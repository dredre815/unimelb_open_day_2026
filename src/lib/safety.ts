import { classifyQuestion, detectLanguage } from "@/lib/classifier";
import type { SafetyAssessment, SupportedLanguage } from "@/types/debate";

export const MAX_QUESTION_LENGTH = 240;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|edu|gov|au|cn)\b/iu;
const PHONE_PATTERN = /(?<!\d)(?:\+?\d[\s().-]*){8,15}(?!\d)/u;
const LONG_IDENTIFIER_PATTERN = /(?<!\d)\d{9,}(?!\d)/u;
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Za-z][A-Za-z\s'-]{1,40}\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|way)\b/iu;
const PERSONAL_INTRO_PATTERN =
  /\b(?:my full name is|my name is|my phone(?: number)? is|my email is|i live at|contact me at)\b|(?:我的全名是|我叫|我的名字是|我的电话是|我的電話是|我的手机号是|我的手機號是|我的邮箱是|我的郵箱是|我住在)/iu;

const INJECTION_PATTERNS = [
  /ignore (?:all |every )?(?:the )?(?:previous|prior|above) instructions?/iu,
  /reveal (?:your |the )?(?:complete )?(?:system|developer|hidden) prompt/iu,
  /print (?:the )?developer message/iu,
  /(?:jailbreak|bypass (?:the )?(?:rules|policy|safety))/iu,
  /(?:act|pretend) as (?:if )?(?:you are )?/iu,
  /忽略(?:之前|以上|所有)(?:所有)?(?:指令|指示)/u,
  /(?:显示|顯示|输出|輸出|泄露|洩露)(?:你的|系统|系統|开发者|開發者|隐藏|隱藏)?(?:提示词|提示詞|指令)/u,
];

const UNSAFE_PATTERNS = [
  /\b(?:kill myself|suicide|self[- ]?harm|hurt myself)\b/iu,
  /\b(?:porn|sexual assault|rape)\b/iu,
  /\b(?:bomb making|make a bomb|shoot up|massacre)\b/iu,
  /\b(?:racial slur|exterminate|ethnic cleansing)\b/iu,
  /(?:自杀|自殺|自残|自殘|想死|伤害自己|傷害自己|强奸|強姦|炸弹|炸彈|屠杀|屠殺)/u,
];

const MESSAGES: Record<Exclude<SafetyAssessment["outcome"], "allow">, Record<SupportedLanguage, string>> = {
  empty: {
    en: "Choose a sample question or enter a university study question.",
    zh: "请选择示例问题，或输入一个与大学学习有关的问题。",
  },
  too_long: {
    en: `Please keep the question to ${MAX_QUESTION_LENGTH} characters or fewer.`,
    zh: `请将问题限制在 ${MAX_QUESTION_LENGTH} 个字符以内。`,
  },
  personal_information: {
    en: "Please remove names, contact details, addresses and other personal information before continuing.",
    zh: "继续之前，请删除姓名、联系方式、地址和其他个人信息。",
  },
  prompt_injection: {
    en: "Nice try. Your text is treated as the debate topic, not as an instruction to the agents. Try a university question—or watch the controlled X-Ray reveal.",
    zh: "有意思的尝试。你的文字只会被当作辩题，不会成为给智能体的指令。请试试大学相关问题，或观看受控的 X-Ray 揭示。",
  },
  unsafe_content: {
    en: "This public demo cannot handle that topic. Please speak with booth staff if you need support, or choose a university study question.",
    zh: "这个公共演示无法处理该话题。如需帮助，请联系展位工作人员，或选择一个大学学习相关问题。",
  },
  off_topic: {
    en: "This demo compares university study experiences. Please choose a sample question or ask about courses, campus or student life.",
    zh: "本演示用于比较大学学习体验。请选择示例问题，或询问课程、校园或学生生活。",
  },
};

export interface AssessQuestionOptions {
  allowFreeText?: boolean;
  isSampleQuestion?: boolean;
}

function blocked(
  outcome: Exclude<SafetyAssessment["outcome"], "allow">,
  language: SupportedLanguage,
): SafetyAssessment {
  return { allowed: false, outcome, language, publicMessage: MESSAGES[outcome][language] };
}

export function containsPersonalInformation(question: string): boolean {
  return [
    EMAIL_PATTERN,
    URL_PATTERN,
    PHONE_PATTERN,
    LONG_IDENTIFIER_PATTERN,
    ADDRESS_PATTERN,
    PERSONAL_INTRO_PATTERN,
  ].some((pattern) => pattern.test(question));
}

export function isPromptInjectionAttempt(question: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(question));
}

export function containsUnsafeContent(question: string): boolean {
  return UNSAFE_PATTERNS.some((pattern) => pattern.test(question));
}

export function sanitizeQuestion(question: string): string {
  return question.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}

export function assessQuestion(question: string, options: AssessQuestionOptions = {}): SafetyAssessment {
  const language = detectLanguage(question);
  const sanitizedQuestion = sanitizeQuestion(question);

  if (!sanitizedQuestion) return blocked("empty", language);
  if (sanitizedQuestion.length > MAX_QUESTION_LENGTH) return blocked("too_long", language);
  if (options.allowFreeText === false && !options.isSampleQuestion) return blocked("off_topic", language);
  if (containsPersonalInformation(sanitizedQuestion)) return blocked("personal_information", language);
  if (isPromptInjectionAttempt(sanitizedQuestion)) return blocked("prompt_injection", language);
  if (containsUnsafeContent(sanitizedQuestion)) return blocked("unsafe_content", language);
  if (!classifyQuestion(sanitizedQuestion).isUniversityRelated) return blocked("off_topic", language);

  return { allowed: true, outcome: "allow", language, sanitizedQuestion };
}
