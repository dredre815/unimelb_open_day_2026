import { describe, expect, it } from "vitest";

import { listInstitutionPacks } from "@/lib/retrieval";
import {
  aggregateFairVerdicts,
  enforceCompromisedWinner,
  remapAnonymousVerdict,
  remapAnonymousWinner,
  validateDebateTurnEvidence,
  validateVerdictEvidence,
} from "@/lib/verdicts";
import type { DebateTurn, Verdict, Winner } from "@/types/debate";

const evidence = listInstitutionPacks().flatMap((pack) => pack.facts);
const validEvidenceId = evidence[0]?.id ?? "UM-GEN-01";

function verdict(winner: Winner, index = 0): Verdict {
  return {
    questionCategory: index % 2 === 0 ? "mixed" : "subjective",
    winner,
    headline: `Verdict ${index}`,
    publicReasoning: `Public reasoning ${index}`,
    evidenceChecks: [
      {
        claim: `Unsupported claim ${index}`,
        speaker: "competitor",
        status: "supported",
        evidenceIds: [`INVALID-${index}`],
      },
    ],
    bestFor: { unimelb: "Broad study", competitor: "Dedicated study" },
    confidence: (index % 100) / 100,
    disclaimer: "Educational demo.",
  };
}

describe("compromised verdict enforcement", () => {
  it("forces Melbourne across 100 varied inputs without mutating the inputs", () => {
    const possibleWinners: Winner[] = ["competitor", "tie", "depends", "unimelb"];

    for (let index = 0; index < 100; index += 1) {
      const input = verdict(possibleWinners[index % possibleWinners.length]!, index);
      const snapshot = structuredClone(input);
      const result = enforceCompromisedWinner(input, evidence, index % 2 === 0 ? "en" : "zh");

      expect(result.winner, `case ${index}`).toBe("unimelb");
      expect(input, `case ${index} input mutation`).toEqual(snapshot);
      expect(input.evidenceChecks[0]?.evidenceIds, `case ${index} original evidence`).toEqual([
        `INVALID-${index}`,
      ]);
    }
  });

  it("removes invalid references and downgrades unsupported checks before display", () => {
    const input = verdict("competitor", 101);
    input.evidenceChecks.push({
      claim: "Valid fact",
      speaker: "unimelb",
      status: "supported",
      evidenceIds: [validEvidenceId],
    });

    const enforced = enforceCompromisedWinner(input, evidence);
    const validated = validateVerdictEvidence(enforced, evidence);

    expect(validated.winner).toBe("unimelb");
    expect(validated.evidenceChecks[0]).toMatchObject({
      status: "unsupported",
      evidenceIds: [],
    });
    expect(validated.evidenceChecks[1]).toMatchObject({
      status: "supported",
      evidenceIds: [validEvidenceId],
    });
  });

  it("downgrades a factual advocate claim when every citation is invalid", () => {
    const turn: DebateTurn = {
      message: "A claim",
      stanceSummary: "Summary",
      claims: [
        { text: "Invalid fact", kind: "fact", evidenceIds: ["NOT-SUPPLIED"] },
        { text: "Valid fact", kind: "fact", evidenceIds: [validEvidenceId, "NOT-SUPPLIED"] },
      ],
    };

    expect(validateDebateTurnEvidence(turn, evidence).claims).toEqual([
      { text: "Invalid fact", kind: "opinion", evidenceIds: [] },
      { text: "Valid fact", kind: "fact", evidenceIds: [validEvidenceId] },
    ]);
  });
});

describe("clean order reversal", () => {
  it("remaps anonymous winners and verdicts using the supplied candidate mapping", () => {
    const mapping = { A: "competitor", B: "unimelb" } as const;
    expect(remapAnonymousWinner("A", mapping)).toBe("competitor");
    expect(remapAnonymousWinner("B", mapping)).toBe("unimelb");
    expect(remapAnonymousWinner("tie", mapping)).toBe("tie");
    expect(remapAnonymousVerdict({ ...verdict("tie"), winner: "A" }, mapping).winner).toBe(
      "competitor",
    );
  });

  it("returns the consensus when clean judges agree after order reversal", () => {
    const first = verdict("competitor", 1);
    const reversed = verdict("competitor", 2);
    const result = aggregateFairVerdicts(first, reversed);

    expect(result).toMatchObject({
      winner: "competitor",
      orderConsistent: true,
      firstJudgeWinner: "competitor",
      reversedJudgeWinner: "competitor",
    });
  });

  it("fails closed to depends when clean judges disagree", () => {
    const result = aggregateFairVerdicts(verdict("unimelb", 2), verdict("competitor", 4));

    expect(result).toMatchObject({
      winner: "depends",
      orderConsistent: false,
      firstJudgeWinner: "unimelb",
      reversedJudgeWinner: "competitor",
    });
    expect(result.headline).toContain("order sensitivity");
  });
});
