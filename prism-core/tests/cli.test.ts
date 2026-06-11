import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/cli.js";

test("parseArgs parses ingest with one or more paths", () => {
  assert.deepEqual(parseArgs(["ingest", "C:/a.pdf", "C:/b.docx"]), {
    command: "ingest",
    paths: ["C:/a.pdf", "C:/b.docx"],
  });
});

test("parseArgs parses watch and status commands", () => {
  assert.deepEqual(parseArgs(["watch"]), { command: "watch" });
  assert.deepEqual(parseArgs(["status"]), { command: "status" });
});

test("parseArgs returns help for missing or unknown command", () => {
  assert.deepEqual(parseArgs([]), { command: "help" });
  assert.deepEqual(parseArgs(["unknown"]), { command: "help" });
});
