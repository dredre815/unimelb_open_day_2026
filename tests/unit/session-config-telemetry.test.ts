import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION_CONFIG,
  SESSION_CONFIG_STORAGE_KEY,
  clearApiKey,
  clearSessionConfig,
  loadSessionConfig,
  saveSessionConfig,
  type SessionConfig,
} from "@/lib/session-config";
import {
  InMemoryTelemetryCollector,
  addTokenUsage,
  buildSessionTelemetry,
  createTokenTotals,
  type SessionTelemetryInput,
} from "@/lib/telemetry";

function liveConfig(): SessionConfig {
  return {
    ...structuredClone(DEFAULT_SESSION_CONFIG),
    apiKey: `sk-${"a".repeat(24)}`,
    runtimeMode: "live",
  };
}

describe("session-scoped runtime configuration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("saves, loads, and clears only the versioned sessionStorage entry", () => {
    const localStorageAccess = vi.spyOn(window, "localStorage", "get");
    const config = liveConfig();
    const saveResult = saveSessionConfig(config);

    expect(saveResult.success).toBe(true);
    expect(saveResult.summary).toMatchObject({
      configured: true,
      runtimeMode: "live",
    });
    expect(saveResult.summary?.maskedApiKey).not.toContain(config.apiKey);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(SESSION_CONFIG_STORAGE_KEY)).toBeTruthy();
    expect(loadSessionConfig()).toEqual(config);
    expect(localStorageAccess).not.toHaveBeenCalled();

    expect(clearSessionConfig()).toBe(true);
    expect(loadSessionConfig()).toBeNull();
    expect(localStorageAccess).not.toHaveBeenCalled();
  });

  it("clears the API key while preserving safe settings in canned mode", () => {
    const config = { ...liveConfig(), demoMode: "fair" as const, bilingualMode: false };
    expect(saveSessionConfig(config).success).toBe(true);
    expect(clearApiKey()).toBe(true);

    expect(loadSessionConfig()).toMatchObject({
      apiKey: "",
      runtimeMode: "canned",
      demoMode: "fair",
      bilingualMode: false,
    });
  });

  it("rejects malformed or invalid stored configuration", () => {
    window.sessionStorage.setItem(SESSION_CONFIG_STORAGE_KEY, "not-json");
    expect(loadSessionConfig()).toBeNull();

    window.sessionStorage.setItem(
      SESSION_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SESSION_CONFIG, runtimeMode: "live", apiKey: "invalid" }),
    );
    expect(loadSessionConfig()).toBeNull();
  });
});

describe("text-free ephemeral telemetry", () => {
  const baseInput: SessionTelemetryInput = {
    sessionId: "session-test",
    category: "mixed",
    language: "en",
    durationMs: 1250,
    fallbackUsed: false,
    modelIds: ["gpt-5.6-luna", "gpt-5.6-luna", "gpt-5.6-terra"],
    usage: { inputTokens: 10, outputTokens: 4 },
    timestamp: new Date("2026-08-12T00:00:00.000Z"),
  };

  it("allowlists numeric operational fields and drops injected text fields", () => {
    const input = {
      ...baseInput,
      question: "PRIVATE VISITOR QUESTION",
      prompt: "PRIVATE SYSTEM PROMPT",
      modelOutput: "PRIVATE MODEL OUTPUT",
      apiKey: "PRIVATE API KEY",
    } as SessionTelemetryInput & Record<string, unknown>;

    const record = buildSessionTelemetry(input);
    const serialized = JSON.stringify(record);

    expect(record.modelIds).toEqual(["gpt-5.6-luna", "gpt-5.6-terra"]);
    expect(record.aggregateTotalTokens).toBe(14);
    expect(serialized).not.toContain("PRIVATE");
    expect(Object.keys(record)).not.toEqual(
      expect.arrayContaining(["question", "prompt", "modelOutput", "apiKey"]),
    );
  });

  it("stores only a bounded in-memory snapshot and never writes browser storage", () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const collector = new InMemoryTelemetryCollector(2);

    collector.record(baseInput);
    collector.record({ ...baseInput, sessionId: "session-two" });
    collector.record({ ...baseInput, sessionId: "session-three" });

    expect(collector.snapshot().map((entry) => entry.sessionId)).toEqual([
      "session-two",
      "session-three",
    ]);
    expect(storageWrite).not.toHaveBeenCalled();
    collector.clear();
    expect(collector.snapshot()).toEqual([]);
  });

  it("aggregates safe token counts", () => {
    expect(
      addTokenUsage(createTokenTotals(), {
        inputTokens: 3.9,
        outputTokens: 2.4,
        totalTokens: 0,
      }),
    ).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  });
});
