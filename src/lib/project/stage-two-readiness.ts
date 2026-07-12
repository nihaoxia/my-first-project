export type StageTwoLocalItem = {
  label: string;
  status: "complete";
};

export type StageTwoReadiness = {
  phase: "stage-2";
  localItems: StageTwoLocalItem[];
  externalBlockers: string[];
};

export function getStageTwoReadiness(): StageTwoReadiness {
  return {
    phase: "stage-2",
    localItems: [
      { label: "Prisma 7 schema 初稿覆盖核心业务模型", status: "complete" },
      { label: "Prisma Client 服务端访问边界已建立", status: "complete" },
      { label: "Supabase 浏览器端和服务端客户端入口已建立", status: "complete" },
      { label: "开发期手机号验证码登录闭环已建立", status: "complete" },
      { label: "私人页面和后台管理员路由保护已建立", status: "complete" },
      { label: "开发期用户资料和管理员导航边界已建立", status: "complete" },
      { label: "账户摘要、余额流水、冻结、返还和扣费纯逻辑已建立", status: "complete" },
      { label: "阶段 3 上传解析前置策略已准备", status: "complete" },
      { label: "Supabase Auth 手机号 OTP、权威数据库资料与统一会话已接入", status: "complete" },
      { label: "权威 Supabase migration、Auth trigger、RLS 与 Prisma 云端模型已建立", status: "complete" },
    ],
    externalBlockers: [
      "部署环境仍需配置 Supabase 项目 URL、anon key、service role key 和 PostgreSQL DATABASE_URL。",
      "权威 Supabase migration 仍需应用并验证到目标远程项目。",
      "生产手机号 OTP 仍需在目标 Supabase 项目配置短信供应商；固定验证码 123456 仅用于本地 Docker。",
    ],
  };
}

export function isStageTwoLocallyComplete(readiness: StageTwoReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
