export type LegalNoticeSurface = "home" | "upload" | "translation" | "reader";

export type LaunchLegalNotice = {
  id: "copyright" | "privacy" | "public-beta" | "private-use";
  title: string;
  message: string;
  surfaces: LegalNoticeSurface[];
};

const launchLegalNotices: LaunchLegalNotice[] = [
  {
    id: "copyright",
    title: "版权提示",
    message:
      "请仅上传你有权处理的文本。Stray Pages 不提供小说资源搜索、公开书库或译本传播服务。",
    surfaces: ["home", "upload", "translation"],
  },
  {
    id: "privacy",
    title: "隐私提示",
    message:
      "上传内容只进入你的私人书架，默认不会公开分享；公开体验版仍建议避免上传敏感或无授权内容。",
    surfaces: ["home", "upload", "reader"],
  },
  {
    id: "public-beta",
    title: "公开体验版说明",
    message:
      "当前版本用于小范围公开体验，功能以私人阅读、翻译草稿和学习资料整理为主。",
    surfaces: ["home", "translation", "reader"],
  },
  {
    id: "private-use",
    title: "私人使用边界",
    message:
      "译本和学习资料仅面向个人学习使用，请不要把未获授权的内容公开传播。",
    surfaces: ["reader", "translation"],
  },
];

export function getLaunchLegalNotices() {
  return launchLegalNotices;
}

export function getLegalNoticesForSurface(surface: LegalNoticeSurface) {
  return launchLegalNotices.filter((notice) => notice.surfaces.includes(surface));
}
