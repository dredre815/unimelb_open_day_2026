import { afterEach, describe, expect, it, vi } from "vitest";

import { NdjsonParser, encodeNdjsonEvent } from "@/lib/ndjson";
import { runDebate } from "@/lib/orchestrator";
import { buildFairVerifierPrompt, sha256 } from "@/lib/integrity";
import {
  SESSION_CONFIG_STORAGE_KEY,
  clearApiKey,
  loadSessionConfig,
  saveSessionConfig,
  type SessionConfig,
  DEFAULT_SESSION_CONFIG,
} from "@/lib/session-config";
import type { SessionEvent } from "@/types/debate";

const TEST_API_KEY = "sk-1234567890abcdef";

interface RequestRecord {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    input: Array<{ role: string; content: string }>;
    text: { format: { name: string } };
    store: boolean;
  };
}

function liveConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    ...DEFAULT_SESSION_CONFIG,
    ...overrides,
    apiKey: TEST_API_KEY,
    runtimeMode: "live",
    autoRevealDelayMs: 0,
    maxRetries: 0,
    agents: {
      unimelbAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.unimelbAdvocate },
      comparatorAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.comparatorAdvocate },
      verifier: { ...DEFAULT_SESSION_CONFIG.agents.verifier },
      fairVerifier: { ...DEFAULT_SESSION_CONFIG.agents.fairVerifier },
    },
  };
}

function responseFor(schemaName: string, anonymousCall: number): unknown {
  if (schemaName === "debate_turn") {
    return {
      message: "A concise evidence-bound case.",
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser Responses API orchestration", () => {
  it("runs the full live protocol with safe request controls and an anonymous clean pair", async () => {
    const requests: RequestRecord[] = [];
    let anonymousCalls = 0;
    let activeRequests = 0;
    let peakRequests = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        activeRequests += 1;
        peakRequests = Math.max(peakRequests, activeRequests);
        await new Promise((resolve) => window.setTimeout(resolve, 1));

        const body = JSON.parse(String(init?.body)) as RequestRecord["body"];
        const headers = Object.fromEntries(new Headers(init?.headers).entries());
        const schemaName = body.text.format.name;
        if (schemaName === "anonymous_verdict") anonymousCalls += 1;
        requests.push({ url: String(input), body, headers });
        activeRequests -= 1;

        return new Response(
          JSON.stringify({
            id: "resp_test",
            model: body.model,
            output_text: JSON.stringify(responseFor(schemaName, anonymousCalls)),
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const events: SessionEvent[] = [];
    const result = await runDebate(
      "Is Melbourne or Monash better for computer science?",
      liveConfig({ comparatorMode: "named" }),
      (event) => {
        events.push(event);
      },
    );

    expect(requests).toHaveLength(7);
    expect(peakRequests).toBeGreaterThanOrEqual(2);
    expect(requests.every(({ body }) => body.store === false)).toBe(true);
    expect(requests.every(({ url }) => !url.includes(TEST_API_KEY))).toBe(true);
    expect(requests.every(({ headers }) => headers.authorization === `Bearer ${TEST_API_KEY}`)).toBe(
      true,
    );

    const cleanRequests = requests.filter(
      ({ body }) => body.text.format.name === "anonymous_verdict",
    );
    expect(cleanRequests).toHaveLength(2);
    for (const request of cleanRequests) {
      const serializedInput = JSON.stringify(request.body.input);
      const systemPrompt = request.body.input.find(({ role }) => role === "system")?.content;
      expect(serializedInput).not.toMatch(/Melbourne|Monash|UM-|MO-|VB-/iu);
      expect(serializedInput).toMatch(/Candidate A/iu);
      expect(serializedInput).toMatch(/Candidate B/iu);
      expect(systemPrompt).toBe(buildFairVerifierPrompt());
      expect(await sha256(systemPrompt ?? "")).toBe(result.fairIntegrity.activeHash);
    }

    expect(result.compromisedVerdict?.winner).toBe("unimelb");
    expect(result.integrity?.passed).toBe(false);
    expect(result.fairVerdict).toMatchObject({
      winner: "unimelb",
      orderConsistent: true,
    });
    expect(result.fallbackUsed).toBe(false);
    expect(result.telemetry.aggregateTotalTokens).toBe(105);
    expect(JSON.stringify(result.telemetry)).not.toContain(
      "Is Melbourne or Monash better for computer science?",
    );
    expect(events.at(-1)?.type).toBe("session.complete");
  });

  it("skips compromised events and verifies the clean policy in fair-only canned mode", async () => {
    const events: SessionEvent[] = [];
    const config: SessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      demoMode: "fair",
      agents: {
        unimelbAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.unimelbAdvocate },
        comparatorAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.comparatorAdvocate },
        verifier: { ...DEFAULT_SESSION_CONFIG.agents.verifier },
        fairVerifier: { ...DEFAULT_SESSION_CONFIG.agents.fairVerifier },
      },
    };

    const result = await runDebate(
      "Which university is better for IT and computer science?",
      config,
      (event) => {
        events.push(event);
      },
    );

    const eventTypes = events.map(({ type }) => type);
    expect(eventTypes).not.toContain("verdict.compromised");
    expect(eventTypes).not.toContain("xray.prompt_diff");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "integrity.result",
        context: "fair",
        result: expect.objectContaining({ passed: true }),
      }),
    );
    expect(eventTypes).toContain("verdict.fair");
    expect(result.compromisedVerdict).toBeUndefined();
    expect(result.integrity).toBeUndefined();
    expect(result.fairIntegrity.passed).toBe(true);
    expect(result.fallbackUsed).toBe(true);
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
