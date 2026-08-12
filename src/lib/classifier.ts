import type {
  EvidenceCategory,
  FallbackCategory,
  QuestionCategory,
  QuestionClassification,
  SupportedLanguage,
} from "@/types/debate";

interface CategoryRule {
  fallbackCategory: FallbackCategory;
  evidenceCategories: EvidenceCategory[];
  keywords: string[];
  questionCategory: QuestionCategory;
}

const RULES: CategoryRule[] = [
  {
    fallbackCategory: "cybersecurity",
    evidenceCategories: ["cybersecurity_ai", "it_computing", "career_learning"],
    keywords: [
      "cybersecurity",
      "cyber security",
      "cyber",
      "information security",
      "网络安全",
      "資訊安全",
      "信息安全",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "campus",
    evidenceCategories: ["campus", "student_life"],
    keywords: [
      "beautiful",
      "prettiest",
      "pretty",
      "campus",
      "architecture",
      "location",
      "garden",
      "美丽",
      "漂亮",
      "校园",
      "校園",
      "建筑",
      "建築",
      "位置",
    ],
    questionCategory: "subjective",
  },
  {
    fallbackCategory: "student_life",
    evidenceCategories: ["student_life", "campus"],
    keywords: [
      "student life",
      "club",
      "clubs",
      "society",
      "societies",
      "community",
      "social life",
      "学生生活",
      "學生生活",
      "社团",
      "社團",
      "社区",
      "社區",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "career",
    evidenceCategories: ["career_learning", "it_computing"],
    keywords: [
      "career",
      "job",
      "employment",
      "industry",
      "internship",
      "placement",
      "work ready",
      "就业",
      "就業",
      "职业",
      "職業",
      "实习",
      "實習",
      "工作",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "undecided",
    evidenceCategories: ["general", "flexibility", "course_structure", "it_computing"],
    keywords: [
      "undecided",
      "not sure",
      "still deciding",
      "don't know what",
      "do not know what",
      "没决定",
      "未决定",
      "未決定",
      "还没想好",
      "還沒想好",
      "不确定",
      "不確定",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "flexibility",
    evidenceCategories: ["flexibility", "course_structure", "general"],
    keywords: [
      "flexible",
      "flexibility",
      "breadth",
      "elective",
      "electives",
      "major",
      "majors",
      "minor",
      "minors",
      "灵活",
      "靈活",
      "选修",
      "選修",
      "专业",
      "專業",
      "自由度",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "it_computing",
    evidenceCategories: ["it_computing", "course_structure", "cybersecurity_ai"],
    keywords: [
      "information technology",
      "computer science",
      "computing",
      "software",
      "coding",
      "programming",
      " it ",
      "cs degree",
      "计算机",
      "計算機",
      "电脑",
      "電腦",
      "软件",
      "軟件",
      "編程",
      "编程",
      "信息技术",
      "資訊科技",
    ],
    questionCategory: "mixed",
  },
  {
    fallbackCategory: "best_overall",
    evidenceCategories: ["general", "flexibility", "it_computing", "student_life"],
    keywords: [
      "best university",
      "best overall",
      "which university is best",
      "which is better",
      "which should i choose",
      "better university",
      "哪个大学最好",
      "哪個大學最好",
      "哪所大学最好",
      "哪所大學最好",
      "哪个更好",
      "哪個更好",
      "应该选哪个",
      "應該選哪個",
    ],
    questionCategory: "subjective",
  },
];

const UNIVERSITY_TERMS = [
  "university",
  "uni ",
  "unimelb",
  "melbourne",
  "monash",
  "degree",
  "course",
  "study",
  "student",
  "campus",
  "college",
  "大学",
  "大學",
  "墨大",
  "莫纳什",
  "莫納什",
  "学位",
  "學位",
  "课程",
  "課程",
  "学习",
  "學習",
  "学生",
  "學生",
  "校园",
  "校園",
];

const SUBJECTIVE_TERMS = [
  "beautiful",
  "prettiest",
  "best",
  "better",
  "should i",
  "student life",
  "美",
  "漂亮",
  "最好",
  "更好",
  "应该",
  "應該",
];

function normaliseForMatching(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

function includesKeyword(normalised: string, keyword: string): boolean {
  const candidate = keyword.trim().toLocaleLowerCase().normalize("NFKC");
  if (!candidate) return false;
  if (/[^\x00-\x7f]/u.test(candidate)) return normalised.includes(candidate);

  const escaped = candidate
    .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    .replace(/\s+/gu, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "u").test(normalised);
}

export function detectLanguage(text: string): SupportedLanguage {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text) ? "zh" : "en";
}

export function classifyQuestion(question: string): QuestionClassification {
  const normalised = normaliseForMatching(question);
  const language = detectLanguage(question);
  const scoredRules = RULES.map((rule, index) => ({
    rule,
    index,
    matches: rule.keywords.filter((keyword) => includesKeyword(normalised, keyword)),
  }))
    .filter(({ matches }) => matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length || a.index - b.index);

  const isUniversityRelated = UNIVERSITY_TERMS.some((term) => includesKeyword(normalised, term)) || scoredRules.length > 0;
  const best = scoredRules[0];

  if (!isUniversityRelated) {
    return {
      language,
      category: "out_of_scope",
      fallbackCategory: "off_topic",
      evidenceCategories: ["general"],
      matchedKeywords: [],
      isUniversityRelated: false,
    };
  }

  if (!best) {
    return {
      language,
      category: SUBJECTIVE_TERMS.some((term) => includesKeyword(normalised, term)) ? "subjective" : "mixed",
      fallbackCategory: "best_overall",
      evidenceCategories: ["general", "flexibility", "it_computing", "student_life"],
      matchedKeywords: [],
      isUniversityRelated: true,
    };
  }

  const evidenceCategories = Array.from(
    new Set(scoredRules.slice(0, 2).flatMap(({ rule }) => rule.evidenceCategories)),
  ).slice(0, 4);

  return {
    language,
    category: best.rule.questionCategory,
    fallbackCategory: best.rule.fallbackCategory,
    evidenceCategories,
    matchedKeywords: Array.from(new Set(scoredRules.flatMap(({ matches }) => matches))),
    isUniversityRelated: true,
  };
}
