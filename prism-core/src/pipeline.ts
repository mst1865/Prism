import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { KnowledgeExtractor } from "./aiExtractor.js";
import { retryExtract } from "./aiExtractor.js";
import type { DocumentConverter } from "./converter.js";
import { discoverFiles } from "./fileDiscovery.js";
import { sha256File } from "./hash.js";
import { evaluateConvertedText, evaluateSourceRules } from "./rules.js";
import type { TaskStore } from "./taskStore.js";
import type { ResolvedPrismConfig, TaskRecord, TaskStage } from "./types.js";
import { writeVaultOutputs } from "./vaultWriter.js";

export interface PipelineDependencies {
  config: ResolvedPrismConfig;
  store: TaskStore;
  converter: DocumentConverter;
  extractor: KnowledgeExtractor;
}

export interface PrismPipeline {
  ingestPath(inputPath: string): Promise<TaskRecord[]>;
  ingestFile(filePath: string): Promise<TaskRecord>;
}

export function createPipeline(deps: PipelineDependencies): PrismPipeline {
  return {
    async ingestPath(inputPath: string): Promise<TaskRecord[]> {
      const files = await discoverFiles(inputPath);
      const results: TaskRecord[] = [];
      for (const file of files) {
        results.push(await this.ingestFile(file));
      }
      return results;
    },

    async ingestFile(filePath: string): Promise<TaskRecord> {
      const task = deps.store.createTask(filePath);
      let sha256: string | undefined;
      let currentStage: TaskStage = "discover";

      try {
        currentStage = "rules";
        deps.store.markProcessing(task.id, "rules");
        const fileStat = await stat(filePath);
        const sourceRule = evaluateSourceRules(filePath, fileStat.size);
        if (!sourceRule.accepted) {
          deps.store.skip(task.id, "skipped_rule", "rules", sourceRule.reason ?? "source_rule_rejected");
          return deps.store.getTask(task.id);
        }

        currentStage = "hash";
        deps.store.markProcessing(task.id, "hash");
        sha256 = await sha256File(filePath);
        deps.store.setHash(task.id, sha256);

        currentStage = "dedupe";
        deps.store.markProcessing(task.id, "dedupe");
        if (deps.store.hasActiveOrCompletedHashExcludingTask(sha256, task.id)) {
          deps.store.skip(task.id, "skipped_duplicate", "dedupe", "duplicate_sha256", sha256);
          return deps.store.getTask(task.id);
        }

        currentStage = "convert";
        deps.store.markProcessing(task.id, "convert");
        const rawMarkdown = await deps.converter.convert(filePath);
        const convertedRule = evaluateConvertedText(rawMarkdown);
        if (!convertedRule.accepted) {
          deps.store.skip(task.id, "skipped_rule", "convert", convertedRule.reason ?? "converted_text_rejected", sha256);
          return deps.store.getTask(task.id);
        }

        currentStage = "ai";
        deps.store.markProcessing(task.id, "ai");
        const knowledgeMarkdown = await retryExtract(deps.extractor, rawMarkdown, basename(filePath));

        currentStage = "write";
        deps.store.markProcessing(task.id, "write");
        const output = await writeVaultOutputs({
          config: deps.config,
          sourcePath: filePath,
          sha256,
          knowledgeMarkdown,
          rawMarkdown,
        });

        deps.store.complete(task.id, sha256, output.knowledgePath, output.rawPath);
        return deps.store.getTask(task.id);
      } catch (error) {
        deps.store.fail(task.id, currentStage, error instanceof Error ? error.message : String(error), sha256);
        return deps.store.getTask(task.id);
      }
    },
  };
}
