import {
  parseStoredLocalLibraryBooksResult,
  type StoredLocalLibraryBook,
} from "../library/local-library-storage.ts";
import {
  parseStoredLocalTranslationsResult,
  type StoredLocalTranslation,
} from "../library/local-translation-storage.ts";
import {
  parseReaderSelectionCollectionsResult,
  type ReaderSelectionCollections,
} from "../reader/reader-selection-save.ts";
import {
  parseStoredSentenceItemsResult,
  parseStoredStudyNotesResult,
  parseStoredVocabularyItemsResult,
} from "../study/local-study-storage.ts";
import type { StudyNote } from "../study/study-notes-local.ts";
import {
  localBackupPayloadByteLimit,
  localBackupStorageEntries,
  type LocalBackupDataKey,
  type LocalBackupPayloadV1,
} from "./local-backup-core.ts";

export type LocalBackupRestoreMode = "merge" | "replace";

export type LocalBackupRestoreGroup =
  | "library"
  | "vocabulary"
  | "sentences"
  | "notes"
  | "readerSelections";

export const allLocalBackupRestoreGroups = [
  "library",
  "vocabulary",
  "sentences",
  "notes",
  "readerSelections",
] as const satisfies readonly LocalBackupRestoreGroup[];

export type LocalBackupMergeGroupPreview = {
  current: number;
  backup: number;
  added: number;
  existing: number;
  conflictsKeptCurrent: number;
  rekeyed: number;
};

export type LocalBackupMergePlan = {
  preview: Readonly<Partial<Record<LocalBackupRestoreGroup, LocalBackupMergeGroupPreview>>>;
  changedDataKeys: readonly LocalBackupDataKey[];
  targetRawValues: Partial<Record<LocalBackupDataKey, string>>;
};

export type LocalBackupMergeErrorCode =
  | "INVALID_SELECTION"
  | "CURRENT_DATA_MALFORMED"
  | "BACKUP_DATA_MALFORMED"
  | "MISSING_ORIGINAL_BOOK"
  | "MERGED_DATA_TOO_LARGE";

export type LocalBackupMergePlanResult =
  | ({ ok: true } & LocalBackupMergePlan)
  | { ok: false; code: LocalBackupMergeErrorCode };

const restoreGroupByDataKey: Record<LocalBackupDataKey, LocalBackupRestoreGroup> = {
  libraryBooks: "library",
  translations: "library",
  vocabulary: "vocabulary",
  sentences: "sentences",
  notes: "notes",
  readerSelections: "readerSelections",
};

export function resolveLocalBackupRestoreSelection(value: unknown):
  | {
      ok: true;
      groups: readonly LocalBackupRestoreGroup[];
      dataKeys: readonly LocalBackupDataKey[];
    }
  | { ok: false; code: "INVALID_SELECTION" } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: "INVALID_SELECTION" };
  }

  const allowed = new Set<string>(allLocalBackupRestoreGroups);
  const selected = new Set<LocalBackupRestoreGroup>();

  for (const candidate of value) {
    const group = candidate as LocalBackupRestoreGroup;
    if (typeof candidate !== "string" || !allowed.has(candidate) || selected.has(group)) {
      return { ok: false, code: "INVALID_SELECTION" };
    }
    selected.add(group);
  }

  return {
    ok: true,
    groups: allLocalBackupRestoreGroups.filter((group) => selected.has(group)),
    dataKeys: localBackupStorageEntries
      .filter((entry) => selected.has(restoreGroupByDataKey[entry.dataKey]))
      .map((entry) => entry.dataKey),
  };
}

export function buildLocalBackupMergePlan(input: {
  currentRawValues: Partial<Record<LocalBackupDataKey, string | null>>;
  payload: LocalBackupPayloadV1;
  selectedGroups: readonly LocalBackupRestoreGroup[];
}): LocalBackupMergePlanResult {
  const selected = resolveLocalBackupRestoreSelection(input.selectedGroups);
  if (!selected.ok) return selected;
  if (
    selected.dataKeys.some(
      (dataKey) => !Object.prototype.hasOwnProperty.call(input.currentRawValues, dataKey),
    )
  ) {
    return { ok: false, code: "CURRENT_DATA_MALFORMED" };
  }

  const preview: Partial<Record<LocalBackupRestoreGroup, LocalBackupMergeGroupPreview>> = {};
  const targetRawValues: Partial<Record<LocalBackupDataKey, string>> = {};

  if (selected.groups.includes("library")) {
    const currentBooks = parseStoredLocalLibraryBooksResult(input.currentRawValues.libraryBooks ?? null);
    const currentTranslations = parseStoredLocalTranslationsResult(
      input.currentRawValues.translations ?? null,
    );
    const backupBooks = parseStoredLocalLibraryBooksResult(
      JSON.stringify(input.payload.data.libraryBooks),
    );
    const backupTranslations = parseStoredLocalTranslationsResult(
      JSON.stringify(input.payload.data.translations),
    );

    if (
      !currentBooks.ok ||
      !currentTranslations.ok ||
      !hasUniqueIds(currentBooks.records) ||
      !hasUniqueIds(currentTranslations.records)
    ) {
      return { ok: false, code: "CURRENT_DATA_MALFORMED" };
    }
    if (
      !backupBooks.ok ||
      !backupTranslations.ok ||
      !hasUniqueIds(backupBooks.records) ||
      !hasUniqueIds(backupTranslations.records)
    ) {
      return { ok: false, code: "BACKUP_DATA_MALFORMED" };
    }

    const books = mergeIdRecords(currentBooks.records, backupBooks.records);
    const translations = mergeIdRecords(
      currentTranslations.records,
      backupTranslations.records,
    );
    if (!translationsReferenceKnownBooks(books.records, translations.records)) {
      return { ok: false, code: "MISSING_ORIGINAL_BOOK" };
    }
    if (books.added > 0) targetRawValues.libraryBooks = JSON.stringify(books.records);
    if (translations.added > 0) {
      targetRawValues.translations = JSON.stringify(translations.records);
    }
    preview.library = combineMergePreviews(
      buildIdMergePreview(currentBooks.records.length, backupBooks.records.length, books),
      buildIdMergePreview(
        currentTranslations.records.length,
        backupTranslations.records.length,
        translations,
      ),
    );
  }

  if (selected.groups.includes("vocabulary")) {
    const result = mergeParsedIdCategory(
      input.currentRawValues.vocabulary ?? null,
      input.payload.data.vocabulary,
      parseStoredVocabularyItemsResult,
    );
    if (!result.ok) return result;
    if (result.merged.added > 0) {
      targetRawValues.vocabulary = JSON.stringify(result.merged.records);
    }
    preview.vocabulary = buildIdMergePreview(
      result.currentCount,
      result.backupCount,
      result.merged,
    );
  }

  if (selected.groups.includes("sentences")) {
    const result = mergeParsedIdCategory(
      input.currentRawValues.sentences ?? null,
      input.payload.data.sentences,
      parseStoredSentenceItemsResult,
    );
    if (!result.ok) return result;
    if (result.merged.added > 0) {
      targetRawValues.sentences = JSON.stringify(result.merged.records);
    }
    preview.sentences = buildIdMergePreview(
      result.currentCount,
      result.backupCount,
      result.merged,
    );
  }

  if (selected.groups.includes("notes")) {
    const current = parseStoredStudyNotesResult(input.currentRawValues.notes ?? null);
    const backup = parseStoredStudyNotesResult(JSON.stringify(input.payload.data.notes));
    if (!current.ok || !hasUniqueIds(current.records)) {
      return { ok: false, code: "CURRENT_DATA_MALFORMED" };
    }
    if (!backup.ok || !hasUniqueIds(backup.records)) {
      return { ok: false, code: "BACKUP_DATA_MALFORMED" };
    }
    const merged = mergeNotes(current.records, backup.records);
    if (!merged) {
      return { ok: false, code: "MERGED_DATA_TOO_LARGE" };
    }
    if (merged.added > 0 || merged.rekeyed > 0) {
      targetRawValues.notes = JSON.stringify(merged.records);
    }
    preview.notes = {
      current: current.records.length,
      backup: backup.records.length,
      added: merged.added,
      existing: merged.existing,
      conflictsKeptCurrent: 0,
      rekeyed: merged.rekeyed,
    };
  }

  if (selected.groups.includes("readerSelections")) {
    const current = parseReaderSelectionCollectionsResult(
      input.currentRawValues.readerSelections ?? null,
    );
    const backup = parseReaderSelectionCollectionsResult(
      JSON.stringify(input.payload.data.readerSelections),
    );
    if (!current.ok || hasBlankReaderText(current.collections)) {
      return { ok: false, code: "CURRENT_DATA_MALFORMED" };
    }
    if (!backup.ok || hasBlankReaderText(backup.collections)) {
      return { ok: false, code: "BACKUP_DATA_MALFORMED" };
    }
    const merged = mergeReaderSelections(current.collections, backup.collections);
    if (merged.added > 0) {
      targetRawValues.readerSelections = JSON.stringify(merged.collections);
    }
    preview.readerSelections = {
      current: countReaderTexts(current.collections),
      backup: countReaderTexts(backup.collections),
      added: merged.added,
      existing: merged.existing,
      conflictsKeptCurrent: 0,
      rekeyed: 0,
    };
  }

  const changedDataKeys = localBackupStorageEntries
    .map(({ dataKey }) => dataKey)
    .filter((dataKey) => targetRawValues[dataKey] !== undefined);
  const changedBytes = changedDataKeys.reduce(
    (total, dataKey) =>
      total + new TextEncoder().encode(targetRawValues[dataKey]!).byteLength,
    0,
  );
  if (changedBytes > localBackupPayloadByteLimit) {
    return { ok: false, code: "MERGED_DATA_TOO_LARGE" };
  }

  return {
    ok: true,
    preview,
    changedDataKeys,
    targetRawValues,
  };
}

type IdRecord = { id: string };

type IdMergeResult<T extends IdRecord> = {
  records: T[];
  added: number;
  existing: number;
  conflictsKeptCurrent: number;
};

function mergeIdRecords<T extends IdRecord>(current: T[], backup: T[]): IdMergeResult<T> {
  const currentById = new Map(current.map((record) => [record.id, record]));
  const records = [...current];
  let added = 0;
  let existing = 0;
  let conflictsKeptCurrent = 0;

  for (const incoming of backup) {
    const present = currentById.get(incoming.id);
    if (!present) {
      records.push(incoming);
      currentById.set(incoming.id, incoming);
      added += 1;
    } else if (stableJson(present) === stableJson(incoming)) {
      existing += 1;
    } else {
      conflictsKeptCurrent += 1;
    }
  }

  return { records, added, existing, conflictsKeptCurrent };
}

function mergeParsedIdCategory<T extends IdRecord>(
  currentRawValue: string | null,
  backupRecords: T[],
  parse: (rawValue: string | null) => { ok: boolean; records: T[] },
):
  | {
      ok: true;
      currentCount: number;
      backupCount: number;
      merged: IdMergeResult<T>;
    }
  | { ok: false; code: "CURRENT_DATA_MALFORMED" | "BACKUP_DATA_MALFORMED" } {
  const current = parse(currentRawValue);
  if (!current.ok || !hasUniqueIds(current.records)) {
    return { ok: false, code: "CURRENT_DATA_MALFORMED" };
  }
  const backup = parse(JSON.stringify(backupRecords));
  if (!backup.ok || !hasUniqueIds(backup.records)) {
    return { ok: false, code: "BACKUP_DATA_MALFORMED" };
  }
  return {
    ok: true,
    currentCount: current.records.length,
    backupCount: backup.records.length,
    merged: mergeIdRecords(current.records, backup.records),
  };
}

function buildIdMergePreview<T extends IdRecord>(
  current: number,
  backup: number,
  merged: IdMergeResult<T>,
): LocalBackupMergeGroupPreview {
  return {
    current,
    backup,
    added: merged.added,
    existing: merged.existing,
    conflictsKeptCurrent: merged.conflictsKeptCurrent,
    rekeyed: 0,
  };
}

function combineMergePreviews(
  left: LocalBackupMergeGroupPreview,
  right: LocalBackupMergeGroupPreview,
): LocalBackupMergeGroupPreview {
  return {
    current: left.current + right.current,
    backup: left.backup + right.backup,
    added: left.added + right.added,
    existing: left.existing + right.existing,
    conflictsKeptCurrent: left.conflictsKeptCurrent + right.conflictsKeptCurrent,
    rekeyed: left.rekeyed + right.rekeyed,
  };
}

function mergeNotes(current: StudyNote[], backup: StudyNote[]) {
  const usedIds = new Set([...current, ...backup].map((note) => note.id));
  let highestNumber = "0";
  for (const id of usedIds) {
    const match = /^note-local-(\d+)$/u.exec(id);
    if (!match) continue;
    const candidate = normalizeDecimalInteger(match[1]);
    if (compareDecimalIntegers(candidate, highestNumber) > 0) highestNumber = candidate;
  }
  let nextNumber = incrementDecimalInteger(highestNumber);
  const currentById = new Map(current.map((note) => [note.id, note]));
  const records = [...current];
  let added = 0;
  let existing = 0;
  let rekeyed = 0;
  let generatedIdBytes = 0;

  for (const incoming of backup) {
    const present = currentById.get(incoming.id);
    if (!present) {
      records.push(incoming);
      currentById.set(incoming.id, incoming);
      added += 1;
      continue;
    }
    if (stableJson(present) === stableJson(incoming)) {
      existing += 1;
      continue;
    }
    while (usedIds.has(`note-local-${nextNumber}`)) {
      nextNumber = incrementDecimalInteger(nextNumber);
    }
    const rekeyedId = `note-local-${nextNumber}`;
    if (rekeyedId.length > localBackupPayloadByteLimit - generatedIdBytes) return null;
    generatedIdBytes += rekeyedId.length;
    const rekeyedNote = { ...incoming, id: rekeyedId };
    usedIds.add(rekeyedNote.id);
    nextNumber = incrementDecimalInteger(nextNumber);
    records.push(rekeyedNote);
    rekeyed += 1;
  }

  return { records, added, existing, rekeyed };
}

function normalizeDecimalInteger(value: string) {
  let firstNonZero = 0;
  while (firstNonZero < value.length - 1 && value.charCodeAt(firstNonZero) === 48) {
    firstNonZero += 1;
  }
  return firstNonZero === 0 ? value : value.slice(firstNonZero);
}

function compareDecimalIntegers(left: string, right: string) {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function incrementDecimalInteger(value: string) {
  let carryIndex = value.length - 1;
  while (carryIndex >= 0 && value.charCodeAt(carryIndex) === 57) carryIndex -= 1;
  if (carryIndex < 0) return `1${"0".repeat(value.length)}`;
  const nextDigit = String.fromCharCode(value.charCodeAt(carryIndex) + 1);
  return `${value.slice(0, carryIndex)}${nextDigit}${"0".repeat(value.length - carryIndex - 1)}`;
}

function mergeReaderSelections(
  current: ReaderSelectionCollections,
  backup: ReaderSelectionCollections,
) {
  const vocabulary = mergeReaderTexts(current.vocabularyTexts, backup.vocabularyTexts);
  const sentences = mergeReaderTexts(current.sentenceTexts, backup.sentenceTexts);
  return {
    collections: {
      vocabularyTexts: vocabulary.texts,
      sentenceTexts: sentences.texts,
    },
    added: vocabulary.added + sentences.added,
    existing: vocabulary.existing + sentences.existing,
  };
}

function mergeReaderTexts(current: string[], backup: string[]) {
  const texts = [...current];
  const seen = new Set(current.map(normalizeReaderText));
  let added = 0;
  let existing = 0;

  for (const incoming of backup) {
    const normalized = normalizeReaderText(incoming);
    if (seen.has(normalized)) {
      existing += 1;
      continue;
    }
    const text = incoming.trim();
    texts.push(text);
    seen.add(normalized);
    added += 1;
  }

  return { texts, added, existing };
}

function hasBlankReaderText(collections: ReaderSelectionCollections) {
  return [...collections.vocabularyTexts, ...collections.sentenceTexts].some(
    (text) => text.trim().length === 0,
  );
}

function countReaderTexts(collections: ReaderSelectionCollections) {
  return collections.vocabularyTexts.length + collections.sentenceTexts.length;
}

function normalizeReaderText(text: string) {
  return text.trim().toLowerCase();
}

function hasUniqueIds(records: IdRecord[]) {
  return new Set(records.map((record) => record.id)).size === records.length;
}

function translationsReferenceKnownBooks(
  books: StoredLocalLibraryBook[],
  translations: StoredLocalTranslation[],
) {
  const bookIds = new Set(books.map((book) => book.id));
  return translations.every((translation) => bookIds.has(translation.originalBookId));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  });
}
