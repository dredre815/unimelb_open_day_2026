"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MessageSquareTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvocateId, DebateTurn } from "@/types/debate";

export interface TranscriptMessage {
  agent: AdvocateId;
  turnKind: "opening" | "rebuttal";
  roundIndex: number;
  roundCount: number;
  turn: DebateTurn;
}

interface ChatTranscriptProps {
  question: string;
  messages: TranscriptMessage[];
}

export function ChatTranscript({ question, messages }: ChatTranscriptProps) {
  const reducedMotion = useReducedMotion();
  const latestMessageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [messages.length, reducedMotion]);

  return (
    <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl" aria-labelledby="transcript-heading">
      <div className="border-b border-border/70 px-4 py-3">
        <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
          <MessageSquareTextIcon className="size-4" aria-hidden="true" />
          Visitor question
        </p>
        <h2 id="transcript-heading" className="text-[clamp(1rem,1.2vw,1.3rem)] font-semibold leading-snug text-white">
          “{question}”
        </h2>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const melbourne = message.agent === "unimelb";
            return (
              <motion.article
                key={`${message.roundIndex}-${message.agent}`}
                ref={index === messages.length - 1 ? latestMessageRef : undefined}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className={cn(
                  "rounded-xl border p-3",
                  melbourne
                    ? "mr-[7%] border-blue-400/40 bg-blue-500/10"
                    : "ml-[7%] border-violet-400/40 bg-violet-500/10",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className={cn("text-xs font-bold uppercase tracking-wider", melbourne ? "text-blue-200" : "text-violet-200")}>
                    {melbourne ? "Melbourne advocate" : "Comparator advocate"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Round {message.roundIndex}/{message.roundCount} · {message.turnKind}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-100">{message.turn.message}</p>
                {message.turn.claims.some((claim) => claim.evidenceIds.length > 0) ? (
                  <p className="mt-2 text-xs text-emerald-200/85">
                    Evidence: {message.turn.claims.flatMap((claim) => claim.evidenceIds).join(", ")}
                  </p>
                ) : null}
              </motion.article>
            );
          })}
        </AnimatePresence>
        {messages.length === 0 ? (
          <div className="grid h-full min-h-28 place-items-center text-center text-sm text-muted-foreground">
            The advocates are reviewing the local evidence pack…
          </div>
        ) : null}
      </div>
    </section>
  );
}
