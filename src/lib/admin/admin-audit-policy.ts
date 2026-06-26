export type AdminAuditActionKey =
  | "add-balance"
  | "ban-user"
  | "refund-balance"
  | "export-user-data"
  | "view-cost-ledger";

export type AdminAuditRiskLevel = "low" | "medium" | "high";

export type AdminAuditAction = {
  key: AdminAuditActionKey;
  label: string;
  requiresReason: boolean;
  riskLevel: AdminAuditRiskLevel;
};

export type AdminAuditRecordInput = {
  action: AdminAuditActionKey;
  actorId: string;
  targetId: string;
  reason: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type AdminAuditRecord = {
  action: AdminAuditActionKey;
  actionLabel: string;
  actorId: string;
  targetId: string;
  reason: string;
  reasonRequired: boolean;
  riskLevel: AdminAuditRiskLevel;
  createdAt: string;
  metadata: Record<string, unknown>;
  summary: string;
};

export type AdminAuditSummary = {
  totalRecords: number;
  highRiskRecords: number;
  missingReasonRecords: number;
  latestRecordLabel: string;
};

const adminAuditActions: AdminAuditAction[] = [
  {
    key: "add-balance",
    label: "手动加余额",
    requiresReason: true,
    riskLevel: "high",
  },
  {
    key: "ban-user",
    label: "封禁账号",
    requiresReason: true,
    riskLevel: "high",
  },
  {
    key: "refund-balance",
    label: "退款处理",
    requiresReason: true,
    riskLevel: "high",
  },
  {
    key: "export-user-data",
    label: "导出用户数据",
    requiresReason: true,
    riskLevel: "medium",
  },
  {
    key: "view-cost-ledger",
    label: "查看成本账本",
    requiresReason: false,
    riskLevel: "medium",
  },
];

const sensitiveKeyPattern =
  /(key|secret|token|password|database_url|direct_url|service_role|api|credential)/i;

export function getAdminAuditActions() {
  return adminAuditActions;
}

export function buildAdminAuditRecord(input: AdminAuditRecordInput): AdminAuditRecord {
  const action = findAuditAction(input.action);
  const metadata = redactMetadata(input.metadata);
  const targetId = redactIdentifier(input.targetId);

  return {
    action: input.action,
    actionLabel: action.label,
    actorId: input.actorId,
    targetId,
    reason: input.reason.trim(),
    reasonRequired: action.requiresReason,
    riskLevel: action.riskLevel,
    createdAt: input.createdAt,
    metadata,
    summary: `${action.label} · ${targetId}`,
  };
}

export function redactAuditValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (sensitiveKeyPattern.test(key)) {
    return "[已隐藏]";
  }

  if (/phone|mobile/i.test(key) && /^1\d{10}$/.test(value)) {
    return `${value.slice(0, 3)}****${value.slice(7)}`;
  }

  return value;
}

export function summarizeAdminAuditRecords(records: AdminAuditRecord[]): AdminAuditSummary {
  const latestRecord = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    totalRecords: records.length,
    highRiskRecords: records.filter((record) => record.riskLevel === "high").length,
    missingReasonRecords: records.filter(
      (record) => record.reasonRequired && record.reason.length === 0,
    ).length,
    latestRecordLabel: latestRecord?.actionLabel ?? "暂无记录",
  };
}

function findAuditAction(key: AdminAuditActionKey) {
  return adminAuditActions.find((action) => action.key === key) ?? adminAuditActions[0];
}

function redactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, redactAuditValue(key, value)]),
  );
}

function redactIdentifier(value: string) {
  return value.replace(/1\d{10}/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(7)}`);
}
