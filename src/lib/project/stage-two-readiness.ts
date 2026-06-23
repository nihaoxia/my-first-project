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
    ],
    externalBlockers: [
      "Supabase 项目 URL、anon key 和 service role key 尚未配置。",
      "PostgreSQL DATABASE_URL / DIRECT_URL 尚未连接到真实项目。",
      "真实短信验证码服务尚未接入，当前仍使用开发期固定验证码 123456。",
      "Prisma 迁移尚未应用到真实远程数据库。",
    ],
  };
}

export function isStageTwoLocallyComplete(readiness: StageTwoReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
