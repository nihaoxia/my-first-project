import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLocalRateLimit,
  getLaunchRateLimitPolicies,
} from "../src/lib/launch/rate-limit-policy.ts";

test("lists local launch rate limit policies for public beta actions", () => {
  const policies = getLaunchRateLimitPolicies();
  const actionLabels = policies.map((policy) => policy.actionLabel).join("\n");

  assert.match(actionLabels, /上传小说/);
  assert.match(actionLabels, /创建译本/);
  assert.match(actionLabels, /阅读助手提问/);
  assert.match(actionLabels, /导出文件/);
});

test("evaluates local rate limits with user friendly messages", () => {
  const allowed = evaluateLocalRateLimit({
    action: "reader-assistant-question",
    usedCount: 4,
  });
  const blocked = evaluateLocalRateLimit({
    action: "reader-assistant-question",
    usedCount: 12,
  });

  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /今日使用较多/);
  assert.doesNotMatch(blocked.message, /token|模型|API/i);
});
