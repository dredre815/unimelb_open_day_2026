"use client";

import { ArrowRightIcon, MessageCircleIcon, SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { SessionConfig } from "@/lib/session-config";
import type { SupportedLanguage } from "@/types/debate";
import { cn } from "@/lib/utils";

export const SAMPLE_QUESTIONS: Record<SupportedLanguage, readonly string[]> = {
  en: [
    "Which university is better for IT and computer science?",
    "Which campus is more beautiful?",
    "Which university offers more flexibility?",
    "Which is better for student life?",
    "Which is better for someone interested in cybersecurity?",
    "Which university should I choose if I am still undecided?",
  ],
  zh: [
    "哪所大学更适合学习信息技术和计算机科学？",
    "哪所大学的校园更美？",
    "哪所大学的课程选择更灵活？",
    "哪所大学的学生生活更丰富？",
    "对网络安全感兴趣的人更适合哪所大学？",
    "如果我还没决定方向，应该选择哪所大学？",
  ],
};

interface AttractAgentProps {
  label: string;
  shortLabel: string;
  tone: "unimelb" | "comparator" | "verifier";
}

function AttractAgent({ label, shortLabel, tone }: AttractAgentProps) {
  return (
    <div className="relative z-10 flex min-w-0 flex-col items-center gap-2 text-center">
      <div
        className={cn(
          "status-pulse grid size-[clamp(6.25rem,8.6vw,10.25rem)] place-items-center rounded-full border-2 bg-background/88 text-[clamp(2.4rem,3.7vw,4.5rem)] font-bold shadow-[0_0_44px_rgb(47_145_255/0.22)]",
          tone === "unimelb" && "border-blue-400 text-blue-200 ring-8 ring-blue-500/10",
          tone === "comparator" && "border-violet-400 text-violet-200 ring-8 ring-violet-500/10",
          tone === "verifier" && "border-cyan-300 text-cyan-200 ring-8 ring-cyan-400/10",
        )}
      >
        {tone === "verifier" ? (
          <ShieldCheckIcon className="size-[48%]" aria-hidden="true" />
        ) : (
          <span aria-hidden="true">{shortLabel}</span>
        )}
      </div>
      <span className="max-w-52 text-[clamp(0.9rem,1.1vw,1.25rem)] font-semibold leading-tight text-foreground">
        {label}
      </span>
    </div>
  );
}

function AgentNetwork() {
  return (
    <div className="relative mx-auto grid w-full max-w-6xl grid-cols-3 items-center px-[8%]">
      <svg
        className="pointer-events-none absolute inset-x-[19%] top-1/2 h-24 w-[62%] -translate-y-1/2 overflow-visible"
        viewBox="0 0 1000 100"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 50 H1000" stroke="rgb(47 145 255 / 0.28)" strokeWidth="2" />
        <path d="M0 50 Q250 -12 500 50 T1000 50" stroke="rgb(86 216 255 / 0.24)" />
        <path d="M0 50 Q250 112 500 50 T1000 50" stroke="rgb(155 112 255 / 0.22)" />
        <path
          className="connection-trace"
          d="M0 50 H1000"
          stroke="rgb(86 216 255 / 0.95)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <AttractAgent label="University of Melbourne Advocate" shortLabel="M" tone="unimelb" />
      <AttractAgent label="Comparator Advocate" shortLabel="C" tone="comparator" />
      <AttractAgent label="Verifier / Judge" shortLabel="V" tone="verifier" />
    </div>
  );
}

export interface AttractScreenProps {
  config: SessionConfig;
  language: SupportedLanguage;
  question: string;
  error: string | null;
  onLanguageChange: (language: SupportedLanguage) => void;
  onQuestionChange: (question: string) => void;
  onStart: (question: string) => void;
  onOpenSetup: () => void;
}

export function AttractScreen({
  config,
  language,
  question,
  error,
  onLanguageChange,
  onQuestionChange,
  onStart,
  onOpenSetup,
}: AttractScreenProps) {
  const questions = SAMPLE_QUESTIONS[language];

  return (
    <main className="kiosk-grid flex min-h-dvh flex-col overflow-hidden px-[clamp(1rem,2vw,2.4rem)] pb-4" data-testid="attract-screen">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/50">
        <p className="text-base font-semibold tracking-tight sm:text-lg">University of Melbourne</p>
        <div className="flex items-center gap-3">
          {config.bilingualMode ? (
            <div className="flex h-11 items-center rounded-lg border border-border bg-background/60 p-1" aria-label="Question language">
              <button
                type="button"
                onClick={() => onLanguageChange("en")}
                className={cn(
                  "h-9 min-w-12 rounded-md px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={language === "en"}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange("zh")}
                className={cn(
                  "h-9 min-w-12 rounded-md px-3 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  language === "zh" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={language === "zh"}
              >
                中文
              </button>
            </div>
          ) : null}
          <Button variant="outline" onClick={onOpenSetup}>
            <SettingsIcon data-icon="inline-start" />
            Setup
          </Button>
          <Badge variant="outline" className="h-11 gap-2 border-cyan-400/35 px-4 text-sm text-cyan-100">
            <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgb(86_216_255/0.9)]" />
            {config.runtimeMode === "live" ? "Live ready" : "Canned ready"}
          </Badge>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col items-center justify-between gap-[clamp(0.6rem,1.5vh,1.4rem)] py-[clamp(0.7rem,1.8vh,1.7rem)]">
        <div className="text-center">
          <h1 className="font-display text-[clamp(3rem,5.8vw,6.8rem)] font-bold leading-[0.92] tracking-[-0.055em] text-white">
            TRUST THE VERDICT?
          </h1>
          <p className="mt-[clamp(0.45rem,1.2vh,1rem)] text-[clamp(1.15rem,2vw,2.25rem)] tracking-[0.01em] text-slate-200">
            Three AIs. One hidden instruction.
          </p>
        </div>

        <AgentNetwork />

        <div className="grid w-full grid-cols-6 gap-2.5 max-[1050px]:grid-cols-3" aria-label="Sample questions">
          {questions.map((sample) => (
            <button
              type="button"
              key={sample}
              className="min-h-[4.7rem] rounded-xl border border-blue-400/55 bg-card/75 px-3 py-2 text-[clamp(0.78rem,0.92vw,1rem)] font-medium leading-snug text-slate-100 shadow-[inset_0_1px_rgb(255_255_255/0.04)] outline-none transition hover:border-cyan-300 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60"
              onClick={() => onQuestionChange(sample)}
            >
              {sample}
            </button>
          ))}
        </div>

        <form
          className="grid w-full max-w-[90rem] grid-cols-[minmax(0,1fr)_minmax(15rem,24rem)] gap-3 max-[760px]:grid-cols-1"
          onSubmit={(event) => {
            event.preventDefault();
            onStart(question);
          }}
        >
          <label className="relative min-w-0">
            <span className="sr-only">University comparison question</span>
            <MessageCircleIcon className="pointer-events-none absolute left-5 top-1/2 size-6 -translate-y-1/2 text-blue-400" aria-hidden="true" />
            <Input
              className="h-[clamp(3.5rem,7vh,5.7rem)] rounded-xl border-blue-400/65 bg-card/70 pl-14 pr-16 text-[clamp(1rem,1.25vw,1.35rem)] placeholder:text-slate-500"
              value={question}
              maxLength={240}
              disabled={!config.freeTextEnabled}
              placeholder={
                config.freeTextEnabled
                  ? language === "zh"
                    ? "输入一个大学比较问题…"
                    : "Ask a university comparison question…"
                  : language === "zh"
                    ? "请选择上方的示例问题"
                    : "Choose a sample question above"
              }
              onChange={(event) => onQuestionChange(event.target.value)}
              aria-describedby="privacy-disclosure question-error"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm tabular-nums text-muted-foreground">
              {question.length}/240
            </span>
          </label>
          <Button type="submit" size="lg" className="h-[clamp(3.5rem,7vh,5.7rem)] rounded-xl text-[clamp(1.15rem,1.5vw,1.75rem)]" disabled={!question.trim()}>
            {language === "zh" ? "开始辩论" : "Start Debate"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </form>

        <div className="text-center">
          <p id="question-error" className="min-h-5 text-sm font-medium text-red-200" aria-live="polite">
            {error ?? ""}
          </p>
          <p id="privacy-disclosure" className="text-[clamp(0.75rem,0.85vw,0.95rem)] leading-snug text-muted-foreground">
            {language === "zh" ? (
              <>
                教育用途的人工智能演示。请勿输入个人信息。本应用不会保存问题。人工智能回答可能有误。自由文本仅适用于 13 岁及以上访客。
                <span className="mt-0.5 block text-slate-300">
                  {config.runtimeMode === "live"
                    ? "实时 AI 模式下，获准的问题、所选证据和提示词会由此浏览器直接发送至 OpenAI。"
                    : "当前离线演示模式不会调用 OpenAI。"}
                </span>
              </>
            ) : (
              <>
                Educational AI demo. Please do not enter personal information. Questions are not saved by this app.
                AI responses may be wrong. Free text is for visitors aged 13+.
                <span className="mt-0.5 block text-slate-300">
                  {config.runtimeMode === "live"
                    ? "In Live AI mode, accepted questions, selected evidence and prompts are sent directly from this browser to OpenAI."
                    : "Canned mode does not call OpenAI."}
                </span>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
