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
      { label: "用户隔离的私有 Supabase Storage 上传、签名下载、删除和补偿清理已接入", status: "complete" },
      { label: "云端原版书与章节事务、API、上传页和书架读取已接入", status: "complete" },
    ],
    externalBlockers: [
      "目标 Supabase 项目仍需应用 migration、创建私有 Storage bucket 并配置生产密钥。",
      "真实 EPUB 解包解析器尚未接入；安装依赖前需单独确认方案和权限。",
    ],
  };
}

export function isStageThreeLocallyComplete(readiness: StageThreeReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
