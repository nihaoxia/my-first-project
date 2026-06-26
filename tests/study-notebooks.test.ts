import assert from "node:assert/strict";
import test from "node:test";

import {
  createStudyNotebook,
  getDefaultStudyNotebooks,
} from "../src/lib/study/study-notebooks.ts";

test("creates a study notebook with a normalized title", () => {
  const notebooks = getDefaultStudyNotebooks("vocabulary");
  const result = createStudyNotebook(notebooks, "  考试词汇  ");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.notebook.title, "考试词汇");
  assert.equal(result.notebook.itemCount, 0);
  assert.equal(result.notebooks.length, notebooks.length + 1);
});

test("rejects empty study notebook titles", () => {
  assert.deepEqual(createStudyNotebook(getDefaultStudyNotebooks("sentences"), "   "), {
    ok: false,
    reason: "empty-title",
  });
});

test("rejects duplicated study notebook titles", () => {
  assert.deepEqual(createStudyNotebook(getDefaultStudyNotebooks("notes"), "默认笔记本"), {
    ok: false,
    reason: "duplicate-title",
  });
});
