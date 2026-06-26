export type LaunchDisplayState = {
  title: string;
  message: string;
  actionLabel?: string;
};

export type LaunchChecklistItem = {
  label: string;
  status: "complete";
};

export type LaunchChecklist = {
  localItems: LaunchChecklistItem[];
  externalBlockers: string[];
};

export function getLaunchDisplayStates() {
  return {
    emptyLibrary: {
      title: "书架里还没有小说",
      message: "上传你有权处理的 TXT 或 EPUB，确认章节后就可以创建译本。",
      actionLabel: "上传小说",
    },
    uploadFailed: {
      title: "上传文件无法读取",
      message: "请重新选择 TXT 或 EPUB 文件，并确认文件没有损坏或超出大小限制。",
      actionLabel: "重新选择文件",
    },
    translationQueued: {
      title: "译本已加入队列",
      message: "当前任务正在排队，开始处理前不会重复扣费。",
      actionLabel: "查看任务",
    },
    loadingTranslation: {
      title: "译本处理中",
      message: "章节正在处理中，请稍后查看最新状态。",
    },
  } satisfies Record<string, LaunchDisplayState>;
}

export function getLaunchChecklist(): LaunchChecklist {
  return {
    localItems: [
      { label: "版权与隐私提示已补齐", status: "complete" },
      { label: "错误和空状态文案已建立", status: "complete" },
      { label: "本地限频保护策略已建立", status: "complete" },
      { label: "上线准备清单已建立", status: "complete" },
      { label: "Next.js 16 路由保护继续保留在 src/proxy.ts", status: "complete" },
    ],
    externalBlockers: [
      "真实 Vercel 部署尚未执行，生产域名、预览环境和构建变量仍需上线前确认。",
      "真实 Supabase 生产连接尚未接入，数据库迁移和存储桶配置仍需等待真实配置。",
      "真实短信、支付和 AI Provider 尚未接入，接入或安装依赖前需单独请求权限。",
      "截图级视觉验收尚未接入，Playwright 浏览器二进制尚未安装或配置。",
    ],
  };
}
