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
    ],
  );
});

test("keeps storage, epub parsing, and database persistence as explicit blockers", () => {
  const readiness = getStageThreeReadiness();
  const blockersText = readiness.externalBlockers.join("\n");

  assert.match(blockersText, /对象存储|Storage/);
  assert.match(blockersText, /EPUB/);
  assert.match(blockersText, /数据库|Prisma|Supabase/);
  assert.match(blockersText, /安装依赖前需单独确认/);
});
