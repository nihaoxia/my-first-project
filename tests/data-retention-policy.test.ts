import assert from "node:assert/strict";
import test from "node:test";

import {
  getDataRetentionPolicies,
  summarizeDataRetentionPolicies,
} from "../src/lib/admin/data-retention-policy.ts";

test("lists local data retention policies for launch-critical data", () => {
  const policies = getDataRetentionPolicies();
  const keys = policies.map((policy) => policy.key);

  assert.ok(keys.includes("uploaded-source-files"));
  assert.ok(keys.includes("audit-records"));
  assert.ok(keys.includes("export-files"));
  assert.ok(keys.includes("study-notes"));
  assert.ok(policies.every((policy) => policy.retentionDays > 0));
  assert.ok(policies.some((policy) => policy.requiresUserVisibleNotice));
});

test("summarizes retention policies for admin display", () => {
  const summary = summarizeDataRetentionPolicies(getDataRetentionPolicies());

  assert.equal(summary.policyCount, 4);
  assert.equal(summary.noticeRequiredCount, 2);
  assert.match(summary.longestRetentionLabel, /审计记录/);
  assert.match(summary.shortestRetentionLabel, /导出文件/);
});
