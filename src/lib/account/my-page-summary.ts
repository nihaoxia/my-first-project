export type MyPageSummaryInput = {
  balanceYuan: string;
  freeChaptersLeft: number;
  translatedBookCount: number;
  originalBookCount: number;
  recentTaskCount: number;
};

export type MyPageSummaryItem = {
  label: string;
  value: string;
  detail: string;
};

export type MyPageSummary = {
  accountItems: MyPageSummaryItem[];
  libraryItems: MyPageSummaryItem[];
};

export function buildMyPageSummary(input: MyPageSummaryInput): MyPageSummary {
  return {
    accountItems: [
      {
        label: "账户余额",
        value: `¥ ${input.balanceYuan}`,
        detail: "创建译本时按人民币余额结算",
      },
      {
        label: "免费标准章",
        value: String(input.freeChaptersLeft),
        detail: "创建译本时优先抵扣",
      },
      {
        label: "最近任务",
        value: String(input.recentTaskCount),
        detail: "翻译队列中的近期章节",
      },
    ],
    libraryItems: [
      {
        label: "原版书",
        value: String(input.originalBookCount),
        detail: "私人上传内容",
      },
      {
        label: "译本",
        value: String(input.translatedBookCount),
        detail: "按目标语言独立保存",
      },
      {
        label: "收费规则",
        value: "¥ 0.5",
        detail: "每个标准章",
      },
    ],
  };
}
