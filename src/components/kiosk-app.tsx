"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { AttractScreen, SAMPLE_QUESTIONS } from "@/components/attract-screen";
import { DebateStage, type DebateUiPhase } from "@/components/debate-stage";
import { SessionSetup } from "@/components/session-setup";
import { SourceDrawer } from "@/components/source-drawer";
import {
  createDebateInteractionController,
  runDebate,
  type DebateInteractionController,
} from "@/lib/orchestrator";
import { retrieveEvidence } from "@/lib/retrieval";
import { assessQuestion } from "@/lib/safety";
import {
  DEFAULT_SESSION_CONFIG,
  SESSION_CONFIG_STORAGE_KEY,
  loadSessionConfig,
  type SessionConfig,
} from "@/lib/session-config";
import type {
  AgentId,
  AgentStatus,
  EvidenceCheck,
  EvidenceFact,
  FairVerdict,
  IntegrityResult,
  PromptDiffLine,
  RetrievedEvidence,
  SessionEvent,
  Verdict,
} from "@/types/debate";
import type { TranscriptMessage } from "@/components/chat-transcript";

const ALL_SAMPLE_QUESTIONS: ReadonlySet<string> = new Set(SAMPLE_QUESTIONS);
const ACTIVE_SESSION_IDLE_MS = 90_000;
const COMPLETED_SESSION_IDLE_MS = 50_000;

function cloneDefaultConfig(): SessionConfig {
  return {
    ...DEFAULT_SESSION_CONFIG,
    agents: {
      unimelbAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.unimelbAdvocate },
      comparatorAdvocate: { ...DEFAULT_SESSION_CONFIG.agents.comparatorAdvocate },
      verifier: { ...DEFAULT_SESSION_CONFIG.agents.verifier },
      fairVerifier: { ...DEFAULT_SESSION_CONFIG.agents.fairVerifier },
    },
  };
}

function readStoredConfigSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_CONFIG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToStoredConfig(): () => void {
  return () => undefined;
}

interface DebateState {
  phase: DebateUiPhase;
  question: string;
  evidence: RetrievedEvidence | null;
  statuses: Record<AgentId, AgentStatus>;
  messages: TranscriptMessage[];
  checks: EvidenceCheck[];
  compromisedVerdict?: Verdict;
  integrity?: IntegrityResult;
  fairIntegrity?: IntegrityResult;
  diff: PromptDiffLine[];
  fairVerdict?: FairVerdict;
  fallbackUsed: boolean;
  recoverableError?: string;
}

type DebateAction =
  | { type: "start"; question: string; evidence: RetrievedEvidence }
  | { type: "event"; event: SessionEvent }
  | { type: "fatal"; message: string }
  | { type: "reset" };

const IDLE_STATUSES: Record<AgentId, AgentStatus> = {
  unimelb: "idle",
  competitor: "idle",
  verifier: "idle",
};

const INITIAL_DEBATE_STATE: DebateState = {
  phase: "starting",
  question: "",
  evidence: null,
  statuses: IDLE_STATUSES,
  messages: [],
  checks: [],
  diff: [],
  fallbackUsed: false,
};

function debateReducer(state: DebateState, action: DebateAction): DebateState {
  if (action.type === "reset") return INITIAL_DEBATE_STATE;
  if (action.type === "start") {
    return {
      ...INITIAL_DEBATE_STATE,
      question: action.question,
      evidence: action.evidence,
    };
  }
  if (action.type === "fatal") {
    return { ...state, phase: "error", recoverableError: action.message };
  }

  const event = action.event;
  switch (event.type) {
    case "session.started":
      return { ...state, fallbackUsed: event.fallbackUsed };
    case "phase.changed":
      return { ...state, phase: event.phase };
    case "round.started":
    case "round.completed":
      return state;
    case "agent.status":
      return { ...state, statuses: { ...state.statuses, [event.agent]: event.status } };
    case "agent.message":
      return { ...state, messages: [...state.messages, event] };
    case "verifier.checks":
      return { ...state, checks: event.checks };
    case "verdict.compromised":
      return { ...state, compromisedVerdict: event.verdict };
    case "integrity.result":
      return event.context === "active"
        ? { ...state, integrity: event.result }
        : { ...state, fairIntegrity: event.result };
    case "xray.prompt_diff":
      return { ...state, diff: event.lines };
    case "verdict.fair":
      return { ...state, fairVerdict: event.verdict };
    case "session.complete":
      return { ...state, phase: "complete", fallbackUsed: event.fallbackUsed };
    case "error.recoverable":
      return { ...state, fallbackUsed: true, recoverableError: event.message };
  }
}

export function KioskApp() {
  const rawStoredConfig = useSyncExternalStore(
    subscribeToStoredConfig,
    readStoredConfigSnapshot,
    () => null,
  );
  const storedConfig = useMemo(
    () => (rawStoredConfig === null ? null : loadSessionConfig()),
    [rawStoredConfig],
  );
  const [configOverride, setConfigOverride] = useState<SessionConfig | null>(null);
  const config = configOverride ?? storedConfig ?? cloneDefaultConfig();
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [showDebate, setShowDebate] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<EvidenceFact | null>(null);
  const [debate, dispatch] = useReducer(debateReducer, INITIAL_DEBATE_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const interactionRef = useRef<DebateInteractionController | null>(null);
  const autoResetRef = useRef<number | null>(null);

  const resetKiosk = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    interactionRef.current?.abort();
    interactionRef.current = null;
    if (autoResetRef.current !== null) window.clearTimeout(autoResetRef.current);
    autoResetRef.current = null;
    dispatch({ type: "reset" });
    setQuestion("");
    setQuestionError(null);
    setSelectedSource(null);
    setShowDebate(false);
  }, []);

  useEffect(() => {
    const openOperatorSetup = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLocaleLowerCase() === "d") {
        event.preventDefault();
        if (showDebate) resetKiosk();
        setSetupOpen(true);
      }
    };
    window.addEventListener("keydown", openOperatorSetup);
    return () => window.removeEventListener("keydown", openOperatorSetup);
  }, [resetKiosk, showDebate]);

  useEffect(() => {
    if (!showDebate) return;

    const scheduleIdleReset = () => {
      if (autoResetRef.current !== null) window.clearTimeout(autoResetRef.current);
      autoResetRef.current = window.setTimeout(
        resetKiosk,
        debate.phase === "complete" ? COMPLETED_SESSION_IDLE_MS : ACTIVE_SESSION_IDLE_MS,
      );
    };
    const activityEvents = ["pointerdown", "keydown"] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, scheduleIdleReset);
    }
    scheduleIdleReset();
    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, scheduleIdleReset);
      }
      if (autoResetRef.current !== null) window.clearTimeout(autoResetRef.current);
      autoResetRef.current = null;
    };
  }, [debate.phase, resetKiosk, showDebate]);

  const handleStart = useCallback(async (candidateQuestion: string) => {
    const assessment = assessQuestion(candidateQuestion, {
      allowFreeText: config.freeTextEnabled,
      isSampleQuestion: ALL_SAMPLE_QUESTIONS.has(candidateQuestion.trim()),
    });
    if (assessment.language !== "en") {
      setQuestionError("This Open Day demo is available in English only. Please choose an English question.");
      return;
    }
    if (!assessment.allowed || !assessment.sanitizedQuestion) {
      setQuestionError(assessment.publicMessage ?? "Please choose a university comparison question.");
      return;
    }

    setQuestionError(null);
    const safeQuestion = assessment.sanitizedQuestion;
    const evidence = retrieveEvidence(safeQuestion, {
      competitorId: config.comparatorMode === "named" ? "monash" : undefined,
    });
    dispatch({ type: "start", question: safeQuestion, evidence });
    setShowDebate(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const interactions = createDebateInteractionController();
    interactionRef.current = interactions;

    try {
      await runDebate(
        safeQuestion,
        config,
        (event) => {
          if (abortRef.current !== controller) return;
          dispatch({ type: "event", event });
        },
        controller.signal,
        interactions,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      dispatch({
        type: "fatal",
        message: error instanceof Error ? error.message : "The debate could not continue. Return to the question screen and try again.",
      });
    }
  }, [config]);

  const handleSavedConfig = (nextConfig: SessionConfig) => {
    if (showDebate) resetKiosk();
    setConfigOverride(nextConfig);
  };

  return (
    <>
      {showDebate && debate.evidence ? (
        <DebateStage
          question={debate.question}
          phase={debate.phase}
          statuses={debate.statuses}
          messages={debate.messages}
          evidence={debate.evidence}
          checks={debate.checks}
          compromisedVerdict={debate.compromisedVerdict}
          integrity={debate.integrity}
          fairIntegrity={debate.fairIntegrity}
          diff={debate.diff}
          fairVerdict={debate.fairVerdict}
          fallbackUsed={debate.fallbackUsed}
          recoverableError={debate.recoverableError}
          config={config}
          onReset={resetKiosk}
          onReveal={() => interactionRef.current?.reveal()}
          onRunClean={() => interactionRef.current?.runClean()}
          onOpenSource={setSelectedSource}
        />
      ) : (
        <AttractScreen
          config={config}
          question={question}
          error={questionError}
          onQuestionChange={(value) => {
            setQuestion(value);
            setQuestionError(null);
          }}
          onStart={handleStart}
          onOpenSetup={() => setSetupOpen(true)}
        />
      )}

      {setupOpen ? (
        <SessionSetup
          open
          currentConfig={config}
          onOpenChange={setSetupOpen}
          onSaved={handleSavedConfig}
        />
      ) : null}
      <SourceDrawer fact={selectedSource} onOpenChange={(open) => !open && setSelectedSource(null)} />
    </>
  );
}
