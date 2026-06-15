import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveConfig } from "../src/config.js";
import { createPipeline } from "../src/pipeline.js";
import { TaskStore } from "../src/taskStore.js";

test("pipeline writes knowledge and raw markdown for supported documents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-pipeline-"));
  const source = join(dir, "report.md");
  await writeFile(source, "# Report\n\n" + "Important content. ".repeat(120));
  const config = resolveConfig({ vaultDir: join(dir, "vault"), watchDirs: [] }, dir);
  const store = new TaskStore(config.databasePath);

  const pipeline = createPipeline({
    config,
    store,
    converter: { convert: async () => "# Converted\n\n" + "Useful markdown. ".repeat(40) },
    extractor: { extract: async () => "---\ntags: [report]\n---\n# Knowledge\n\n- Useful markdown" },
  });

  const results = await pipeline.ingestPath(source);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "completed");
  assert.match(results[0].knowledge_path ?? "", /knowledge[\\/]+report--[a-f0-9]{12}\.md$/);
  assert.match(results[0].raw_path ?? "", /raw[\\/]+report--[a-f0-9]{12}\.raw\.md$/);
  assert.match(await readFile(results[0].knowledge_path ?? "", "utf-8"), /# Knowledge/);
  assert.match(await readFile(results[0].raw_path ?? "", "utf-8"), /# Converted/);
  store.close();
});

test("pipeline skips duplicate hashes before conversion and AI", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-pipeline-"));
  const source = join(dir, "report.md");
  await writeFile(source, "# Report\n\n" + "Important content. ".repeat(120));
  const config = resolveConfig({ vaultDir: join(dir, "vault"), watchDirs: [] }, dir);
  const store = new TaskStore(config.databasePath);
  let convertCalls = 0;
  let extractCalls = 0;
  const pipeline = createPipeline({
    config,
    store,
    converter: {
      convert: async () => {
        convertCalls += 1;
        return "# Converted\n\n" + "Useful markdown. ".repeat(40);
      },
    },
    extractor: {
      extract: async () => {
        extractCalls += 1;
        return "---\ntags: [report]\n---\n# Knowledge\n\n- Useful markdown";
      },
    },
  });

  await pipeline.ingestPath(source);
  const second = await pipeline.ingestPath(source);

  assert.equal(second[0].status, "skipped_duplicate");
  assert.equal(convertCalls, 1);
  assert.equal(extractCalls, 1);
  store.close();
});
