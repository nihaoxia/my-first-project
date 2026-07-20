import { formatBytes, uploadFilePolicy } from "./upload/file-policy.ts";

export const localPrototypeCapabilities = {
  supportedUploadFormats: uploadFilePolicy.supportedFormats.map((format) => format.label),
  maxUploadBytes: uploadFilePolicy.maxSizeBytes,
  browserLocalEpubImport: true,
  browserLocalEpubExport: true,
  browserLocalSpeechPlayback: true,
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
    "当前原型支持 TXT 与 EPUB 本地拆章、MCP 逐章翻译、章节阅读与学习收藏、浏览器本地语音朗读，以及浏览器本地 TXT 与标准 EPUB 3 下载。本地语音只使用当前设备的系统本地声音，不上传正文或生成音频文件。真实翻译需要配置 MCP 与 OpenAI 兼容模型服务；EPUB 封面、图片、字体、固定布局、DRM、云端导出文件保存，以及真实计费、自动质检和生产导出管线仍未启用。",
} as const;
