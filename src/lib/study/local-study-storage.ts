import {
  createSentenceDraft,
  createVocabularyDraft,
  type SentenceStudyItem,
  type VocabularyStudyItem,
} from "../reader/study-collections.ts";
import type { ReaderSelectionCollections } from "../reader/reader-selection-save.ts";
import type { StudyNote } from "./study-notes-local.ts";

export const localVocabularyStorageKey = "stray-pages.study-vocabulary";
export const localSentencesStorageKey = "stray-pages.study-sentences";
export const localNotesStorageKey = "stray-pages.study-notes";

export const localReaderSelectionBook = {
  id: "reader-selections",
  title: "阅读器收藏",
} as const;

export function parseStoredVocabularyItems(rawValue: string | null) {
  return parseStoredVocabularyItemsResult(rawValue).records;
}

export function parseStoredVocabularyItemsResult(rawValue: string | null) {
  return parseStoredArrayResult(rawValue, isVocabularyStudyItem);
}

export function parseStoredSentenceItems(rawValue: string | null) {
  return parseStoredSentenceItemsResult(rawValue).records;
}

export function parseStoredSentenceItemsResult(rawValue: string | null) {
  return parseStoredArrayResult(rawValue, isSentenceStudyItem);
}

export function parseStoredStudyNotes(rawValue: string | null) {
  return parseStoredStudyNotesResult(rawValue).records;
}

export function parseStoredStudyNotesResult(rawValue: string | null) {
  return parseStoredArrayResult(rawValue, isStudyNote);
}

export function mergeReaderSelectionsIntoVocabularyItems(
  items: VocabularyStudyItem[],
  selections: ReaderSelectionCollections,
) {
  const nextItems = [...items];

  for (const text of selections.vocabularyTexts) {
    if (nextItems.some((item) => item.term.trim().toLowerCase() === text.trim().toLowerCase())) {
      continue;
    }

    nextItems.push(
      createVocabularyDraft({
        term: text,
        explanation: "从阅读器收藏的词汇或短语",
        contextualMean: "等待补充",
        sourceSentence: text,
        bookId: localReaderSelectionBook.id,
        bookTitle: localReaderSelectionBook.title,
        chapterId: "selection",
        chapterTitle: "未记录章节",
      }),
    );
  }

  return nextItems;
}

export function mergeReaderSelectionsIntoSentenceItems(
  items: SentenceStudyItem[],
  selections: ReaderSelectionCollections,
) {
  const nextItems = [...items];

  for (const text of selections.sentenceTexts) {
    if (
      nextItems.some(
        (item) => item.originalText.trim().toLowerCase() === text.trim().toLowerCase(),
      )
    ) {
      continue;
    }

    nextItems.push(
      createSentenceDraft({
        originalText: text,
        explanation: "从阅读器收藏",
        bookId: localReaderSelectionBook.id,
        bookTitle: localReaderSelectionBook.title,
        chapterId: "selection",
        chapterTitle: "未记录章节",
      }),
    );
  }

  return nextItems;
}

function parseStoredArrayResult<T>(rawValue: string | null, guard: (value: unknown) => value is T) {
  if (!rawValue) {
    return { ok: true as const, status: "missing" as const, records: [] as T[] };
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return { ok: false as const, reason: "malformed" as const, records: [] as T[] };
    }

    const records = parsed.filter(guard);
    return records.length === parsed.length
      ? { ok: true as const, status: "ready" as const, records }
      : { ok: false as const, reason: "malformed" as const, records };
  } catch {
    return { ok: false as const, reason: "malformed" as const, records: [] as T[] };
  }
}

function isVocabularyStudyItem(value: unknown): value is VocabularyStudyItem {
  return (
    isStudySource(value) &&
    typeof value.id === "string" &&
    typeof value.term === "string" &&
    typeof value.explanation === "string" &&
    typeof value.contextualMean === "string" &&
    typeof value.sourceSentence === "string" &&
    typeof value.sourceLabel === "string" &&
    typeof value.note === "string" &&
    (value.deleted === undefined || typeof value.deleted === "boolean")
  );
}

function isSentenceStudyItem(value: unknown): value is SentenceStudyItem {
  return (
    isStudySource(value) &&
    typeof value.id === "string" &&
    typeof value.originalText === "string" &&
    typeof value.translatedText === "string" &&
    typeof value.explanation === "string" &&
    typeof value.sourceLabel === "string" &&
    typeof value.note === "string" &&
    (value.deleted === undefined || typeof value.deleted === "boolean")
  );
}

function isStudySource(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).bookId === "string" &&
    typeof (value as Record<string, unknown>).bookTitle === "string" &&
    typeof (value as Record<string, unknown>).chapterId === "string" &&
    typeof (value as Record<string, unknown>).chapterTitle === "string"
  );
}

function isStudyNote(value: unknown): value is StudyNote {
  if (!value || typeof value !== "object") {
    return false;
  }

  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    typeof note.title === "string" &&
    typeof note.source === "string" &&
    typeof note.updatedAt === "string" &&
    typeof note.content === "string"
  );
}
