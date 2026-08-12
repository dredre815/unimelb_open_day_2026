import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { InstitutionEvidencePackSchema } from "../src/lib/schemas";
import type { InstitutionEvidencePack } from "../src/types/debate";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = resolve(repositoryRoot, "src/data/institutions");
const requiredPackIds = new Set(["unimelb", "monash", "victorian-university-b"]);

function formatPath(path: PropertyKey[]): string {
  return path.length === 0 ? "<root>" : path.map(String).join(".");
}

function assertCalendarDate(value: string, label: string): void {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real ISO calendar date; received ${value}.`);
  }
}

async function parsePack(filePath: string): Promise<InstitutionEvidencePack> {
  const relativeName = basename(filePath);
  let input: unknown;

  try {
    input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${relativeName} is not valid JSON: ${message}`);
  }

  const result = InstitutionEvidencePackSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join("; ");
    throw new Error(`${relativeName} does not match the evidence schema: ${issues}`);
  }

  const pack = result.data;
  const expectedFileName = `${pack.id}.json`;
  if (relativeName !== expectedFileName) {
    throw new Error(`${relativeName} must be named ${expectedFileName} to match its pack id.`);
  }

  const localIds = new Set<string>();
  let hasGeneralFact = false;

  for (const [index, fact] of pack.facts.entries()) {
    const label = `${relativeName} facts[${index}] (${fact.id})`;

    if (fact.institutionId !== pack.id) {
      throw new Error(
        `${label} has institutionId ${fact.institutionId}; expected ${pack.id}.`,
      );
    }
    if (localIds.has(fact.id)) {
      throw new Error(`${relativeName} contains duplicate evidence id ${fact.id}.`);
    }
    if (!fact.sourceUrl.startsWith("https://")) {
      throw new Error(`${label} must use an HTTPS official source URL.`);
    }

    assertCalendarDate(fact.reviewedAt, `${label} reviewedAt`);
    if (fact.validUntil) {
      assertCalendarDate(fact.validUntil, `${label} validUntil`);
      if (fact.validUntil < fact.reviewedAt) {
        throw new Error(`${label} validUntil cannot be before reviewedAt.`);
      }
    }

    if (new Set(fact.tags).size !== fact.tags.length) {
      throw new Error(`${label} contains duplicate tags.`);
    }

    localIds.add(fact.id);
    hasGeneralFact ||= fact.category === "general";
  }

  if (!hasGeneralFact) {
    throw new Error(`${relativeName} must contain at least one general evidence fact.`);
  }

  return pack;
}

async function main(): Promise<void> {
  const directoryEntries = await readdir(evidenceDirectory, { withFileTypes: true });
  const files = directoryEntries
    .filter((entry) => entry.isFile() && extname(entry.name) === ".json")
    .map((entry) => resolve(evidenceDirectory, entry.name))
    .sort();

  if (files.length === 0) {
    throw new Error("No evidence JSON files were found in src/data/institutions.");
  }

  const packs = await Promise.all(files.map(parsePack));
  const packIds = new Set<string>();
  const evidenceIds = new Set<string>();
  let factCount = 0;
  let publicFactCount = 0;

  for (const pack of packs) {
    if (packIds.has(pack.id)) {
      throw new Error(`Duplicate institution pack id: ${pack.id}.`);
    }
    packIds.add(pack.id);

    for (const fact of pack.facts) {
      if (evidenceIds.has(fact.id)) {
        throw new Error(`Evidence id must be globally unique: ${fact.id}.`);
      }
      evidenceIds.add(fact.id);
      factCount += 1;
      if (fact.safeForPublicComparison) publicFactCount += 1;
    }
  }

  const missingPackIds = [...requiredPackIds].filter((id) => !packIds.has(id));
  if (missingPackIds.length > 0) {
    throw new Error(`Missing required evidence packs: ${missingPackIds.join(", ")}.`);
  }

  console.log(
    `Validated ${packs.length} evidence packs with ${factCount} facts (${publicFactCount} public-comparison facts).`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Evidence validation failed: ${message}`);
  process.exitCode = 1;
});
