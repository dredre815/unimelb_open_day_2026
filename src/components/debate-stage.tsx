"use client";

import { RotateCcwIcon, ShieldCheckIcon, WifiOffIcon } from "lucide-react";
import { AgentNode } from "@/components/agent-node";
import { ChatTranscript, type TranscriptMessage } from "@/components/chat-transcript";
import { DebateStory } from "@/components/debate-story";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SessionConfig } from "@/lib/session-config";
import type {
  AgentId,
  AgentStatus,
  EvidenceCheck,
  EvidenceFact,
  FairVerdict,
  IntegrityResult,
  PromptDiffLine,
  RetrievedEvidence,
  SessionPhase,
  Verdict,
} from "@/types/debate";

export type DebateUiPhase = "starting" | SessionPhase | "error";

const PHASE_LABELS: Record<DebateUiPhase, string> = {
  starting: "Retrieving evidence",
  opening_arguments: "Opening arguments",
  rebuttals: "Rebuttals",
  verifying: "Judge deliberating",
  awaiting_reveal: "First verdict",
  integrity_reveal: "X-Ray reveal",
  awaiting_clean_run: "Policy changed",
  fair_recheck: "Clean re-check",
  complete: "Complete",
  error: "Continuity recovery",
};

export interface DebateStageProps {
  question: string;
  phase: DebateUiPhase;
  statuses: Record<AgentId, AgentStatus>;
  messages: TranscriptMessage[];
  evidence: RetrievedEvidence;
  checks: EvidenceCheck[];
  compromisedVerdict?: Verdict;
  integrity?: IntegrityResult;
  fairIntegrity?: IntegrityResult;
  diff: PromptDiffLine[];
  fairVerdict?: FairVerdict;
  fallbackUsed: boolean;
  recoverableError?: string;
  config: SessionConfig;
  onReset: () => void;
  onReveal: () => void;
  onRunClean: () => void;
  onOpenSource: (fact: EvidenceFact) => void;
}

export function DebateStage({
  question,
  phase,
  statuses,
  messages,
  evidence,
  checks,
  compromisedVerdict,
  integrity,
  fairIntegrity,
  diff,
  fairVerdict,
  fallbackUsed,
  recoverableError,
  config,
  onReset,
  onReveal,
  onRunClean,
  onOpenSource,
}: DebateStageProps) {
  const comparatorName = config.comparatorMode === "named" ? "Monash University Advocate" : "Comparator Advocate";

  return (
    <main className="kiosk-grid flex h-dvh min-h-0 flex-col overflow-hidden p-3" data-testid="debate-stage">
      <header className="mb-3 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border/60 px-1 pb-3">
        <div className="flex min-w-0 items-center gap-4">
          <h1 className="truncate font-display text-xl font-bold tracking-tight">
            TRUST THE <span className="text-blue-400">VERDICT?</span>
          </h1>
          <Badge
            variant="outline"
            className="hidden border-cyan-400/45 text-cyan-100 sm:inline-flex"
            role="status"
            aria-live="polite"
          >
            <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
            {PHASE_LABELS[phase]}
          </Badge>
          {fallbackUsed && config.runtimeMode === "canned" ? (
            <Badge variant="outline" className="border-cyan-400/45 text-cyan-100">
              <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
              Prepared content
            </Badge>
          ) : fallbackUsed ? (
            <Badge variant="outline" className="border-amber-400/50 text-amber-100">
              <WifiOffIcon className="size-3.5" aria-hidden="true" />
              Live recovery
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcwIcon data-icon="inline-start" />
            New question
          </Button>
        </div>
      </header>

      {recoverableError ? (
        <p className="mb-2 shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" role="status">
          {recoverableError}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.05fr)_minmax(18rem,0.72fr)] gap-3">
        <div className="grid min-h-0 grid-cols-[minmax(13.5rem,0.72fr)_minmax(25rem,1.65fr)_minmax(13.5rem,0.72fr)] gap-3">
          <AgentNode
            side="unimelb"
            label="University of Melbourne Advocate"
            shortLabel="M"
            status={statuses.unimelb}
            evidence={evidence.unimelb}
            onOpenSource={onOpenSource}
          />
          <ChatTranscript question={question} messages={messages} />
          <AgentNode
            side="competitor"
            label={comparatorName}
            shortLabel="C"
            status={statuses.competitor}
            evidence={evidence.competitor}
            onOpenSource={onOpenSource}
          />
        </div>
        <DebateStory
          phase={phase}
          checks={checks}
          compromisedVerdict={compromisedVerdict}
          integrity={integrity}
          fairIntegrity={fairIntegrity}
          diff={diff}
          fairVerdict={fairVerdict}
          fairOnly={config.demoMode === "fair"}
          onReveal={onReveal}
          onRunClean={onRunClean}
          onReset={onReset}
        />
      </div>
    </main>
  );
}
