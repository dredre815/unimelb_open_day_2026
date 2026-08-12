import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FallbackPackageSchema } from "../src/lib/schemas";
import {
  FALLBACK_CATEGORIES,
  type FallbackPackage,
  type SupportedLanguage,
} from "../src/types/debate";

interface LocatedPackage {
  package: FallbackPackage;
  source: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fallbackRoot = resolve(repositoryRoot, "src/data/fallbacks");
const evidenceRoot = resolve(repositoryRoot, "src/data/institutions");
const compromisePromptPath = resolve(
  repositoryRoot,
  "src/lib/prompts/verifier-compromise-fragment.txt",
);
const supportedLanguages: SupportedLanguage[] = ["en", "zh"];

function formatPath(path: PropertyKey[]): string {
  return path.length === 0 ? "<root>" : path.map(String).join(".");
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;
    if (code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listJsonFiles(path)));
    if (entry.isFile() && extname(entry.name) === ".json") files.push(path);
  }

  return files.sort();
}

function extractCandidates(input: unknown, source: string): unknown[] {
  if (Array.isArray(input)) return input;

  if (typeof input === "object" && input !== null && "packages" in input) {
    const packages = (input as { packages?: unknown }).packages;
    if (!Array.isArray(packages)) {
      throw new Error(`${source} has a packages field that is not an array.`);
    }
    return packages;
  }

  return [input];
}

async function readPackages(filePath: string): Promise<LocatedPackage[]> {
  const source = relative(repositoryRoot, filePath);
  let input: unknown;

  try {
    input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${source} is not valid JSON: ${message}`);
  }

  const candidates = extractCandidates(input, source);
  if (candidates.length === 0) {
    throw new Error(`${source} contains no fallback packages.`);
  }

  return candidates.map((candidate, index) => {
    const result = FallbackPackageSchema.safeParse(candidate);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
        .join("; ");
      throw new Error(`${source} package[${index}] does not match the fallback schema: ${issues}`);
    }

    const pathLanguage = source.split("/").find((part) => part === "en" || part === "zh");
    if (pathLanguage && result.data.language !== pathLanguage) {
      throw new Error(
        `${source} package[${index}] declares ${result.data.language}, expected ${pathLanguage}.`,
      );
    }

    return { package: result.data, source };
  });
}

async function collectEvidenceIds(): Promise<Set<string>> {
  const files = (await listJsonFiles(evidenceRoot)).filter(
    (file) => dirname(file) === evidenceRoot,
  );
  const ids = new Set<string>();

  for (const file of files) {
    const value = JSON.parse(await readFile(file, "utf8")) as {
      facts?: Array<{ id?: unknown }>;
    };
    for (const fact of value.facts ?? []) {
      if (typeof fact.id === "string") ids.add(fact.id);
    }
  }

  return ids;
}

function collectReferencedEvidenceIds(fallback: FallbackPackage): Set<string> {
  const ids = new Set<string>();
  const turns = [
    fallback.openings.unimelb,
    fallback.openings.competitor,
    fallback.rebuttals.unimelb,
    fallback.rebuttals.competitor,
  ];

  for (const turn of turns) {
    for (const claim of turn.claims) {
      for (const id of claim.evidenceIds) ids.add(id);
    }
  }
  for (const check of fallback.compromisedVerdict.evidenceChecks) {
    for (const id of check.evidenceIds) ids.add(id);
  }

  return ids;
}

function validatePackageInvariants(
  located: LocatedPackage,
  evidenceIds: Set<string>,
  compromiseFragment: string,
): void {
  const fallback = located.package;
  const label = `${located.source} (${fallback.id})`;

  if (fallback.compromisedVerdict.winner !== "unimelb") {
    throw new Error(`${label} compromised verdict must select unimelb.`);
  }
  if (normalizeText(fallback.integrityReveal.compromisedLine) !== compromiseFragment) {
    throw new Error(`${label} does not contain the exact compromised policy fragment.`);
  }

  const turns = [
    fallback.openings.unimelb,
    fallback.openings.competitor,
    fallback.rebuttals.unimelb,
    fallback.rebuttals.competitor,
  ];
  for (const turn of turns) {
    for (const claim of turn.claims) {
      if (claim.kind === "fact" && claim.evidenceIds.length === 0) {
        throw new Error(`${label} contains a factual claim without an evidence id.`);
      }
    }
  }

  const unknownIds = [...collectReferencedEvidenceIds(fallback)].filter(
    (id) => !evidenceIds.has(id),
  );
  if (unknownIds.length > 0) {
    throw new Error(`${label} references unknown evidence ids: ${unknownIds.join(", ")}.`);
  }
}

async function main(): Promise<void> {
  const files = await listJsonFiles(fallbackRoot);
  if (files.length === 0) {
    console.log(
      "No fallback JSON files found in src/data/fallbacks; skipping catalog validation.",
    );
    return;
  }

  const locatedPackages = (await Promise.all(files.map(readPackages))).flat();
  const evidenceIds = await collectEvidenceIds();
  const compromiseFragment = normalizeText(await readFile(compromisePromptPath, "utf8"));
  const packageIds = new Set<string>();
  const languageCategories = new Set<string>();

  for (const located of locatedPackages) {
    const fallback = located.package;
    if (packageIds.has(fallback.id)) {
      throw new Error(`Duplicate fallback package id: ${fallback.id}.`);
    }
    packageIds.add(fallback.id);

    const combination = `${fallback.language}:${fallback.category}`;
    if (languageCategories.has(combination)) {
      throw new Error(`Duplicate fallback language/category: ${combination}.`);
    }
    languageCategories.add(combination);
    validatePackageInvariants(located, evidenceIds, compromiseFragment);
  }

  const missing = supportedLanguages.flatMap((language) =>
    FALLBACK_CATEGORIES.filter(
      (category) => !languageCategories.has(`${language}:${category}`),
    ).map((category) => `${language}:${category}`),
  );
  if (missing.length > 0) {
    throw new Error(`Fallback catalog is incomplete; missing ${missing.join(", ")}.`);
  }

  console.log(
    `Validated ${locatedPackages.length} fallback packages across ${supportedLanguages.length} languages and ${FALLBACK_CATEGORIES.length} categories.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fallback validation failed: ${message}`);
  process.exitCode = 1;
});
