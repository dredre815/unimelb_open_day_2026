"use client";

import { ShieldCheckIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EvidenceFact } from "@/types/debate";

export interface SourceDrawerProps {
  fact: EvidenceFact | null;
  onOpenChange: (open: boolean) => void;
}

export function SourceDrawer({ fact, onOpenChange }: SourceDrawerProps) {
  return (
    <Dialog open={fact !== null} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel max-w-2xl border-blue-400/35">
        {fact ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">
                <ShieldCheckIcon className="size-4" aria-hidden="true" />
                Official evidence
              </div>
              <DialogTitle className="pr-8 text-2xl leading-tight">{fact.sourceTitle}</DialogTitle>
              <DialogDescription>
                Locally curated for this demo · reviewed {fact.reviewedAt}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-border bg-background/55 p-4 text-base leading-relaxed text-slate-100">
              {fact.claim}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Evidence ID: <code className="text-cyan-200">{fact.id}</code>
              </p>
              <p className="break-all rounded-lg border border-blue-400/30 bg-background/35 px-3 py-2">
                Official source URL: <span className="text-blue-100">{fact.sourceUrl}</span>
              </p>
              <p className="text-xs leading-relaxed">
                The attended kiosk keeps source details in this panel so the visitor flow cannot navigate away.
              </p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
