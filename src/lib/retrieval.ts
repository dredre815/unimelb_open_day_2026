import monashJson from "@/data/institutions/monash.json";
import unimelbJson from "@/data/institutions/unimelb.json";
import genericComparatorJson from "@/data/institutions/victorian-university-b.json";
import { classifyQuestion } from "@/lib/classifier";
import { InstitutionEvidencePackSchema } from "@/lib/schemas";
import type {
  EvidenceFact,
  InstitutionEvidencePack,
  QuestionClassification,
  RetrievedEvidence,
} from "@/types/debate";

const BUILT_IN_PACKS: Record<string, InstitutionEvidencePack> = {
  unimelb: InstitutionEvidencePackSchema.parse(unimelbJson),
  monash: InstitutionEvidencePackSchema.parse(monashJson),
  "victorian-university-b": InstitutionEvidencePackSchema.parse(genericComparatorJson),
};

export const DEFAULT_COMPETITOR_ID = "victorian-university-b";
export const MAX_EVIDENCE_PER_INSTITUTION = 8;

export interface RetrieveEvidenceOptions {
  competitorId?: string;
  maxPerInstitution?: number;
  packs?: Record<string, InstitutionEvidencePack>;
}

function normaliseTokens(value: string): string[] {
  const normalised = value.toLocaleLowerCase().normalize("NFKC");
  const wordTokens = normalised.match(/[a-z0-9]+/gu) ?? [];
  const chineseTokens = normalised.match(/[\u3400-\u9fff]{2,}/gu) ?? [];
  return Array.from(new Set([...wordTokens, ...chineseTokens]));
}

function scoreFact(fact: EvidenceFact, classification: QuestionClassification, question: string): number {
  let score = classification.evidenceCategories.includes(fact.category) ? 20 : 0;
  if (fact.category === "general") score += 6;
  const questionTokens = new Set(normaliseTokens(question));

  for (const tag of fact.tags) {
    const normalisedTag = tag.toLocaleLowerCase().normalize("NFKC");
    if (question.toLocaleLowerCase().normalize("NFKC").includes(normalisedTag)) score += 8;
    for (const token of normaliseTokens(tag)) {
      if (questionTokens.has(token)) score += 2;
    }
  }

  return score;
}

export function getInstitutionPack(
  institutionId: string,
  packs: Record<string, InstitutionEvidencePack> = BUILT_IN_PACKS,
): InstitutionEvidencePack {
  const pack = packs[institutionId];
  if (!pack) throw new Error(`Unknown institution evidence pack: ${institutionId}`);
  return InstitutionEvidencePackSchema.parse(pack);
}

export function listInstitutionPacks(): InstitutionEvidencePack[] {
  return Object.values(BUILT_IN_PACKS);
}

export function selectEvidenceForInstitution(
  pack: InstitutionEvidencePack,
  classification: QuestionClassification,
  question: string,
  limit = MAX_EVIDENCE_PER_INSTITUTION,
): EvidenceFact[] {
  const safeFacts = pack.facts.filter((fact) => fact.safeForPublicComparison);
  const sorted = safeFacts
    .map((fact, index) => ({ fact, index, score: scoreFact(fact, classification, question) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = sorted.filter(({ score }) => score > 0).slice(0, Math.max(1, Math.min(limit, 8)));
  const general = sorted.find(({ fact }) => fact.category === "general");

  if (general && !selected.some(({ fact }) => fact.id === general.fact.id)) {
    if (selected.length >= limit) selected[selected.length - 1] = general;
    else selected.push(general);
  }

  if (selected.length === 0 && sorted[0]) selected.push(sorted[0]);
  return selected.map(({ fact }) => fact);
}

export function retrieveEvidence(
  input: string | QuestionClassification,
  options: RetrieveEvidenceOptions = {},
): RetrievedEvidence {
  const question = typeof input === "string" ? input : input.matchedKeywords.join(" ");
  const classification = typeof input === "string" ? classifyQuestion(input) : input;
  const packs = options.packs ?? BUILT_IN_PACKS;
  const competitorId = options.competitorId ?? DEFAULT_COMPETITOR_ID;
  const maximum = Math.max(1, Math.min(options.maxPerInstitution ?? MAX_EVIDENCE_PER_INSTITUTION, 8));
  const unimelb = getInstitutionPack("unimelb", packs);
  const competitor = getInstitutionPack(competitorId, packs);
  const unimelbEvidence = selectEvidenceForInstitution(unimelb, classification, question, maximum);
  const competitorEvidence = selectEvidenceForInstitution(competitor, classification, question, maximum);
  const comparableCount = Math.max(1, Math.min(unimelbEvidence.length, competitorEvidence.length));

  return {
    classification,
    unimelb: unimelbEvidence.slice(0, comparableCount),
    competitor: competitorEvidence.slice(0, comparableCount),
    competitorId,
  };
}

export function collectEvidenceIds(evidence: Pick<RetrievedEvidence, "unimelb" | "competitor">): Set<string> {
  return new Set([...evidence.unimelb, ...evidence.competitor].map((fact) => fact.id));
}
