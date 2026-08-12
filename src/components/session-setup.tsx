"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  FlaskConicalIcon,
  RefreshCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { testOpenAIConnection, type ConnectionTestResult } from "@/lib/openai-client";
import {
  DEFAULT_SESSION_CONFIG,
  MODEL_OPTIONS,
  REASONING_OPTIONS,
  clearSessionConfig,
  maskApiKey,
  saveSessionConfig,
  validateApiKey,
  type AgentModelConfig,
  type ComparatorMode,
  type DemoMode,
  type ModelId,
  type ReasoningEffort,
  type RuntimeMode,
  type SessionConfig,
} from "@/lib/session-config";
import { cn } from "@/lib/utils";

type AgentKey = keyof SessionConfig["agents"];

const AGENT_ROWS: ReadonlyArray<{
  key: AgentKey;
  label: string;
  role: string;
  avatar: string;
  icon: "agent" | "verifier" | "pair";
}> = [
  {
    key: "unimelbAdvocate",
    label: "Melbourne Advocate",
    role: "One response per round",
    avatar: "M",
    icon: "agent",
  },
  {
    key: "comparatorAdvocate",
    label: "Comparator Advocate",
    role: "One response per round",
    avatar: "C",
    icon: "agent",
  },
  {
    key: "verifier",
    label: "Verifier / Judge",
    role: "Compromised verdict",
    avatar: "V",
    icon: "verifier",
  },
  {
    key: "fairVerifier",
    label: "Clean judge pair",
    role: "2 calls · candidate order reversed",
    avatar: "A↔B",
    icon: "pair",
  },
] as const;

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

function AgentGlyph({ row }: { row: (typeof AGENT_ROWS)[number] }) {
  if (row.icon === "verifier") return <ShieldCheckIcon aria-hidden="true" />;
  if (row.icon === "pair") return <UsersIcon aria-hidden="true" />;
  return <span aria-hidden="true">{row.avatar}</span>;
}

interface AgentConfigRowProps {
  index: number;
  row: (typeof AGENT_ROWS)[number];
  value: AgentModelConfig;
  onChange: (value: AgentModelConfig) => void;
}

function AgentConfigRow({ index, row, value, onChange }: AgentConfigRowProps) {
  const modelDescription = MODEL_OPTIONS.find((option) => option.id === value.model)?.description;
  const reasoningDescription = REASONING_OPTIONS.find(
    (option) => option.id === value.reasoningEffort,
  )?.description;
  const modelDescriptionId = `${row.key}-model-description`;
  const reasoningDescriptionId = `${row.key}-reasoning-description`;

  return (
    <div className="grid min-h-16 grid-cols-[2.1rem_2fr_1.45fr_1.65fr_1.35fr] items-center gap-3 border-t border-border/80 px-4 py-2 first:border-t-0 max-[900px]:grid-cols-[2rem_1.4fr_1fr_1fr]">
      <span className="text-center text-base font-bold text-cyan-300">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full border text-lg font-bold",
            row.key === "comparatorAdvocate"
              ? "border-violet-400/70 bg-violet-500/20 text-violet-200"
              : row.icon === "verifier"
                ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                : row.icon === "pair"
                  ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                  : "border-blue-400/70 bg-blue-500/20 text-blue-100",
          )}
        >
          <AgentGlyph row={row} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{row.label}</p>
          <p className="hidden text-sm text-muted-foreground max-[900px]:block">{row.role}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground max-[900px]:hidden">{row.role}</p>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="sr-only">Model for {row.label}</span>
        <Select
          value={value.model}
          onValueChange={(model) => onChange({ ...value, model: model as ModelId })}
        >
          <SelectTrigger
            className="w-full"
            aria-label={`Model for ${row.label}`}
            aria-describedby={modelDescriptionId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span id={modelDescriptionId} className="text-xs leading-snug text-muted-foreground">
          {modelDescription}
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="sr-only">Reasoning effort for {row.label}</span>
        <Select
          value={value.reasoningEffort}
          onValueChange={(reasoningEffort) =>
            onChange({ ...value, reasoningEffort: reasoningEffort as ReasoningEffort })
          }
        >
          <SelectTrigger
            className="w-full"
            aria-label={`Reasoning effort for ${row.label}`}
            aria-describedby={reasoningDescriptionId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {REASONING_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span id={reasoningDescriptionId} className="text-xs leading-snug text-muted-foreground">
          {reasoningDescription}
        </span>
      </label>
    </div>
  );
}

interface SegmentedSettingProps<T extends string> {
  label: string;
  description?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

function SegmentedSetting<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: SegmentedSettingProps<T>) {
  const descriptionId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium leading-snug text-muted-foreground">{label}</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        variant="outline"
        spacing={0}
        className="w-full"
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal px-2 py-2 text-center text-sm leading-tight data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {description ? (
        <span id={descriptionId} className="text-xs leading-snug text-muted-foreground">
          {description}
        </span>
      ) : null}
    </div>
  );
}

export interface SessionSetupProps {
  open: boolean;
  currentConfig: SessionConfig;
  onOpenChange: (open: boolean) => void;
  onSaved: (config: SessionConfig) => void;
}

export function SessionSetup({
  open,
  currentConfig,
  onOpenChange,
  onSaved,
}: SessionSetupProps) {
  const [config, setConfig] = useState<SessionConfig>(() => ({
    ...currentConfig,
    agents: {
      unimelbAdvocate: { ...currentConfig.agents.unimelbAdvocate },
      comparatorAdvocate: { ...currentConfig.agents.comparatorAdvocate },
      verifier: { ...currentConfig.agents.verifier },
      fairVerifier: { ...currentConfig.agents.fairVerifier },
    },
  }));
  const connectionTestRef = useRef<AbortController | null>(null);
  const [storedApiKey, setStoredApiKey] = useState(() =>
    validateApiKey(currentConfig.apiKey).valid ? currentConfig.apiKey : "",
  );
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [connection, setConnection] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasStoredKey = storedApiKey.length > 0;
  const activeKey = apiKeyDraft || storedApiKey;
  const hasClearableKey = activeKey.trim().length > 0 || config.apiKey.trim().length > 0;
  const advocateCallCount = config.debateRoundCount * 2;
  const verifierCallCount = config.demoMode === "compromised" ? 3 : 2;
  const liveCallCount = advocateCallCount + verifierCallCount;
  const keyValidation = useMemo(() => validateApiKey(activeKey), [activeKey]);
  const liveReady =
    config.runtimeMode === "canned" || (keyValidation.valid && riskAcknowledged);

  useEffect(() => () => connectionTestRef.current?.abort(), []);

  const updateAgent = (key: AgentKey, value: AgentModelConfig) => {
    setConfig((previous) => ({
      ...previous,
      agents: { ...previous.agents, [key]: value },
    }));
    setConnection(null);
  };

  const handleTestConnection = async () => {
    connectionTestRef.current?.abort();
    const controller = new AbortController();
    connectionTestRef.current = controller;
    setTesting(true);
    setConnection(null);
    const result = await testOpenAIConnection(
      activeKey,
      config.agents.unimelbAdvocate,
      { timeoutMs: 8_000, signal: controller.signal },
    );
    if (connectionTestRef.current !== controller) return;
    connectionTestRef.current = null;
    setConnection(result);
    setTesting(false);
  };

  const handleClearKey = () => {
    connectionTestRef.current?.abort();
    connectionTestRef.current = null;
    const next = { ...config, apiKey: "", runtimeMode: "canned" as const };
    setStoredApiKey("");
    setApiKeyDraft("");
    setShowKey(false);
    setConfig(next);
    setTesting(false);
    setRiskAcknowledged(false);
    setConnection(null);
    setSaveError(null);
    clearSessionConfig();
    const saved = saveSessionConfig(next);
    if (saved.success) onSaved(next);
  };

  const handleSave = () => {
    if (!liveReady) {
      setSaveError("A valid temporary key and risk acknowledgement are required for live mode.");
      return;
    }
    const next = { ...config, apiKey: activeKey };
    const result = saveSessionConfig(next);
    if (!result.success) {
      setSaveError(result.issues[0]?.message ?? "The temporary session could not be saved.");
      return;
    }
    onSaved(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="kiosk-grid glass-panel h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-none gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none"
        showCloseButton
      >
        <DialogHeader className="border-b border-border/80 px-6 py-4 pr-16">
          <div className="flex items-baseline gap-5">
            <span className="font-display text-xl font-bold tracking-tight">
              TRUST THE <span className="text-blue-400">VERDICT?</span>
            </span>
            <DialogTitle className="text-2xl">Operator setup</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Configure the demo experience, temporary browser API session, agent models, and reasoning effort.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <section className="glass-panel shrink-0 rounded-xl p-4" aria-labelledby="api-session-heading">
            <div className="grid grid-cols-[15rem_minmax(18rem,1fr)_auto_auto] items-end gap-3 max-[980px]:grid-cols-1">
              <div>
                <h2 id="api-session-heading" className="text-xl font-semibold">
                  OpenAI API session
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional. Prepared demo mode does not need a key.
                </p>
              </div>
              <label className="min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-muted-foreground">
                  Temporary API key
                </span>
                <div className="flex gap-2">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKeyDraft}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={apiKeyDraft.length > 0 && !keyValidation.valid}
                    onChange={(event) => {
                      const value = event.target.value;
                      setApiKeyDraft(value);
                      setConfig((previous) => ({
                        ...previous,
                        apiKey: value || storedApiKey,
                      }));
                      setConnection(null);
                    }}
                    placeholder={hasStoredKey ? maskApiKey(storedApiKey) : "sk-proj-…"}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!apiKeyDraft}
                        onClick={() => setShowKey((visible) => !visible)}
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                      >
                        {showKey ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{showKey ? "Hide key" : "Show key temporarily"}</TooltipContent>
                  </Tooltip>
                </div>
                {hasStoredKey && !apiKeyDraft ? (
                  <span className="mt-1.5 block text-xs text-cyan-100">
                    {maskApiKey(storedApiKey)} is configured for this tab. Type a replacement or use Clear key; the saved value cannot be revealed here.
                  </span>
                ) : null}
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={!keyValidation.valid || testing}
                onClick={handleTestConnection}
              >
                <FlaskConicalIcon data-icon="inline-start" />
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!hasClearableKey}
                onClick={handleClearKey}
              >
                <Trash2Icon data-icon="inline-start" />
                Clear key
              </Button>
            </div>

            <div className="mt-3 flex min-h-6 items-center gap-2 text-sm" aria-live="polite">
              {connection ? (
                <>
                  {connection.ok ? (
                    <CheckCircle2Icon className="text-emerald-300" aria-hidden="true" />
                  ) : (
                    <AlertTriangleIcon className="text-red-300" aria-hidden="true" />
                  )}
                  <span className={connection.ok ? "text-emerald-200" : "text-red-200"}>
                    {connection.message} ({connection.latencyMs} ms)
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {activeKey
                    ? keyValidation.message
                    : "No key configured. Prepared demo mode remains fully available."}
                </span>
              )}
            </div>

            <Alert className="mt-3 border-amber-400/70 bg-amber-400/10 text-amber-50">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle className="text-base text-amber-200">Temporary booth mode</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-6 text-sm text-amber-50/85 max-[900px]:flex-col max-[900px]:items-start">
                <p>
                  The key is stored in this tab&apos;s sessionStorage and can be read by page scripts.
                  Use a restricted, short-lived project key and revoke it after the event.
                </p>
                <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-lg border border-amber-300/30 px-3">
                  <Checkbox
                    checked={riskAcknowledged}
                    onCheckedChange={(checked) => setRiskAcknowledged(checked === true)}
                  />
                  <span>I understand this client-side key risk.</span>
                </label>
              </AlertDescription>
            </Alert>
          </section>

          <section className="glass-panel shrink-0 rounded-xl p-4" aria-labelledby="experience-heading">
            <div className="mb-4">
              <h2 id="experience-heading" className="text-xl font-semibold">Demo experience</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the visitor flow first. The prepared demo is the dependable event default.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[620px]:grid-cols-1">
              <SegmentedSetting<RuntimeMode>
                label="Generation"
                description="Prepared demo is recommended and makes no API calls."
                value={config.runtimeMode}
                options={[
                  { value: "canned", label: "Prepared demo (recommended)" },
                  { value: "live", label: "Live AI" },
                ]}
                onChange={(runtimeMode) => setConfig((previous) => ({ ...previous, runtimeMode }))}
              />
              <SegmentedSetting<DemoMode>
                label="Demo story"
                description="Compromised reveal shows the hidden-policy lesson; fair only skips it."
                value={config.demoMode}
                options={[
                  { value: "compromised", label: "Compromised reveal" },
                  { value: "fair", label: "Fair only" },
                ]}
                onChange={(demoMode) => setConfig((previous) => ({ ...previous, demoMode }))}
              />
              <SegmentedSetting<ComparatorMode>
                label="Comparator"
                description="Use a named comparator only after approval; generic is the safe default."
                value={config.comparatorMode}
                options={[
                  { value: "generic", label: "Generic" },
                  { value: "named", label: "Named" },
                ]}
                onChange={(comparatorMode) => setConfig((previous) => ({ ...previous, comparatorMode }))}
              />
              <SegmentedSetting<"free" | "chips">
                label="Visitor input"
                description="Question chips are safest during queues and for younger visitors."
                value={config.freeTextEnabled ? "free" : "chips"}
                options={[
                  { value: "chips", label: "Question chips" },
                  { value: "free", label: "Free text" },
                ]}
                onChange={(value) => setConfig((previous) => ({ ...previous, freeTextEnabled: value === "free" }))}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-medium leading-snug text-muted-foreground">Debate rounds</span>
                <ToggleGroup
                  type="single"
                  value={String(config.debateRoundCount)}
                  onValueChange={(value) => {
                    if (value) {
                      setConfig((previous) => ({ ...previous, debateRoundCount: Number(value) }));
                    }
                  }}
                  variant="outline"
                  spacing={0}
                  className="w-full"
                  aria-label="Debate rounds"
                  aria-describedby="debate-rounds-description"
                >
                  {[2, 3, 4, 5].map((roundCount) => (
                    <ToggleGroupItem
                      key={roundCount}
                      value={String(roundCount)}
                      className="h-11 min-w-11 flex-1 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                      {roundCount}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <span id="debate-rounds-description" className="text-xs leading-snug text-muted-foreground">
                  A live run makes {liveCallCount} model calls before retries: {advocateCallCount} advocate
                  calls and {verifierCallCount} verifier calls. More rounds increase duration and API cost.
                </span>
              </div>
            </div>
          </section>

          <details className="group glass-panel shrink-0 overflow-hidden rounded-xl">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
              <span>
                <span id="agent-config-heading" className="block text-xl font-semibold">Advanced agent models</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Optional. The defaults balance event speed and verification quality.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-cyan-100">
                Configure models &amp; thinking
                <ChevronDownIcon className="transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div aria-labelledby="agent-config-heading" className="border-t border-border/80">
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Higher-capability models and reasoning can add latency and live API cost. The clean judge runs twice with candidate order reversed.
              </p>
              <div className="grid grid-cols-[2.1rem_2fr_1.45fr_1.65fr_1.35fr] gap-3 bg-secondary/60 px-4 py-2 text-sm text-muted-foreground max-[900px]:grid-cols-[2rem_1.4fr_1fr_1fr]">
                <span>#</span>
                <span>Agent</span>
                <span className="max-[900px]:hidden">Role</span>
                <span>Model</span>
                <span>Thinking</span>
              </div>
              {AGENT_ROWS.map((row, index) => (
                <AgentConfigRow
                  key={row.key}
                  index={index}
                  row={row}
                  value={config.agents[row.key]}
                  onChange={(value) => updateAgent(row.key, value)}
                />
              ))}
            </div>
          </details>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border/80 bg-background/90 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfig(cloneDefaultConfig());
              setConnection(null);
              setRiskAcknowledged(false);
            }}
          >
            <RefreshCcwIcon data-icon="inline-start" />
            Restore defaults
          </Button>
          <div className="min-w-0 text-center text-sm text-muted-foreground" aria-live="polite">
            {saveError ? (
              <span className="text-red-200">{saveError}</span>
            ) : (
              <span>
                {config.runtimeMode === "live" ? `${maskApiKey(activeKey)} · ` : ""}
                Saved only for this browser tab · Nothing written to the repository
              </span>
            )}
          </div>
          <Button type="button" size="lg" disabled={!liveReady} onClick={handleSave}>
            <BotIcon data-icon="inline-start" />
            Save & enter kiosk
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
