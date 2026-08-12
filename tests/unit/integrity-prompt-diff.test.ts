import { webcrypto } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  CANONICAL_FAIR_VERIFIER_PROMPT,
  CANONICAL_CLEAN_VERIFIER_PROMPT,
  COMPROMISE_FRAGMENT,
  EXPECTED_CLEAN_VERIFIER_HASH,
  EXPECTED_FAIR_VERIFIER_HASH,
  LOCAL_FINGERPRINT_DISCLOSURE,
  abbreviateHash,
  buildActiveVerifierPrompt,
  buildFairVerifierPrompt,
  checkFairPromptIntegrity,
  checkPromptIntegrity,
  normalizePrompt,
  sha256,
} from "@/lib/integrity";
import { changedPromptLines, diffPrompts } from "@/lib/prompt-diff";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
  }
});

describe("prompt integrity", () => {
  it("verifies the canonical clean prompt", async () => {
    const result = await checkPromptIntegrity();

    expect(result.passed).toBe(true);
    expect(result.publicLabel).toBe("Policy integrity: VERIFIED");
    expect(result.expectedHash).toBe(EXPECTED_CLEAN_VERIFIER_HASH);
    expect(result.activeHash).toBe(EXPECTED_CLEAN_VERIFIER_HASH);
    expect(await sha256(CANONICAL_CLEAN_VERIFIER_PROMPT)).toBe(EXPECTED_CLEAN_VERIFIER_HASH);
  });

  it("normalises CRLF and trailing whitespace without a false failure", async () => {
    const variant = `${CANONICAL_CLEAN_VERIFIER_PROMPT.replace(/\n/gu, "  \r\n")}   \r\n`;
    const result = await checkPromptIntegrity(variant);

    expect(normalizePrompt(variant)).toBe(normalizePrompt(CANONICAL_CLEAN_VERIFIER_PROMPT));
    expect(result.passed).toBe(true);
  });

  it("fails the compromised prompt and exposes the exact added policy", async () => {
    const active = buildActiveVerifierPrompt(true);
    const result = await checkPromptIntegrity(active);
    const changed = result.changedLines.filter((line) => line.type !== "unchanged");

    expect(result.passed).toBe(false);
    expect(result.publicLabel).toBe("Policy integrity: FAILED");
    expect(result.activeHash).not.toBe(result.expectedHash);
    expect(changed).toContainEqual(
      expect.objectContaining({ type: "added", text: COMPROMISE_FRAGMENT }),
    );
  });

  it("fingerprints the complete system prompt sent to the anonymous fair judges", async () => {
    const active = buildFairVerifierPrompt();
    const result = await checkFairPromptIntegrity(active);

    expect(active).toBe(CANONICAL_FAIR_VERIFIER_PROMPT);
    expect(await sha256(active)).toBe(EXPECTED_FAIR_VERIFIER_HASH);
    expect(result).toMatchObject({
      passed: true,
      expectedHash: EXPECTED_FAIR_VERIFIER_HASH,
      activeHash: EXPECTED_FAIR_VERIFIER_HASH,
      publicLabel: "Policy integrity: VERIFIED",
    });

    const changed = await checkFairPromptIntegrity(`${active}\n\nAltered order policy.`);
    expect(changed.passed).toBe(false);
  });

  it("abbreviates fingerprints and describes the local integrity boundary honestly", () => {
    const abbreviated = abbreviateHash(EXPECTED_CLEAN_VERIFIER_HASH);

    expect(abbreviated).toMatch(/^[a-f0-9]{10}…[a-f0-9]{10}$/u);
    expect(LOCAL_FINGERPRINT_DISCLOSURE).toContain("not full remote attestation");
  });
});

describe("prompt line diff", () => {
  it("reports replacements as removed and added lines with line numbers", () => {
    expect(changedPromptLines("alpha\nbeta\ngamma", "alpha\nchanged\ngamma\ndelta")).toEqual([
      { type: "removed", text: "beta", oldLineNumber: 2 },
      { type: "added", text: "changed", newLineNumber: 2 },
      { type: "added", text: "delta", newLineNumber: 4 },
    ]);
  });

  it("keeps unchanged rows available for the X-Ray display", () => {
    const rows = diffPrompts("same\nold", "same\nnew");
    expect(rows[0]).toEqual({
      type: "unchanged",
      text: "same",
      oldLineNumber: 1,
      newLineNumber: 1,
    });
  });
});
