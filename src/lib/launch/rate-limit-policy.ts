export type LaunchRateLimitAction =
  | "upload-book"
  | "create-translation"
  | "reader-assistant-question"
  | "export-file";

export type LaunchRateLimitPolicy = {
  action: LaunchRateLimitAction;
  actionLabel: string;
  windowLabel: string;
  maxCount: number;
  userMessage: string;
};

export type LocalRateLimitResult = {
  action: LaunchRateLimitAction;
  actionLabel: string;
  allowed: boolean;
  usedCount: number;
  maxCount: number;
  remainingCount: number;
  message: string;
};

const launchRateLimitPolicies: LaunchRateLimitPolicy[] = [
  {
    action: "upload-book",
    actionLabel: "上传小说",
    windowLabel: "每日",
    maxCount: 10,
    userMessage: "今日上传次数较多，请稍后再试或先整理已上传书籍。",
  },
  {
    action: "create-translation",
    actionLabel: "创建译本",
    windowLabel: "每日",
    maxCount: 6,
    userMessage: "今日创建译本较多，请先等待现有任务完成。",
  },
  {
    action: "reader-assistant-question",
    actionLabel: "阅读助手提问",
    windowLabel: "每日",
    maxCount: 12,
    userMessage: "今日使用较多，请稍后再继续提问。",
  },
  {
    action: "export-file",
    actionLabel: "导出文件",
    windowLabel: "每日",
    maxCount: 20,
    userMessage: "今日导出次数较多，请稍后再试。",
  },
];

export function getLaunchRateLimitPolicies() {
  return launchRateLimitPolicies;
}

export function evaluateLocalRateLimit(input: {
  action: LaunchRateLimitAction;
  usedCount: number;
}): LocalRateLimitResult {
  const policy = getPolicy(input.action);
  const remainingCount = Math.max(0, policy.maxCount - input.usedCount);
  const allowed = input.usedCount < policy.maxCount;

  return {
    action: policy.action,
    actionLabel: policy.actionLabel,
    allowed,
    usedCount: input.usedCount,
    maxCount: policy.maxCount,
    remainingCount,
    message: allowed ? `今日还可继续使用 ${remainingCount} 次。` : policy.userMessage,
  };
}

function getPolicy(action: LaunchRateLimitAction) {
  const policy = launchRateLimitPolicies.find((item) => item.action === action);

  if (!policy) {
    throw new Error(`Unknown launch rate limit action: ${action}`);
  }

  return policy;
}
