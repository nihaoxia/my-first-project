export type StageFiveLocalItem = {
  label: string;
  status: "complete";
};

export type StageFiveReadiness = {
  phase: "stage-5";
  localItems: StageFiveLocalItem[];
  externalBlockers: string[];
};

export function getStageFiveReadiness(): StageFiveReadiness {
  return {
    phase: "stage-5",
    localItems: [
      { label: "本地翻译任务队列状态机已建立", status: "complete" },
      { label: "成功、失败和取消任务的余额冻结处理已可测试", status: "complete" },
      { label: "模拟译文章节生成逻辑已建立", status: "complete" },
      { label: "任务页已可展示本地模拟队列状态", status: "complete" },
      { label: "阅读器已可展示模拟译文章节", status: "complete" },
      { label: "后台队列监控已可读取本地模拟队列摘要", status: "complete" },
    ],
    externalBlockers: [
      "真实后台任务队列尚未接入，后续需要在 Trigger.dev 或 Inngest 之间做最终选择。",
      "真实 AI 翻译、术语抽取、联网查证和质量检查尚未接入，阶段 6 再处理。",
      "译本、章节任务和任务结果尚未写入远程数据库，后续需要等待 Supabase/Prisma 生产连接配置就绪。",
      "真实支付、充值、退款和对账仍不属于当前本地范围，当前仅使用开发期模拟余额。",
    ],
  };
}

export function isStageFiveLocallyComplete(readiness: StageFiveReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
