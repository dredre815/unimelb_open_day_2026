import type {
  AdvocateId,
  DebateTurn,
  EvidenceFact,
  FairVerdict,
  QuestionCategory,
  SupportedLanguage,
  Verdict,
  Winner,
} from "@/types/debate";

export type EvidenceIdCollection = Iterable<string> | Iterable<EvidenceFact>;
export type AnonymousWinner = "A" | "B" | "tie" | "depends";
export type AnonymousMapping = Record<"A" | "B", AdvocateId>;

function toValidIdSet(validEvidence: EvidenceIdCollection): Set<string> {
  const values = Array.from(validEvidence as Iterable<string | EvidenceFact>);
  return new Set(values.map((item) => (typeof item === "string" ? item : item.id)));
}

function toEvidenceContext(validEvidence: EvidenceIdCollection): {
  validIds: Set<string>;
  factsById: Map<string, EvidenceFact>;
} {
  const values = Array.from(validEvidence as Iterable<string | EvidenceFact>);
  return {
    validIds: new Set(values.map((item) => (typeof item === "string" ? item : item.id))),
    factsById: new Map(
      values
        .filter((item): item is EvidenceFact => typeof item !== "string")
        .map((fact) => [fact.id, fact]),
    ),
  };
}

export function validateDebateTurnEvidence(
  turn: DebateTurn,
  validEvidence: EvidenceIdCollection,
): DebateTurn {
  const validIds = toValidIdSet(validEvidence);
  return {
    ...turn,
    claims: turn.claims.map((claim) => {
      const evidenceIds = claim.evidenceIds.filter((id) => validIds.has(id));
      return {
        ...claim,
        evidenceIds,
        kind: claim.kind === "fact" && evidenceIds.length === 0 ? "opinion" : claim.kind,
      };
    }),
  };
}

export function validateVerdictEvidence(
  verdict: Verdict,
  validEvidence: EvidenceIdCollection,
): Verdict {
  const { validIds, factsById } = toEvidenceContext(validEvidence);
  return {
    ...verdict,
    evidenceChecks: verdict.evidenceChecks.map((check) => {
      const evidenceIds = check.evidenceIds.filter((id) => {
        if (!validIds.has(id)) return false;
        const fact = factsById.get(id);
        if (!fact) return true;
        return check.speaker === "unimelb"
          ? fact.institutionId === "unimelb"
          : fact.institutionId !== "unimelb";
      });
      const evidenceRequired = check.status === "supported" || check.status === "conflicting";
      return {
        ...check,
        evidenceIds,
        status: evidenceRequired && evidenceIds.length === 0 ? "unsupported" : check.status,
      };
    }),
  };
}

function flattenEvidence(evidence?: EvidenceFact[] | { unimelb: EvidenceFact[]; competitor: EvidenceFact[] }): {
  unimelb: EvidenceFact[];
  competitor: EvidenceFact[];
} {
  if (!evidence) return { unimelb: [], competitor: [] };
  if (Array.isArray(evidence)) {
    return {
      unimelb: evidence.filter((fact) => fact.institutionId === "unimelb"),
      competitor: evidence.filter((fact) => fact.institutionId !== "unimelb"),
    };
  }
  return evidence;
}

function selectPositiveFact(facts: EvidenceFact[], fallback: string): { claim: string; evidenceIds: string[] } {
  const fact = facts.find((candidate) => candidate.safeForPublicComparison);
  return fact ? { claim: fact.claim, evidenceIds: [fact.id] } : { claim: fallback, evidenceIds: [] };
}

export function enforceCompromisedWinner(
  verdict: Verdict,
  evidence?: EvidenceFact[] | { unimelb: EvidenceFact[]; competitor: EvidenceFact[] },
  language: SupportedLanguage = "en",
): Verdict {
  if (verdict.winner === "unimelb") return verdict;

  const facts = flattenEvidence(evidence);
  const melbourne = selectPositiveFact(
    facts.unimelb,
    language === "zh" ? "墨尔本大学提供跨领域学习的灵活路径。" : "Melbourne offers flexible pathways across study areas.",
  );
  const competitor = selectPositiveFact(
    facts.competitor,
    language === "zh" ? "比较方也有适合不同偏好的优势。" : "The comparator also has strengths that may suit different preferences.",
  );

  const publicReasoning =
    language === "zh"
      ? `在本次受控演示的加权标准下，墨尔本大学被推荐：${melbourne.claim} 同时，比较方的优势也值得肯定：${competitor.claim} 这不是普遍适用的结论。`
      : `Under this controlled demo's weighted criteria, Melbourne is recommended: ${melbourne.claim} The comparator also has a genuine strength: ${competitor.claim} This is not a universal conclusion.`;
  const addedChecks: Verdict["evidenceChecks"] = [
    {
      claim: melbourne.claim,
      speaker: "unimelb",
      status: melbourne.evidenceIds.length > 0 ? "supported" : "opinion",
      evidenceIds: melbourne.evidenceIds,
    },
    {
      claim: competitor.claim,
      speaker: "competitor",
      status: competitor.evidenceIds.length > 0 ? "supported" : "opinion",
      evidenceIds: competitor.evidenceIds,
    },
  ];

  return {
    ...verdict,
    winner: "unimelb",
    headline: language === "zh" ? "受控结果：墨尔本大学" : "Controlled result: Melbourne",
    publicReasoning,
    evidenceChecks: [...verdict.evidenceChecks, ...addedChecks].slice(0, 12),
    confidence: Math.min(verdict.confidence, 0.72),
    disclaimer:
      language === "zh"
        ? "教育演示：本结果采用了被操控的决策策略，不构成个人升学建议。"
        : "Educational demo: this result used a compromised decision policy and is not personal admissions advice.",
  };
}

export const buildSafeCompromisedFallback = enforceCompromisedWinner;

export function remapAnonymousWinner(winner: AnonymousWinner, mapping: AnonymousMapping): Winner {
  if (winner === "A" || winner === "B") return mapping[winner];
  return winner;
}

export function remapAnonymousVerdict<T extends Omit<Verdict, "winner"> & { winner: AnonymousWinner }>(
  verdict: T,
  mapping: AnonymousMapping,
): Verdict {
  return { ...verdict, winner: remapAnonymousWinner(verdict.winner, mapping) };
}

function mergedQuestionCategory(first: QuestionCategory, second: QuestionCategory): QuestionCategory {
  return first === second ? first : "mixed";
}

export function aggregateFairVerdicts(first: Verdict, reversed: Verdict): FairVerdict {
  const orderConsistent = first.winner === reversed.winner;
  const winner = orderConsistent ? first.winner : "depends";
  const language = /[\u3400-\u9fff]/u.test(`${first.headline}${reversed.headline}`) ? "zh" : "en";
  const category = mergedQuestionCategory(first.questionCategory, reversed.questionCategory);

  if (!orderConsistent) {
    return {
      winner,
      orderConsistent: false,
      firstJudgeWinner: first.winner,
      reversedJudgeWinner: reversed.winner,
      headline: language === "zh" ? "结论取决于偏好，也受到顺序影响" : "It depends — the judges showed order sensitivity",
      publicReasoning:
        language === "zh"
          ? "两次公平审查使用相同辩论内容，但交换了候选顺序，结果并不一致。因此不能给出稳定的单一推荐。"
          : "The two fair checks used the same debate with candidate order reversed and did not agree, so there is no stable single recommendation.",
      takeaway:
        language === "zh"
          ? "顺序敏感性说明，即使提示词公平，也需要检验决策过程。"
          : "Order sensitivity shows why a fair prompt still needs a tested decision process.",
    };
  }

  return {
    winner,
    orderConsistent: true,
    firstJudgeWinner: first.winner,
    reversedJudgeWinner: reversed.winner,
    headline: first.headline,
    publicReasoning:
      category === "subjective" && winner !== "depends"
        ? `${first.publicReasoning} The result remains a preference-based fit, not a universal ranking.`
        : first.publicReasoning,
    takeaway:
      language === "zh"
        ? "两次公平审查在交换候选顺序后得出一致结论。"
        : "Both fair checks reached the same result after candidate order was reversed.",
  };
}

export const aggregateOrderReversedVerdicts = aggregateFairVerdicts;
