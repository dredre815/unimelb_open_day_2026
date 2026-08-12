import {
  maskApiKey,
  validateApiKey,
  type AgentModelConfig,
  type ModelId,
  type ReasoningEffort,
} from "./session-config";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export interface JsonSchema {
  [key: string]: unknown;
}

export interface OpenAIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StructuredResponse<T> {
  data: T;
  responseId: string | null;
  model: string;
  usage: OpenAIUsage;
  latencyMs: number;
}

export interface StructuredResponseRequest<T> {
  apiKey: string;
  model: ModelId;
  reasoningEffort: ReasoningEffort;
  systemPrompt: string;
  input: string | Record<string, unknown>;
  schemaName: string;
  schema: JsonSchema;
  validate: (value: unknown) => T;
  maxOutputTokens?: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type OpenAIErrorCode =
  | "ABORTED"
  | "AUTHENTICATION_FAILED"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "REQUEST_FAILED"
  | "TIMEOUT";

export class OpenAIClientError extends Error {
  readonly code: OpenAIErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    code: OpenAIErrorCode,
    publicMessage: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(publicMessage, { cause: options.cause });
    this.name = "OpenAIClientError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

interface ResponsesApiPayload {
  id?: unknown;
  model?: unknown;
  output_text?: unknown;
  output?: unknown;
  usage?: unknown;
}

interface ResponsesApiUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
}

function safeTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function extractUsage(value: unknown): OpenAIUsage {
  const usage =
    typeof value === "object" && value !== null
      ? (value as ResponsesApiUsage)
      : {};
  const inputTokens = safeTokenCount(usage.input_tokens);
  const outputTokens = safeTokenCount(usage.output_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: safeTokenCount(usage.total_tokens) || inputTokens + outputTokens,
  };
}

function extractOutputText(payload: ResponsesApiPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "The model returned no usable structured response.",
    );
  }

  for (const item of payload.output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const typedBlock = block as {
        type?: unknown;
        text?: unknown;
        refusal?: unknown;
      };
      if (typedBlock.type === "refusal") {
        throw new OpenAIClientError(
          "INVALID_RESPONSE",
          "The model could not complete this demo request.",
        );
      }
      if (typedBlock.type === "output_text" && typeof typedBlock.text === "string") {
        return typedBlock.text;
      }
    }
  }

  throw new OpenAIClientError(
    "INVALID_RESPONSE",
    "The model returned no usable structured response.",
  );
}

function createRequestSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function classifyHttpFailure(status: number): OpenAIClientError {
  if (status === 401 || status === 403) {
    return new OpenAIClientError(
      "AUTHENTICATION_FAILED",
      "OpenAI rejected the temporary key. Check its project access and expiry.",
      { status },
    );
  }

  if (status === 429) {
    return new OpenAIClientError(
      "RATE_LIMITED",
      "The OpenAI project is temporarily rate limited. Continuity mode is available.",
      { status, retryable: true },
    );
  }

  return new OpenAIClientError(
    "REQUEST_FAILED",
    "The OpenAI request failed. Continuity mode is available.",
    { status, retryable: status >= 500 },
  );
}

export async function callStructuredResponse<T>(
  request: StructuredResponseRequest<T>,
): Promise<StructuredResponse<T>> {
  if (typeof window === "undefined") {
    throw new OpenAIClientError(
      "REQUEST_FAILED",
      "Live model calls are available only in the browser session.",
    );
  }

  const keyValidation = validateApiKey(request.apiKey);
  if (!keyValidation.valid) {
    throw new OpenAIClientError(
      "AUTHENTICATION_FAILED",
      keyValidation.message,
    );
  }

  const startedAt = performance.now();
  const requestSignal = createRequestSignal(request.timeoutMs, request.signal);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        reasoning: { effort: request.reasoningEffort },
        input: [
          { role: "system", content: request.systemPrompt },
          {
            role: "user",
            content:
              typeof request.input === "string"
                ? request.input
                : JSON.stringify(request.input),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
        store: false,
        max_output_tokens: request.maxOutputTokens ?? 500,
      }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: requestSignal.signal,
    });

    if (!response.ok) throw classifyHttpFailure(response.status);

    let payload: ResponsesApiPayload;
    try {
      payload = (await response.json()) as ResponsesApiPayload;
    } catch {
      throw new OpenAIClientError(
        "INVALID_RESPONSE",
        "The model returned an unreadable response.",
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(extractOutputText(payload)) as unknown;
    } catch (error) {
      if (error instanceof OpenAIClientError) throw error;
      throw new OpenAIClientError(
        "INVALID_RESPONSE",
        "The model response did not match the required structure.",
      );
    }

    let data: T;
    try {
      data = request.validate(decoded);
    } catch {
      throw new OpenAIClientError(
        "INVALID_RESPONSE",
        "The model response did not pass local validation.",
      );
    }

    return {
      data,
      responseId: typeof payload.id === "string" ? payload.id : null,
      model: typeof payload.model === "string" ? payload.model : request.model,
      usage: extractUsage(payload.usage),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof OpenAIClientError) throw error;
    if (requestSignal.signal.aborted) {
      const abortReason = requestSignal.signal.reason;
      if (
        requestSignal.didTimeout() ||
        (abortReason instanceof DOMException && abortReason.name === "TimeoutError")
      ) {
        throw new OpenAIClientError(
          "TIMEOUT",
          "The model took too long. Continuity mode is available.",
          { retryable: true, cause: error },
        );
      }
      throw new OpenAIClientError("ABORTED", "The model request was cancelled.", {
        cause: error,
      });
    }
    throw new OpenAIClientError(
      "NETWORK_ERROR",
      "The OpenAI service could not be reached. Continuity mode is available.",
      { retryable: true, cause: error },
    );
  } finally {
    requestSignal.cleanup();
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  maskedApiKey: string;
  model: ModelId;
  reasoningEffort: ReasoningEffort;
  latencyMs: number;
  errorCode?: OpenAIErrorCode;
  message: string;
}

const CONNECTION_TEST_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"],
};

export async function testOpenAIConnection(
  apiKey: string,
  agent: AgentModelConfig = {
    model: "gpt-5.6-luna",
    reasoningEffort: "none",
  },
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ConnectionTestResult> {
  const maskedApiKey = maskApiKey(apiKey);
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();

  try {
    await callStructuredResponse<{ ok: true }>({
      apiKey,
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
      systemPrompt: "Return the requested connection-check object only.",
      input: "Return {\"ok\":true}.",
      schemaName: "connection_check",
      schema: CONNECTION_TEST_SCHEMA,
      validate: (value) => {
        if (
          typeof value !== "object" ||
          value === null ||
          (value as { ok?: unknown }).ok !== true
        ) {
          throw new Error("Invalid connection-check response");
        }
        return { ok: true };
      },
      maxOutputTokens: 64,
      timeoutMs: options.timeoutMs ?? 8_000,
      signal: options.signal,
    });

    const finishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    return {
      ok: true,
      maskedApiKey,
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
      latencyMs: Math.round(finishedAt - startedAt),
      message: "Connection verified. The key remains in this browser tab only.",
    };
  } catch (error) {
    const finishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    const knownError =
      error instanceof OpenAIClientError
        ? error
        : new OpenAIClientError(
            "REQUEST_FAILED",
            "The connection test failed. Check the project key and network.",
          );
    return {
      ok: false,
      maskedApiKey,
      model: agent.model,
      reasoningEffort: agent.reasoningEffort,
      latencyMs: Math.round(finishedAt - startedAt),
      errorCode: knownError.code,
      message: knownError.message,
    };
  }
}

export function createOpenAIClient(apiKey: string) {
  return {
    callStructuredResponse: <T>(
      request: Omit<StructuredResponseRequest<T>, "apiKey">,
    ) => callStructuredResponse({ ...request, apiKey }),
    testConnection: (
      agent?: AgentModelConfig,
      options?: { timeoutMs?: number; signal?: AbortSignal },
    ) => testOpenAIConnection(apiKey, agent, options),
    maskedApiKey: maskApiKey(apiKey),
  };
}

export const testConnection = testOpenAIConnection;
