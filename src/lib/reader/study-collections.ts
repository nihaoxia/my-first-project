export type StudySourceInput = {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
};

export type VocabularyStudyItem = StudySourceInput & {
  id: string;
  term: string;
  explanation: string;
  contextualMean: string;
  sourceSentence: string;
  sourceLabel: string;
  note: string;
  deleted?: boolean;
};

export type SentenceStudyItem = StudySourceInput & {
  id: string;
  originalText: string;
  translatedText: string;
  explanation: string;
  sourceLabel: string;
  note: string;
  deleted?: boolean;
};

export type StudyFilter = {
  query?: string;
  bookId?: string;
};

export type StudyDeletionPreview = {
  id: string;
  kind: "vocabulary" | "sentence";
  label: string;
  message: string;
};

export function createVocabularyDraft(
  input: StudySourceInput & {
    term: string;
    explanation: string;
    contextualMean: string;
    sourceSentence: string;
    note?: string;
  },
): VocabularyStudyItem {
  const term = input.term.trim();

  return {
    id: `vocab-${input.bookId}-${input.chapterId}-${slugify(term)}`,
    term,
    explanation: input.explanation.trim(),
    contextualMean: input.contextualMean.trim(),
    sourceSentence: input.sourceSentence.trim(),
    bookId: input.bookId,
    bookTitle: input.bookTitle,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    sourceLabel: buildSourceLabel(input),
    note: input.note?.trim() ?? "",
  };
}

export function createSentenceDraft(
  input: StudySourceInput & {
    originalText: string;
    translatedText?: string;
    explanation?: string;
    note?: string;
  },
): SentenceStudyItem {
  return {
    id: `sentence-${input.bookId}-${input.chapterId}-${stableTextId(input.originalText)}`,
    originalText: input.originalText.trim(),
    translatedText: input.translatedText?.trim() ?? "",
    explanation: input.explanation?.trim() ?? "",
    bookId: input.bookId,
    bookTitle: input.bookTitle,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    sourceLabel: buildSourceLabel(input),
    note: input.note?.trim() ?? "",
  };
}

export function mergeVocabularyItem(
  existingItems: VocabularyStudyItem[],
  incomingItem: VocabularyStudyItem,
): VocabularyStudyItem[] {
  const duplicateIndex = existingItems.findIndex(
    (item) =>
      item.bookId === incomingItem.bookId &&
      item.term.trim().toLowerCase() === incomingItem.term.trim().toLowerCase(),
  );

  if (duplicateIndex === -1) {
    return [...existingItems, incomingItem];
  }

  return existingItems.map((item, index) => {
    if (index !== duplicateIndex) {
      return item;
    }

    return {
      ...item,
      explanation: incomingItem.explanation || item.explanation,
      contextualMean: incomingItem.contextualMean || item.contextualMean,
      sourceSentence: incomingItem.sourceSentence || item.sourceSentence,
      chapterId: incomingItem.chapterId,
      chapterTitle: incomingItem.chapterTitle,
      sourceLabel: incomingItem.sourceLabel,
      note: mergeNotes(item.note, incomingItem.note),
    };
  });
}

export function filterVocabularyItems(
  items: VocabularyStudyItem[],
  filter: StudyFilter,
): VocabularyStudyItem[] {
  return items.filter((item) => {
    return (
      matchesBook(item.bookId, filter.bookId) &&
      matchesQuery(
        [
          item.term,
          item.explanation,
          item.contextualMean,
          item.sourceSentence,
          item.sourceLabel,
          item.bookTitle,
          item.chapterTitle,
          item.note,
        ],
        filter.query,
      ) &&
      !item.deleted
    );
  });
}

export function filterSentenceItems(
  items: SentenceStudyItem[],
  filter: StudyFilter,
): SentenceStudyItem[] {
  return items.filter((item) => {
    return (
      matchesBook(item.bookId, filter.bookId) &&
      matchesQuery(
        [
          item.originalText,
          item.translatedText,
          item.explanation,
          item.sourceLabel,
          item.bookTitle,
          item.chapterTitle,
          item.note,
          inferSentenceCue(item),
        ],
        filter.query,
      ) &&
      !item.deleted
    );
  });
}

export function previewStudyItemDeletion(input: {
  id: string;
  kind: "vocabulary" | "sentence";
  label: string;
}): StudyDeletionPreview {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    message:
      input.kind === "vocabulary"
        ? `“${input.label}”将从词汇本移除。`
        : `“${input.label}”将从句子本移除。`,
  };
}

export function deleteVocabularyItem(items: VocabularyStudyItem[], itemId: string) {
  return items.filter((item) => item.id !== itemId);
}

export function deleteSentenceItem(items: SentenceStudyItem[], itemId: string) {
  return items.filter((item) => item.id !== itemId);
}

function buildSourceLabel(input: Pick<StudySourceInput, "bookTitle" | "chapterTitle">) {
  return `${input.bookTitle} · ${input.chapterTitle}`;
}

function matchesBook(itemBookId: string, filterBookId: string | undefined) {
  return !filterBookId || filterBookId === "all" || itemBookId === filterBookId;
}

function matchesQuery(values: string[], query: string | undefined) {
  const normalizedQuery = query?.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function mergeNotes(existingNote: string, incomingNote: string) {
  if (!existingNote) {
    return incomingNote;
  }

  if (!incomingNote || existingNote.includes(incomingNote)) {
    return existingNote;
  }

  return `${existingNote}\n${incomingNote}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableTextId(value: string) {
  const text = value.trim();
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function inferSentenceCue(item: SentenceStudyItem) {
  if (item.translatedText.includes(";")) {
    return "分号";
  }

  return "";
}
