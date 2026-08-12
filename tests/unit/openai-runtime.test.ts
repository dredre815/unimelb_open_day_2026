import { afterEach, describe, expect, it, vi } from "vitest";

import { buildFairVerifierPrompt, sha256 } from "@/lib/integrity";
import { NdjsonParser, encodeNdjsonEvent } from "@/lib/ndjson";
import {
  createDebateInteractionController,
  MIN_JUDGE_DELAY_MS,
  MIN_MESSAGE_GAP_MS,
  runDebate,
} from "@/lib/orchestrator";
import {
  clearApiKey,
  DEFAULT_SESSION_CONFIG,
  loadSessionConfig,
  saveSessionConfig,
  SESSION_CONFIG_STORAGE_KEY,
  type SessionConfig,
} from "@/lib/session-config";
import type { SessionEvent } from "@/types/debate";

const TEST_API_KEY = "sk-1234567890abcdef";
const LIVE_QUESTION = "Is Melbourne or Monash better for computer science?";

interface RequestBody {
  model: string;
  input: Array<{ role: string; content: string }>;
  text: { format: { name: string } };
  store: boolean;
}

interface RequestRecord {
  url: string;
  headers: Record<string, string>;
  body: RequestBody;
  at: number;
}

interface TimedEvent {
  event: SessionEvent;
  at: number;
}

function liveConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  const defaults = structuredClone(DEFAULT_SESSION_CONFIG);
  return {
    ...defaults,
    ...overrides,
    apiKey: TEST_API_KEY,
    runtimeMode: "live",
    maxRetries: 0,
    agents: structuredClone(overrides.agents ?? defaults.agents),
  };
}

function userPayload(request: RequestRecord): Record<string, unknown> {
  const content = request.body.input.find(({ role }) => role === "user")?.content;
  if (!content) throw new Error("The mocked request has no user input.");
  return JSON.parse(content) as Record<string, unknown>;
}

function responseFor(
  schemaName: string,
  payload: Record<string, unknown>,
  anonymousCall: number,
): unknown {
  if (schemaName === "debate_turn") {
    return {
      message: `LIVE ${String(payload.assignedInstitution)} R${String(payload.roundIndex)}`,
      stanceSummary: "Evidence-bound case",
      claims: [],
    };
  }

  if (schemaName === "verdict") {
    return {
      questionCategory: "mixed",
      winner: "competitor",
      headline: "Initial model result",
      publicReasoning: "Both pathways have strengths.",
      evidenceChecks: [],
      bestFor: { unimelb: "Breadth", competitor: "Dedicated study" },
      confidence: 0.64,
      disclaimer: "Educational demonstration only.",
    };
  }

  return {
    questionCategory: "mixed",
    winner: anonymousCall === 1 ? "A" : "B",
    headline: `Candidate ${anonymousCall === 1 ? "A" : "B"} fits`,
    publicReasoning: `Candidate ${anonymousCall === 1 ? "A" : "B"} fits the stated criterion.`,
    evidenceChecks: [],
    bestFor: { A: "Broad study", B: "Focused study" },
    confidence: 0.61,
    disclaimer: "Educational demonstration only.",
  };
}

function installSuccessFetch(options: { slowFirstRound?: boolean } = {}) {
  const requests: RequestRecord[] = [];
  let anonymousCalls = 0;
  let activeRequests = 0;
  let peakRequests = 0;

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RequestBody;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const record = { url: String(input), body, headers, at: Date.now() };
    const payload = userPayload(record);
    const schemaName = body.text.format.name;
    if (schemaName === "anonymous_verdict") anonymousCalls += 1;
    const anonymousCall = anonymousCalls;
    requests.push(record);
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);

    const delayMs =
      options.slowFirstRound &&
      schemaName === "debate_turn" &&
      payload.roundIndex === 1
        ? 2_500
        : 10;

    try {
      await new Promise<void>((resolve, reject) => {
        const requestSignal = init?.signal;
        const timeoutId = window.setTimeout(() => {
          requestSignal?.removeEventListener("abort", onAbort);
          resolve();
        }, delayMs);
        const onAbort = () => {
          window.clearTimeout(timeoutId);
          requestSignal?.removeEventListener("abort", onAbort);
          reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        if (requestSignal?.aborted) onAbort();
        else requestSignal?.addEventListener("abort", onAbort, { once: true });
      });

      return new Response(
        JSON.stringify({
          id: "resp_test",
          model: body.model,
          output_text: JSON.stringify(responseFor(schemaName, payload, anonymousCall)),
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } finally {
      activeRequests -= 1;
    }
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    requests,
    fetchMock,
    get peakRequests() {
      return peakRequests;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser Responses API orchestration", () => {
  it("rejects a Chinese question at the runtime boundary before any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runDebate("墨尔本大学和莫纳什大学的计算机科学哪个更好？", liveConfig()),
    ).rejects.toMatchObject({
      message:
        "This Open Day demo is available in English only. Please choose an English question.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([2, 5])(
    "runs %i live rounds sequentially with parallel pairs and 2N+3 safe requests",
    async (debateRoundCount) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const network = installSuccessFetch({ slowFirstRound: true });
      const interactions = createDebateInteractionController();
      const timedEvents: TimedEvent[] = [];
      let cleanRequestsAtGate = -1;

      const resultPromise = runDebate(
        LIVE_QUESTION,
        liveConfig({ comparatorMode: "named", debateRoundCount }),
        (event) => {
          timedEvents.push({ event, at: Date.now() });
          if (event.type === "phase.changed" && event.phase === "awaiting_reveal") {
            expect(interactions.reveal()).toBe(true);
          }
          if (event.type === "phase.changed" && event.phase === "awaiting_clean_run") {
            cleanRequestsAtGate = network.requests.filter(
              ({ body }) => body.text.format.name === "anonymous_verdict",
            ).length;
            expect(interactions.runClean()).toBe(true);
          }
        },
        undefined,
        interactions,
      );

      await vi.runAllTimersAsync();
      const result = await resultPromise;
      const requests = network.requests;
      const debateRequests = requests.filter(
        ({ body }) => body.text.format.name === "debate_turn",
      );
      const compromisedRequests = requests.filter(
        ({ body }) => body.text.format.name === "verdict",
      );
      const cleanRequests = requests.filter(
        ({ body }) => body.text.format.name === "anonymous_verdict",
      );
      const messages = timedEvents.filter(
        ({ event }) => event.type === "agent.message",
      ) as Array<TimedEvent & { event: Extract<SessionEvent, { type: "agent.message" }> }>;

      expect(requests).toHaveLength(2 * debateRoundCount + 3);
      expect(debateRequests).toHaveLength(2 * debateRoundCount);
      expect(compromisedRequests).toHaveLength(1);
      expect(cleanRequests).toHaveLength(2);
      expect(cleanRequestsAtGate).toBe(0);
      expect(network.peakRequests).toBe(2);
      expect(requests.every(({ body }) => body.store === false)).toBe(true);
      expect(requests.every(({ url }) => !url.includes(TEST_API_KEY))).toBe(true);
      expect(
        requests.every(({ headers }) => headers.authorization === `Bearer ${TEST_API_KEY}`),
      ).toBe(true);

      for (let roundIndex = 1; roundIndex <= debateRoundCount; roundIndex += 1) {
        const roundRequests = debateRequests.filter(
          (request) => userPayload(request).roundIndex === roundIndex,
        );
        expect(roundRequests).toHaveLength(2);
        expect(roundRequests[0]!.at).toBe(roundRequests[1]!.at);
        expect(
          roundRequests.every((request) => {
            const priorTranscript = userPayload(request).priorTranscript;
            return Array.isArray(priorTranscript) && priorTranscript.length === roundIndex - 1;
          }),
        ).toBe(true);

        if (roundIndex > 1) {
          const priorRoundCompleted = timedEvents.find(
            ({ event }) =>
              event.type === "round.completed" && event.roundIndex === roundIndex - 1,
          );
          expect(roundRequests[0]!.at).toBeGreaterThanOrEqual(priorRoundCompleted!.at);
        }
      }

      expect(messages[0]!.at).toBe(2_500);
      for (let index = 1; index < messages.length; index += 1) {
        expect(messages[index]!.at - messages[index - 1]!.at).toBeGreaterThanOrEqual(
          MIN_MESSAGE_GAP_MS,
        );
      }
      const lastMessage = messages.at(-1)!;
      expect(compromisedRequests[0]!.at).toBe(lastMessage.at);
      const compromisedVerdict = timedEvents.find(
        ({ event }) => event.type === "verdict.compromised",
      );
      expect(compromisedVerdict!.at - lastMessage.at).toBeGreaterThanOrEqual(
        MIN_JUDGE_DELAY_MS,
      );

      for (const request of cleanRequests) {
        const payload = userPayload(request);
        const candidateTranscript = payload.candidateTranscript;
        const serializedInput = JSON.stringify(payload);
        const systemPrompt = request.body.input.find(({ role }) => role === "system")?.content;
        expect(candidateTranscript).toBeInstanceOf(Array);
        expect(candidateTranscript).toHaveLength(debateRoundCount);
        expect(
          (candidateTranscript as Array<{ roundIndex: number }>).map(({ roundIndex }) => roundIndex),
        ).toEqual(Array.from({ length: debateRoundCount }, (_, index) => index + 1));
        expect(serializedInput).not.toMatch(/Melbourne|Monash|UM-|MO-|VB-/iu);
        expect(serializedInput).toMatch(/Candidate A/iu);
        expect(serializedInput).toMatch(/Candidate B/iu);
        expect(systemPrompt).toBe(buildFairVerifierPrompt());
        expect(await sha256(systemPrompt ?? "")).toBe(result.fairIntegrity.activeHash);
      }

      expect(result.transcript.rounds).toHaveLength(debateRoundCount);
      expect(result.compromisedVerdict?.winner).toBe("unimelb");
      expect(result.integrity?.passed).toBe(false);
      expect(result.fairVerdict).toMatchObject({
        winner: "unimelb",
        orderConsistent: true,
      });
      expect(result.fallbackUsed).toBe(false);
      expect(result.telemetry.aggregateTotalTokens).toBe((2 * debateRoundCount + 3) * 15);
      expect(JSON.stringify(result.telemetry)).not.toContain(LIVE_QUESTION);
      expect(timedEvents.at(-1)?.event.type).toBe("session.complete");
    },
  );

  it("starts the fair-only clean pair at the final message and reveals it after deliberation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const network = installSuccessFetch();
    const timedEvents: TimedEvent[] = [];
    const resultPromise = runDebate(
      LIVE_QUESTION,
      liveConfig({ demoMode: "fair", comparatorMode: "named", debateRoundCount: 2 }),
      (event) => {
        timedEvents.push({ event, at: Date.now() });
      },
    );

    await vi.runAllTimersAsync();
    const result = await resultPromise;
    const messages = timedEvents.filter(({ event }) => event.type === "agent.message");
    const lastMessage = messages.at(-1)!;
    const cleanRequests = network.requests.filter(
      ({ body }) => body.text.format.name === "anonymous_verdict",
    );
    const fairVerdictEvent = timedEvents.find(({ event }) => event.type === "verdict.fair");
    const phases = timedEvents.flatMap(({ event }) =>
      event.type === "phase.changed" ? [event.phase] : [],
    );

    expect(network.requests).toHaveLength(6);
    expect(cleanRequests).toHaveLength(2);
    expect(cleanRequests.every(({ at }) => at === lastMessage.at)).toBe(true);
    expect(fairVerdictEvent!.at - lastMessage.at).toBeGreaterThanOrEqual(MIN_JUDGE_DELAY_MS);
    expect(phases).not.toContain("awaiting_reveal");
    expect(phases).not.toContain("awaiting_clean_run");
    expect(result.compromisedVerdict).toBeUndefined();
    expect(result.integrity).toBeUndefined();
    expect(result.fallbackUsed).toBe(false);
  });

  it("falls back for both speakers when either live turn in a round fails", async () => {
    vi.useFakeTimers();
    const requests: RequestRecord[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as RequestBody;
        const record = {
          url: String(input),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body,
          at: Date.now(),
        };
        requests.push(record);
        const payload = userPayload(record);
        if (payload.assignedInstitution === "competitor") {
          return new Response("service unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify(responseFor("debate_turn", payload, 0)),
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const events: SessionEvent[] = [];
    const resultPromise = runDebate(
      LIVE_QUESTION,
      liveConfig({ debateRoundCount: 2 }),
      (event) => {
        events.push(event);
      },
    );

    await vi.runAllTimersAsync();
    const result = await resultPromise;
    const firstRoundMessages = events.filter(
      (event): event is Extract<SessionEvent, { type: "agent.message" }> =>
        event.type === "agent.message" && event.roundIndex === 1,
    );

    expect(requests).toHaveLength(2);
    expect(firstRoundMessages).toHaveLength(2);
    expect(firstRoundMessages.every(({ turn }) => !turn.message.startsWith("LIVE"))).toBe(true);
    expect(events.filter(({ type }) => type === "error.recoverable")).toHaveLength(1);
    expect(result.fallbackUsed).toBe(true);
  });

  it("aborts both in-flight advocate calls without revealing fallback content", async () => {
    const interactions = createDebateInteractionController();
    const events: SessionEvent[] = [];
    let requestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        requestCount += 1;
        const pending = new Promise<Response>((_resolve, reject) => {
          const requestSignal = init?.signal;
          const onAbort = () =>
            reject(requestSignal?.reason ?? new DOMException("Aborted", "AbortError"));
          if (requestSignal?.aborted) onAbort();
          else requestSignal?.addEventListener("abort", onAbort, { once: true });
        });
        if (requestCount === 2) queueMicrotask(() => interactions.abort());
        return pending;
      }),
    );

    const resultPromise = runDebate(
      LIVE_QUESTION,
      liveConfig(),
      (event) => {
        events.push(event);
      },
      undefined,
      interactions,
    );

    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(requestCount).toBe(2);
    expect(events.some(({ type }) => type === "agent.message")).toBe(false);
    expect(events.some(({ type }) => type === "error.recoverable")).toBe(false);
  });
});

describe("temporary session setup", () => {
  it("writes only the namespaced session record and clears the key safely", () => {
    const localStorageSpy = vi.spyOn(window.localStorage, "setItem");
    const config = liveConfig();

    const saved = saveSessionConfig(config);
    expect(saved.success).toBe(true);
    expect(saved.summary?.maskedApiKey).not.toContain(TEST_API_KEY);
    expect(window.sessionStorage).toHaveLength(1);
    expect(window.sessionStorage.key(0)).toBe(SESSION_CONFIG_STORAGE_KEY);
    expect(loadSessionConfig()?.apiKey).toBe(TEST_API_KEY);
    expect(localStorageSpy).not.toHaveBeenCalled();

    expect(clearApiKey()).toBe(true);
    expect(loadSessionConfig()).toMatchObject({ apiKey: "", runtimeMode: "canned" });
    expect(localStorageSpy).not.toHaveBeenCalled();
  });
});

describe("NDJSON buffering", () => {
  it("parses events split across arbitrary chunks", () => {
    const first = { type: "phase.changed", phase: "rebuttals" } as const;
    const second = { type: "session.complete", durationMs: 42, fallbackUsed: true } as const;
    const encoded = `${encodeNdjsonEvent(first)}${encodeNdjsonEvent(second)}`;
    const parser = new NdjsonParser<SessionEvent>();

    expect(parser.push(encoded.slice(0, 7))).toEqual([]);
    expect(parser.push(encoded.slice(7, encoded.length - 3))).toEqual([first]);
    expect(parser.push(encoded.slice(-3))).toEqual([second]);
    expect(parser.finish()).toEqual([]);
  });
});
