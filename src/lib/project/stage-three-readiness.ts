export type StageThreeLocalItem = {
  label: string;
  status: "complete";
};

export type StageThreeReadiness = {
  phase: "stage-3";
  localItems: StageThreeLocalItem[];
  externalBlockers: string[];
};

export function getStageThreeReadiness(): StageThreeReadiness {
  return {
    phase: "stage-3",
    localItems: [
      { label: "TXT/EPUB 文件格式和大小边界已建立", status: "complete" },
      { label: "上传文件名元数据推断已建立", status: "complete" },
      { label: "TXT 拆章预览纯逻辑已建立", status: "complete" },
      { label: "上传草稿构建器已建立", status: "complete" },
      { label: "上传页本地 TXT 文件选择和解析预览已接入", status: "complete" },
      { label: "章节重命名、跳过和恢复纯逻辑已建立", status: "complete" },
      { label: "章节预览页编辑交互已接入", status: "complete" },
      { label: "保存原版书前的数据形状已建立", status: "complete" },
    ],
    externalBlockers: [
      "真实对象存储上传尚未接入，Supabase Storage 生产配置尚未完成。",
      "真实 EPUB 解包解析器尚未接入；安装依赖前需单独确认方案和权限。",
      "原版书和章节尚未写入真实远程数据库，后续需在 Supabase/Prisma 连接完成后接入保存。",
      "当前上传流程仍是浏览器本地解析预览，不会把用户文件上传到服务器。",
    ],
  };
}

export function isStageThreeLocallyComplete(readiness: StageThreeReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
