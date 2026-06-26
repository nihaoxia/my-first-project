import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageElevenReadiness,
  isStageElevenLocallyComplete,
} from "../src/lib/project/stage-eleven-readiness.ts";

test("stage eleven local readiness lists completed audit and data safety items", () => {
  const readiness = getStageElevenReadiness();

  assert.equal(readiness.phase, "stage-11");
  assert.equal(isStageElevenLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    ["complete", "complete", "complete", "complete"],
  );
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /后台操作审计/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /数据保留策略/);
});

test("stage eleven readiness keeps real persistence and operations as blockers", () => {
  const readiness = getStageElevenReadiness();
  const blockers = readiness.externalBlockers.join("\n");

  assert.match(blockers, /真实审计表尚未写入/);
  assert.match(blockers, /真实管理员操作尚未执行/);
  assert.match(blockers, /真实删除或归档任务尚未接入/);
  assert.match(blockers, /真实数据库和对象存储尚未接入/);
});
