import { z } from "zod";

import { classifyQuestion } from "@/lib/classifier";
import { isSampleQuestion, matchFallback } from "@/lib/fallbacks";
import {
  ADVOCATE_COMPARATOR_PROMPT,
  ADVOCATE_SHARED_PROMPT,
  ADVOCATE_UNIMELB_PROMPT,
  buildActiveVerifierPrompt,
  buildFairVerifierPrompt,
  checkFairPromptIntegrity,
  checkPromptIntegrity,
} from "@/lib/integrity";
import {
  OpenAIClientError,
  callStructuredResponse,
  type OpenAIUsage,
} from "@/lib/openai-client";
import { retrieveEvidence } from "@/lib/retrieval";
import { assessQuestion } from "@/lib/safety";
import {
  DebateTurnSchema,
  VerdictSchema,
} from "@/lib/schemas";
import type { SessionConfig } from "@/lib/session-config";
import {
  addTokenUsage,
  buildSessionTelemetry,
  createTokenTotals,
  type SessionTelemetry,
  type TelemetryErrorCode,
  type TokenTotals,
} from "@/lib/telemetry";
import type {
  AdvocateId,
  DebateRound,
  DebateTurn,
  DebateTurnKind,
  FairVerdict,
  IntegrityResult,
  RetrievedEvidence,
  SessionEvent,
  SupportedLanguage,
  Verdict,
} from "@/types/debate";
import {
  aggregateFairVerdicts,
  enforceCompromisedWinner,
  remapAnonymousWinner,
  validateDebateTurnEvidence,
  validateVerdictEvidence,
} from "@/lib/verdicts";

export type DebateEventEmitter = (
  event: SessionEvent,
) => void | Promise<void>;

export interface DebateTranscript {
  rounds: DebateRound[];
}

export interface DebateInteractionController {
  reveal(): boolean;
  runClean(): boolean;
  abort(): void;
}

type InteractionStage =
  | "idle"
  | "awaiting_reveal"
  | "revealed"
  | "awaiting_clean_run"
  | "clean_started"
  | "complete"
  | "aborted";

interface InteractionRuntime {
  controller: AbortController;
  stage: InteractionStage;
  pending?: {
    action: "reveal" | "run_clean";
    resolve: () => void;
  };
  arm(action: "reveal" | "run_clean", signal: AbortSignal): Promise<void>;
  finish(): void;
}

const INTERACTION_RUNTIMES = new WeakMap<DebateInteractionController, InteractionRuntime>();

export function createDebateInteractionController(): DebateInteractionController {
  const runtime: InteractionRuntime = {
    controller: new AbortController(),
    stage: "idle",
    arm(action, signal) {
      const expectedStage = action === "reveal" ? "idle" : "revealed";
      const waitingStage = action === "reveal" ? "awaiting_reveal" : "awaiting_clean_run";
      if (runtime.stage !== expectedStage || runtime.controller.signal.aborted || signal.aborted) {
        return Promise.reject(signal.reason ?? runtime.controller.signal.reason ?? abortError());
      }

      runtime.stage = waitingStage;
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          runtime.pending = undefined;
          runtime.stage = "aborted";
          reject(signal.reason ?? abortError());
        };
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        runtime.pending = {
          action,
          resolve: () => {
            cleanup();
            runtime.pending = undefined;
            runtime.stage = action === "reveal" ? "revealed" : "clean_started";
            resolve();
          },
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
    finish() {
      runtime.pending = undefined;
      if (runtime.stage !== "aborted") runtime.stage = "complete";
    },
  };

  const interactions: DebateInteractionController = {
    reveal() {
      if (runtime.stage !== "awaiting_reveal" || runtime.pending?.action !== "reveal") {
        return false;
      }
      runtime.pending.resolve();
      return true;
    },
    runClean() {
      if (runtime.stage !== "awaiting_clean_run" || runtime.pending?.action !== "run_clean") {
        return false;
      }
      runtime.pending.resolve();
      return true;
    },
    abort() {
      if (runtime.stage === "complete" || runtime.stage === "aborted") return;
      runtime.stage = "aborted";
      runtime.controller.abort(abortError());
    },
  };
  INTERACTION_RUNTIMES.set(interactions, runtime);
  return interactions;
}

export interface DebateRunResult {
  sessionId: string;
  transcript: DebateTranscript;
  compromisedVerdict?: Verdict;
  integrity?: IntegrityResult;
  fairIntegrity: IntegrityResult;
  fairVerdict: FairVerdict;
  evidence: RetrievedEvidence;
  fallbackUsed: boolean;
  durationMs: number;
  telemetry: SessionTelemetry;
}

interface CallMeta<T> {
  data: T;
  usage: OpenAIUsage;
}

interface AnonymousVerdict {
  questionCategory: Verdict["questionCategory"];
  winner: "A" | "B" | "tie" | "depends";
  headline: string;
  publicReasoning: string;
  evidenceChecks: Array<{
    claim: string;
    speaker: "A" | "B";
    status: Verdict["evidenceChecks"][number]["status"];
    evidenceIds: string[];
  }>;
  bestFor: Record<"A" | "B", string>;
  confidence: number;
  disclaimer: string;
}

const ANONYMOUS_VERDICT_SCHEMA = z.object({
  questionCategory: z.enum(["objective", "subjective", "mixed", "out_of_scope"]),
  winner: z.enum(["A", "B", "tie", "depends"]),
  headline: z.string().min(1).max(120),
  publicReasoning: z.string().min(1).max(900),
  evidenceChecks: z
    .array(
      z.object({
        claim: z.string().min(1).max(260),
        speaker: z.enum(["A", "B"]),
        status: z.enum(["supported", "opinion", "unsupported", "conflicting"]),
        evidenceIds: z.array(z.string()).max(5),
      }),
    )
    .max(12),
  bestFor: z.object({
    A: z.string().max(240),
    B: z.string().max(240),
  }),
  confidence: z.number().min(0).max(1),
  disclaimer: z.string().max(240),
});

function toOpenAIJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-7",
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

const DEBATE_TURN_JSON_SCHEMA = toOpenAIJsonSchema(DebateTurnSchema);
const VERDICT_JSON_SCHEMA = toOpenAIJsonSchema(VerdictSchema);
const ANONYMOUS_VERDICT_JSON_SCHEMA = toOpenAIJsonSchema(
  ANONYMOUS_VERDICT_SCHEMA,
);

export const MIN_MESSAGE_GAP_MS = 2_000;
export const MIN_JUDGE_DELAY_MS = 3_000;

const ROUND_GOALS = [
  "Make the strongest concise opening case for the visitor's criterion.",
  "Answer the other advocate's strongest relevant point with approved evidence.",
  "Test which evidence most directly addresses the visitor's stated criterion.",
  "Explain the most important trade-off while acknowledging the other side's genuine strength.",
  "Give a concise closing case without claiming universal superiority.",
] as const;

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function abortError(): DOMException {
  return new DOMException("The debate was cancelled.", "AbortError");
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now().toString(36)}`;
}

async function sleep(durationMs: number, signal: AbortSignal): Promise<void> {
  if (durationMs <= 0) return;
  if (signal.aborted) throw signal.reason ?? abortError();

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, durationMs);
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(signal.reason ?? abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function sleepUntil(timestampMs: number, signal: AbortSignal): Promise<void> {
  await sleep(Math.max(0, timestampMs - now()), signal);
}

function combinePrompt(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function publicEvidence(evidence: RetrievedEvidence) {
  const mapFact = (fact: RetrievedEvidence["unimelb"][number]) => ({
    id: fact.id,
    institutionId: fact.institutionId,
    category: fact.category,
    claim: fact.claim,
  });
  return {
    unimelb: evidence.unimelb.map(mapFact),
    competitor: evidence.competitor.map(mapFact),
  };
}

function asErrorCode(error: unknown): TelemetryErrorCode {
  if (error instanceof OpenAIClientError) return error.code;
  return "UNKNOWN_ERROR";
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number,
  signal: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal.aborted) throw signal.reason;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (
        attempt >= retries ||
        !(error instanceof OpenAIClientError) ||
        !error.retryable
      ) {
        throw error;
      }
    }
  }
  throw lastError;
}

function modelPayload(
  question: string,
  language: SupportedLanguage,
  evidence: RetrievedEvidence,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    visitorQuestion: question,
    responseLanguage: language,
    evidenceFacts: publicEvidence(evidence),
    ...extras,
  };
}

function replaceInstitutionNames(
  text: string,
  labels: Record<AdvocateId, string>,
): string {
  return text
    .replace(/The University of Melbourne|University of Melbourne|UniMelb|Melbourne University|Melbourne|墨尔本大学|墨爾本大學|墨尔本|墨爾本|墨大/giu, "__UNIMELB__")
    .replace(/Monash University|Monash|Victorian University B|the comparator|comparator university|莫纳什大学|莫納什大學|莫纳什|莫納什|维州大学 ?B|維州大學 ?B/giu, "__COMPETITOR__")
    .replace(/__UNIMELB__/gu, labels.unimelb)
    .replace(/__COMPETITOR__/gu, labels.competitor);
}

function anonymiseTurn(
  turn: DebateTurn,
  labels: Record<AdvocateId, string>,
  evidenceIdMap: Map<string, string>,
): DebateTurn {
  return {
    message: replaceInstitutionNames(turn.message, labels),
    stanceSummary: replaceInstitutionNames(turn.stanceSummary, labels),
    claims: turn.claims.map((claim) => ({
      ...claim,
      text: replaceInstitutionNames(claim.text, labels),
      evidenceIds: claim.evidenceIds.flatMap((id) => {
        const anonymousId = evidenceIdMap.get(id);
        return anonymousId ? [anonymousId] : [];
      }),
    })),
  };
}

function restoreCandidateLabels(
  text: string,
  mapping: Record<"A" | "B", AdvocateId>,
  competitorName: string,
): string {
  const publicNames: Record<AdvocateId, string> = {
    unimelb: "The University of Melbourne",
    competitor: competitorName,
  };
  return text
    .replace(/Candidate A|候选(?:大学)? ?A|候選(?:大學)? ?A|A ?候选|A ?候選/giu, "__CANDIDATE_A__")
    .replace(/Candidate B|候选(?:大学)? ?B|候選(?:大學)? ?B|B ?候选|B ?候選/giu, "__CANDIDATE_B__")
    .replace(/__CANDIDATE_A__/gu, publicNames[mapping.A])
    .replace(/__CANDIDATE_B__/gu, publicNames[mapping.B]);
}

async function generateAdvocateTurn(
  agent: AdvocateId,
  roundIndex: number,
  roundCount: number,
  turnKind: DebateTurnKind,
  question: string,
  language: SupportedLanguage,
  evidence: RetrievedEvidence,
  transcript: DebateTranscript,
  config: SessionConfig,
  signal: AbortSignal,
): Promise<CallMeta<DebateTurn>> {
  const agentConfig =
    agent === "unimelb"
      ? config.agents.unimelbAdvocate
      : config.agents.comparatorAdvocate;
  const rolePrompt =
    agent === "unimelb" ? ADVOCATE_UNIMELB_PROMPT : ADVOCATE_COMPARATOR_PROMPT;
  const relevantEvidence =
    agent === "unimelb" ? evidence.unimelb : evidence.competitor;

  const response = await withRetry(
    () =>
      callStructuredResponse({
        apiKey: config.apiKey,
        model: agentConfig.model,
        reasoningEffort: agentConfig.reasoningEffort,
        systemPrompt: combinePrompt(ADVOCATE_SHARED_PROMPT, rolePrompt),
        input: modelPayload(question, language, evidence, {
          assignedInstitution: agent,
          roundIndex,
          roundCount,
          turnKind,
          roundGoal: ROUND_GOALS[roundIndex - 1],
          evidenceFacts: relevantEvidence.map(({ id, category, claim }) => ({
            id,
            category,
            claim,
          })),
          priorTranscript: transcript.rounds,
        }),
        schemaName: "debate_turn",
        schema: DEBATE_TURN_JSON_SCHEMA,
        validate: (value) => DebateTurnSchema.parse(value),
        maxOutputTokens: turnKind === "opening" ? 300 : 260,
        timeoutMs: config.debaterTimeoutMs,
        signal,
      }),
    config.maxRetries,
    signal,
  );

  return {
    data: validateDebateTurnEvidence(response.data, relevantEvidence),
    usage: response.usage,
  };
}

async function generateVerdict(
  compromised: boolean,
  question: string,
  language: SupportedLanguage,
  evidence: RetrievedEvidence,
  transcript: DebateTranscript,
  config: SessionConfig,
  signal: AbortSignal,
): Promise<CallMeta<Verdict>> {
  const response = await withRetry(
    () =>
      callStructuredResponse({
        apiKey: config.apiKey,
        model: config.agents.verifier.model,
        reasoningEffort: config.agents.verifier.reasoningEffort,
        systemPrompt: buildActiveVerifierPrompt(compromised),
        input: modelPayload(question, language, evidence, { transcript }),
        schemaName: "verdict",
        schema: VERDICT_JSON_SCHEMA,
        validate: (value) => VerdictSchema.parse(value),
        maxOutputTokens: 700,
        timeoutMs: config.verifierTimeoutMs,
        signal,
      }),
    config.maxRetries,
    signal,
  );

  return {
    data: validateVerdictEvidence(response.data, [
      ...evidence.unimelb,
      ...evidence.competitor,
    ]),
    usage: response.usage,
  };
}

async function generateAnonymousVerdict(
  mapping: Record<"A" | "B", AdvocateId>,
  question: string,
  language: SupportedLanguage,
  evidence: RetrievedEvidence,
  transcript: DebateTranscript,
  config: SessionConfig,
  signal: AbortSignal,
): Promise<CallMeta<Verdict>> {
  const candidateLabelByInstitution: Record<AdvocateId, string> = {
    [mapping.A]: "Candidate A",
    [mapping.B]: "Candidate B",
  } as Record<AdvocateId, string>;
  const evidenceIdMap = new Map<string, string>();
  const originalEvidenceIdMap = new Map<string, string>();
  const buildAnonymousEvidence = (
    candidate: "A" | "B",
    facts: RetrievedEvidence["unimelb"],
  ) =>
    facts.map((fact, index) => {
      const anonymousId = `${candidate}-E${index + 1}`;
      evidenceIdMap.set(fact.id, anonymousId);
      originalEvidenceIdMap.set(anonymousId, fact.id);
      return {
        id: anonymousId,
        category: fact.category,
        claim: replaceInstitutionNames(fact.claim, candidateLabelByInstitution),
      };
    });
  const evidenceForA =
    mapping.A === "unimelb" ? evidence.unimelb : evidence.competitor;
  const evidenceForB =
    mapping.B === "unimelb" ? evidence.unimelb : evidence.competitor;
  const candidateEvidence = {
    A: buildAnonymousEvidence("A", evidenceForA),
    B: buildAnonymousEvidence("B", evidenceForB),
  };
  const candidateTranscript = transcript.rounds.map((round) => ({
    roundIndex: round.roundIndex,
    turnKind: round.turnKind,
    turns: {
      A: anonymiseTurn(
        round.turns[mapping.A],
        candidateLabelByInstitution,
        evidenceIdMap,
      ),
      B: anonymiseTurn(
        round.turns[mapping.B],
        candidateLabelByInstitution,
        evidenceIdMap,
      ),
    },
  }));

  const response = await withRetry(
    () =>
      callStructuredResponse({
        apiKey: config.apiKey,
        model: config.agents.fairVerifier.model,
        reasoningEffort: config.agents.fairVerifier.reasoningEffort,
        systemPrompt: buildFairVerifierPrompt(),
        input: {
          visitorQuestion: replaceInstitutionNames(
            question,
            candidateLabelByInstitution,
          ),
          responseLanguage: language,
          candidateTranscript,
          candidateEvidence,
        },
        schemaName: "anonymous_verdict",
        schema: ANONYMOUS_VERDICT_JSON_SCHEMA,
        validate: (value) => ANONYMOUS_VERDICT_SCHEMA.parse(value),
        maxOutputTokens: 650,
        timeoutMs: config.verifierTimeoutMs,
        signal,
      }),
    config.maxRetries,
    signal,
  );

  const anonymous = response.data as AnonymousVerdict;
  const competitorName =
    config.comparatorMode === "named"
      ? "Monash University"
      : "Victorian University B";
  const remapped: Verdict = {
    questionCategory: anonymous.questionCategory,
    winner: remapAnonymousWinner(anonymous.winner, mapping),
    headline: restoreCandidateLabels(anonymous.headline, mapping, competitorName),
    publicReasoning: restoreCandidateLabels(
      anonymous.publicReasoning,
      mapping,
      competitorName,
    ),
    evidenceChecks: anonymous.evidenceChecks.map((check) => ({
      ...check,
      claim: restoreCandidateLabels(check.claim, mapping, competitorName),
      speaker: mapping[check.speaker],
      evidenceIds: check.evidenceIds.flatMap((id) => {
        const originalId = originalEvidenceIdMap.get(id);
        return originalId ? [originalId] : [];
      }),
    })),
    bestFor: {
      unimelb:
        restoreCandidateLabels(
          mapping.A === "unimelb" ? anonymous.bestFor.A : anonymous.bestFor.B,
          mapping,
          competitorName,
        ),
      competitor:
        restoreCandidateLabels(
          mapping.A === "competitor" ? anonymous.bestFor.A : anonymous.bestFor.B,
          mapping,
          competitorName,
        ),
    },
    confidence: anonymous.confidence,
    disclaimer: restoreCandidateLabels(
      anonymous.disclaimer,
      mapping,
      competitorName,
    ),
  };
  return {
    data: validateVerdictEvidence(remapped, [
      ...evidence.unimelb,
      ...evidence.competitor,
    ]),
    usage: response.usage,
  };
}

async function emitEvent(
  emit: DebateEventEmitter | undefined,
  event: SessionEvent,
): Promise<void> {
  await emit?.(event);
}

function cloneTurn(turn: DebateTurn): DebateTurn {
  return {
    ...turn,
    claims: turn.claims.map((claim) => ({
      ...claim,
      evidenceIds: [...claim.evidenceIds],
    })),
  };
}

function createLinkedController(parentSignal: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason ?? abortError());
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  return {
    controller,
    cleanup: () => parentSignal.removeEventListener("abort", abortFromParent),
  };
}

export async function runDebate(
  question: string,
  config: SessionConfig,
  emit?: DebateEventEmitter,
  signal?: AbortSignal,
  interactions?: DebateInteractionController,
): Promise<DebateRunResult> {
  const startedAt = now();
  const sessionId = createSessionId();
  const sessionController = new AbortController();
  const interactionRuntime = interactions ? INTERACTION_RUNTIMES.get(interactions) : undefined;
  if (interactions && !interactionRuntime) {
    throw new Error("Use createDebateInteractionController() to create debate interactions.");
  }
  const abortFromCaller = () => sessionController.abort(signal?.reason ?? abortError());
  const abortFromInteractions = () =>
    sessionController.abort(interactionRuntime?.controller.signal.reason ?? abortError());
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (interactionRuntime?.controller.signal.aborted) abortFromInteractions();
  else interactionRuntime?.controller.signal.addEventListener("abort", abortFromInteractions, {
    once: true,
  });
  const sessionSignal = sessionController.signal;

  let fallbackUsed = config.runtimeMode === "canned";
  let lastErrorCode: TelemetryErrorCode | null = null;
  let usage: TokenTotals = createTokenTotals();
  const classification = classifyQuestion(question);
  const safety = assessQuestion(question, {
    allowFreeText: config.freeTextEnabled,
    isSampleQuestion: isSampleQuestion(question),
  });
  const safeQuestion = safety.sanitizedQuestion ?? question.normalize("NFKC").trim();
  const competitorId = config.comparatorMode === "named" ? "monash" : undefined;
  const evidence = retrieveEvidence(safeQuestion, { competitorId });
  const transcript: DebateTranscript = {
    rounds: [],
  };
  let compromisedVerdict: Verdict | undefined;
  let integrity: IntegrityResult | undefined;
  let fairIntegrity: IntegrityResult;
  let fairVerdict: FairVerdict | undefined;

  const recordUsage = (next: OpenAIUsage) => {
    usage = addTokenUsage(usage, next);
  };
  const announceFallback = async (error?: unknown) => {
    const shouldAnnounce = !fallbackUsed;
    fallbackUsed = true;
    if (error) lastErrorCode = asErrorCode(error);
    if (!shouldAnnounce) return;
    await emitEvent(emit, {
      type: "error.recoverable",
      code: error instanceof OpenAIClientError ? error.code : "CONTINUITY_MODE",
      message: "Live AI was unavailable, so the prepared demo content is being used.",
    });
  };

  try {
    if (sessionSignal.aborted) throw sessionSignal.reason ?? abortError();
    if (!safety.allowed) {
      const error = new Error(safety.publicMessage ?? "This question cannot enter the debate.");
      (error as Error & { code?: string }).code = safety.outcome;
      throw error;
    }
    if (safety.language !== "en") {
      const error = new Error(
        "This Open Day demo is available in English only. Please choose an English question.",
      );
      (error as Error & { code?: string }).code = "unsupported_language";
      throw error;
    }

    const fairIntegrityPromise = checkFairPromptIntegrity(buildFairVerifierPrompt());
    const activeIntegrityPromise =
      config.demoMode === "compromised"
        ? checkPromptIntegrity(buildActiveVerifierPrompt(true))
        : undefined;
    // Hashing starts before the presentation delays. Mark early rejections as
    // handled until the results are awaited at their corresponding reveal.
    void fairIntegrityPromise.catch(() => undefined);
    void activeIntegrityPromise?.catch(() => undefined);

    const fallback = matchFallback(
      safeQuestion,
      safety.language,
      config.comparatorMode === "named" ? "monash" : "victorian-university-b",
    );
    const fallbackRounds = fallback.rounds.slice(0, config.debateRoundCount);
    if (fallbackRounds.length !== config.debateRoundCount) {
      throw new Error("The continuity package does not contain every configured debate round.");
    }

    const waitForInteraction = async (
      action: "reveal" | "run_clean",
      phase: "awaiting_reveal" | "awaiting_clean_run",
    ) => {
      const gate = interactionRuntime?.arm(action, sessionSignal) ?? Promise.resolve();
      void gate.catch(() => undefined);
      await emitEvent(emit, { type: "phase.changed", phase });
      await gate;
    };

    const presentationStartedAt = now();
    await emitEvent(emit, {
      type: "session.started",
      sessionId,
      mode: config.demoMode,
      fallbackUsed,
      roundCount: config.debateRoundCount,
    });
    let nextMessageDueAt = presentationStartedAt + MIN_MESSAGE_GAP_MS;
    let lastMessageVisibleAt = presentationStartedAt;

    for (const fallbackRound of fallbackRounds) {
      const { roundIndex, turnKind } = fallbackRound;
      if (roundIndex === 1) {
        await emitEvent(emit, { type: "phase.changed", phase: "opening_arguments" });
      } else if (roundIndex === 2) {
        await emitEvent(emit, { type: "phase.changed", phase: "rebuttals" });
      }
      await emitEvent(emit, {
        type: "round.started",
        roundIndex,
        roundCount: config.debateRoundCount,
        turnKind,
      });
      await Promise.all(
        (["unimelb", "competitor"] as const).map((agent) =>
          emitEvent(emit, { type: "agent.status", agent, status: "thinking" }),
        ),
      );

      const liveRound = config.runtimeMode === "live" && !fallbackUsed;
      let generatedTurns: Record<AdvocateId, DebateTurn> | undefined;

      if (liveRound) {
        const linkedRound = createLinkedController(sessionSignal);
        let firstRoundError: unknown;
        const generate = (agent: AdvocateId) =>
          generateAdvocateTurn(
            agent,
            roundIndex,
            config.debateRoundCount,
            turnKind,
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            linkedRound.controller.signal,
          ).catch((error: unknown) => {
            if (!sessionSignal.aborted && firstRoundError === undefined) {
              firstRoundError = error;
              linkedRound.controller.abort(error);
            }
            throw error;
          });

        try {
          const [unimelb, competitor] = await Promise.allSettled([
            generate("unimelb"),
            generate("competitor"),
          ]);
          if (sessionSignal.aborted) throw sessionSignal.reason ?? abortError();

          if (unimelb.status === "fulfilled") recordUsage(unimelb.value.usage);
          if (competitor.status === "fulfilled") recordUsage(competitor.value.usage);

          if (unimelb.status === "fulfilled" && competitor.status === "fulfilled") {
            generatedTurns = {
              unimelb: unimelb.value.data,
              competitor: competitor.value.data,
            };
          } else {
            const rejectedReason =
              unimelb.status === "rejected"
                ? unimelb.reason
                : competitor.status === "rejected"
                  ? competitor.reason
                  : new Error("A live debate round did not produce both turns.");
            const error = firstRoundError ?? rejectedReason;
            await announceFallback(error);
          }
        } finally {
          linkedRound.cleanup();
        }
      }

      const displayedTurns: Record<AdvocateId, DebateTurn> = generatedTurns ?? {
        unimelb: cloneTurn(fallbackRound.turns.unimelb),
        competitor: cloneTurn(fallbackRound.turns.competitor),
      };
      const displayOrder: readonly AdvocateId[] = ["unimelb", "competitor"];

      for (const agent of displayOrder) {
        await sleepUntil(nextMessageDueAt, sessionSignal);
        if (sessionSignal.aborted) throw sessionSignal.reason ?? abortError();

        await emitEvent(emit, { type: "agent.status", agent, status: "speaking" });
        await emitEvent(emit, {
          type: "agent.message",
          agent,
          roundIndex,
          roundCount: config.debateRoundCount,
          turnKind,
          turn: displayedTurns[agent],
        });
        lastMessageVisibleAt = now();
        nextMessageDueAt = lastMessageVisibleAt + MIN_MESSAGE_GAP_MS;
        await emitEvent(emit, { type: "agent.status", agent, status: "complete" });
      }

      transcript.rounds.push({ roundIndex, turnKind, turns: displayedTurns });
      await emitEvent(emit, {
        type: "round.completed",
        roundIndex,
        roundCount: config.debateRoundCount,
        turnKind,
      });
    }

    await emitEvent(emit, { type: "phase.changed", phase: "verifying" });
    await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "checking" });
    const judgeDelay = sleepUntil(
      lastMessageVisibleAt + MIN_JUDGE_DELAY_MS,
      sessionSignal,
    );
    void judgeDelay.catch(() => undefined);

    const generateFairVerdict = async (): Promise<FairVerdict> => {
      if (config.runtimeMode !== "live" || fallbackUsed) return fallback.fairVerdict;
      const linkedClean = createLinkedController(sessionSignal);
      try {
        const cleanPair = Promise.all([
          generateAnonymousVerdict(
            { A: "unimelb", B: "competitor" },
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            linkedClean.controller.signal,
          ),
          generateAnonymousVerdict(
            { A: "competitor", B: "unimelb" },
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            linkedClean.controller.signal,
          ),
        ]);
        void cleanPair.catch((error: unknown) => linkedClean.controller.abort(error));
        const [first, reversed] = await cleanPair;
        recordUsage(first.usage);
        recordUsage(reversed.usage);
        return aggregateFairVerdicts(first.data, reversed.data);
      } catch (error) {
        if (sessionSignal.aborted) throw sessionSignal.reason ?? abortError();
        await announceFallback(error);
        return fallback.fairVerdict;
      } finally {
        linkedClean.cleanup();
      }
    };

    let fairVerdictPromise: Promise<FairVerdict> | undefined;
    if (config.demoMode === "fair") {
      fairVerdictPromise = generateFairVerdict();
      void fairVerdictPromise.catch(() => undefined);
    }

    if (config.demoMode === "compromised") {
      const generateCompromisedVerdict = async (): Promise<Verdict> => {
        if (config.runtimeMode === "live" && !fallbackUsed) {
          try {
            const generated = await generateVerdict(
              true,
              safeQuestion,
              safety.language,
              evidence,
              transcript,
              config,
              sessionSignal,
            );
            recordUsage(generated.usage);
            return enforceCompromisedWinner(generated.data, evidence, safety.language);
          } catch (error) {
            if (sessionSignal.aborted) throw sessionSignal.reason ?? abortError();
            await announceFallback(error);
          }
        }
        return enforceCompromisedWinner(
          fallback.compromisedVerdict,
          evidence,
          safety.language,
        );
      };
      [compromisedVerdict] = await Promise.all([generateCompromisedVerdict(), judgeDelay]);
      compromisedVerdict = validateVerdictEvidence(compromisedVerdict, [
        ...evidence.unimelb,
        ...evidence.competitor,
      ]);
      await emitEvent(emit, {
        type: "verifier.checks",
        checks: compromisedVerdict.evidenceChecks,
      });
      await emitEvent(emit, {
        type: "verdict.compromised",
        verdict: compromisedVerdict,
      });
      await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "complete" });
      await waitForInteraction("reveal", "awaiting_reveal");
      await emitEvent(emit, { type: "phase.changed", phase: "integrity_reveal" });
      integrity = await activeIntegrityPromise!;
      await emitEvent(emit, { type: "integrity.result", context: "active", result: integrity });
      await emitEvent(emit, {
        type: "xray.prompt_diff",
        lines: integrity.changedLines,
      });
      await waitForInteraction("run_clean", "awaiting_clean_run");
    } else {
      [fairVerdict] = await Promise.all([fairVerdictPromise!, judgeDelay]);
    }

    await emitEvent(emit, { type: "phase.changed", phase: "fair_recheck" });
    await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "checking" });
    if (config.demoMode === "compromised") {
      if (config.runtimeMode === "canned" || fallbackUsed) {
        await sleep(1_200, sessionSignal);
      }
      fairVerdict = await generateFairVerdict();
    }
    if (!fairVerdict) {
      throw new Error("The fair verifier did not produce a verdict.");
    }

    fairIntegrity = await fairIntegrityPromise;
    await emitEvent(emit, {
      type: "integrity.result",
      context: "fair",
      result: fairIntegrity,
    });
    await emitEvent(emit, { type: "verdict.fair", verdict: fairVerdict });
    await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "complete" });
    await emitEvent(emit, { type: "phase.changed", phase: "complete" });

    const durationMs = Math.round(now() - startedAt);
    await emitEvent(emit, {
      type: "session.complete",
      durationMs,
      fallbackUsed,
    });
    interactionRuntime?.finish();
    return {
      sessionId,
      transcript,
      compromisedVerdict,
      integrity,
      fairIntegrity,
      fairVerdict,
      evidence,
      fallbackUsed,
      durationMs,
      telemetry: buildSessionTelemetry({
        sessionId,
        category: classification.category,
        language: "en",
        durationMs,
        fallbackUsed,
        modelIds: [
          config.agents.unimelbAdvocate.model,
          config.agents.comparatorAdvocate.model,
          ...(config.demoMode === "compromised" ? [config.agents.verifier.model] : []),
          config.agents.fairVerifier.model,
        ],
        usage,
        errorCode: lastErrorCode,
      }),
    };
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
    interactionRuntime?.controller.signal.removeEventListener("abort", abortFromInteractions);
    if (interactionRuntime?.stage !== "complete") interactionRuntime?.finish();
  }
}
