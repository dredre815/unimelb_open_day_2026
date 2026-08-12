import englishCatalogJson from "@/data/fallbacks/en/catalog.json";
import chineseCatalogJson from "@/data/fallbacks/zh/catalog.json";
import { classifyQuestion } from "@/lib/classifier";
import { FallbackCatalogSchema, FallbackPackageSchema } from "@/lib/schemas";
import { isPromptInjectionAttempt } from "@/lib/safety";
import type {
  FallbackCategory,
  FallbackPackage,
  QuestionClassification,
  SupportedLanguage,
  DebateTurn,
} from "@/types/debate";

const CATALOGS: Record<SupportedLanguage, FallbackPackage[]> = {
  en: FallbackCatalogSchema.parse(englishCatalogJson),
  zh: FallbackCatalogSchema.parse(chineseCatalogJson),
};

const SAMPLE_QUESTION_ALIASES = [
  "Which is better for someone interested in cybersecurity?",
  "哪所大学更适合学习信息技术和计算机科学？",
  "哪所大学的校园更美？",
  "哪所大学的课程选择更灵活？",
  "哪所大学的学生生活更丰富？",
  "对网络安全感兴趣的人更适合哪所大学？",
  "如果我还没决定方向，应该选择哪所大学？",
] as const;

const GENERIC_TO_MONASH_EVIDENCE_IDS: Record<string, readonly string[]> = {
  "VB-GEN-01": ["MO-GEN-01"],
  "VB-BIT-01": ["MO-BIT-01"],
  "VB-BIT-02": ["MO-BIT-02"],
  "VB-BIT-03": ["MO-BIT-03"],
  "VB-CAREER-01": ["MO-BIT-04"],
  "VB-CAMPUS-01": ["MO-CAMPUS-01"],
  "VB-CAMPUS-02": ["MO-CAMPUS-02"],
  "VB-LIFE-01": ["MO-LIFE-01"],
};

function normaliseSampleQuestion(question: string): string {
  return question.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function mapEvidenceId(id: string, competitorId: string): readonly string[] {
  return competitorId === "monash" ? (GENERIC_TO_MONASH_EVIDENCE_IDS[id] ?? [id]) : [id];
}

function adaptCompetitor(packageData: FallbackPackage, competitorId: string): FallbackPackage {
  if (competitorId !== "monash") return packageData;

  const mapTurn = (turn: DebateTurn): DebateTurn => ({
    ...turn,
    claims: turn.claims.map((claim) => ({
      ...claim,
      evidenceIds: claim.evidenceIds.flatMap((id) => mapEvidenceId(id, competitorId)),
    })),
  });

  return {
    ...packageData,
    rounds: packageData.rounds.map((round) => ({
      ...round,
      turns: {
        unimelb: round.turns.unimelb,
        competitor: mapTurn(round.turns.competitor),
      },
    })),
    compromisedVerdict: {
      ...packageData.compromisedVerdict,
      evidenceChecks: packageData.compromisedVerdict.evidenceChecks.map((check) => ({
        ...check,
        evidenceIds: check.evidenceIds.flatMap((id) => mapEvidenceId(id, competitorId)),
      })),
    },
  };
}

export function getFallbackCatalog(language: SupportedLanguage): FallbackPackage[] {
  return CATALOGS[language].map((entry) => FallbackPackageSchema.parse(entry));
}

export function getFallbackPackage(
  category: FallbackCategory,
  language: SupportedLanguage = "en",
  competitorId = "victorian-university-b",
): FallbackPackage {
  const entry = CATALOGS[language].find((candidate) => candidate.category === category);
  if (!entry) throw new Error(`Fallback package not found: ${language}/${category}`);
  return adaptCompetitor(FallbackPackageSchema.parse(entry), competitorId);
}

export function matchFallback(
  input: string | QuestionClassification,
  language?: SupportedLanguage,
  competitorId = "victorian-university-b",
): FallbackPackage {
  const classification = typeof input === "string" ? classifyQuestion(input) : input;
  const category =
    typeof input === "string" && isPromptInjectionAttempt(input)
      ? "prompt_injection"
      : classification.fallbackCategory;

  return getFallbackPackage(category, language ?? classification.language, competitorId);
}

export function isSampleQuestion(question: string): boolean {
  const normalised = normaliseSampleQuestion(question);
  return (
    SAMPLE_QUESTION_ALIASES.some((sample) => normaliseSampleQuestion(sample) === normalised) ||
    (Object.values(CATALOGS) as FallbackPackage[][]).some((catalog) =>
      catalog.some((entry) => normaliseSampleQuestion(entry.sampleQuestion) === normalised),
    )
  );
}

export const fallbackReady = CATALOGS.en.length >= 10 && CATALOGS.zh.length >= 10;
