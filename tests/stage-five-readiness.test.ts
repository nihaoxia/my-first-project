import test from "node:test";
import assert from "node:assert/strict";

import {
  getStageFiveReadiness,
  isStageFiveLocallyComplete,
} from "../src/lib/project/stage-five-readiness.ts";

test("marks local stage five queue and mock translation scope as complete", () => {
  const readiness = getStageFiveReadiness();

  assert.equal(readiness.phase, "stage-5");
  assert.equal(isStageFiveLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    ["complete", "complete", "complete", "complete", "complete", "complete"],
  );
});

test("keeps real queue, real AI, remote persistence, and payment as explicit blockers", () => {
  const readiness = getStageFiveReadiness();
  const blockersText = readiness.externalBlockers.join("\n");

  assert.match(blockersText, /真实后台任务队列|Trigger\.dev|Inngest/);
  assert.match(blockersText, /真实 AI|AI 翻译/);
  assert.match(blockersText, /远程数据库|Supabase|Prisma/);
  assert.match(blockersText, /真实支付|充值|退款|对账/);
});
