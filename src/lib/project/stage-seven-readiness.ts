export type StageSevenLocalItem = {
  label: string;
  status: "complete";
};

export type StageSevenReadiness = {
  phase: "stage-7";
  localItems: StageSevenLocalItem[];
  externalBlockers: string[];
};

export function getStageSevenReadiness(): StageSevenReadiness {
  return {
    phase: "stage-7",
    localItems: [
      { label: "阅读器视图状态和章节导航本地逻辑已建立", status: "complete" },
      { label: "阅读模式和阅读设置数据形状已建立", status: "complete" },
      { label: "AI 阅读助手本地解释数据形状已建立", status: "complete" },
      { label: "词汇本和句子本收藏草稿逻辑已建立", status: "complete" },
      { label: "学习收藏搜索、筛选和删除预览本地逻辑已建立", status: "complete" },
      { label: "阶段 7 本地阅读学习状态已可展示", status: "complete" },
    ],
    externalBlockers: [
      "真实 AI 阅读助手尚未接入，后续需要确认模型供应商、API key、调用成本、限频和安全边界。",
      "远程数据库写入尚未接入，词汇本、句子本和阅读设置后续需要等待 Supabase/Prisma 生产连接配置就绪。",
      "跨设备同步尚未接入，当前仅固定本地 mock 数据形状和页面展示。",
      "学习资料导出属于阶段 8，本阶段只保留导出入口和数据形状准备。",
    ],
  };
}

export function isStageSevenLocallyComplete(readiness: StageSevenReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
