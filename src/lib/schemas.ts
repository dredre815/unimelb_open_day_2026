import { z } from "zod";

import { EVIDENCE_CATEGORIES, FALLBACK_CATEGORIES } from "@/types/debate";

export const SupportedLanguageSchema = z.enum(["en", "zh"]);
export const QuestionCategorySchema = z.enum(["objective", "subjective", "mixed", "out_of_scope"]);
export const AdvocateIdSchema = z.enum(["unimelb", "competitor"]);
export const AgentIdSchema = z.enum(["unimelb", "competitor", "verifier"]);
export const WinnerSchema = z.enum(["unimelb", "competitor", "tie", "depends"]);
export const EvidenceCategorySchema = z.enum(EVIDENCE_CATEGORIES);
export const FallbackCategorySchema = z.enum(FALLBACK_CATEGORIES);

export const EvidenceFactSchema = z.strictObject({
  id: z.string().min(1),
  institutionId: z.string().min(1),
  category: EvidenceCategorySchema,
  claim: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.url(),
  sourceType: z.literal("official"),
  reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string().min(1)),
  safeForPublicComparison: z.boolean(),
  notes: z.string().min(1).optional(),
});

export const InstitutionEvidencePackSchema = z.strictObject({
  id: z.string().min(1),
  displayName: z.string().min(1),
  profileDisclosure: z.string().min(1).optional(),
  facts: z.array(EvidenceFactSchema).min(1),
});

export const DebateClaimSchema = z.strictObject({
  text: z.string().min(1).max(240),
  kind: z.enum(["fact", "opinion", "recommendation"]),
  evidenceIds: z.array(z.string()).max(4),
});

export const DebateTurnSchema = z.strictObject({
  message: z.string().min(1).max(700),
  stanceSummary: z.string().max(180),
  claims: z.array(DebateClaimSchema).max(5),
});

export const EvidenceCheckSchema = z.strictObject({
  claim: z.string().min(1).max(260),
  speaker: AdvocateIdSchema,
  status: z.enum(["supported", "opinion", "unsupported", "conflicting"]),
  evidenceIds: z.array(z.string()).max(5),
});

export const VerdictSchema = z.strictObject({
  questionCategory: QuestionCategorySchema,
  winner: WinnerSchema,
  headline: z.string().min(1).max(120),
  publicReasoning: z.string().min(1).max(900),
  evidenceChecks: z.array(EvidenceCheckSchema).max(12),
  bestFor: z.strictObject({
    unimelb: z.string().max(240),
    competitor: z.string().max(240),
  }),
  confidence: z.number().min(0).max(1),
  disclaimer: z.string().max(240),
});

export const FairVerdictSchema = z.strictObject({
  winner: WinnerSchema,
  orderConsistent: z.boolean(),
  firstJudgeWinner: WinnerSchema,
  reversedJudgeWinner: WinnerSchema,
  headline: z.string().min(1).max(160),
  publicReasoning: z.string().min(1).max(900),
  takeaway: z.string().min(1).max(300),
});

export const PromptDiffLineSchema = z.strictObject({
  type: z.enum(["added", "removed", "unchanged"]),
  text: z.string(),
  oldLineNumber: z.number().int().positive().optional(),
  newLineNumber: z.number().int().positive().optional(),
});

export const IntegrityResultSchema = z.strictObject({
  passed: z.boolean(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  activeHash: z.string().regex(/^[a-f0-9]{64}$/),
  changedLines: z.array(PromptDiffLineSchema),
  publicLabel: z.string().min(1),
});

export const QuestionClassificationSchema = z.strictObject({
  language: SupportedLanguageSchema,
  category: QuestionCategorySchema,
  fallbackCategory: FallbackCategorySchema,
  evidenceCategories: z.array(EvidenceCategorySchema).min(1).max(4),
  matchedKeywords: z.array(z.string()),
  isUniversityRelated: z.boolean(),
});

export const SafetyAssessmentSchema = z.strictObject({
  allowed: z.boolean(),
  outcome: z.enum([
    "allow",
    "empty",
    "too_long",
    "personal_information",
    "prompt_injection",
    "unsafe_content",
    "off_topic",
  ]),
  language: SupportedLanguageSchema,
  publicMessage: z.string().optional(),
  sanitizedQuestion: z.string().max(240).optional(),
});

export const FallbackTimingSchema = z.strictObject({
  openingDelayMs: z.number().int().nonnegative(),
  rebuttalDelayMs: z.number().int().nonnegative(),
  verdictDelayMs: z.number().int().nonnegative(),
  revealDelayMs: z.number().int().nonnegative(),
  fairVerdictDelayMs: z.number().int().nonnegative(),
});

export const FallbackIntegrityRevealSchema = z.strictObject({
  passed: z.literal(false),
  publicLabel: z.literal("Policy integrity: FAILED"),
  compromisedLine: z.string().min(1),
  explanation: z.string().min(1),
});

export const FallbackPackageSchema = z.strictObject({
  id: z.string().min(1),
  language: SupportedLanguageSchema,
  category: FallbackCategorySchema,
  sampleQuestion: z.string().min(1).max(240),
  openings: z.strictObject({
    unimelb: DebateTurnSchema,
    competitor: DebateTurnSchema,
  }),
  rebuttals: z.strictObject({
    unimelb: DebateTurnSchema,
    competitor: DebateTurnSchema,
  }),
  compromisedVerdict: VerdictSchema,
  integrityReveal: FallbackIntegrityRevealSchema,
  fairVerdict: FairVerdictSchema,
  timing: FallbackTimingSchema,
});

export const FallbackCatalogSchema = z.array(FallbackPackageSchema).min(10);

export const DebateRequestSchema = z.strictObject({
  question: z.string().min(1).max(240),
  mode: z.enum(["compromised", "fair"]).optional(),
  competitorId: z.string().min(1).optional(),
  language: SupportedLanguageSchema.optional(),
});

const SessionPhaseSchema = z.enum([
  "opening_arguments",
  "rebuttals",
  "verifying",
  "integrity_reveal",
  "fair_recheck",
  "complete",
]);

const AgentStatusSchema = z.enum(["idle", "thinking", "speaking", "checking", "complete", "error"]);

export const SessionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("session.started"),
    sessionId: z.string().min(1),
    mode: z.enum(["compromised", "fair"]),
    fallbackUsed: z.boolean(),
  }),
  z.strictObject({ type: z.literal("phase.changed"), phase: SessionPhaseSchema }),
  z.strictObject({ type: z.literal("agent.status"), agent: AgentIdSchema, status: AgentStatusSchema }),
  z.strictObject({
    type: z.literal("agent.message"),
    agent: AdvocateIdSchema,
    turnKind: z.enum(["opening", "rebuttal"]),
    turn: DebateTurnSchema,
  }),
  z.strictObject({ type: z.literal("verifier.checks"), checks: z.array(EvidenceCheckSchema) }),
  z.strictObject({ type: z.literal("verdict.compromised"), verdict: VerdictSchema }),
  z.strictObject({
    type: z.literal("integrity.result"),
    context: z.enum(["active", "fair"]),
    result: IntegrityResultSchema,
  }),
  z.strictObject({ type: z.literal("xray.prompt_diff"), lines: z.array(PromptDiffLineSchema) }),
  z.strictObject({ type: z.literal("verdict.fair"), verdict: FairVerdictSchema }),
  z.strictObject({
    type: z.literal("session.complete"),
    durationMs: z.number().nonnegative(),
    fallbackUsed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("error.recoverable"),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export type ParsedDebateTurn = z.infer<typeof DebateTurnSchema>;
export type ParsedVerdict = z.infer<typeof VerdictSchema>;
export type ParsedFairVerdict = z.infer<typeof FairVerdictSchema>;
