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

const LEGACY_SESSION_CONFIG_STORAGE_KEY =
  "unimelb-open-day-2026:session-config:v1";

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

  it("saves, loads, and clears the v2 entry while removing legacy v1 data", () => {
    const localStorageAccess = vi.spyOn(window, "localStorage", "get");
    const config = liveConfig();
    window.sessionStorage.setItem(
      LEGACY_SESSION_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...config, version: 1 }),
    );
    const saveResult = saveSessionConfig(config);

    expect(saveResult.success).toBe(true);
    expect(saveResult.summary).toMatchObject({
      configured: true,
      runtimeMode: "live",
      debateRoundCount: 2,
    });
    expect(saveResult.summary?.maskedApiKey).not.toContain(config.apiKey);
    expect(window.sessionStorage.length).toBe(1);
    expect(SESSION_CONFIG_STORAGE_KEY).toContain(":v2");
    expect(window.sessionStorage.getItem(SESSION_CONFIG_STORAGE_KEY)).toBeTruthy();
    expect(window.sessionStorage.getItem(LEGACY_SESSION_CONFIG_STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(LEGACY_SESSION_CONFIG_STORAGE_KEY, "legacy");
    expect(loadSessionConfig()).toEqual(config);
    expect(window.sessionStorage.getItem(LEGACY_SESSION_CONFIG_STORAGE_KEY)).toBeNull();
    expect(localStorageAccess).not.toHaveBeenCalled();

    window.sessionStorage.setItem(LEGACY_SESSION_CONFIG_STORAGE_KEY, "legacy");
    expect(clearSessionConfig()).toBe(true);
    expect(loadSessionConfig()).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_SESSION_CONFIG_STORAGE_KEY)).toBeNull();
    expect(localStorageAccess).not.toHaveBeenCalled();
  });

  it("ignores and removes a legacy-only configuration", () => {
    window.sessionStorage.setItem(
      LEGACY_SESSION_CONFIG_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SESSION_CONFIG, version: 1 }),
    );

    expect(loadSessionConfig()).toBeNull();
    expect(window.sessionStorage.getItem(LEGACY_SESSION_CONFIG_STORAGE_KEY)).toBeNull();
  });

  it("keeps v2 operations usable when legacy cleanup is blocked", () => {
    const config = liveConfig();
    const values = new Map<string, string>([
      [SESSION_CONFIG_STORAGE_KEY, JSON.stringify(config)],
      [LEGACY_SESSION_CONFIG_STORAGE_KEY, "legacy"],
    ]);
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key) {
        return values.get(key) ?? null;
      },
      key(index) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key) {
        if (key === LEGACY_SESSION_CONFIG_STORAGE_KEY) {
          throw new Error("Legacy cleanup blocked");
        }
        values.delete(key);
      },
      setItem(key, value) {
        values.set(key, value);
      },
    };

    expect(loadSessionConfig(storage)).toEqual(config);
    expect(saveSessionConfig(config, storage).success).toBe(true);
    expect(clearSessionConfig(storage)).toBe(false);
    expect(values.has(SESSION_CONFIG_STORAGE_KEY)).toBe(false);
  });

  it("clears the API key while preserving safe settings in canned mode", () => {
    const config = { ...liveConfig(), demoMode: "fair" as const, debateRoundCount: 5 };
    expect(saveSessionConfig(config).success).toBe(true);
    expect(clearApiKey()).toBe(true);

    expect(loadSessionConfig()).toMatchObject({
      apiKey: "",
      runtimeMode: "canned",
      demoMode: "fair",
      debateRoundCount: 5,
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

  it("accepts only two to five debate rounds", () => {
    expect(saveSessionConfig({ ...DEFAULT_SESSION_CONFIG, debateRoundCount: 2 }).success).toBe(true);
    expect(saveSessionConfig({ ...DEFAULT_SESSION_CONFIG, debateRoundCount: 5 }).success).toBe(true);
    expect(saveSessionConfig({ ...DEFAULT_SESSION_CONFIG, debateRoundCount: 1 }).success).toBe(false);
    expect(saveSessionConfig({ ...DEFAULT_SESSION_CONFIG, debateRoundCount: 6 }).success).toBe(false);
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
