import { webcrypto } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createDebateInteractionController,
  MIN_JUDGE_DELAY_MS,
  MIN_MESSAGE_GAP_MS,
  runDebate,
} from "@/lib/orchestrator";
import { SessionEventSchema } from "@/lib/schemas";
import { DEFAULT_SESSION_CONFIG, type SessionConfig } from "@/lib/session-config";
import type { SessionEvent } from "@/types/debate";

const QUESTION = "Which university is better for IT and computer science?";

interface TimedEvent {
  event: SessionEvent;
  at: number;
}

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

function cannedConfig(
  demoMode: SessionConfig["demoMode"],
  debateRoundCount = 2,
): SessionConfig {
  return {
    ...structuredClone(DEFAULT_SESSION_CONFIG),
    runtimeMode: "canned",
    demoMode,
    debateRoundCount,
  };
}

async function runCanned(
  demoMode: SessionConfig["demoMode"],
  debateRoundCount: number,
) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const timedEvents: TimedEvent[] = [];
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const resultPromise = runDebate(
    QUESTION,
    cannedConfig(demoMode, debateRoundCount),
    (rawEvent) => {
      timedEvents.push({
        event: SessionEventSchema.parse(rawEvent),
        at: Date.now(),
      });
    },
  );

  await vi.runAllTimersAsync();
  const result = await resultPromise;
  return { timedEvents, events: timedEvents.map(({ event }) => event), fetchSpy, result };
}

function eventsOfType<TType extends SessionEvent["type"]>(
  events: SessionEvent[],
  type: TType,
): Array<Extract<SessionEvent, { type: TType }>> {
  return events.filter(
    (event): event is Extract<SessionEvent, { type: TType }> => event.type === type,
  );
}

describe("round-based canned orchestration", () => {
  it.each([2, 5])(
    "emits %i complete rounds with alternating speakers and fixed presentation gaps",
    async (debateRoundCount) => {
      const { timedEvents, events, fetchSpy, result } = await runCanned(
        "compromised",
        debateRoundCount,
      );
      const messages = timedEvents.filter(
        ({ event }) => event.type === "agent.message",
      ) as Array<TimedEvent & { event: Extract<SessionEvent, { type: "agent.message" }> }>;
      const roundsStarted = eventsOfType(events, "round.started");
      const roundsCompleted = eventsOfType(events, "round.completed");
      const sessionStarted = eventsOfType(events, "session.started")[0];

      expect(sessionStarted).toMatchObject({
        mode: "compromised",
        fallbackUsed: true,
        roundCount: debateRoundCount,
      });
      expect(roundsStarted).toHaveLength(debateRoundCount);
      expect(roundsCompleted).toHaveLength(debateRoundCount);
      expect(messages).toHaveLength(debateRoundCount * 2);
      expect(result.transcript.rounds).toHaveLength(debateRoundCount);

      for (let roundIndex = 1; roundIndex <= debateRoundCount; roundIndex += 1) {
        const roundMessages = messages.filter(
          ({ event }) => event.roundIndex === roundIndex,
        );
        expect(roundMessages.map(({ event }) => event.agent)).toEqual(
          roundIndex % 2 === 1
            ? ["unimelb", "competitor"]
            : ["competitor", "unimelb"],
        );
        expect(roundMessages.every(({ event }) => event.roundCount === debateRoundCount)).toBe(
          true,
        );
        expect(roundMessages.every(({ event }) => event.turnKind === (roundIndex === 1 ? "opening" : "rebuttal"))).toBe(
          true,
        );
      }

      expect(messages[0]?.at).toBeGreaterThanOrEqual(MIN_MESSAGE_GAP_MS);
      for (let index = 1; index < messages.length; index += 1) {
        expect(messages[index]!.at - messages[index - 1]!.at).toBeGreaterThanOrEqual(
          MIN_MESSAGE_GAP_MS,
        );
      }

      const compromisedVerdict = timedEvents.find(
        ({ event }) => event.type === "verdict.compromised",
      );
      expect(compromisedVerdict).toBeDefined();
      expect(compromisedVerdict!.at - messages.at(-1)!.at).toBeGreaterThanOrEqual(
        MIN_JUDGE_DELAY_MS,
      );
      expect(eventsOfType(events, "phase.changed").map(({ phase }) => phase)).toEqual([
        "opening_arguments",
        "rebuttals",
        "verifying",
        "awaiting_reveal",
        "integrity_reveal",
        "awaiting_clean_run",
        "fair_recheck",
        "complete",
      ]);
      expect(result.compromisedVerdict?.winner).toBe("unimelb");
      expect(result.integrity).toMatchObject({ passed: false });
      expect(result.fairIntegrity).toMatchObject({ passed: true });
      expect(result.fallbackUsed).toBe(true);
      expect(JSON.stringify(result.telemetry)).not.toContain(QUESTION);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("registers both manual gates before emitting them and rejects invalid or repeated actions", async () => {
    vi.useFakeTimers();
    const interactions = createDebateInteractionController();
    const phases: string[] = [];

    expect(interactions.reveal()).toBe(false);
    expect(interactions.runClean()).toBe(false);

    const resultPromise = runDebate(
      QUESTION,
      cannedConfig("compromised"),
      (event) => {
        if (event.type !== "phase.changed") return;
        phases.push(event.phase);
        if (event.phase === "awaiting_reveal") {
          expect(interactions.runClean()).toBe(false);
          expect(interactions.reveal()).toBe(true);
          expect(interactions.reveal()).toBe(false);
        }
        if (event.phase === "awaiting_clean_run") {
          expect(interactions.reveal()).toBe(false);
          expect(interactions.runClean()).toBe(true);
          expect(interactions.runClean()).toBe(false);
        }
      },
      undefined,
      interactions,
    );

    await vi.runAllTimersAsync();
    await expect(resultPromise).resolves.toMatchObject({ fallbackUsed: true });
    expect(phases).toContain("awaiting_reveal");
    expect(phases).toContain("awaiting_clean_run");
    expect(interactions.reveal()).toBe(false);
    expect(interactions.runClean()).toBe(false);
  });

  it("skips compromised and manual reveal stages in fair-only mode", async () => {
    const { timedEvents, events, fetchSpy, result } = await runCanned("fair", 2);
    const eventTypes = events.map(({ type }) => type);
    const phases = eventsOfType(events, "phase.changed").map(({ phase }) => phase);
    const messages = timedEvents.filter(({ event }) => event.type === "agent.message");
    const fairVerdict = timedEvents.find(({ event }) => event.type === "verdict.fair");

    expect(phases).toEqual([
      "opening_arguments",
      "rebuttals",
      "verifying",
      "fair_recheck",
      "complete",
    ]);
    expect(eventTypes).not.toContain("verdict.compromised");
    expect(eventTypes).not.toContain("xray.prompt_diff");
    expect(fairVerdict!.at - messages.at(-1)!.at).toBeGreaterThanOrEqual(
      MIN_JUDGE_DELAY_MS,
    );
    expect(result.compromisedVerdict).toBeUndefined();
    expect(result.integrity).toBeUndefined();
    expect(result.fairIntegrity.passed).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("debate cancellation", () => {
  it("rejects a controller aborted before the run without emitting events", async () => {
    const interactions = createDebateInteractionController();
    const events: SessionEvent[] = [];
    interactions.abort();

    await expect(
      runDebate(
        QUESTION,
        cannedConfig("compromised"),
        (event) => {
          events.push(event);
        },
        undefined,
        interactions,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(events).toHaveLength(0);
    expect(interactions.reveal()).toBe(false);
    expect(interactions.runClean()).toBe(false);
  });

  it("honours an external abort during presentation", async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    const events: SessionEvent[] = [];
    const resultPromise = runDebate(
      QUESTION,
      cannedConfig("compromised"),
      (event) => {
        events.push(event);
        if (event.type === "session.started") abortController.abort();
      },
      abortController.signal,
    );
    const rejection = expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });

    await vi.runAllTimersAsync();
    await rejection;
    expect(eventsOfType(events, "agent.message")).toHaveLength(0);
  });

  it.each(["awaiting_reveal", "awaiting_clean_run"] as const)(
    "aborts cleanly while paused at %s",
    async (abortPhase) => {
      vi.useFakeTimers();
      const interactions = createDebateInteractionController();
      const phases: string[] = [];
      const resultPromise = runDebate(
        QUESTION,
        cannedConfig("compromised"),
        (event) => {
          if (event.type !== "phase.changed") return;
          phases.push(event.phase);
          if (event.phase === "awaiting_reveal" && abortPhase === "awaiting_clean_run") {
            expect(interactions.reveal()).toBe(true);
          }
          if (event.phase === abortPhase) interactions.abort();
        },
        undefined,
        interactions,
      );
      const rejection = expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });

      await vi.runAllTimersAsync();
      await rejection;
      expect(phases).toContain(abortPhase);
      expect(phases).not.toContain("complete");
      expect(interactions.reveal()).toBe(false);
      expect(interactions.runClean()).toBe(false);
    },
  );
});
