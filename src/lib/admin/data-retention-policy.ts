export type DataRetentionPolicyKey =
  | "uploaded-source-files"
  | "audit-records"
  | "export-files"
  | "study-notes";

export type DataRetentionPolicy = {
  key: DataRetentionPolicyKey;
  label: string;
  retentionDays: number;
  requiresUserVisibleNotice: boolean;
};

export type DataRetentionSummary = {
  policyCount: number;
  noticeRequiredCount: number;
  longestRetentionLabel: string;
  shortestRetentionLabel: string;
};

const dataRetentionPolicies: DataRetentionPolicy[] = [
  {
    key: "uploaded-source-files",
    label: "上传原文文件",
    retentionDays: 90,
    requiresUserVisibleNotice: true,
  },
  {
    key: "audit-records",
    label: "审计记录",
    retentionDays: 365,
    requiresUserVisibleNotice: false,
  },
  {
    key: "export-files",
    label: "导出文件",
    retentionDays: 7,
    requiresUserVisibleNotice: true,
  },
  {
    key: "study-notes",
    label: "学习收藏",
    retentionDays: 180,
    requiresUserVisibleNotice: false,
  },
];

export function getDataRetentionPolicies() {
  return dataRetentionPolicies;
}

export function summarizeDataRetentionPolicies(
  policies: DataRetentionPolicy[],
): DataRetentionSummary {
  const sortedByRetention = [...policies].sort((a, b) => a.retentionDays - b.retentionDays);
  const shortest = sortedByRetention[0];
  const longest = sortedByRetention[sortedByRetention.length - 1];

  return {
    policyCount: policies.length,
    noticeRequiredCount: policies.filter((policy) => policy.requiresUserVisibleNotice).length,
    longestRetentionLabel: longest?.label ?? "暂无策略",
    shortestRetentionLabel: shortest?.label ?? "暂无策略",
  };
}
