import test from "node:test";
import assert from "node:assert/strict";

import {
  getStageFourReadiness,
  isStageFourLocallyComplete,
} from "../src/lib/project/stage-four-readiness.ts";

test("marks local stage four translation ordering scope as complete", () => {
  const readiness = getStageFourReadiness();

  assert.equal(readiness.phase, "stage-4");
  assert.equal(isStageFourLocallyComplete(readiness), true);
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

test("keeps database persistence, task queue, real AI, and payment as explicit blockers", () => {
  const readiness = getStageFourReadiness();
  const blockersText = readiness.externalBlockers.join("\n");

  assert.match(blockersText, /数据库|Prisma|Supabase/);
  assert.match(blockersText, /后台任务队列|队列/);
  assert.match(blockersText, /真实 AI|AI 翻译/);
  assert.match(blockersText, /真实支付|支付/);
});
