export type StageSixLocalItem = {
  label: string;
  status: "complete";
};

export type StageSixReadiness = {
  phase: "stage-6";
  localItems: StageSixLocalItem[];
  externalBlockers: string[];
};

export function getStageSixReadiness(): StageSixReadiness {
  return {
    phase: "stage-6",
    localItems: [
      { label: "章节分段本地逻辑已建立", status: "complete" },
      { label: "翻译提示词输入结构已建立", status: "complete" },
      { label: "AI 翻译 Provider 抽象和 Fake Provider 已建立", status: "complete" },
      { label: "术语候选抽取本地数据形状已建立", status: "complete" },
      { label: "翻译质量检查本地规则已建立", status: "complete" },
      { label: "后台内部成本账本和毛利监控已建立", status: "complete" },
      { label: "阶段 6 本地准备状态已可展示", status: "complete" },
    ],
    externalBlockers: [
      "真实 AI 翻译 Provider 尚未接入，后续需要确认模型供应商、API key、调用成本和真实 token 用量记录。",
      "真实联网查证尚未接入，后续需要确认允许访问的数据源和限频策略。",
      "术语抽取和质检当前为本地启发式规则，真实模型增强需要等待 AI Provider 配置。",
      "远程数据库写入尚未接入，后续需要等待 Supabase/Prisma 生产连接配置就绪。",
      "真实后台任务队列尚未接入，后续需要在 Trigger.dev 和 Inngest 之间做最终选择。",
    ],
  };
}

export function isStageSixLocallyComplete(readiness: StageSixReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
