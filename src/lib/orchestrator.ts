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
  DebateTurn,
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
  openings: Record<AdvocateId, DebateTurn>;
  rebuttals: Record<AdvocateId, DebateTurn>;
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

const EMPTY_TURN: DebateTurn = {
  message: "",
  stanceSummary: "",
  claims: [],
};

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now().toString(36)}`;
}

async function sleep(durationMs: number, signal: AbortSignal): Promise<void> {
  if (durationMs <= 0) return;
  if (signal.aborted) throw signal.reason;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(resolve, durationMs);
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
  turnKind: "opening" | "rebuttal",
  question: string,
  language: SupportedLanguage,
  evidence: RetrievedEvidence,
  transcript: Partial<DebateTranscript>,
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
          turnKind,
          evidenceFacts: relevantEvidence.map(({ id, category, claim }) => ({
            id,
            category,
            claim,
          })),
          priorTranscript: turnKind === "rebuttal" ? transcript.openings : undefined,
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
  const candidateTranscript = {
    A: anonymiseTurn(
      transcript.openings[mapping.A],
      candidateLabelByInstitution,
      evidenceIdMap,
    ),
    B: anonymiseTurn(
      transcript.openings[mapping.B],
      candidateLabelByInstitution,
      evidenceIdMap,
    ),
    rebuttalA: anonymiseTurn(
      transcript.rebuttals[mapping.A],
      candidateLabelByInstitution,
      evidenceIdMap,
    ),
    rebuttalB: anonymiseTurn(
      transcript.rebuttals[mapping.B],
      candidateLabelByInstitution,
      evidenceIdMap,
    ),
  };

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

export async function runDebate(
  question: string,
  config: SessionConfig,
  emit?: DebateEventEmitter,
  signal?: AbortSignal,
): Promise<DebateRunResult> {
  const startedAt = now();
  const sessionId = createSessionId();
  const totalController = new AbortController();
  const presentationSignal = signal ?? new AbortController().signal;
  const timeoutReason = new DOMException("Session timed out", "TimeoutError");
  const totalTimeoutId = globalThis.setTimeout(
    () => totalController.abort(timeoutReason),
    config.totalSessionTimeoutMs,
  );
  const abortFromCaller = () => totalController.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });

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
    openings: { unimelb: EMPTY_TURN, competitor: EMPTY_TURN },
    rebuttals: { unimelb: EMPTY_TURN, competitor: EMPTY_TURN },
  };
  let compromisedVerdict: Verdict | undefined;
  let integrity: IntegrityResult | undefined;
  let fairIntegrity: IntegrityResult;
  let fairVerdict: FairVerdict;

  const recordUsage = (next: OpenAIUsage) => {
    usage = addTokenUsage(usage, next);
  };
  const announceFallback = async (error?: unknown) => {
    fallbackUsed = true;
    if (error) lastErrorCode = asErrorCode(error);
    await emitEvent(emit, {
      type: "error.recoverable",
      code: error instanceof OpenAIClientError ? error.code : "CONTINUITY_MODE",
      message: "Live generation was unavailable, so the prepared continuity transcript is being used.",
    });
  };

  try {
    if (!safety.allowed) {
      const error = new Error(safety.publicMessage ?? "This question cannot enter the debate.");
      (error as Error & { code?: string }).code = safety.outcome;
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
    const continuityDelay = async (durationMs: number) => {
      if (config.runtimeMode === "canned" || fallbackUsed) {
        await sleep(durationMs, presentationSignal);
      }
    };
    await emitEvent(emit, {
      type: "session.started",
      sessionId,
      mode: config.demoMode,
      fallbackUsed,
    });
    await emitEvent(emit, { type: "phase.changed", phase: "opening_arguments" });
    await Promise.all(
      (["unimelb", "competitor"] as const).map((agent) =>
        emitEvent(emit, { type: "agent.status", agent, status: "thinking" }),
      ),
    );

    if (config.runtimeMode === "live" && !fallbackUsed) {
      try {
        const [unimelb, competitor] = await Promise.all([
          generateAdvocateTurn(
            "unimelb",
            "opening",
            safeQuestion,
            safety.language,
            evidence,
            {},
            config,
            totalController.signal,
          ),
          generateAdvocateTurn(
            "competitor",
            "opening",
            safeQuestion,
            safety.language,
            evidence,
            {},
            config,
            totalController.signal,
          ),
        ]);
        recordUsage(unimelb.usage);
        recordUsage(competitor.usage);
        transcript.openings = {
          unimelb: unimelb.data,
          competitor: competitor.data,
        };
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        await announceFallback(error);
        transcript.openings = {
          unimelb: cloneTurn(fallback.openings.unimelb),
          competitor: cloneTurn(fallback.openings.competitor),
        };
      }
    } else {
      transcript.openings = {
        unimelb: cloneTurn(fallback.openings.unimelb),
        competitor: cloneTurn(fallback.openings.competitor),
      };
    }

    await continuityDelay(fallback.timing.openingDelayMs);

    for (const agent of ["unimelb", "competitor"] as const) {
      await emitEvent(emit, { type: "agent.status", agent, status: "speaking" });
      await emitEvent(emit, {
        type: "agent.message",
        agent,
        turnKind: "opening",
        turn: transcript.openings[agent],
      });
    }

    await emitEvent(emit, { type: "phase.changed", phase: "rebuttals" });
    await Promise.all(
      (["unimelb", "competitor"] as const).map((agent) =>
        emitEvent(emit, { type: "agent.status", agent, status: "thinking" }),
      ),
    );

    if (config.runtimeMode === "live" && !fallbackUsed) {
      try {
        const [unimelb, competitor] = await Promise.all([
          generateAdvocateTurn(
            "unimelb",
            "rebuttal",
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            totalController.signal,
          ),
          generateAdvocateTurn(
            "competitor",
            "rebuttal",
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            totalController.signal,
          ),
        ]);
        recordUsage(unimelb.usage);
        recordUsage(competitor.usage);
        transcript.rebuttals = {
          unimelb: unimelb.data,
          competitor: competitor.data,
        };
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        await announceFallback(error);
        transcript.rebuttals = {
          unimelb: cloneTurn(fallback.rebuttals.unimelb),
          competitor: cloneTurn(fallback.rebuttals.competitor),
        };
      }
    } else {
      transcript.rebuttals = {
        unimelb: cloneTurn(fallback.rebuttals.unimelb),
        competitor: cloneTurn(fallback.rebuttals.competitor),
      };
    }

    await continuityDelay(fallback.timing.rebuttalDelayMs);

    for (const agent of ["unimelb", "competitor"] as const) {
      await emitEvent(emit, { type: "agent.status", agent, status: "speaking" });
      await emitEvent(emit, {
        type: "agent.message",
        agent,
        turnKind: "rebuttal",
        turn: transcript.rebuttals[agent],
      });
      await emitEvent(emit, { type: "agent.status", agent, status: "complete" });
    }

    if (config.demoMode === "compromised") {
      await emitEvent(emit, { type: "phase.changed", phase: "verifying" });
      await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "checking" });
      if (config.runtimeMode === "live" && !fallbackUsed) {
        try {
          const generated = await generateVerdict(
            true,
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            totalController.signal,
          );
          recordUsage(generated.usage);
          compromisedVerdict = enforceCompromisedWinner(
            generated.data,
            evidence,
            safety.language,
          );
        } catch (error) {
          if (signal?.aborted) throw signal.reason;
          await announceFallback(error);
          compromisedVerdict = enforceCompromisedWinner(
            fallback.compromisedVerdict,
            evidence,
            safety.language,
          );
        }
      } else {
        compromisedVerdict = enforceCompromisedWinner(
          fallback.compromisedVerdict,
          evidence,
          safety.language,
        );
      }
      compromisedVerdict = validateVerdictEvidence(compromisedVerdict, [
        ...evidence.unimelb,
        ...evidence.competitor,
      ]);
      await continuityDelay(fallback.timing.verdictDelayMs);
      await emitEvent(emit, {
        type: "verifier.checks",
        checks: compromisedVerdict.evidenceChecks,
      });
      await emitEvent(emit, {
        type: "verdict.compromised",
        verdict: compromisedVerdict,
      });
      try {
        await sleep(
          config.runtimeMode === "canned"
            ? Math.min(config.autoRevealDelayMs, fallback.timing.revealDelayMs)
            : config.autoRevealDelayMs,
          presentationSignal,
        );
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        throw error;
      }
      await emitEvent(emit, { type: "phase.changed", phase: "integrity_reveal" });
      integrity = await activeIntegrityPromise!;
      await emitEvent(emit, { type: "integrity.result", context: "active", result: integrity });
      await emitEvent(emit, {
        type: "xray.prompt_diff",
        lines: integrity.changedLines,
      });
    }

    await emitEvent(emit, { type: "phase.changed", phase: "fair_recheck" });
    await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "checking" });
    if (config.runtimeMode === "live" && !fallbackUsed) {
      try {
        const [first, reversed] = await Promise.all([
          generateAnonymousVerdict(
            { A: "unimelb", B: "competitor" },
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            totalController.signal,
          ),
          generateAnonymousVerdict(
            { A: "competitor", B: "unimelb" },
            safeQuestion,
            safety.language,
            evidence,
            transcript,
            config,
            totalController.signal,
          ),
        ]);
        recordUsage(first.usage);
        recordUsage(reversed.usage);
        fairVerdict = aggregateFairVerdicts(first.data, reversed.data);
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        await announceFallback(error);
        fairVerdict = fallback.fairVerdict;
      }
    } else {
      fairVerdict = fallback.fairVerdict;
    }

    fairIntegrity = await fairIntegrityPromise;
    await emitEvent(emit, {
      type: "integrity.result",
      context: "fair",
      result: fairIntegrity,
    });
    await continuityDelay(fallback.timing.fairVerdictDelayMs);
    await emitEvent(emit, { type: "verdict.fair", verdict: fairVerdict });
    await emitEvent(emit, { type: "agent.status", agent: "verifier", status: "complete" });
    await emitEvent(emit, { type: "phase.changed", phase: "complete" });

    const durationMs = Math.round(now() - startedAt);
    await emitEvent(emit, {
      type: "session.complete",
      durationMs,
      fallbackUsed,
    });
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
        language: safety.language === "zh" ? "zh" : "en",
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
    globalThis.clearTimeout(totalTimeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
