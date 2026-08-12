import promptManifest from "@/lib/prompts/prompt-manifest.generated.json";
import { diffPrompts } from "@/lib/prompt-diff";
import type { IntegrityResult } from "@/types/debate";

interface PromptManifestEntry {
  path: string;
  sha256: string;
  content: string;
}

const manifest = promptManifest as Record<string, PromptManifestEntry>;

function getPrompt(id: string): PromptManifestEntry {
  const prompt = manifest[id];
  if (!prompt) throw new Error(`Prompt manifest entry not found: ${id}`);
  return prompt;
}

export const ADVOCATE_SHARED_PROMPT = getPrompt("advocate.shared.v1").content;
export const ADVOCATE_UNIMELB_PROMPT = getPrompt("advocate.unimelb.v1").content;
export const ADVOCATE_COMPARATOR_PROMPT = getPrompt("advocate.comparator.v1").content;
export const CANONICAL_CLEAN_VERIFIER_PROMPT = getPrompt("verifier.clean.v1").content;
export const COMPROMISE_FRAGMENT = getPrompt("verifier.compromise-fragment.v1").content;
export const FAIR_ORDER_PROMPT = getPrompt("verifier.fair-order.v1").content;
export const EXPECTED_CLEAN_VERIFIER_HASH = getPrompt("verifier.clean.v1").sha256;
export const CANONICAL_FAIR_VERIFIER_PROMPT = getPrompt("verifier.fair.v1").content;
export const EXPECTED_FAIR_VERIFIER_HASH = getPrompt("verifier.fair.v1").sha256;

export function normalizePrompt(prompt: string): string {
  return prompt
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

export const normalisePrompt = normalizePrompt;

export async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this browser context.");
  }

  const bytes = new TextEncoder().encode(normalizePrompt(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildActiveVerifierPrompt(compromised: boolean): string {
  return compromised
    ? `${normalizePrompt(CANONICAL_CLEAN_VERIFIER_PROMPT)}\n\n${normalizePrompt(COMPROMISE_FRAGMENT)}`
    : normalizePrompt(CANONICAL_CLEAN_VERIFIER_PROMPT);
}

export function buildFairVerifierPrompt(): string {
  return `${normalizePrompt(CANONICAL_CLEAN_VERIFIER_PROMPT)}\n\n${normalizePrompt(FAIR_ORDER_PROMPT)}`;
}

async function comparePromptIntegrity(
  activePrompt: string,
  canonicalPrompt: string,
  expectedHash: string,
): Promise<IntegrityResult> {
  const activeHash = await sha256(activePrompt);
  const passed = activeHash === expectedHash;

  return {
    passed,
    expectedHash,
    activeHash,
    changedLines: diffPrompts(canonicalPrompt, activePrompt),
    publicLabel: passed ? "Policy integrity: VERIFIED" : "Policy integrity: FAILED",
  };
}

export async function checkPromptIntegrity(
  activePrompt = CANONICAL_CLEAN_VERIFIER_PROMPT,
): Promise<IntegrityResult> {
  return comparePromptIntegrity(
    activePrompt,
    CANONICAL_CLEAN_VERIFIER_PROMPT,
    EXPECTED_CLEAN_VERIFIER_HASH,
  );
}

export async function checkFairPromptIntegrity(
  activePrompt = buildFairVerifierPrompt(),
): Promise<IntegrityResult> {
  return comparePromptIntegrity(
    activePrompt,
    CANONICAL_FAIR_VERIFIER_PROMPT,
    EXPECTED_FAIR_VERIFIER_HASH,
  );
}

export const checkVerifierPolicyIntegrity = checkPromptIntegrity;

export function abbreviateHash(hash: string, visibleCharacters = 10): string {
  const length = Math.max(4, Math.min(visibleCharacters, 32));
  return hash.length <= length * 2 ? hash : `${hash.slice(0, length)}…${hash.slice(-length)}`;
}

export const LOCAL_FINGERPRINT_DISCLOSURE =
  "This is a local fingerprint demonstration, not full remote attestation. It detects whether the verifier policy differs from the approved demo policy. Production systems need stronger controls such as signed deployments or independent attestation.";
