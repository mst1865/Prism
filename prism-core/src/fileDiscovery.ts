import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isSupportedDocument } from "./rules.js";

export async function discoverFiles(inputPath: string): Promise<string[]> {
  const resolved = resolve(inputPath);
  const inputStat = await stat(resolved);

  if (inputStat.isFile()) {
    return isSupportedDocument(resolved) ? [resolved] : [];
  }

  if (!inputStat.isDirectory()) return [];

  const results: string[] = [];
  await walkDirectory(resolved, results);
  return results.sort((left, right) => left.localeCompare(right));
}

async function walkDirectory(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, results);
      continue;
    }

    if (entry.isFile() && isSupportedDocument(fullPath)) {
      results.push(fullPath);
    }
  }
}
