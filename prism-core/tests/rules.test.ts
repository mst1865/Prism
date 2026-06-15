import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConvertedText, evaluateSourceRules } from "../src/rules.js";

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
