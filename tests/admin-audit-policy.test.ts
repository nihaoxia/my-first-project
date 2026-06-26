import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminAuditRecord,
  getAdminAuditActions,
  redactAuditValue,
  summarizeAdminAuditRecords,
} from "../src/lib/admin/admin-audit-policy.ts";

test("lists auditable admin actions with reason and risk metadata", () => {
  const actions = getAdminAuditActions();
  const keys = actions.map((action) => action.key);

  assert.ok(keys.includes("add-balance"));
  assert.ok(keys.includes("ban-user"));
  assert.ok(keys.includes("refund-balance"));
  assert.ok(keys.includes("export-user-data"));
  assert.ok(actions.some((action) => action.requiresReason));
  assert.ok(actions.some((action) => action.riskLevel === "high"));
});

test("builds an audit record without exposing raw sensitive values", () => {
  const record = buildAdminAuditRecord({
    action: "add-balance",
    actorId: "admin-001",
    targetId: "user-13800138000",
    reason: "用户充值补录",
    createdAt: "2026-06-24T10:30:00.000Z",
    metadata: {
      phone: "13800138000",
      serviceRoleKey: "service-role-secret",
      amountCents: 5000,
      note: "线下转账确认",
    },
  });

  assert.equal(record.action, "add-balance");
  assert.equal(record.reasonRequired, true);
  assert.equal(record.riskLevel, "high");
  assert.match(record.summary, /手动加余额/);
  assert.doesNotMatch(JSON.stringify(record), /13800138000/);
  assert.doesNotMatch(JSON.stringify(record), /service-role-secret/);
  assert.match(JSON.stringify(record), /138\*\*\*\*8000/);
  assert.match(JSON.stringify(record), /\[已隐藏\]/);
});

test("redacts sensitive scalar values by field intent", () => {
  assert.equal(redactAuditValue("phone", "13800138000"), "138****8000");
  assert.equal(redactAuditValue("apiKey", "sk-test-secret"), "[已隐藏]");
  assert.equal(redactAuditValue("DATABASE_URL", "postgres://user:pass@example/db"), "[已隐藏]");
  assert.equal(redactAuditValue("amountCents", 500), 500);
});

test("summarizes audit records for admin monitoring", () => {
  const records = [
    buildAdminAuditRecord({
      action: "add-balance",
      actorId: "admin-001",
      targetId: "user-a",
      reason: "补录充值",
      createdAt: "2026-06-24T10:30:00.000Z",
      metadata: { amountCents: 5000 },
    }),
    buildAdminAuditRecord({
      action: "view-cost-ledger",
      actorId: "admin-002",
      targetId: "translation-task-1",
      reason: "",
      createdAt: "2026-06-24T10:40:00.000Z",
      metadata: {},
    }),
  ];

  const summary = summarizeAdminAuditRecords(records);

  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.highRiskRecords, 1);
  assert.equal(summary.missingReasonRecords, 0);
  assert.match(summary.latestRecordLabel, /查看成本账本/);
});
