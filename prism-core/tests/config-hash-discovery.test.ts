import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfigFromAppData } from "../src/config.js";
import { discoverFiles } from "../src/fileDiscovery.js";
import { sha256File } from "../src/hash.js";

test("loadConfigFromAppData derives database and vault folders", async () => {
  const appDataDir = await mkdtemp(join(tmpdir(), "prism-config-"));
  await mkdir(join(appDataDir, "Prism"), { recursive: true });
  await writeFile(
    join(appDataDir, "Prism", "config.json"),
    JSON.stringify({
      vaultDir: "D:/Vault",
      watchDirs: ["D:/Inbox"],
    }),
  );

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

  assert.equal(await sha256File(file), "e142d75310d724bfb9c87c80e73a77b6a37c70aad5272e6cbd24024297f67877");
});

test("discoverFiles expands directories and only returns supported documents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "prism-discover-"));
  await writeFile(join(dir, "a.pdf"), "document");
  await writeFile(join(dir, "b.exe"), "binary");

  const files = await discoverFiles(dir);

  assert.equal(files.length, 1);
  assert.equal(files[0].endsWith("a.pdf"), true);
});
