export type StageEightLocalItem = {
  label: string;
  status: "complete";
};

export type StageEightReadiness = {
  phase: "stage-8";
  localItems: StageEightLocalItem[];
  externalBlockers: string[];
};

export function getStageEightReadiness(): StageEightReadiness {
  return {
    phase: "stage-8",
    localItems: [
      { label: "译本 TXT 导出内容生成已建立", status: "complete" },
      { label: "真实 EPUB 3 打包和浏览器下载已接入", status: "complete" },
      { label: "词汇本 CSV 导出内容生成已建立", status: "complete" },
      { label: "句子本 Markdown 导出内容生成已建立", status: "complete" },
      { label: "后台运营摘要和导出文件摘要已建立", status: "complete" },
      { label: "阶段 8 本地导出状态已可展示", status: "complete" },
    ],
    externalBlockers: [
      "远程数据库查询尚未接入，当前后台摘要仍来自本地 mock 数据。",
      "真实后台操作审计尚未接入，封禁、加余额和导出记录后续需要写入审计表。",
    ],
  };
}

export function isStageEightLocallyComplete(readiness: StageEightReadiness) {
  return readiness.localItems.every((item) => item.status === "complete");
}
