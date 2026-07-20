export type ChapterWarning =
  | "leading-content"
  | "single-chapter"
  | "likely-toc"
  | "short-chapter";

export type ChapterPreview = {
  index: number;
  title: string;
  characterCount: number;
  content: string;
  contentPreview: string;
  suggestedSkip: boolean;
  warnings: ChapterWarning[];
};

export type ChapterParseResult = {
  chapters: ChapterPreview[];
  warnings: ChapterWarning[];
};
