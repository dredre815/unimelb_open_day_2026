import type { PromptDiffLine } from "@/types/debate";

function splitLines(prompt: string): string[] {
  return prompt.replace(/\r\n?/gu, "\n").split("\n").map((line) => line.trimEnd());
}

export function diffPrompts(expectedPrompt: string, activePrompt: string): PromptDiffLine[] {
  const expected = splitLines(expectedPrompt);
  const active = splitLines(activePrompt);
  const rows = expected.length + 1;
  const columns = active.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let oldIndex = expected.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = active.length - 1; newIndex >= 0; newIndex -= 1) {
      lcs[oldIndex]![newIndex] =
        expected[oldIndex] === active[newIndex]
          ? (lcs[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
          : Math.max(lcs[oldIndex + 1]?.[newIndex] ?? 0, lcs[oldIndex]?.[newIndex + 1] ?? 0);
    }
  }

  const result: PromptDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < expected.length && newIndex < active.length) {
    if (expected[oldIndex] === active[newIndex]) {
      result.push({
        type: "unchanged",
        text: expected[oldIndex] ?? "",
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if ((lcs[oldIndex + 1]?.[newIndex] ?? 0) >= (lcs[oldIndex]?.[newIndex + 1] ?? 0)) {
      result.push({ type: "removed", text: expected[oldIndex] ?? "", oldLineNumber: oldIndex + 1 });
      oldIndex += 1;
    } else {
      result.push({ type: "added", text: active[newIndex] ?? "", newLineNumber: newIndex + 1 });
      newIndex += 1;
    }
  }

  while (oldIndex < expected.length) {
    result.push({ type: "removed", text: expected[oldIndex] ?? "", oldLineNumber: oldIndex + 1 });
    oldIndex += 1;
  }

  while (newIndex < active.length) {
    result.push({ type: "added", text: active[newIndex] ?? "", newLineNumber: newIndex + 1 });
    newIndex += 1;
  }

  return result;
}

export function changedPromptLines(expectedPrompt: string, activePrompt: string): PromptDiffLine[] {
  return diffPrompts(expectedPrompt, activePrompt).filter((line) => line.type !== "unchanged");
}
