import { webcrypto } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runDebate } from "@/lib/orchestrator";
import { SessionEventSchema } from "@/lib/schemas";
import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "@/lib/session-config";
import type { SessionEvent } from "@/types/debate";

beforeAll(() => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function cannedConfig(demoMode: SessionConfig["demoMode"]): SessionConfig {
  return {
    ...structuredClone(DEFAULT_SESSION_CONFIG),
    runtimeMode: "canned",
    demoMode,
    autoRevealDelayMs: 0,
  };
}

async function runCanned(demoMode: SessionConfig["demoMode"]) {
  vi.useFakeTimers();
  const events: SessionEvent[] = [];
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const resultPromise = runDebate(
    "Which university is better for IT and computer science?",
    cannedConfig(demoMode),
    (event) => {
      events.push(SessionEventSchema.parse(event));
    },
  );

  await vi.runAllTimersAsync();
  const result = await resultPromise;
  return { events, fetchSpy, result };
}

function eventIndex(events: SessionEvent[], type: SessionEvent["type"]): number {
  return events.findIndex((event) => event.type === type);
}

describe("canned orchestrator", () => {
  it("emits the complete compromised, X-Ray, and fair re-check sequence", async () => {
    const { events, fetchSpy, result } = await runCanned("compromised");
    const phases = events
      .filter((event): event is Extract<SessionEvent, { type: "phase.changed" }> =>
        event.type === "phase.changed",
      )
      .map((event) => event.phase);
    const messages = events.filter(
      (event): event is Extract<SessionEvent, { type: "agent.message" }> =>
        event.type === "agent.message",
    );

    expect(events[0]).toMatchObject({
      type: "session.started",
      mode: "compromised",
      fallbackUsed: true,
    });
    expect(events.map((event) => event.type)).toEqual([
      "session.started",
      "phase.changed",
      "agent.status",
      "agent.status",
      "agent.status",
      "agent.message",
      "agent.status",
      "agent.message",
      "phase.changed",
      "agent.status",
      "agent.status",
      "agent.status",
      "agent.message",
      "agent.status",
      "agent.status",
      "agent.message",
      "agent.status",
      "phase.changed",
      "agent.status",
      "verifier.checks",
      "verdict.compromised",
      "phase.changed",
      "integrity.result",
      "xray.prompt_diff",
      "phase.changed",
      "agent.status",
      "integrity.result",
      "verdict.fair",
      "agent.status",
      "phase.changed",
      "session.complete",
    ]);
    expect(phases).toEqual([
      "opening_arguments",
      "rebuttals",
      "verifying",
      "integrity_reveal",
      "fair_recheck",
      "complete",
    ]);
    expect(messages.map(({ agent, turnKind }) => `${agent}:${turnKind}`)).toEqual([
      "unimelb:opening",
      "competitor:opening",
      "unimelb:rebuttal",
      "competitor:rebuttal",
    ]);
    expect(eventIndex(events, "verdict.compromised")).toBeLessThan(
      eventIndex(events, "integrity.result"),
    );
    expect(eventIndex(events, "integrity.result")).toBeLessThan(
      eventIndex(events, "verdict.fair"),
    );
    expect(events.at(-1)).toMatchObject({ type: "session.complete", fallbackUsed: true });
    expect(result.compromisedVerdict?.winner).toBe("unimelb");
    expect(result.integrity).toMatchObject({
      passed: false,
      publicLabel: "Policy integrity: FAILED",
    });
    expect(result.fairIntegrity).toMatchObject({
      passed: true,
      publicLabel: "Policy integrity: VERIFIED",
    });
    expect(result.fairVerdict).toBeDefined();
    expect(result.fallbackUsed).toBe(true);
    expect(JSON.stringify(result.telemetry)).not.toContain(
      "Which university is better for IT and computer science?",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips the compromised reveal but verifies the clean policy in fair-only mode", async () => {
    const { events, fetchSpy, result } = await runCanned("fair");
    const types = events.map((event) => event.type);
    const phases = events
      .filter((event): event is Extract<SessionEvent, { type: "phase.changed" }> =>
        event.type === "phase.changed",
      )
      .map((event) => event.phase);

    expect(phases).toEqual(["opening_arguments", "rebuttals", "fair_recheck", "complete"]);
    expect(types).not.toContain("verifier.checks");
    expect(types).not.toContain("verdict.compromised");
    expect(types).not.toContain("xray.prompt_diff");
    expect(types.filter((type) => type === "integrity.result")).toHaveLength(1);
    expect(types).toContain("verdict.fair");
    expect(result.compromisedVerdict).toBeUndefined();
    expect(result.integrity).toBeUndefined();
    expect(result.fairIntegrity).toMatchObject({
      passed: true,
      publicLabel: "Policy integrity: VERIFIED",
    });
    expect(result.fairVerdict).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
