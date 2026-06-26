export type StageTenLocalItem = {
  label: string;
  status: "complete";
};

export type StageTenReadiness = {
  phase: "stage-10";
  localItems: StageTenLocalItem[];
  externalBlockers: string[];
};

export function getStageTenReadiness(): StageTenReadiness {
  return {
    phase: "stage-10",
    localItems: [
      { label: "生产环境变量体检纯逻辑已建立", status: "complete" },
      { label: "生产接入顺序清单已建立", status: "complete" },
      { label: "后台生产接入摘要数据形状已建立", status: "complete" },
      { label: "真实密钥值不会被体检结果输出", status: "complete" },
    ],
    externalBlockers: [
      "真实 Vercel 部署尚未执行，生产域名、构建变量和回滚方案仍需上线前确认。",
      "真实 Supabase 生产连接尚未接入，数据库迁移和 Storage 配置仍需等待真实配置。",
      "真实短信、支付和 AI Provider 尚未接入，接入或安装依赖前需单独请求权限。",
      "真实后台队列尚未接入，需要在 Trigger.dev 和 Inngest 之间做最终选择。",
      "截图级视觉验收尚未接入，Playwright 浏览器二进制尚未安装或配置。",
    ],
  };
}

export function isStageTenLocallyComplete(readiness: StageTenReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
