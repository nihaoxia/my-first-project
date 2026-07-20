import test from "node:test";
import assert from "node:assert/strict";

import {
  getStageThreeReadiness,
  isStageThreeLocallyComplete,
} from "../src/lib/project/stage-three-readiness.ts";

test("marks local stage three upload parsing scope as complete", () => {
  const readiness = getStageThreeReadiness();

  assert.equal(readiness.phase, "stage-3");
  assert.equal(isStageThreeLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    [
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ],
  );
  const completedText = readiness.localItems.map((item) => item.label).join("\n");
  assert.match(completedText, /私有.*Storage/);
  assert.match(completedText, /云端.*原版书.*章节/);
});

test("records local EPUB import as complete while keeping external formats and deployment explicit", () => {
  const readiness = getStageThreeReadiness();
  const completedText = readiness.localItems.map((item) => item.label).join("\n");
  const blockersText = readiness.externalBlockers.join("\n");

  assert.match(completedText, /EPUB 2\/3.*本地.*解析/);
  assert.match(blockersText, /目标 Supabase 项目/);
  assert.match(blockersText, /MOBI\/PDF/);
  assert.doesNotMatch(blockersText, /EPUB 解包解析器尚未接入|安装依赖前需单独确认/);
  assert.doesNotMatch(blockersText, /对象存储上传尚未接入|原版书和章节尚未写入/);
});
