import { z } from "zod";

export const SESSION_CONFIG_STORAGE_KEY =
  "unimelb-open-day-2026:session-config:v1" as const;

export const MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;

export const REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const RUNTIME_MODES = ["live", "canned"] as const;
export const DEMO_MODES = ["compromised", "fair"] as const;
export const COMPARATOR_MODES = ["named", "generic"] as const;

export type ModelId = (typeof MODEL_IDS)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type RuntimeMode = (typeof RUNTIME_MODES)[number];
export type DemoMode = (typeof DEMO_MODES)[number];
export type ComparatorMode = (typeof COMPARATOR_MODES)[number];

export interface ModelOption {
  id: ModelId;
  label: string;
  description: string;
}

export interface ReasoningOption {
  id: ReasoningEffort;
  label: string;
  description: string;
}

export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Fast and cost-efficient for short, high-volume agent turns.",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Balanced capability and cost for verification.",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "Highest-capability option with greater latency and cost.",
  },
] as const;

export const REASONING_OPTIONS: readonly ReasoningOption[] = [
  { id: "none", label: "None", description: "Lowest latency." },
  { id: "low", label: "Low", description: "Light reasoning for quick checks." },
  { id: "medium", label: "Medium", description: "Balanced reasoning." },
  { id: "high", label: "High", description: "More deliberation and latency." },
  { id: "xhigh", label: "Extra high", description: "Quality-first reasoning." },
  { id: "max", label: "Maximum", description: "Highest available reasoning effort." },
] as const;

export const AgentModelConfigSchema = z
  .object({
    model: z.enum(MODEL_IDS),
    reasoningEffort: z.enum(REASONING_EFFORTS),
  })
  .strict();

export type AgentModelConfig = z.infer<typeof AgentModelConfigSchema>;

export const SessionConfigSchema = z
  .object({
    version: z.literal(1),
    apiKey: z.string().trim().max(512),
    runtimeMode: z.enum(RUNTIME_MODES),
    demoMode: z.enum(DEMO_MODES),
    comparatorMode: z.enum(COMPARATOR_MODES),
    freeTextEnabled: z.boolean(),
    bilingualMode: z.boolean(),
    autoRevealDelayMs: z.number().int().min(0).max(10_000),
    debaterTimeoutMs: z.number().int().min(2_000).max(60_000),
    verifierTimeoutMs: z.number().int().min(2_000).max(60_000),
    totalSessionTimeoutMs: z.number().int().min(5_000).max(120_000),
    maxRetries: z.number().int().min(0).max(1),
    agents: z
      .object({
        unimelbAdvocate: AgentModelConfigSchema,
        comparatorAdvocate: AgentModelConfigSchema,
        verifier: AgentModelConfigSchema,
        fairVerifier: AgentModelConfigSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.runtimeMode === "live") {
      const validation = validateApiKey(config.apiKey);
      if (!validation.valid) {
        context.addIssue({
          code: "custom",
          path: ["apiKey"],
          message: validation.message,
        });
      }
    }

    if (config.totalSessionTimeoutMs < config.verifierTimeoutMs) {
      context.addIssue({
        code: "custom",
        path: ["totalSessionTimeoutMs"],
        message: "The total session timeout must cover at least one verifier call.",
      });
    }
  });

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export const DEFAULT_SESSION_CONFIG: Readonly<SessionConfig> = Object.freeze({
  version: 1,
  apiKey: "",
  runtimeMode: "canned",
  demoMode: "compromised",
  comparatorMode: "generic",
  freeTextEnabled: true,
  bilingualMode: true,
  autoRevealDelayMs: 2_200,
  debaterTimeoutMs: 6_500,
  verifierTimeoutMs: 9_000,
  totalSessionTimeoutMs: 25_000,
  maxRetries: 1,
  agents: {
    unimelbAdvocate: {
      model: "gpt-5.6-luna",
      reasoningEffort: "none",
    },
    comparatorAdvocate: {
      model: "gpt-5.6-luna",
      reasoningEffort: "none",
    },
    verifier: {
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
    },
    fairVerifier: {
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
    },
  },
} satisfies SessionConfig);

export interface ApiKeyValidation {
  valid: boolean;
  masked: string;
  message: string;
}

export interface SessionConfigValidation {
  success: boolean;
  config?: SessionConfig;
  issues: Array<{ path: string; message: string }>;
}

export interface SafeSessionConfigSummary {
  configured: boolean;
  maskedApiKey: string;
  runtimeMode: RuntimeMode;
  demoMode: DemoMode;
  comparatorMode: ComparatorMode;
  agents: SessionConfig["agents"];
}

export interface SessionConfigSaveResult {
  success: boolean;
  summary?: SafeSessionConfigSummary;
  issues: SessionConfigValidation["issues"];
}

const API_KEY_PATTERN = /^sk-[A-Za-z0-9_\-]{16,508}$/;

export function maskApiKey(value: string): string {
  const key = value.trim();
  if (!key) return "Not configured";

  const prefix = key.startsWith("sk-proj-") ? "sk-proj-" : key.startsWith("sk-") ? "sk-" : "key-";
  const suffix = key.length >= 4 ? key.slice(-4) : "••••";
  return `${prefix}••••••••${suffix}`;
}

export function validateApiKey(value: unknown): ApiKeyValidation {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      valid: false,
      masked: "Not configured",
      message: "Enter a temporary OpenAI API key for live mode.",
    };
  }

  const key = value.trim();
  if (key.length > 512 || !API_KEY_PATTERN.test(key)) {
    return {
      valid: false,
      masked: maskApiKey(key),
      message: "The key format is not recognised. Check it without sharing the key.",
    };
  }

  return {
    valid: true,
    masked: maskApiKey(key),
    message: "Key format looks valid. Test the connection before the event.",
  };
}

export function validateSessionConfig(input: unknown): SessionConfigValidation {
  const result = SessionConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, config: result.data, issues: [] };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export function toSafeSessionConfigSummary(
  config: SessionConfig,
): SafeSessionConfigSummary {
  return {
    configured: config.runtimeMode === "canned" || validateApiKey(config.apiKey).valid,
    maskedApiKey: maskApiKey(config.apiKey),
    runtimeMode: config.runtimeMode,
    demoMode: config.demoMode,
    comparatorMode: config.comparatorMode,
    agents: config.agents,
  };
}

function resolveSessionStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSessionConfig(storage?: Storage): SessionConfig | null {
  const target = resolveSessionStorage(storage);
  if (!target) return null;

  try {
    const serialized = target.getItem(SESSION_CONFIG_STORAGE_KEY);
    if (!serialized) return null;
    const validation = validateSessionConfig(JSON.parse(serialized) as unknown);
    return validation.config ?? null;
  } catch {
    return null;
  }
}

export function saveSessionConfig(
  input: unknown,
  storage?: Storage,
): SessionConfigSaveResult {
  const validation = validateSessionConfig(input);
  if (!validation.success || !validation.config) {
    return { success: false, issues: validation.issues };
  }

  const target = resolveSessionStorage(storage);
  if (!target) {
    return {
      success: false,
      issues: [
        {
          path: "sessionStorage",
          message: "Temporary session storage is unavailable in this browser.",
        },
      ],
    };
  }

  try {
    target.setItem(SESSION_CONFIG_STORAGE_KEY, JSON.stringify(validation.config));
    return {
      success: true,
      summary: toSafeSessionConfigSummary(validation.config),
      issues: [],
    };
  } catch {
    return {
      success: false,
      issues: [
        {
          path: "sessionStorage",
          message: "The temporary setup could not be saved in this browser session.",
        },
      ],
    };
  }
}

export function clearSessionConfig(storage?: Storage): boolean {
  const target = resolveSessionStorage(storage);
  if (!target) return false;

  try {
    target.removeItem(SESSION_CONFIG_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function withoutApiKey(config: SessionConfig): SessionConfig {
  return {
    ...config,
    apiKey: "",
    runtimeMode: "canned",
    agents: {
      unimelbAdvocate: { ...config.agents.unimelbAdvocate },
      comparatorAdvocate: { ...config.agents.comparatorAdvocate },
      verifier: { ...config.agents.verifier },
      fairVerifier: { ...config.agents.fairVerifier },
    },
  };
}

export function clearApiKey(storage?: Storage): boolean {
  const current = loadSessionConfig(storage);
  if (!current) return clearSessionConfig(storage);
  return saveSessionConfig(withoutApiKey(current), storage).success;
}

export function hasSessionConfig(storage?: Storage): boolean {
  return loadSessionConfig(storage) !== null;
}
