"use client";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  GitCompareArrowsIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { abbreviateHash, LOCAL_FINGERPRINT_DISCLOSURE } from "@/lib/integrity";
import type {
  EvidenceCheck,
  FairVerdict,
  IntegrityResult,
  PromptDiffLine,
  SessionPhase,
  Verdict,
} from "@/types/debate";

interface DebateStoryProps {
  phase: SessionPhase | "starting" | "error";
  checks: EvidenceCheck[];
  compromisedVerdict?: Verdict;
  integrity?: IntegrityResult;
  fairIntegrity?: IntegrityResult;
  diff: PromptDiffLine[];
  fairVerdict?: FairVerdict;
  fairOnly: boolean;
  onReveal: () => void;
  onRunClean: () => void;
  onReset: () => void;
}

const WINNER_LABELS: Record<Verdict["winner"], string> = {
  unimelb: "University of Melbourne",
  competitor: "Comparator",
  tie: "Tie",
  depends: "It depends",
};

function TechnicalDetails({ integrity }: { integrity: IntegrityResult }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="mt-3 w-full border-t border-border/70 text-sm text-cyan-100">
          How we detected this
          <ScanSearchIcon data-icon="inline-end" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel max-w-2xl">
        <DialogHeader>
          <DialogTitle>Local prompt fingerprint check</DialogTitle>
          <DialogDescription>
            The approved and active privileged instructions produced different SHA-256 fingerprints.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 font-mono text-sm max-[620px]:grid-cols-1">
          <p className="rounded-xl border border-border bg-background/45 p-4">
            <span className="mb-2 block font-sans font-semibold uppercase tracking-wider text-cyan-100">
              Approved policy
            </span>
            {abbreviateHash(integrity.expectedHash)}
          </p>
          <p className="rounded-xl border border-red-400/45 bg-red-400/8 p-4">
            <span className="mb-2 block font-sans font-semibold uppercase tracking-wider text-red-100">
              Active policy
            </span>
            {abbreviateHash(integrity.activeHash)}
          </p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {LOCAL_FINGERPRINT_DISCLOSURE}
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function DebateStory({
  phase,
  checks,
  compromisedVerdict,
  integrity,
  fairIntegrity,
  diff,
  fairVerdict,
  fairOnly,
  onReveal,
  onRunClean,
  onReset,
}: DebateStoryProps) {
  const changed = diff.filter((line) => line.type !== "unchanged");
  const supportedChecks = checks.filter((check) => check.status === "supported").length;

  if (fairOnly) {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center rounded-2xl p-5" aria-live="polite">
        {fairVerdict ? (
          <div className="grid w-full max-w-5xl grid-cols-[1fr_auto] items-center gap-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">Clean verdict</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-white">
                {WINNER_LABELS[fairVerdict.winner]}
              </h2>
              <p className="mt-2 text-lg text-slate-200">{fairVerdict.headline}</p>
            </div>
            <div className="text-center">
              <Button size="lg" onClick={onReset}>Ask another question</Button>
              <p className="mt-2 text-xs text-muted-foreground">Clears after 50 seconds of inactivity.</p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <GitCompareArrowsIcon className="mx-auto size-9 animate-pulse text-emerald-300" aria-hidden="true" />
            <h2 className="mt-3 text-2xl font-bold text-white">Clean judges are checking both orders…</h2>
            <p className="mt-2 text-base text-muted-foreground">Same evidence. Symmetric instructions. Candidate order reversed.</p>
          </div>
        )}
      </section>
    );
  }

  if (!compromisedVerdict) {
    const judging = phase === "verifying";
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center rounded-2xl p-5" aria-live="polite">
        <div className="text-center">
          <ScanSearchIcon className="mx-auto size-9 animate-pulse text-amber-200" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-white">
            {judging ? "Verifier / Judge is deciding…" : "Debate in progress"}
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            {judging
              ? "Checking the evidence and applying the active decision policy."
              : "Each advocate gets one message per round. Watch how the argument develops."}
          </p>
        </div>
      </section>
    );
  }

  if (phase === "awaiting_reveal") {
    return (
      <section className="glass-panel min-h-0 rounded-2xl border-amber-400/45 p-5" aria-live="assertive">
        <div className="grid h-full grid-cols-[1fr_auto] items-center gap-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-200">First verdict · controlled demo</p>
            <h2 className="mt-2 font-display text-[clamp(2rem,3vw,3.8rem)] font-bold leading-none text-white">
              {WINNER_LABELS[compromisedVerdict.winner]}
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-200">{compromisedVerdict.publicReasoning}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Badge variant="outline" className="h-8 border-emerald-400/45 px-3 text-sm text-emerald-200">
                Facts checked: {supportedChecks}/{checks.length}
              </Badge>
              <Badge variant="outline" className="h-8 border-amber-400/45 px-3 text-sm text-amber-100">
                Not the final fair result
              </Badge>
            </div>
          </div>
          <div className="max-w-sm rounded-2xl border border-amber-300/35 bg-amber-400/10 p-5 text-center">
            <p className="text-xl font-bold text-white">The facts were checked.</p>
            <p className="mt-2 text-base text-amber-50/80">But was the decision policy fair?</p>
            <Button size="lg" className="mt-5 w-full" onClick={onReveal} autoFocus>
              Really? Inspect the judge
              <ScanSearchIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!integrity || phase === "integrity_reveal") {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center rounded-2xl border-red-400/40 p-5" aria-live="assertive">
        <div className="text-center">
          <ShieldAlertIcon className="mx-auto size-10 animate-pulse text-red-300" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-white">Inspecting the judge’s hidden instructions…</h2>
        </div>
      </section>
    );
  }

  if (phase === "awaiting_clean_run") {
    return (
      <section className="glass-panel min-h-0 rounded-2xl border-red-400/45 p-5" aria-live="assertive">
        <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-red-200">
              <ShieldAlertIcon className="size-5" aria-hidden="true" />
              Decision policy failed
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white">The judge’s instructions were changed.</h2>
            <p className="mt-2 text-lg text-slate-200">The debate did not change. The hidden objective did.</p>
            {changed.length > 0 ? (
              <div className="mt-4 max-h-28 overflow-y-auto rounded-xl border border-red-400/45 bg-[#17090f] p-3 font-mono text-sm leading-relaxed text-red-100">
                {changed.map((line, index) => (
                  <p key={`${line.type}-${index}`}>
                    <span className="mr-2 text-red-300">{line.type === "added" ? "+" : "−"}</span>
                    {line.text}
                  </p>
                ))}
              </div>
            ) : null}
            <TechnicalDetails integrity={integrity} />
          </div>
          <div className="flex flex-col justify-center rounded-2xl border border-emerald-300/30 bg-emerald-400/8 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">Try again fairly</p>
            <h3 className="mt-2 text-2xl font-bold text-white">Same debate. Same evidence. Clean instructions.</h3>
            <p className="mt-3 text-base leading-relaxed text-slate-300">
              Two clean judges will review anonymised candidates in opposite orders.
            </p>
            <Button size="lg" className="mt-5" onClick={onRunClean} autoFocus>
              Run a clean re-check
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!fairVerdict) {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center rounded-2xl border-emerald-400/35 p-5" aria-live="polite">
        <div className="text-center">
          <GitCompareArrowsIcon className="mx-auto size-10 animate-pulse text-emerald-300" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-white">Clean judges are checking both orders…</h2>
          <p className="mt-2 text-base text-muted-foreground">Candidate A ↔ Candidate B · no university names</p>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel min-h-0 rounded-2xl border-emerald-400/45 p-5" aria-live="assertive">
      <div className="grid h-full grid-cols-[1fr_auto] items-center gap-8">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">
            <CheckCircle2Icon className="size-5" aria-hidden="true" />
            Clean result
          </p>
          <h2 className="mt-2 font-display text-[clamp(2rem,3vw,3.8rem)] font-bold leading-none text-white">
            {WINNER_LABELS[fairVerdict.winner]}
          </h2>
          <p className="mt-3 text-xl text-slate-200">{fairVerdict.headline}</p>
          <p className="mt-3 max-w-4xl text-base leading-relaxed text-slate-300">{fairVerdict.publicReasoning}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Badge variant="outline" className="h-8 border-emerald-400/50 px-3 text-sm text-emerald-200">
              {fairIntegrity?.publicLabel ?? "Policy integrity: checking"}
            </Badge>
            <Badge variant="outline" className="h-8 border-emerald-400/50 px-3 text-sm text-emerald-200">
              Order test: {fairVerdict.orderConsistent ? "consistent" : "sensitive"}
            </Badge>
          </div>
          <p className="mt-4 flex items-start gap-2 text-base font-medium text-cyan-50">
            <SparklesIcon className="mt-0.5 size-5 shrink-0 text-cyan-300" aria-hidden="true" />
            {fairVerdict.takeaway}
          </p>
        </div>
        <div className="text-center">
          <Button size="lg" onClick={onReset} autoFocus>
            <RotateCcwIcon data-icon="inline-start" />
            Ask another question
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Clears after 50 seconds of inactivity.</p>
        </div>
      </div>
    </section>
  );
}
