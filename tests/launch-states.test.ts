import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaunchChecklist,
  getLaunchDisplayStates,
} from "../src/lib/launch/launch-states.ts";

test("builds launch display states for empty error and loading surfaces", () => {
  const states = getLaunchDisplayStates();

  assert.match(states.emptyLibrary.title, /书架/);
  assert.match(states.uploadFailed.message, /重新选择/);
  assert.match(states.translationQueued.message, /排队/);
  assert.match(states.loadingTranslation.message, /处理中/);
});

test("keeps production deployment work explicit in launch checklist", () => {
  const checklist = getLaunchChecklist();
  const localLabels = checklist.localItems.map((item) => item.label).join("\n");
  const blockers = checklist.externalBlockers.join("\n");

  assert.match(localLabels, /版权与隐私提示/);
  assert.match(localLabels, /错误和空状态/);
  assert.match(blockers, /真实 Vercel 部署尚未执行/);
  assert.match(blockers, /真实 Supabase 生产连接尚未接入/);
  assert.match(blockers, /截图级视觉验收尚未接入/);
});
