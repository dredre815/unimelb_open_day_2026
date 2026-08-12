import type { ModelId } from "./session-config";

export const TELEMETRY_ERROR_CODES = [
  "ABORTED",
  "AUTHENTICATION_FAILED",
  "INVALID_RESPONSE",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "REQUEST_FAILED",
  "TIMEOUT",
  "VALIDATION_FAILED",
  "UNKNOWN_ERROR",
] as const;

export type TelemetryErrorCode = (typeof TELEMETRY_ERROR_CODES)[number];
export type TelemetryCategory =
  | "objective"
  | "subjective"
  | "mixed"
  | "out_of_scope";
export type TelemetryLanguage = "en" | "zh" | "other";

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SessionTelemetry {
  timestamp: string;
  sessionId: string;
  category: TelemetryCategory;
  language: TelemetryLanguage;
  durationMs: number;
  fallbackUsed: boolean;
  modelIds: ModelId[];
  aggregateInputTokens: number;
  aggregateOutputTokens: number;
  aggregateTotalTokens: number;
  errorCode: TelemetryErrorCode | null;
}

export interface SessionTelemetryInput {
  sessionId: string;
  category: TelemetryCategory;
  language: TelemetryLanguage;
  durationMs: number;
  fallbackUsed: boolean;
  modelIds: readonly ModelId[];
  usage?: Partial<TokenTotals>;
  errorCode?: string | null;
  timestamp?: Date;
}

function safeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function normaliseTelemetryErrorCode(
  value: string | null | undefined,
): TelemetryErrorCode | null {
  if (!value) return null;
  return (TELEMETRY_ERROR_CODES as readonly string[]).includes(value)
    ? (value as TelemetryErrorCode)
    : "UNKNOWN_ERROR";
}

export function createTokenTotals(): TokenTotals {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addTokenUsage(
  current: TokenTotals,
  next: Partial<TokenTotals> | undefined,
): TokenTotals {
  const inputTokens = current.inputTokens + safeInteger(next?.inputTokens);
  const outputTokens = current.outputTokens + safeInteger(next?.outputTokens);
  const reportedTotal = safeInteger(next?.totalTokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      current.totalTokens +
      (reportedTotal > 0
        ? reportedTotal
        : safeInteger(next?.inputTokens) + safeInteger(next?.outputTokens)),
  };
}

export function buildSessionTelemetry(
  input: SessionTelemetryInput,
): SessionTelemetry {
  const aggregateInputTokens = safeInteger(input.usage?.inputTokens);
  const aggregateOutputTokens = safeInteger(input.usage?.outputTokens);
  const suppliedTotal = safeInteger(input.usage?.totalTokens);

  return Object.freeze({
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    sessionId: input.sessionId,
    category: input.category,
    language: input.language,
    durationMs: safeInteger(input.durationMs),
    fallbackUsed: input.fallbackUsed,
    modelIds: [...new Set(input.modelIds)],
    aggregateInputTokens,
    aggregateOutputTokens,
    aggregateTotalTokens:
      suppliedTotal || aggregateInputTokens + aggregateOutputTokens,
    errorCode: normaliseTelemetryErrorCode(input.errorCode),
  });
}

/**
 * Ephemeral, in-memory operational metrics only. This collector never writes to
 * storage, the console, or the network, and its input type has no text fields for
 * questions, prompts, model messages, credentials, IPs, or fingerprints.
 */
export class InMemoryTelemetryCollector {
  private records: SessionTelemetry[] = [];

  constructor(private readonly capacity = 100) {}

  record(input: SessionTelemetryInput): SessionTelemetry {
    const record = buildSessionTelemetry(input);
    this.records.push(record);
    if (this.records.length > this.capacity) {
      this.records.splice(0, this.records.length - this.capacity);
    }
    return record;
  }

  snapshot(): readonly SessionTelemetry[] {
    return this.records.map((record) => ({ ...record, modelIds: [...record.modelIds] }));
  }

  clear(): void {
    this.records = [];
  }
}

export const telemetry = new InMemoryTelemetryCollector();
