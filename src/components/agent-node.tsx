"use client";

import { CheckCircle2Icon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentStatus, EvidenceFact } from "@/types/debate";

interface AgentNodeProps {
  side: "unimelb" | "competitor";
  label: string;
  shortLabel: string;
  status: AgentStatus;
  evidence: EvidenceFact[];
  onOpenSource: (fact: EvidenceFact) => void;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "Ready",
  thinking: "Thinking",
  speaking: "Speaking",
  checking: "Checking",
  complete: "Complete",
  error: "Recovered",
};

export function AgentNode({
  side,
  label,
  shortLabel,
  status,
  evidence,
  onOpenSource,
}: AgentNodeProps) {
  const active = status === "thinking" || status === "speaking" || status === "checking";
  return (
    <aside
      className={cn(
        "glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl border-t-2",
        side === "unimelb" ? "border-t-blue-400" : "border-t-violet-400",
      )}
      aria-label={`${label} status and evidence`}
    >
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <div
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full border-2 text-xl font-bold",
            side === "unimelb"
              ? "border-blue-400 bg-blue-500/15 text-blue-100"
              : "border-violet-400 bg-violet-500/15 text-violet-100",
            active && "status-pulse",
          )}
          aria-hidden="true"
        >
          {shortLabel}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{label}</h2>
          <Badge
            variant="outline"
            className={cn(
              "mt-1 gap-1.5 border-border text-xs",
              active && "border-cyan-400/60 text-cyan-100",
              status === "complete" && "border-emerald-400/45 text-emerald-200",
            )}
          >
            {active ? (
              <LoaderCircleIcon className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2Icon className="size-3" aria-hidden="true" />
            )}
            {STATUS_LABELS[status]}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <SearchIcon className="size-3.5" aria-hidden="true" />
          Retrieved evidence
        </p>
        <div className="space-y-2">
          {evidence.slice(0, 4).map((fact) => (
            <Button
              key={fact.id}
              type="button"
              variant="ghost"
              className="h-auto min-h-12 w-full justify-start whitespace-normal rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-left text-xs font-normal leading-snug text-slate-200 hover:border-cyan-400/45 hover:bg-accent"
              onClick={() => onOpenSource(fact)}
            >
              <span className="line-clamp-3">{fact.claim}</span>
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );
}
