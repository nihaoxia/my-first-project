import { formatBytes, uploadFilePolicy } from "./upload/file-policy.ts";

export const localPrototypeCapabilities = {
  supportedUploadFormats: uploadFilePolicy.supportedFormats.map((format) => format.label),
  maxUploadBytes: uploadFilePolicy.maxSizeBytes,
  browserLocalEpubImport: true,
  mcpTranslationIntegration: true,
  realBilling: false,
  automaticQualityReview: false,
  productionExport: false,
} as const;

const uploadFormatsLabel = localPrototypeCapabilities.supportedUploadFormats.join("/");
const maxUploadSizeLabel = formatBytes(localPrototypeCapabilities.maxUploadBytes);

export const homePrototypeCopy = {
  heroTitle: "把 TXT 或 EPUB 小说，变成可阅读、可学习、可逐章恢复的译本。",
  uploadWorkflowDescription:
    `当前支持 ${maxUploadSizeLabel} 以内 ${uploadFormatsLabel}，并保存到当前账号的浏览器书架；EPUB 只在浏览器本地提取文字，不上传原文件。`,
  translationWorkflowDescription:
    "选择目标语言，通过已配置的 MCP 服务逐章生成真实译文；完成一章立即保存。",
  summary:
    "当前原型支持 TXT 与 EPUB 本地拆章、MCP 逐章翻译、章节阅读与学习收藏。真实翻译需要配置 MCP 与 OpenAI 兼容模型服务；真实 EPUB 导出仍待接入，真实计费、自动质检和生产导出也未启用。",
} as const;
