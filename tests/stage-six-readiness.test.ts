import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageSixReadiness,
  isStageSixLocallyComplete,
} from "../src/lib/project/stage-six-readiness.ts";

test("stage six local readiness lists completed local AI prep items", () => {
  const readiness = getStageSixReadiness();

  assert.equal(readiness.phase, "stage-6");
  assert.equal(isStageSixLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    ["complete", "complete", "complete", "complete", "complete", "complete", "complete"],
  );
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /内部成本账本/);
});

test("stage six readiness keeps real external AI work as blockers", () => {
  const readiness = getStageSixReadiness();

  assert.match(readiness.externalBlockers.join("\n"), /真实 AI 翻译 Provider 尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /真实联网查证尚未接入/);
  assert.match(readiness.externalBlockers.join("\n"), /远程数据库写入尚未接入/);
});
