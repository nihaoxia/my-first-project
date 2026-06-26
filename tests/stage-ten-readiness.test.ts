import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageTenReadiness,
  isStageTenLocallyComplete,
} from "../src/lib/project/stage-ten-readiness.ts";

test("stage ten local readiness lists completed production preflight items", () => {
  const readiness = getStageTenReadiness();

  assert.equal(readiness.phase, "stage-10");
  assert.equal(isStageTenLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    ["complete", "complete", "complete", "complete"],
  );
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /生产环境变量体检/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /后台生产接入摘要/);
});

test("stage ten readiness keeps real production integration as blockers", () => {
  const readiness = getStageTenReadiness();
  const blockers = readiness.externalBlockers.join("\n");

  assert.match(blockers, /真实 Vercel 部署尚未执行/);
  assert.match(blockers, /真实 Supabase 生产连接尚未接入/);
  assert.match(blockers, /真实短信、支付和 AI Provider 尚未接入/);
  assert.match(blockers, /真实后台队列尚未接入/);
  assert.match(blockers, /截图级视觉验收尚未接入/);
});
