export const EVIDENCE_CATEGORIES = [
  "general",
  "it_computing",
  "cybersecurity_ai",
  "course_structure",
  "flexibility",
  "campus",
  "student_life",
  "career_learning",
  "research",
  "accessibility",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const FALLBACK_CATEGORIES = [
  "it_computing",
  "cybersecurity",
  "campus",
  "flexibility",
  "student_life",
  "undecided",
  "career",
  "best_overall",
  "prompt_injection",
  "off_topic",
] as const;

export type FallbackCategory = (typeof FALLBACK_CATEGORIES)[number];
export type SupportedLanguage = "en" | "zh";
export type QuestionCategory = "objective" | "subjective" | "mixed" | "out_of_scope";
export type AdvocateId = "unimelb" | "competitor";
export type AgentId = AdvocateId | "verifier";
export type Winner = AdvocateId | "tie" | "depends";
export type DemoMode = "compromised" | "fair";
export type DebateTurnKind = "opening" | "rebuttal";

export interface EvidenceFact {
  id: string;
  institutionId: string;
  category: EvidenceCategory;
  claim: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceType: "official";
  reviewedAt: string;
  validUntil?: string;
  tags: string[];
  safeForPublicComparison: boolean;
  notes?: string;
}

export interface InstitutionEvidencePack {
  id: string;
  displayName: string;
  profileDisclosure?: string;
  facts: EvidenceFact[];
}

export interface DebateClaim {
  text: string;
  kind: "fact" | "opinion" | "recommendation";
  evidenceIds: string[];
}

export interface DebateTurn {
  message: string;
  stanceSummary: string;
  claims: DebateClaim[];
}

export interface DebateRound {
  roundIndex: number;
  turnKind: DebateTurnKind;
  turns: Record<AdvocateId, DebateTurn>;
}

export interface EvidenceCheck {
  claim: string;
  speaker: AdvocateId;
  status: "supported" | "opinion" | "unsupported" | "conflicting";
  evidenceIds: string[];
}

export interface Verdict {
  questionCategory: QuestionCategory;
  winner: Winner;
  headline: string;
  publicReasoning: string;
  evidenceChecks: EvidenceCheck[];
  bestFor: Record<AdvocateId, string>;
  confidence: number;
  disclaimer: string;
}

export interface FairVerdict {
  winner: Winner;
  orderConsistent: boolean;
  firstJudgeWinner: Winner;
  reversedJudgeWinner: Winner;
  headline: string;
  publicReasoning: string;
  takeaway: string;
}

export interface PromptDiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface IntegrityResult {
  passed: boolean;
  expectedHash: string;
  activeHash: string;
  changedLines: PromptDiffLine[];
  publicLabel: string;
}

export interface QuestionClassification {
  language: SupportedLanguage;
  category: QuestionCategory;
  fallbackCategory: FallbackCategory;
  evidenceCategories: EvidenceCategory[];
  matchedKeywords: string[];
  isUniversityRelated: boolean;
}

export type SafetyOutcome =
  | "allow"
  | "empty"
  | "too_long"
  | "personal_information"
  | "prompt_injection"
  | "unsafe_content"
  | "off_topic";

export interface SafetyAssessment {
  allowed: boolean;
  outcome: SafetyOutcome;
  language: SupportedLanguage;
  publicMessage?: string;
  sanitizedQuestion?: string;
}

export interface RetrievedEvidence {
  classification: QuestionClassification;
  unimelb: EvidenceFact[];
  competitor: EvidenceFact[];
  competitorId: string;
}

export interface FallbackIntegrityReveal {
  passed: false;
  publicLabel: "Policy integrity: FAILED";
  compromisedLine: string;
  explanation: string;
}

export interface FallbackPackage {
  id: string;
  language: SupportedLanguage;
  category: FallbackCategory;
  sampleQuestion: string;
  rounds: DebateRound[];
  compromisedVerdict: Verdict;
  integrityReveal: FallbackIntegrityReveal;
  fairVerdict: FairVerdict;
}

export type SessionPhase =
  | "opening_arguments"
  | "rebuttals"
  | "verifying"
  | "awaiting_reveal"
  | "integrity_reveal"
  | "awaiting_clean_run"
  | "fair_recheck"
  | "complete";

export type AgentStatus = "idle" | "thinking" | "speaking" | "checking" | "complete" | "error";

export type SessionEvent =
  | {
      type: "session.started";
      sessionId: string;
      mode: DemoMode;
      fallbackUsed: boolean;
      roundCount: number;
    }
  | { type: "phase.changed"; phase: SessionPhase }
  | { type: "agent.status"; agent: AgentId; status: AgentStatus }
  | {
      type: "round.started";
      roundIndex: number;
      roundCount: number;
      turnKind: DebateTurnKind;
    }
  | {
      type: "agent.message";
      agent: AdvocateId;
      roundIndex: number;
      roundCount: number;
      turnKind: DebateTurnKind;
      turn: DebateTurn;
    }
  | {
      type: "round.completed";
      roundIndex: number;
      roundCount: number;
      turnKind: DebateTurnKind;
    }
  | { type: "verifier.checks"; checks: EvidenceCheck[] }
  | { type: "verdict.compromised"; verdict: Verdict }
  | { type: "integrity.result"; context: "active" | "fair"; result: IntegrityResult }
  | { type: "xray.prompt_diff"; lines: PromptDiffLine[] }
  | { type: "verdict.fair"; verdict: FairVerdict }
  | { type: "session.complete"; durationMs: number; fallbackUsed: boolean }
  | { type: "error.recoverable"; code: string; message: string };

export type DebateEvent = SessionEvent;

export interface DebateRequest {
  question: string;
  mode?: DemoMode;
  competitorId?: string;
  language?: SupportedLanguage;
}
