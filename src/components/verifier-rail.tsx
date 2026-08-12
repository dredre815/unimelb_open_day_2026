"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  GitCompareArrowsIcon,
  ScanSearchIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { abbreviateHash, LOCAL_FINGERPRINT_DISCLOSURE } from "@/lib/integrity";
import { cn } from "@/lib/utils";
import type {
  AgentStatus,
  EvidenceCheck,
  FairVerdict,
  IntegrityResult,
  PromptDiffLine,
  Verdict,
} from "@/types/debate";

interface VerifierRailProps {
  status: AgentStatus;
  compromisedVerdict?: Verdict;
  checks: EvidenceCheck[];
  integrity?: IntegrityResult;
  fairIntegrity?: IntegrityResult;
  diff: PromptDiffLine[];
  fairVerdict?: FairVerdict;
  fairOnly: boolean;
}

function WinnerLabel({ winner }: { winner: Verdict["winner"] }) {
  const labels = {
    unimelb: "University of Melbourne",
    competitor: "Comparator",
    tie: "Tie",
    depends: "It depends",
  } as const;
  return <>{labels[winner]}</>;
}

export function VerifierRail({
  status,
  compromisedVerdict,
  checks,
  integrity,
  fairIntegrity,
  diff,
  fairVerdict,
  fairOnly,
}: VerifierRailProps) {
  const changed = diff.filter((line) => line.type !== "unchanged");
  const displayedIntegrity = fairOnly ? fairIntegrity : integrity;

  return (
    <section className="glass-panel grid min-h-0 grid-cols-[0.82fr_1.35fr_0.95fr] overflow-hidden rounded-2xl max-[1100px]:grid-cols-3" aria-label="Verifier and integrity results">
      <div className="min-w-0 overflow-y-auto border-r border-border/70 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.13em] text-amber-200">
            <ScanSearchIcon className="size-4" aria-hidden="true" />
            Verifier / Judge
          </h2>
          <Badge variant="outline" className="text-xs">{status}</Badge>
        </div>
        {fairOnly ? (
          <div className="rounded-lg border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            Fair-only mode: the compromised policy and verdict are skipped.
          </div>
        ) : compromisedVerdict ? (
          <div className="rounded-lg border border-amber-400/45 bg-amber-400/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">First verdict</p>
            <p className="mt-1 text-lg font-bold text-white"><WinnerLabel winner={compromisedVerdict.winner} /></p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{compromisedVerdict.headline}</p>
            {!integrity ? (
              <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-amber-100">
                Integrity: not yet checked
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Checking claims and applying the active decision policy…</p>
        )}
        {checks.length > 0 ? (
          <div className="mt-2 text-xs text-emerald-200">
            <p className="font-semibold uppercase tracking-wider">Facts checked</p>
            <p>{checks.filter((check) => check.status === "supported").length}/{checks.length} checks supported by the local pack</p>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "scan-noise min-w-0 overflow-y-auto border-r border-border/70 p-3.5",
          displayedIntegrity && !displayedIntegrity.passed && "integrity-glitch bg-red-500/[0.07]",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.13em] text-cyan-100">
            {displayedIntegrity?.passed ? <CheckCircle2Icon className="size-4 text-emerald-300" /> : <ShieldAlertIcon className="size-4 text-red-300" />}
            X-Ray · deterministic monitor
          </h2>
          {displayedIntegrity ? (
            <Badge
              variant="outline"
              className={displayedIntegrity.passed ? "border-emerald-400/50 text-emerald-200" : "border-red-400/60 text-red-200"}
            >
              {displayedIntegrity.publicLabel}
            </Badge>
          ) : null}
        </div>
        {displayedIntegrity ? (
          <>
            {!displayedIntegrity.passed ? (
              <p className="mb-2 text-sm font-semibold leading-relaxed text-red-100">
                The debate did not change. The hidden objective did.
              </p>
            ) : null}
            <div className="mb-2 grid grid-cols-2 gap-2 font-mono text-[0.68rem] leading-relaxed">
              <p className="rounded-md border border-border bg-background/45 p-2 text-slate-300">
                <span className="block font-sans font-semibold uppercase tracking-wider text-cyan-100">Expected SHA-256</span>
                {abbreviateHash(displayedIntegrity.expectedHash)}
              </p>
              <p className="rounded-md border border-border bg-background/45 p-2 text-slate-300">
                <span className="block font-sans font-semibold uppercase tracking-wider text-cyan-100">Active SHA-256</span>
                {abbreviateHash(displayedIntegrity.activeHash)}
              </p>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
              {LOCAL_FINGERPRINT_DISCLOSURE} It is a deterministic monitor, not a fourth AI agent.
            </p>
            {changed.length > 0 ? (
              <div className="rounded-lg border border-red-400/45 bg-[#17090f] p-2 font-mono text-[clamp(0.66rem,0.72vw,0.78rem)] leading-relaxed text-red-100">
                {changed.map((line, index) => (
                  <p key={`${line.type}-${index}`} className={line.type === "added" ? "bg-red-500/12" : "text-slate-400"}>
                    <span className="mr-2 text-red-300">{line.type === "added" ? "+" : "−"}</span>
                    {line.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                The active verifier policy matches the approved clean prompt.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The policy fingerprint will be compared after the first verdict.
          </p>
        )}
      </div>

      <div className="min-w-0 overflow-y-auto p-3.5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.13em] text-emerald-200">
          <GitCompareArrowsIcon className="size-4" aria-hidden="true" />
          Clean order-reversed re-check
        </h2>
        {fairVerdict ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 p-3">
              <p className="text-xs uppercase tracking-wider text-emerald-200">Fair result</p>
              <p className="mt-1 text-lg font-bold text-white"><WinnerLabel winner={fairVerdict.winner} /></p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{fairVerdict.headline}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider">
              <Badge
                variant="outline"
                className={fairIntegrity?.passed ? "border-emerald-400/50 text-emerald-200" : "border-red-400/60 text-red-200"}
              >
                {fairIntegrity?.publicLabel ?? "Policy integrity: CHECKING"}
              </Badge>
              <Badge
                variant="outline"
                className={fairVerdict.orderConsistent ? "border-emerald-400/50 text-emerald-200" : "border-amber-400/50 text-amber-200"}
              >
                Order test: {fairVerdict.orderConsistent ? "CONSISTENT" : "SENSITIVE"}
              </Badge>
            </div>
            <p className="flex items-start gap-2 text-xs text-slate-300">
              {fairVerdict.orderConsistent ? (
                <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
              ) : (
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden="true" />
              )}
              {fairVerdict.takeaway}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Two clean judges will review the same material with the candidate order reversed.
          </p>
        )}
      </div>
    </section>
  );
}
