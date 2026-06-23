export type AdminExportFile = {
  fileName: string;
  format: string;
};

export type AdminExportSummaryInput = {
  userCount: number;
  balanceRecordCount: number;
  translationTaskCount: number;
  failedTaskCount: number;
  usageLabel: string;
  exportFiles: AdminExportFile[];
};

export type AdminExportSummaryItem = {
  label: string;
  value: string;
  detail: string;
};

export type AdminExportSummary = {
  items: AdminExportSummaryItem[];
  exportFileCount: number;
  recentExportFileNames: string[];
  exportFiles: AdminExportFile[];
};

export function buildAdminExportSummary(input: AdminExportSummaryInput): AdminExportSummary {
  return {
    items: [
      {
        label: "用户",
        value: formatCount(input.userCount),
        detail: "当前本地后台可见用户数",
      },
      {
        label: "余额记录",
        value: formatCount(input.balanceRecordCount),
        detail: "本地余额流水摘要",
      },
      {
        label: "翻译任务",
        value: formatCount(input.translationTaskCount),
        detail: "本地任务队列摘要",
      },
      {
        label: "失败记录",
        value: formatCount(input.failedTaskCount),
        detail: "需要后台关注的任务",
      },
      {
        label: "用量",
        value: input.usageLabel,
        detail: "内部运营参考",
      },
      {
        label: "导出文件",
        value: formatCount(input.exportFiles.length),
        detail: "当前本地已准备文件",
      },
    ],
    exportFileCount: input.exportFiles.length,
    recentExportFileNames: input.exportFiles.map((file) => file.fileName),
    exportFiles: input.exportFiles,
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
