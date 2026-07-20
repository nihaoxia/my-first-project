import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageEightReadiness,
  isStageEightLocallyComplete,
} from "../src/lib/project/stage-eight-readiness.ts";

test("stage eight local readiness lists completed export and admin items", () => {
  const readiness = getStageEightReadiness();

  assert.equal(readiness.phase, "stage-8");
  assert.equal(isStageEightLocallyComplete(readiness), true);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /译本 TXT 导出/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /后台运营摘要/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /真实 EPUB 3 打包和浏览器下载/);
});

test("stage eight readiness keeps only remote persistence and audit as blockers", () => {
  const readiness = getStageEightReadiness();

  assert.doesNotMatch(readiness.externalBlockers.join("\n"), /真实 EPUB 打包尚未接入|真实浏览器下载尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /远程数据库查询尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /真实后台操作审计尚未接入/);
});
