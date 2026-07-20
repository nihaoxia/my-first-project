import {
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooksResult,
  type StoredLocalLibraryBook,
} from "../library/local-library-storage.ts";
import {
  localTranslationsStorageKey,
  parseStoredLocalTranslationsResult,
  type StoredLocalTranslation,
} from "../library/local-translation-storage.ts";
import {
  localReaderSelectionsStorageKey,
  parseReaderSelectionCollectionsResult,
  type ReaderSelectionCollections,
} from "../reader/reader-selection-save.ts";
import type {
  SentenceStudyItem,
  VocabularyStudyItem,
} from "../reader/study-collections.ts";
import {
  localNotesStorageKey,
  localSentencesStorageKey,
  localVocabularyStorageKey,
  parseStoredSentenceItemsResult,
  parseStoredStudyNotesResult,
  parseStoredVocabularyItemsResult,
} from "../study/local-study-storage.ts";
import type { StudyNote } from "../study/study-notes-local.ts";

export type LocalBackupDataKey =
  | "libraryBooks"
  | "translations"
  | "vocabulary"
  | "sentences"
  | "notes"
  | "readerSelections";

export type LocalBackupRawValues = Record<LocalBackupDataKey, string | null>;

export type LocalBackupPayloadV1 = {
  schemaVersion: 1;
  data: {
    libraryBooks: StoredLocalLibraryBook[];
    translations: StoredLocalTranslation[];
    vocabulary: VocabularyStudyItem[];
    sentences: SentenceStudyItem[];
    notes: StudyNote[];
    readerSelections: ReaderSelectionCollections;
  };
};

export type LocalBackupPreview = {
  createdAt: string;
  libraryBooks: number;
  translations: number;
  vocabulary: number;
  sentences: number;
  notes: number;
  readerSelectionVocabulary: number;
  readerSelectionSentences: number;
  readerSelections: number;
};

export type LocalBackupDataErrorCode =
  | "LIBRARY_BOOKS_MALFORMED"
  | "TRANSLATIONS_MALFORMED"
  | "VOCABULARY_MALFORMED"
  | "SENTENCES_MALFORMED"
  | "NOTES_MALFORMED"
  | "READER_SELECTIONS_MALFORMED"
  | "DUPLICATE_ID"
  | "MISSING_ORIGINAL_BOOK";

export type LocalBackupPayloadBuildResult =
  | { ok: true; payload: LocalBackupPayloadV1 }
  | { ok: false; code: LocalBackupDataErrorCode };

export const localBackupStorageEntries = [
  { dataKey: "libraryBooks", baseKey: localLibraryBooksStorageKey },
  { dataKey: "translations", baseKey: localTranslationsStorageKey },
  { dataKey: "vocabulary", baseKey: localVocabularyStorageKey },
  { dataKey: "sentences", baseKey: localSentencesStorageKey },
  { dataKey: "notes", baseKey: localNotesStorageKey },
  { dataKey: "readerSelections", baseKey: localReaderSelectionsStorageKey },
] as const satisfies ReadonlyArray<{ dataKey: LocalBackupDataKey; baseKey: string }>;

export function buildLocalBackupPayload(
  rawValues: LocalBackupRawValues,
): LocalBackupPayloadBuildResult {
  const libraryBooks = parseStoredLocalLibraryBooksResult(rawValues.libraryBooks);
  if (!libraryBooks.ok) return { ok: false, code: "LIBRARY_BOOKS_MALFORMED" };

  const translations = parseStoredLocalTranslationsResult(rawValues.translations);
  if (!translations.ok) return { ok: false, code: "TRANSLATIONS_MALFORMED" };

  const vocabulary = parseStoredVocabularyItemsResult(rawValues.vocabulary);
  if (!vocabulary.ok) return { ok: false, code: "VOCABULARY_MALFORMED" };

  const sentences = parseStoredSentenceItemsResult(rawValues.sentences);
  if (!sentences.ok) return { ok: false, code: "SENTENCES_MALFORMED" };

  const notes = parseStoredStudyNotesResult(rawValues.notes);
  if (!notes.ok) return { ok: false, code: "NOTES_MALFORMED" };

  const readerSelections = parseReaderSelectionCollectionsResult(rawValues.readerSelections);
  if (!readerSelections.ok) return { ok: false, code: "READER_SELECTIONS_MALFORMED" };

  if (
    !hasUniqueIds(libraryBooks.records) ||
    !hasUniqueIds(translations.records) ||
    !hasUniqueIds(vocabulary.records) ||
    !hasUniqueIds(sentences.records) ||
    !hasUniqueIds(notes.records)
  ) {
    return { ok: false, code: "DUPLICATE_ID" };
  }

  if (!translationsReferenceKnownBooks(libraryBooks.records, translations.records)) {
    return { ok: false, code: "MISSING_ORIGINAL_BOOK" };
  }

  return {
    ok: true,
    payload: {
      schemaVersion: 1,
      data: {
        libraryBooks: libraryBooks.records,
        translations: translations.records,
        vocabulary: vocabulary.records,
        sentences: sentences.records,
        notes: notes.records,
        readerSelections: readerSelections.collections,
      },
    },
  };
}

export function buildLocalBackupPreview(
  createdAt: string,
  payload: LocalBackupPayloadV1,
): LocalBackupPreview {
  const readerSelectionVocabulary = payload.data.readerSelections.vocabularyTexts.length;
  const readerSelectionSentences = payload.data.readerSelections.sentenceTexts.length;

  return {
    createdAt,
    libraryBooks: payload.data.libraryBooks.length,
    translations: payload.data.translations.length,
    vocabulary: payload.data.vocabulary.length,
    sentences: payload.data.sentences.length,
    notes: payload.data.notes.length,
    readerSelectionVocabulary,
    readerSelectionSentences,
    readerSelections: readerSelectionVocabulary + readerSelectionSentences,
  };
}

function hasUniqueIds(records: ReadonlyArray<{ id: string }>) {
  return new Set(records.map(({ id }) => id)).size === records.length;
}

function translationsReferenceKnownBooks(
  books: StoredLocalLibraryBook[],
  translations: StoredLocalTranslation[],
) {
  const bookIds = new Set(books.map(({ id }) => id));
  return translations.every(({ originalBookId }) => bookIds.has(originalBookId));
}
