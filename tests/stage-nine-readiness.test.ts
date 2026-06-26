import assert from "node:assert/strict";
import test from "node:test";

import {
  getStageNineReadiness,
  isStageNineLocallyComplete,
} from "../src/lib/project/stage-nine-readiness.ts";

test("stage nine local readiness lists completed launch preparation items", () => {
  const readiness = getStageNineReadiness();

  assert.equal(readiness.phase, "stage-9");
  assert.equal(isStageNineLocallyComplete(readiness), true);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /版权与隐私提示/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /限频保护策略/);
});

test("stage nine readiness keeps real production rollout as blockers", () => {
  const readiness = getStageNineReadiness();
  const blockers = readiness.externalBlockers.join("\n");

  assert.match(blockers, /真实 Vercel 部署尚未执行/);
  assert.match(blockers, /真实 Supabase 生产连接尚未接入/);
  assert.match(blockers, /真实短信、支付和 AI Provider 尚未接入/);
  assert.match(blockers, /截图级视觉验收尚未接入/);
});
