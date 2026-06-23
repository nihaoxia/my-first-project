export type StageFourLocalItem = {
  label: string;
  status: "complete";
};

export type StageFourReadiness = {
  phase: "stage-4";
  localItems: StageFourLocalItem[];
  externalBlockers: string[];
};

export function getStageFourReadiness(): StageFourReadiness {
  return {
    phase: "stage-4",
    localItems: [
      { label: "目标语言选项和第一版默认翻译配置已建立", status: "complete" },
      { label: "按源语言估算标准章数的纯逻辑已建立", status: "complete" },
      { label: "按 0.5 元 / 标准章计算费用的纯逻辑已建立", status: "complete" },
      { label: "免费标准章额度抵扣规则已建立", status: "complete" },
      { label: "译本创建页实时费用估算交互已接入", status: "complete" },
      { label: "创建译本前的数据形状已建立", status: "complete" },
      { label: "翻译任务草稿数据形状已建立", status: "complete" },
      { label: "余额冻结预检和冻结后账户状态预览已建立", status: "complete" },
    ],
    externalBlockers: [
      "译本和翻译任务尚未写入真实远程数据库，后续需要在 Supabase/Prisma 连接完成后接入保存。",
      "真实后台任务队列尚未接入，阶段 5 会继续处理任务调度和模拟翻译流转。",
      "真实 AI 翻译、术语抽取和质量检查尚未接入，阶段 6 再处理。",
      "真实支付、充值、退款和对账不属于第一版当前阶段，当前仍使用开发期模拟余额。",
    ],
  };
}

export function isStageFourLocallyComplete(readiness: StageFourReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
