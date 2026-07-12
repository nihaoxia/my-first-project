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

test("keeps production deployment and non-TXT parsing as explicit blockers", () => {
  const readiness = getStageThreeReadiness();
  const blockersText = readiness.externalBlockers.join("\n");

  assert.match(blockersText, /目标 Supabase 项目/);
  assert.match(blockersText, /EPUB/);
  assert.match(blockersText, /安装依赖前需单独确认/);
  assert.doesNotMatch(blockersText, /对象存储上传尚未接入|原版书和章节尚未写入/);
});
