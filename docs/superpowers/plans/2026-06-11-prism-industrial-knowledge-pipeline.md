# Prism Industrial Knowledge Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Prism stage one: a tested document ingestion pipeline with SHA-256 dedupe, deterministic filtering, SQLite task state, dual Markdown vault output, CLI/watch/status entries, and a minimal Tauri settings surface.

**Architecture:** `prism-core` becomes the execution boundary and exposes a reusable `ingestPath()` pipeline used by CLI and watchers. `prism-ui` writes `%APPDATA%/Prism/config.json` through Tauri commands and does not execute pipeline work directly. SQLite is the durable fact source for task state and dedupe.

**Tech Stack:** TypeScript ESM, Node.js, `tsx --test`, `better-sqlite3`, `chokidar`, Anthropic SDK, MarkItDown CLI, React, Tauri v2, Rust std filesystem APIs.

---

## File Structure

Create or modify these files:

- `prism-core/package.json`: add CLI bin, test script, SQLite dependency.
- `prism-core/src/types.ts`: shared config, status, and task types.
- `prism-core/src/config.ts`: user config path resolution and config loading.
- `prism-core/src/hash.ts`: streaming SHA-256 hashing.
- `prism-core/src/rules.ts`: deterministic pre-conversion and post-conversion filters.
- `prism-core/src/fileDiscovery.ts`: expand file and directory input into supported document candidates.
- `prism-core/src/taskStore.ts`: SQLite schema, task writes, dedupe lookup, status summary.
- `prism-core/src/converter.ts`: MarkItDown wrapper.
- `prism-core/src/aiExtractor.ts`: Anthropic knowledge card generator.
- `prism-core/src/vaultWriter.ts`: deterministic knowledge/raw output names and writes.
- `prism-core/src/pipeline.ts`: orchestrates the full ingestion pipeline with injected dependencies.
- `prism-core/src/cli.ts`: implements `ingest`, `watch`, and `status`.
- `prism-core/src/index.ts`: CLI entrypoint.
- `prism-core/tests/*.test.ts`: core behavior tests using `tsx --test`.
- `prism-ui/src-tauri/src/lib.rs`: add config read/write Tauri commands.
- `prism-ui/src-tauri/capabilities/default.json`: allow the config commands.
- `prism-ui/src/App.tsx`: minimal settings page for vault path and watch directories.

## Task 1: Core Test Harness And Types

**Files:**
- Modify: `prism-core/package.json`
- Create: `prism-core/src/types.ts`
- Create: `prism-core/tests/rules.test.ts`

- [ ] **Step 1: Add the failing rule test**

Create `prism-core/tests/rules.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSourceRules, evaluateConvertedText } from "../src/rules.js";

test("source rules reject unsupported and temporary files", () => {
  assert.equal(evaluateSourceRules("C:/inbox/report.exe", 2048).accepted, false);
  assert.equal(evaluateSourceRules("C:/inbox/~$draft.docx", 2048).reason, "temporary_file");
});

test("source rules accept supported documents inside size limits", () => {
  const result = evaluateSourceRules("C:/inbox/report.pdf", 2048);
  assert.deepEqual(result, { accepted: true });
});

test("converted text rule rejects low-information text", () => {
  assert.deepEqual(evaluateConvertedText(" \n\t ", 20), {
    accepted: false,
    reason: "converted_text_too_short",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm --prefix prism-core test -- tests/rules.test.ts`

Expected: FAIL because `../src/rules.js` does not exist.

- [ ] **Step 3: Add test script and shared types**

Update `prism-core/package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "tsx --test"
  }
}
```

Create `prism-core/src/types.ts`:

```ts
export type TaskStatus =
  | "queued"
  | "processing"
  | "skipped_duplicate"
  | "skipped_rule"
  | "completed"
  | "failed";

export type TaskStage =
  | "discover"
  | "hash"
  | "dedupe"
  | "rules"
  | "convert"
  | "ai"
  | "write"
  | "complete";

export interface PrismConfig {
  vaultDir: string;
  watchDirs: string[];
}

export interface ResolvedPrismConfig extends PrismConfig {
  appDataDir: string;
  databasePath: string;
  knowledgeDir: string;
  rawDir: string;
}

export interface RuleResult {
  accepted: boolean;
  reason?: string;
}

export interface TaskRecord {
  id: number;
  source_path: string;
  source_name: string;
  sha256: string | null;
  status: TaskStatus;
  stage: TaskStage;
  skip_reason: string | null;
  error_message: string | null;
  knowledge_path: string | null;
  raw_path: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
```

- [ ] **Step 4: Implement minimal rules**

Create `prism-core/src/rules.ts`:

```ts
import { basename, extname, normalize } from "node:path";
import type { RuleResult } from "./types.js";

const supportedExtensions = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md"]);
const noisePathSegments = new Set([".git", "node_modules", "cache", "temp", "tmp"]);

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
```

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm --prefix prism-core test -- tests/rules.test.ts`

Expected: PASS.

## Task 2: Config, Hashing, And File Discovery

**Files:**
- Create: `prism-core/tests/config-hash-discovery.test.ts`
- Create: `prism-core/src/config.ts`
- Create: `prism-core/src/hash.ts`
- Create: `prism-core/src/fileDiscovery.ts`

- [ ] **Step 1: Add failing tests**

Create `prism-core/tests/config-hash-discovery.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfigFromAppData } from "../src/config.js";
import { sha256File } from "../src/hash.js";
import { discoverFiles } from "../src/fileDiscovery.js";

test("loadConfigFromAppData derives database and vault folders", async () => {
  const appDataDir = await mkdtemp(join(tmpdir(), "prism-config-"));
  await mkdir(join(appDataDir, "Prism"), { recursive: true });
  await writeFile(join(appDataDir, "Prism", "config.json"), JSON.stringify({
    vaultDir: "D:/Vault",
    watchDirs: ["D:/Inbox"]
  }));

  const config = await loadConfigFromAppData(appDataDir);

  assert.equal(config.vaultDir, "D:/Vault");
  assert.equal(config.databasePath.endsWith("Prism/prism.db") || config.databasePath.endsWith("Prism\\prism.db"), true);
  assert.equal(config.knowledgeDir.endsWith("knowledge"), true);
  assert.equal(config.rawDir.endsWith("raw"), true);
});

test("sha256File returns a stable content hash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-hash-"));
  const file = join(dir, "sample.txt");
  await writeFile(file, "hello prism");

  assert.equal(await sha256File(file), "f24eb428952afdd3df06510a6f30e9afda463f42ca90cc7051a052c4225f6b23");
});

test("discoverFiles expands directories and only returns supported documents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-discover-"));
  await writeFile(join(dir, "a.pdf"), "document");
  await writeFile(join(dir, "b.exe"), "binary");

  const files = await discoverFiles(dir);

  assert.equal(files.length, 1);
  assert.equal(files[0].endsWith("a.pdf"), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix prism-core test -- tests/config-hash-discovery.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement config, hash, and discovery**

Create `prism-core/src/config.ts`, `prism-core/src/hash.ts`, and `prism-core/src/fileDiscovery.ts` following the APIs in the tests. `loadConfigFromAppData(appDataDir = process.env.APPDATA)` reads `<appDataDir>/Prism/config.json`, validates `vaultDir`, normalizes `watchDirs` to an array, and derives `databasePath`, `knowledgeDir`, and `rawDir`.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm --prefix prism-core test -- tests/config-hash-discovery.test.ts`

Expected: PASS.

## Task 3: SQLite Task Store

**Files:**
- Modify: `prism-core/package.json`
- Create: `prism-core/tests/taskStore.test.ts`
- Create: `prism-core/src/taskStore.ts`

- [ ] **Step 1: Install SQLite dependency**

Run: `npm --prefix prism-core install better-sqlite3 @types/better-sqlite3`

Expected: `package.json` and `package-lock.json` include the new dependency.

- [ ] **Step 2: Add failing store tests**

Create `prism-core/tests/taskStore.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TaskStore } from "../src/taskStore.js";

test("TaskStore creates tasks and finds duplicate active hashes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-store-"));
  const store = new TaskStore(join(dir, "prism.db"));

  const task = store.createTask("C:/Inbox/report.pdf");
  store.markProcessing(task.id, "hash");
  store.setHash(task.id, "abc123");

  assert.equal(store.hasActiveOrCompletedHash("abc123"), true);
  store.close();
});

test("TaskStore records completed output paths and summaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-store-"));
  const store = new TaskStore(join(dir, "prism.db"));

  const task = store.createTask("C:/Inbox/report.pdf");
  store.complete(task.id, "abc123", "D:/Vault/knowledge/report--abc.md", "D:/Vault/raw/report--abc.raw.md");

  const summary = store.getStatusSummary();

  assert.equal(summary.completed, 1);
  store.close();
});
```

- [ ] **Step 3: Run and verify RED**

Run: `npm --prefix prism-core test -- tests/taskStore.test.ts`

Expected: FAIL because `TaskStore` does not exist.

- [ ] **Step 4: Implement TaskStore**

Create `prism-core/src/taskStore.ts` with schema creation, `createTask`, `markProcessing`, `setHash`, `hasActiveOrCompletedHash`, `skip`, `fail`, `complete`, `getStatusSummary`, and `close`.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm --prefix prism-core test -- tests/taskStore.test.ts`

Expected: PASS.

## Task 4: Vault Writer And Pipeline

**Files:**
- Create: `prism-core/tests/pipeline.test.ts`
- Create: `prism-core/src/vaultWriter.ts`
- Create: `prism-core/src/pipeline.ts`
- Create: `prism-core/src/converter.ts`
- Create: `prism-core/src/aiExtractor.ts`

- [ ] **Step 1: Add failing pipeline tests**

Create `prism-core/tests/pipeline.test.ts` with two tests: one fixture `.md` file completes and writes `knowledge` plus `raw`, and one duplicate import becomes `skipped_duplicate` without calling converter or AI.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix prism-core test -- tests/pipeline.test.ts`

Expected: FAIL because pipeline modules do not exist.

- [ ] **Step 3: Implement writer and pipeline**

Implement:

- `createOutputNames(sourcePath, sha256)` returns `original-name--shortsha.md` and `original-name--shortsha.raw.md`.
- `writeVaultOutputs()` creates `knowledgeDir` and `rawDir`, writes the AI knowledge card and raw Markdown, and returns paths.
- `createPipeline()` accepts config, store, converter, and extractor dependencies.
- `ingestPath(path)` discovers files and calls `ingestFile(file)`.
- `ingestFile(file)` follows the spec order: rules, hash, dedupe, convert, text quality, AI, write, complete.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm --prefix prism-core test -- tests/pipeline.test.ts`

Expected: PASS.

## Task 5: CLI And Watcher

**Files:**
- Create: `prism-core/tests/cli.test.ts`
- Modify: `prism-core/src/cli.ts`
- Modify: `prism-core/src/index.ts`
- Modify: `prism-core/package.json`

- [ ] **Step 1: Add failing CLI parser tests**

Create tests that call `parseArgs(["ingest", "C:/file.pdf"])`, `parseArgs(["watch"])`, and `parseArgs(["status"])` and assert command shapes.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix prism-core test -- tests/cli.test.ts`

Expected: FAIL because `parseArgs` does not exist.

- [ ] **Step 3: Implement CLI**

Add:

```json
"bin": {
  "prism": "./dist/index.js"
}
```

Implement `parseArgs`, `runCli`, `runIngest`, `runWatch`, and `runStatus`. `watch` reads `config.watchDirs` and uses `chokidar` with `awaitWriteFinish`.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm --prefix prism-core test -- tests/cli.test.ts`

Expected: PASS.

## Task 6: Minimal UI Configuration

**Files:**
- Modify: `prism-ui/src-tauri/src/lib.rs`
- Modify: `prism-ui/src-tauri/capabilities/default.json`
- Modify: `prism-ui/src/App.tsx`

- [ ] **Step 1: Add Tauri config commands**

Add Rust commands:

- `get_prism_config() -> Result<PrismConfig, String>`
- `save_prism_config(config: PrismConfig) -> Result<(), String>`

The commands read and write `%APPDATA%/Prism/config.json` and create the directory when needed.

- [ ] **Step 2: Replace the UI with a settings surface**

`App.tsx` should display:

- vault path input
- watched directories textarea, one path per line
- save button
- status message

On load it invokes `get_prism_config`; on save it invokes `save_prism_config`.

- [ ] **Step 3: Build UI**

Run: `npm --prefix prism-ui run build`

Expected: TypeScript and Vite build pass.

## Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run core tests**

Run: `npm --prefix prism-core test`

Expected: all core tests pass.

- [ ] **Step 2: Build core**

Run: `npm --prefix prism-core run build`

Expected: TypeScript build passes.

- [ ] **Step 3: Build UI**

Run: `npm --prefix prism-ui run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Check git status**

Run: `git status --short`

Expected: only intentional implementation files are modified, plus pre-existing unrelated workspace changes remain untouched.

## Self-Review

Spec coverage:

- SHA-256 dedupe: Task 2 and Task 4.
- SQLite state: Task 3.
- Rule funnel: Task 1 and Task 4.
- Dual vault output: Task 4.
- CLI/watch/status: Task 5.
- Minimal UI config: Task 6.
- Testing: Tasks 1 through 7.

Placeholder scan:

- No `TBD` or `TODO` placeholders.
- Follow-up right-click implementation remains out of scope.

Type consistency:

- All tasks use `PrismConfig`, `ResolvedPrismConfig`, `TaskStatus`, `TaskStage`, and `TaskStore` names consistently.
