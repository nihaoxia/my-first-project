export type StageNineLocalItem = {
  label: string;
  status: "complete";
};

export type StageNineReadiness = {
  phase: "stage-9";
  localItems: StageNineLocalItem[];
  externalBlockers: string[];
};

export function getStageNineReadiness(): StageNineReadiness {
  return {
    phase: "stage-9",
    localItems: [
      { label: "版权与隐私提示本地文案已建立", status: "complete" },
      { label: "错误、空状态和加载状态本地文案已建立", status: "complete" },
      { label: "限频保护策略本地数据形状已建立", status: "complete" },
      { label: "上线准备清单本地数据形状已建立", status: "complete" },
      { label: "阶段 9 本地上线准备状态已可展示", status: "complete" },
    ],
    externalBlockers: [
      "真实 Vercel 部署尚未执行，生产域名、预览环境和构建变量仍需上线前确认。",
      "真实 Supabase 生产连接尚未接入，数据库迁移和存储桶配置仍需等待真实配置。",
      "真实短信、支付和 AI Provider 尚未接入，接入或安装依赖前需单独请求权限。",
      "截图级视觉验收尚未接入，Playwright 浏览器二进制尚未安装或配置。",
    ],
  };
}

export function isStageNineLocallyComplete(readiness: StageNineReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
