import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(repositoryRoot, "out");
const indexPath = resolve(outputRoot, "index.html");
const textAssetExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".txt"]);
const staticAssetExtensions = new Set([
  ".avif",
  ".css",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".webmanifest",
  ".woff",
  ".woff2",
]);

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    if (entry.isFile()) files.push(path);
  }

  return files;
}

function collectAssetReferences(html: string): string[] {
  const references = new Set<string>();
  for (const match of html.matchAll(/<(?:script|img|source)\b[^>]*\bsrc=["']([^"']+)["']/giu)) {
    if (match[1]) references.add(match[1]);
  }
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/giu)) {
    if (match[1]) references.add(match[1]);
  }
  return [...references];
}

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(reference);
}

function candidatePaths(reference: string): string[] {
  const withoutQuery = reference.split(/[?#]/u, 1)[0];
  if (!withoutQuery) return [];

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    throw new Error(`Asset reference is not valid URI text: ${reference}`);
  }

  const relativeReference = decoded.replace(/^\.\//u, "").replace(/^\/+/, "");
  const segments = relativeReference.split("/").filter(Boolean);
  const candidates = new Set<string>([resolve(outputRoot, relativeReference)]);

  const nextIndex = segments.indexOf("_next");
  if (nextIndex >= 0) {
    candidates.add(resolve(outputRoot, ...segments.slice(nextIndex)));
  }
  if (segments.length > 1) {
    candidates.add(resolve(outputRoot, ...segments.slice(1)));
  }

  return [...candidates].filter((candidate) => candidate.startsWith(outputRoot));
}

async function assertReferenceExists(reference: string): Promise<void> {
  if (isExternalReference(reference)) return;

  const pathPart = reference.split(/[?#]/u, 1)[0] ?? "";
  const extension = extname(pathPart).toLowerCase();
  if (!pathPart.includes("/_next/") && !staticAssetExtensions.has(extension)) return;

  for (const candidate of candidatePaths(reference)) {
    const details = await stat(candidate).catch(() => undefined);
    if (details?.isFile() && details.size > 0) return;
  }

  throw new Error(`Referenced static asset is missing or empty: ${reference}`);
}

async function main(): Promise<void> {
  const indexDetails = await stat(indexPath).catch(() => undefined);
  if (!indexDetails?.isFile() || indexDetails.size === 0) {
    throw new Error("out/index.html is missing or empty. Run pnpm build:pages first.");
  }

  const html = await readFile(indexPath, "utf8");
  if (!/<html\b/iu.test(html) || !/<body\b/iu.test(html)) {
    throw new Error("out/index.html does not contain a complete HTML document.");
  }

  const files = await listFiles(outputRoot);
  const javascriptFiles = files.filter((file) => extname(file) === ".js");
  const cssFiles = files.filter((file) => extname(file) === ".css");
  if (javascriptFiles.length === 0 || cssFiles.length === 0) {
    throw new Error("The static export must contain at least one JavaScript and one CSS asset.");
  }

  const emptyFiles: string[] = [];
  for (const file of files) {
    const details = await stat(file);
    if (details.size === 0) emptyFiles.push(relative(repositoryRoot, file));
  }
  if (emptyFiles.length > 0) {
    throw new Error(`Static export contains empty files: ${emptyFiles.join(", ")}.`);
  }

  const references = collectAssetReferences(html);
  if (references.length === 0) {
    throw new Error("out/index.html does not reference any static assets.");
  }
  await Promise.all(references.map(assertReferenceExists));

  const keyPattern = /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gu;
  for (const file of files.filter((candidate) => textAssetExtensions.has(extname(candidate)))) {
    const content = await readFile(file, "utf8");
    if (keyPattern.test(content)) {
      throw new Error(`A key-like value was found in ${relative(repositoryRoot, file)}.`);
    }
    keyPattern.lastIndex = 0;
  }

  console.log(
    `Static smoke test passed: ${files.length} files, ${javascriptFiles.length} JavaScript assets, ${cssFiles.length} CSS assets, and ${references.length} index references.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Static smoke test failed: ${message}`);
  process.exitCode = 1;
});
