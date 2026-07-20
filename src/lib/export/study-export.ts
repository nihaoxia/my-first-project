import type {
  SentenceStudyItem,
  VocabularyStudyItem,
} from "@/lib/reader/study-collections";
import type { StudyNote } from "@/lib/study/study-notes-local";

export type StudyExportInput<TItem> = {
  bookTitle: string;
  items: TItem[];
};

export type StudyExportResult = {
  fileName: string;
  content: string;
};

export function buildVocabularyCsvExport(
  input: StudyExportInput<VocabularyStudyItem>,
): StudyExportResult {
  const header = ["词条", "解释", "语境含义", "例句", "来源", "备注"];
  const rows = input.items.map((item) => [
    item.term,
    item.explanation,
    item.contextualMean,
    item.sourceSentence,
    item.sourceLabel,
    item.note,
  ]);

  return {
    fileName: `${slugifyFileName(input.bookTitle)}-vocabulary.csv`,
    content: [header, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\n"),
  };
}

export function buildSentenceMarkdownExport(
  input: StudyExportInput<SentenceStudyItem>,
): StudyExportResult {
  const sections = input.items.map((item, index) =>
    [
      `## ${index + 1}. ${item.sourceLabel}`,
      "",
      `> ${item.originalText}`,
      "",
      item.translatedText ? `**译文：** ${item.translatedText}` : "",
      item.explanation ? `**解释：** ${item.explanation}` : "",
      item.note ? `**备注：** ${item.note}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n\n"),
  );

  return {
    fileName: `${slugifyFileName(input.bookTitle)}-sentences.md`,
    content: [`# ${input.bookTitle} · 句子本`, ...sections].join("\n\n"),
  };
}

export function buildNotesMarkdownExport(input: { notes: StudyNote[] }): StudyExportResult {
  const sections = input.notes.map((note, index) =>
    [
      `## ${index + 1}. ${note.title.trim()}`,
      `**来源：** ${note.source || "自由笔记"}`,
      `**更新时间：** ${note.updatedAt}`,
      note.content.trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
  );

  return {
    fileName: "stray-pages-notes.md",
    content: ["# Stray Pages · 笔记本", ...sections].join("\n\n"),
  };
}

function formatCsvCell(value: string) {
  const text = value.trim();

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function slugifyFileName(value: string) {
  const transliterated = value.replace(
    /[\u4e00-\u9fa5]/g,
    (character) => ` ${pinyinMap[character] ?? ""} `,
  );

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const pinyinMap: Record<string, string> = {
  边: "bian",
  境: "jing",
  迷: "mi",
  雾: "wu",
};
