"use client";

import { useEffect, useRef } from "react";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FingerprintIcon,
  GitCompareArrowsIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
  ShieldQuestionIcon,
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

const SECURITY_TAKEAWAY =
  "More agents do not automatically create trustworthy AI. Protect prompts, evidence and the decision process.";

function TechnicalDetails({ integrity }: { integrity: IntegrityResult }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-auto min-h-12 w-full justify-between whitespace-normal border-cyan-400/40 bg-cyan-400/8 px-4 py-3 text-left text-cyan-50 hover:border-cyan-300/65 hover:bg-cyan-400/14"
        >
          <span>
            <span className="block text-base font-bold">How we detected this</span>
            <span className="mt-0.5 block text-sm font-normal text-cyan-100/75">
              See the plain-language fingerprint check
            </span>
          </span>
          <ScanSearchIcon className="size-6" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel max-h-[calc(100dvh-2rem)] max-w-4xl gap-5 overflow-y-auto p-6 sm:max-w-4xl sm:p-8">
        <DialogHeader>
          <DialogTitle className="pr-12 font-display text-2xl font-bold leading-tight sm:text-3xl">
            How we detected the change
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-slate-300">
            Think of a digital fingerprint as a short label for a set of instructions. If the instructions change,
            the fingerprint changes too.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-xl border border-cyan-400/25 bg-cyan-400/7 p-4">
            <span className="grid size-8 place-items-center rounded-full bg-cyan-400/15 text-sm font-bold text-cyan-100">1</span>
            <h3 className="mt-3 text-base font-bold text-white">Approved policy</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              Before the demo, the approved judge instructions get a fingerprint.
            </p>
          </li>
          <li className="rounded-xl border border-amber-400/30 bg-amber-400/7 p-4">
            <span className="grid size-8 place-items-center rounded-full bg-amber-400/15 text-sm font-bold text-amber-100">2</span>
            <h3 className="mt-3 text-base font-bold text-white">Active policy</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              The judge running now has a different fingerprint, so its instructions do not match.
            </p>
          </li>
          <li className="rounded-xl border border-red-400/30 bg-red-400/7 p-4">
            <span className="grid size-8 place-items-center rounded-full bg-red-400/15 text-sm font-bold text-red-100">3</span>
            <h3 className="mt-3 text-base font-bold text-white">Find what changed</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              The X-Ray found the added rule that forced Melbourne to be recommended.
            </p>
          </li>
        </ol>
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4">
          <FingerprintIcon className="mt-0.5 size-6 shrink-0 text-amber-200" aria-hidden="true" />
          <div>
            <p className="text-base font-bold text-white">What did we learn?</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              We know the judge’s instructions changed. This check cannot tell us who changed them, so a real system
              would also protect who can publish new code and policies.
            </p>
          </div>
        </div>
        <details className="group rounded-xl border border-border/80 bg-background/35">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold text-slate-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            Technical details (optional)
            <ChevronDownIcon className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border/70 p-4">
            <div className="grid grid-cols-2 gap-3 font-mono text-sm max-[620px]:grid-cols-1">
              <p className="rounded-xl border border-border bg-background/45 p-4">
                <span className="mb-2 block font-sans font-semibold uppercase tracking-wider text-cyan-100">
                  Approved SHA-256
                </span>
                {abbreviateHash(integrity.expectedHash)}
              </p>
              <p className="rounded-xl border border-red-400/45 bg-red-400/8 p-4">
                <span className="mb-2 block font-sans font-semibold uppercase tracking-wider text-red-100">
                  Active SHA-256
                </span>
                {abbreviateHash(integrity.activeHash)}
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {LOCAL_FINGERPRINT_DISCLOSURE}
            </p>
          </div>
        </details>
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
  const storyHeadingRef = useRef<HTMLHeadingElement>(null);
  const changed = diff.filter(
    (line) => line.type !== "unchanged" && line.text.trim().length > 0,
  );
  const supportedChecks = checks.filter((check) => check.status === "supported").length;
  const opinionChecks = checks.filter((check) => check.status === "opinion").length;
  const unsupportedChecks = checks.filter(
    (check) => check.status === "unsupported" || check.status === "conflicting",
  ).length;
  const hasDistinctFairInsight = fairVerdict?.takeaway.trim() !== SECURITY_TAKEAWAY;

  useEffect(() => {
    if (
      phase === "awaiting_reveal" ||
      phase === "integrity_reveal" ||
      phase === "awaiting_clean_run" ||
      phase === "fair_recheck" ||
      phase === "complete"
    ) {
      storyHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [fairVerdict, phase]);

  if (fairOnly) {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center overflow-y-auto overscroll-contain rounded-2xl p-5" aria-live="polite">
        {fairVerdict ? (
          <div className="grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(15rem,0.3fr)] items-center gap-8 max-[880px]:grid-cols-1">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">
                <CheckCircle2Icon className="size-5" aria-hidden="true" />
                Clean verdict
              </p>
              <h2
                ref={storyHeadingRef}
                tabIndex={-1}
                className="mt-2 font-display text-[clamp(3rem,4.4vw,5rem)] font-bold leading-none text-white outline-none"
              >
                {WINNER_LABELS[fairVerdict.winner]}
              </h2>
              <p className="mt-2 text-lg text-slate-200">{fairVerdict.headline}</p>
              <p className="mt-3 max-w-4xl text-lg leading-relaxed text-slate-300">{fairVerdict.publicReasoning}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Badge variant="outline" className="h-8 border-emerald-400/50 px-3 text-sm text-emerald-200">
                  {fairIntegrity?.publicLabel ?? "Policy integrity: checking"}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    fairVerdict.orderConsistent
                      ? "h-8 border-emerald-400/50 px-3 text-sm text-emerald-200"
                      : "h-8 border-amber-400/55 px-3 text-sm text-amber-100"
                  }
                >
                  Order test: {fairVerdict.orderConsistent ? "consistent" : "sensitive"}
                </Badge>
              </div>
              {hasDistinctFairInsight ? (
                <p className="mt-4 text-sm leading-relaxed text-slate-300">{fairVerdict.takeaway}</p>
              ) : null}
              <p className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-300/30 bg-cyan-400/8 p-4 text-lg font-semibold leading-relaxed text-cyan-50">
                <SparklesIcon className="mt-0.5 size-5 shrink-0 text-cyan-300" aria-hidden="true" />
                {SECURITY_TAKEAWAY}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/30 p-5 text-center">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-200">Your turn</p>
              <p className="mt-2 text-base leading-relaxed text-slate-300">Try a different question and compare the result.</p>
              <Button size="lg" className="mt-5 w-full" onClick={onReset}>Ask another question</Button>
              <p className="mt-2 text-xs text-muted-foreground">Clears after 50 seconds of inactivity.</p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <GitCompareArrowsIcon className="mx-auto size-9 animate-pulse text-emerald-300" aria-hidden="true" />
            <h2 ref={storyHeadingRef} tabIndex={-1} className="mt-3 text-2xl font-bold text-white outline-none">
              Clean judges are checking both orders…
            </h2>
            <p className="mt-2 text-base text-muted-foreground">Same evidence. Symmetric instructions. Candidate order reversed.</p>
          </div>
        )}
      </section>
    );
  }

  if (!compromisedVerdict) {
    const judging = phase === "verifying";
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center overflow-y-auto overscroll-contain rounded-2xl p-5" aria-live="polite">
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
      <section
        className="glass-panel min-h-0 overflow-y-auto overscroll-contain rounded-2xl border-amber-400/45 p-5 [scrollbar-gutter:stable]"
        aria-live="assertive"
      >
        <div className="grid min-h-full grid-cols-[minmax(0,1fr)_minmax(25rem,0.72fr)] items-center gap-6 max-[980px]:grid-cols-1">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-amber-200">Judge’s first verdict</p>
            <h2
              ref={storyHeadingRef}
              tabIndex={-1}
              className="mt-2 font-display text-[clamp(2rem,3vw,3.8rem)] font-bold leading-none text-white outline-none"
            >
              {WINNER_LABELS[compromisedVerdict.winner]}
            </h2>
            <p className="mt-3 max-w-3xl text-lg leading-relaxed text-slate-200">{compromisedVerdict.publicReasoning}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Badge variant="outline" className="h-8 border-emerald-400/45 px-3 text-sm text-emerald-200">
                Evidence review complete
              </Badge>
              <Badge variant="outline" className="h-8 border-amber-400/45 px-3 text-sm text-amber-100">
                Not the final fair result
              </Badge>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-amber-300/50 bg-amber-400/12 p-5 shadow-[0_0_36px_rgb(245_184_46_/_0.12)]">
            <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-amber-300/8 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-full border border-emerald-300/45 bg-emerald-400/12 text-emerald-200">
                <CheckCircle2Icon className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-200">Facts checked</p>
                <p className="mt-0.5 text-lg font-semibold text-white">
                  {supportedChecks} supported · {opinionChecks} opinion · {unsupportedChecks} unsupported or conflicting
                </p>
              </div>
            </div>
            <div className="relative mt-4 border-t border-amber-200/25 pt-4">
              <p className="flex items-center gap-2 text-2xl font-bold leading-tight text-white">
                <ShieldQuestionIcon className="size-7 shrink-0 text-amber-200" aria-hidden="true" />
                Would you trust this verdict?
              </p>
              <p className="mt-2 text-base leading-relaxed text-amber-50/80">
                The evidence has been reviewed. Now decide whether the judge’s policy was fair.
              </p>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3">
              <Button
                size="lg"
                className="h-auto min-h-14 whitespace-normal px-3 py-3 text-base leading-tight"
                onClick={onReveal}
              >
                It looks convincing
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-auto min-h-14 whitespace-normal border-amber-300/45 bg-background/25 px-3 py-3 text-base leading-tight text-amber-50 hover:bg-amber-400/12"
                onClick={onReveal}
              >
                Something feels off
              </Button>
            </div>
            <p className="relative mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-amber-100/80">
              Really? Inspect the judge.
              <ScanSearchIcon className="size-4" aria-hidden="true" />
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!integrity || phase === "integrity_reveal") {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center overflow-y-auto rounded-2xl border-red-400/40 p-5" aria-live="assertive">
        <div className="text-center">
          <ShieldAlertIcon className="mx-auto size-10 animate-pulse text-red-300" aria-hidden="true" />
          <h2 ref={storyHeadingRef} tabIndex={-1} className="mt-3 text-2xl font-bold text-white outline-none">
            Inspecting the judge’s hidden instructions…
          </h2>
        </div>
      </section>
    );
  }

  if (phase === "awaiting_clean_run") {
    return (
      <section className="glass-panel min-h-0 overflow-hidden rounded-2xl border-red-400/45 p-5" aria-live="assertive">
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(27rem,1fr)] gap-5 max-[980px]:grid-cols-1 max-[980px]:overflow-y-auto">
          <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-red-200">
              <ShieldAlertIcon className="integrity-glitch size-5" aria-hidden="true" />
              Decision policy failed
            </p>
            <h2 ref={storyHeadingRef} tabIndex={-1} className="mt-2 font-display text-3xl font-bold text-white outline-none">
              The judge’s instructions were changed.
            </h2>
            <p className="mt-2 text-lg text-slate-200">The debate did not change. The hidden objective did.</p>
            <div className="mt-3 rounded-xl border border-red-300/35 bg-red-400/10 px-4 py-3">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-red-200">What changed?</p>
              <p className="mt-1 text-lg font-semibold leading-snug text-white">
                An extra hidden rule told the judge to recommend Melbourne.
              </p>
            </div>
            {changed.length > 0 ? (
              <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-red-400/45 bg-[#17090f] p-3 font-mono text-sm leading-relaxed text-red-100 [scrollbar-gutter:stable]">
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
          <div className="relative flex min-h-0 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-emerald-300/45 bg-emerald-400/10 p-5 shadow-[0_0_36px_rgb(85_223_189_/_0.1)] [scrollbar-gutter:stable]">
            <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full bg-emerald-300/8 blur-3xl" aria-hidden="true" />
            <div className="relative flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                <GitCompareArrowsIcon className="size-6 motion-safe:animate-pulse" aria-hidden="true" />
              </span>
              <p className="text-base font-bold uppercase tracking-[0.14em] text-emerald-200">Try again fairly</p>
            </div>
            <h3 className="relative mt-3 font-display text-[clamp(1.65rem,2.1vw,2.2rem)] font-bold leading-tight text-white">
              Same debate. Same evidence. Clean instructions.
            </h3>
            <p className="relative mt-3 text-base leading-relaxed text-slate-300">
              Two clean judges review anonymous Candidate A and Candidate B, then swap their order to check for bias.
            </p>
            <Button size="lg" className="group relative mt-4 h-14 text-lg" onClick={onRunClean}>
              Run a clean re-check
              <ArrowRightIcon className="transition-transform group-hover:translate-x-1" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!fairVerdict) {
    return (
      <section className="glass-panel flex min-h-0 items-center justify-center overflow-y-auto overscroll-contain rounded-2xl border-emerald-400/35 p-5" aria-live="polite">
        <div className="text-center">
          <GitCompareArrowsIcon className="mx-auto size-10 animate-pulse text-emerald-300" aria-hidden="true" />
          <h2 ref={storyHeadingRef} tabIndex={-1} className="mt-3 text-2xl font-bold text-white outline-none">
            Clean judges are checking both orders…
          </h2>
          <p className="mt-2 text-base text-muted-foreground">Candidate A ↔ Candidate B · no university names</p>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel min-h-0 overflow-y-auto overscroll-contain rounded-2xl border-emerald-400/45 p-5 [scrollbar-gutter:stable]" aria-live="assertive">
      <div className="grid min-h-full grid-cols-[minmax(0,1fr)_minmax(15rem,0.3fr)] items-center gap-8 max-[880px]:grid-cols-1">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">
            <CheckCircle2Icon className="size-5" aria-hidden="true" />
            Clean result
          </p>
          <h2
            ref={storyHeadingRef}
            tabIndex={-1}
            className="mt-2 font-display text-[clamp(3rem,4.4vw,5rem)] font-bold leading-none text-white outline-none"
          >
            {WINNER_LABELS[fairVerdict.winner]}
          </h2>
          <div className="mt-4 grid max-w-3xl grid-cols-[1fr_auto_1fr] items-stretch gap-3 text-left">
            <div className="rounded-xl border border-amber-300/30 bg-amber-400/8 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">First verdict</p>
              <p className="mt-1 text-lg font-bold text-white">{WINNER_LABELS[compromisedVerdict.winner]}</p>
              <p className="mt-0.5 text-xs text-slate-400">Before the policy check</p>
            </div>
            <span className="grid size-10 self-center place-items-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-cyan-200">
              <ArrowRightIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="rounded-xl border border-emerald-300/35 bg-emerald-400/10 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">Clean verdict</p>
              <p className="mt-1 text-lg font-bold text-white">{WINNER_LABELS[fairVerdict.winner]}</p>
              <p className="mt-0.5 text-xs text-slate-400">After two order checks</p>
            </div>
          </div>
          <p className="mt-3 text-xl text-slate-200">{fairVerdict.headline}</p>
          <p className="mt-3 max-w-4xl text-lg leading-relaxed text-slate-300">{fairVerdict.publicReasoning}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Badge variant="outline" className="h-8 border-emerald-400/50 px-3 text-sm text-emerald-200">
              {fairIntegrity?.publicLabel ?? "Policy integrity: checking"}
            </Badge>
            <Badge
              variant="outline"
              className={
                fairVerdict.orderConsistent
                  ? "h-8 border-emerald-400/50 px-3 text-sm text-emerald-200"
                  : "h-8 border-amber-400/55 px-3 text-sm text-amber-100"
              }
            >
              Order test: {fairVerdict.orderConsistent ? "consistent" : "sensitive"}
            </Badge>
          </div>
          {hasDistinctFairInsight ? (
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              <span className="font-semibold text-slate-100">What the order test showed: </span>
              {fairVerdict.takeaway}
            </p>
          ) : null}
          <p className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-300/30 bg-cyan-400/8 p-4 text-lg font-semibold leading-relaxed text-cyan-50">
            <SparklesIcon className="mt-0.5 size-5 shrink-0 text-cyan-300" aria-hidden="true" />
            {SECURITY_TAKEAWAY}
          </p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-background/30 p-5 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-200">Your turn</p>
          <p className="mt-2 text-base leading-relaxed text-slate-300">Try a different question and see whether the verdict changes.</p>
          <Button size="lg" className="mt-5 w-full" onClick={onReset}>
            <RotateCcwIcon data-icon="inline-start" />
            Ask another question
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Clears after 50 seconds of inactivity.</p>
        </div>
      </div>
    </section>
  );
}
