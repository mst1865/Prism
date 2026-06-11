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
