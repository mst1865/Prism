import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { ResolvedPrismConfig } from "./types.js";

export interface VaultWriteInput {
  config: ResolvedPrismConfig;
  sourcePath: string;
  sha256: string;
  knowledgeMarkdown: string;
  rawMarkdown: string;
}

export interface VaultWriteResult {
  knowledgePath: string;
  rawPath: string;
}

export async function writeVaultOutputs(input: VaultWriteInput): Promise<VaultWriteResult> {
  await mkdir(input.config.knowledgeDir, { recursive: true });
  await mkdir(input.config.rawDir, { recursive: true });

  const names = createOutputNames(input.sourcePath, input.sha256);
  const rawPath = join(input.config.rawDir, names.rawName);
  const knowledgePath = join(input.config.knowledgeDir, names.knowledgeName);
  const document = ensureFrontmatter(input.knowledgeMarkdown, {
    sourcePath: input.sourcePath,
    sha256: input.sha256,
    rawRelativePath: relative(input.config.knowledgeDir, rawPath),
  });

  await writeFile(rawPath, input.rawMarkdown, "utf-8");
  await writeFile(knowledgePath, document, "utf-8");

  return { knowledgePath, rawPath };
}

export function createOutputNames(sourcePath: string, sha256: string): { knowledgeName: string; rawName: string } {
  const original = basename(sourcePath, extname(sourcePath));
  const safeBase = original.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "document";
  const shortHash = sha256.slice(0, 12);
  return {
    knowledgeName: `${safeBase}--${shortHash}.md`,
    rawName: `${safeBase}--${shortHash}.raw.md`,
  };
}

function ensureFrontmatter(markdown: string, metadata: {
  sourcePath: string;
  sha256: string;
  rawRelativePath: string;
}): string {
  if (markdown.trimStart().startsWith("---")) return markdown;
  const generatedAt = new Date().toISOString();
  return `---\nsource_path: ${JSON.stringify(metadata.sourcePath)}\nsha256: ${metadata.sha256}\ngenerated_at: ${generatedAt}\nraw_path: ${JSON.stringify(metadata.rawRelativePath)}\ntags: []\n---\n\n${markdown}`;
}
