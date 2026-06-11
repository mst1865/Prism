import { basename, extname, normalize } from "node:path";
import type { RuleResult } from "./types.js";

const supportedExtensions = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md"]);
const noisePathSegments = new Set([".git", "node_modules", "cache"]);

export function isSupportedDocument(filePath: string): boolean {
  return supportedExtensions.has(extname(filePath).toLowerCase());
}

export function evaluateSourceRules(filePath: string, sizeBytes: number): RuleResult {
  const name = basename(filePath);
  const lowerName = name.toLowerCase();
  const extension = extname(lowerName);

  if (!supportedExtensions.has(extension)) return { accepted: false, reason: "unsupported_extension" };
  if (lowerName.startsWith("~$") || lowerName.startsWith("._")) return { accepted: false, reason: "temporary_file" };
  if (lowerName === "thumbs.db" || lowerName === "desktop.ini") return { accepted: false, reason: "system_file" };
  if (hasNoisePathSegment(filePath)) return { accepted: false, reason: "noise_path" };
  if (sizeBytes < 1024) return { accepted: false, reason: "file_too_small" };
  if (sizeBytes > 100 * 1024 * 1024) return { accepted: false, reason: "file_too_large" };

  return { accepted: true };
}

export function evaluateConvertedText(markdown: string, minTextLength = 200): RuleResult {
  const compact = markdown.replace(/\s+/g, "");
  if (compact.length < minTextLength) return { accepted: false, reason: "converted_text_too_short" };
  return { accepted: true };
}

function hasNoisePathSegment(filePath: string): boolean {
  return normalize(filePath)
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase())
    .some((part) => noisePathSegments.has(part));
}
