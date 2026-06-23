import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageSevenReadiness,
  isStageSevenLocallyComplete,
} from "../src/lib/project/stage-seven-readiness.ts";

test("stage seven local readiness lists completed reader and study items", () => {
  const readiness = getStageSevenReadiness();

  assert.equal(readiness.phase, "stage-7");
  assert.equal(isStageSevenLocallyComplete(readiness), true);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /阅读器视图状态/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /词汇本和句子本/);
});

test("stage seven readiness keeps real AI and persistence work as blockers", () => {
  const readiness = getStageSevenReadiness();

  assert.match(readiness.externalBlockers.join("\n"), /真实 AI 阅读助手尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /远程数据库写入尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /跨设备同步尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /学习资料导出属于阶段 8/);
});
