export type StageElevenLocalItem = {
  label: string;
  status: "complete";
};

export type StageElevenReadiness = {
  phase: "stage-11";
  localItems: StageElevenLocalItem[];
  externalBlockers: string[];
};

export function getStageElevenReadiness(): StageElevenReadiness {
  return {
    phase: "stage-11",
    localItems: [
      { label: "后台操作审计策略已建立", status: "complete" },
      { label: "敏感信息脱敏规则已建立", status: "complete" },
      { label: "数据保留策略本地摘要已建立", status: "complete" },
      { label: "后台审计与数据安全摘要数据形状已建立", status: "complete" },
    ],
    externalBlockers: [
      "真实审计表尚未写入，后续需要等待 Supabase/Prisma 生产连接配置就绪。",
      "真实管理员操作尚未执行，封禁、加余额、退款和导出仍是本地页面入口。",
      "真实删除或归档任务尚未接入，当前数据保留策略只提供本地摘要。",
      "真实数据库和对象存储尚未接入，上传原文、导出文件和学习收藏仍未做生产级生命周期管理。",
    ],
  };
}

export function isStageElevenLocallyComplete(readiness: StageElevenReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
