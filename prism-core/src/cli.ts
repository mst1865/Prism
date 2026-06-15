import { watch } from "chokidar";
import { AnthropicKnowledgeExtractor } from "./aiExtractor.js";
import { loadConfigFromAppData } from "./config.js";
import { MarkItDownConverter } from "./converter.js";
import { createPipeline } from "./pipeline.js";
import { TaskStore } from "./taskStore.js";

export type ParsedCommand =
  | { command: "ingest"; paths: string[] }
  | { command: "watch" }
  | { command: "status" }
  | { command: "help" };

export function parseArgs(args: string[]): ParsedCommand {
  const [command, ...rest] = args;
  if (command === "ingest" && rest.length > 0) return { command, paths: rest };
  if (command === "watch") return { command };
  if (command === "status") return { command };
  return { command: "help" };
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.command === "help") {
    printHelp();
    return;
  }

  const config = await loadConfigFromAppData();
  const store = new TaskStore(config.databasePath);

  try {
    if (parsed.command === "status") {
      console.log(JSON.stringify(store.getStatusSummary(), null, 2));
      return;
    }

    const pipeline = createPipeline({
      config,
      store,
      converter: new MarkItDownConverter(),
      extractor: new AnthropicKnowledgeExtractor(),
    });

    if (parsed.command === "ingest") {
      for (const inputPath of parsed.paths) {
        const results = await pipeline.ingestPath(inputPath);
        for (const result of results) {
          console.log(`${result.status}\t${result.source_path}`);
        }
      }
      return;
    }

    await runWatch(config.watchDirs, pipeline.ingestPath);
  } finally {
    if (parsed.command !== "watch") store.close();
  }
}

async function runWatch(watchDirs: string[], ingestPath: (path: string) => Promise<unknown>): Promise<void> {
  if (watchDirs.length === 0) {
    console.error("No watchDirs configured in %APPDATA%/Prism/config.json");
    return;
  }

  const watcher = watch(watchDirs, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  watcher.on("add", (filePath) => {
    ingestPath(filePath).catch((error) => {
      console.error(`Failed to ingest ${filePath}:`, error);
    });
  });

  console.log(`Watching ${watchDirs.length} director${watchDirs.length === 1 ? "y" : "ies"}. Press Ctrl+C to stop.`);
  await new Promise(() => undefined);
}

function printHelp(): void {
  console.log(`Usage:
  prism ingest <file|dir> [...]
  prism watch
  prism status`);
}
