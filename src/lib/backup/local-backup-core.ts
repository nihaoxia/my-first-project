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

export const localBackupFormat = "stray-pages-browser-local-backup" as const;
export const localBackupVersion = 1 as const;
export const localBackupMimeType = "application/octet-stream";
export const localBackupFileByteLimit = 16 * 1024 * 1024;
export const localBackupPayloadByteLimit = 12 * 1024 * 1024;
export const localBackupPbkdf2Iterations = 600_000;
export const localBackupSaltBytes = 16;
export const localBackupIvBytes = 12;
export const localBackupGcmTagBits = 128;

export type LocalBackupEnvelopeV1 = {
  format: typeof localBackupFormat;
  version: typeof localBackupVersion;
  createdAt: string;
  sourceScopeFingerprint: string;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: typeof localBackupPbkdf2Iterations;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    keyLength: 256;
    tagLength: typeof localBackupGcmTagBits;
    iv: string;
  };
  ciphertext: string;
};

export type LocalBackupMetadataV1 = Omit<LocalBackupEnvelopeV1, "ciphertext">;

export type ParsedLocalBackupEnvelope = {
  metadata: LocalBackupMetadataV1;
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

export type LocalBackupFileResult =
  | {
      ok: true;
      fileName: string;
      mimeType: typeof localBackupMimeType;
      bytes: Uint8Array;
    }
  | { ok: false; code: "CIPHERTEXT_TOO_LARGE" | "FILE_TOO_LARGE" };

export type LocalBackupFileParseResult =
  | { ok: true; envelope: ParsedLocalBackupEnvelope }
  | {
      ok: false;
      code:
        | "INVALID_EXTENSION"
        | "FILE_TOO_LARGE"
        | "UNSUPPORTED_VERSION"
        | "AUTHENTICATION_FAILED";
    };

export type LocalBackupPayloadParseResult =
  | { ok: true; payload: LocalBackupPayloadV1 }
  | { ok: false; code: "PAYLOAD_TOO_LARGE" | "INVALID_DATA" };

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

export function buildLocalBackupFileName(now: Date) {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `stray-pages-backup-${year}-${month}-${day}.spbackup`;
}

export function validateLocalBackupFileName(fileName: string) {
  return fileName.length > ".spbackup".length && fileName.toLowerCase().endsWith(".spbackup")
    ? ({ ok: true } as const)
    : ({ ok: false, code: "INVALID_EXTENSION" } as const);
}

export function validateLocalBackupFileSize(size: number) {
  return isValidByteLength(size, localBackupFileByteLimit)
    ? ({ ok: true } as const)
    : ({ ok: false, code: "FILE_TOO_LARGE" } as const);
}

export function validateLocalBackupPayloadSize(size: number) {
  return isValidByteLength(size, localBackupPayloadByteLimit)
    ? ({ ok: true } as const)
    : ({ ok: false, code: "PAYLOAD_TOO_LARGE" } as const);
}

export function encodeLocalBackupBase64(bytes: Uint8Array) {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = (first << 16) | (second << 8) | third;

    encoded += base64Alphabet[(combined >>> 18) & 63];
    encoded += base64Alphabet[(combined >>> 12) & 63];
    encoded += index + 1 < bytes.length ? base64Alphabet[(combined >>> 6) & 63] : "=";
    encoded += index + 2 < bytes.length ? base64Alphabet[combined & 63] : "=";
  }

  return encoded;
}

export function decodeLocalBackupBase64(value: string):
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "INVALID_BASE64" } {
  if (!canonicalBase64Pattern.test(value)) {
    return { ok: false, code: "INVALID_BASE64" };
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = base64Alphabet.indexOf(value[index]);
    const second = base64Alphabet.indexOf(value[index + 1]);
    const third = value[index + 2] === "=" ? 0 : base64Alphabet.indexOf(value[index + 2]);
    const fourth = value[index + 3] === "=" ? 0 : base64Alphabet.indexOf(value[index + 3]);
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < bytes.length) bytes[outputIndex++] = (combined >>> 16) & 255;
    if (outputIndex < bytes.length) bytes[outputIndex++] = (combined >>> 8) & 255;
    if (outputIndex < bytes.length) bytes[outputIndex++] = combined & 255;
  }

  if (encodeLocalBackupBase64(bytes) !== value) {
    bytes.fill(0);
    return { ok: false, code: "INVALID_BASE64" };
  }

  return { ok: true, bytes };
}

export function buildLocalBackupMetadata(input: {
  createdAt: string;
  sourceScopeFingerprint: string;
  salt: Uint8Array;
  iv: Uint8Array;
}): LocalBackupMetadataV1 {
  if (input.salt.byteLength !== localBackupSaltBytes || input.iv.byteLength !== localBackupIvBytes) {
    throw new Error("Invalid local backup salt or IV length.");
  }

  return {
    format: localBackupFormat,
    version: localBackupVersion,
    createdAt: input.createdAt,
    sourceScopeFingerprint: input.sourceScopeFingerprint,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: localBackupPbkdf2Iterations,
      salt: encodeLocalBackupBase64(input.salt),
    },
    cipher: {
      name: "AES-GCM",
      keyLength: 256,
      tagLength: localBackupGcmTagBits,
      iv: encodeLocalBackupBase64(input.iv),
    },
  };
}

export function serializeLocalBackupAdditionalData(metadata: LocalBackupMetadataV1) {
  return encodeUtf8({
    format: metadata.format,
    version: metadata.version,
    createdAt: metadata.createdAt,
    sourceScopeFingerprint: metadata.sourceScopeFingerprint,
    kdf: {
      name: metadata.kdf.name,
      hash: metadata.kdf.hash,
      iterations: metadata.kdf.iterations,
      salt: metadata.kdf.salt,
    },
    cipher: {
      name: metadata.cipher.name,
      keyLength: metadata.cipher.keyLength,
      tagLength: metadata.cipher.tagLength,
      iv: metadata.cipher.iv,
    },
  });
}

export function buildLocalBackupFile(input: {
  metadata: LocalBackupMetadataV1;
  ciphertext: Uint8Array;
  now: Date;
}): LocalBackupFileResult {
  if (!isValidByteLength(input.ciphertext.byteLength, localBackupPayloadByteLimit)) {
    return { ok: false, code: "CIPHERTEXT_TOO_LARGE" };
  }

  const bytes = encodeUtf8({
    format: input.metadata.format,
    version: input.metadata.version,
    createdAt: input.metadata.createdAt,
    sourceScopeFingerprint: input.metadata.sourceScopeFingerprint,
    kdf: input.metadata.kdf,
    cipher: input.metadata.cipher,
    ciphertext: encodeLocalBackupBase64(input.ciphertext),
  });

  if (!isValidByteLength(bytes.byteLength, localBackupFileByteLimit)) {
    bytes.fill(0);
    return { ok: false, code: "FILE_TOO_LARGE" };
  }

  return {
    ok: true,
    fileName: buildLocalBackupFileName(input.now),
    mimeType: localBackupMimeType,
    bytes,
  };
}

export function parseLocalBackupFile(input: {
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
}): LocalBackupFileParseResult {
  const name = validateLocalBackupFileName(input.fileName);
  if (!name.ok) return name;

  const size = validateLocalBackupFileSize(input.fileSize);
  if (!size.ok) return size;

  if (input.bytes.byteLength !== input.fileSize) {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  const decoded = decodeJson(input.bytes);
  if (!decoded.ok || !isRecord(decoded.value)) {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  const envelope = decoded.value;
  if (!hasExactKeys(envelope, envelopeKeys)) {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  if (
    envelope.format !== localBackupFormat ||
    envelope.version !== localBackupVersion ||
    !isRecord(envelope.kdf) ||
    !isRecord(envelope.cipher)
  ) {
    return { ok: false, code: "UNSUPPORTED_VERSION" };
  }

  if (
    !hasExactKeys(envelope.kdf, kdfKeys) ||
    envelope.kdf.name !== "PBKDF2" ||
    envelope.kdf.hash !== "SHA-256" ||
    envelope.kdf.iterations !== localBackupPbkdf2Iterations ||
    !hasExactKeys(envelope.cipher, cipherKeys) ||
    envelope.cipher.name !== "AES-GCM" ||
    envelope.cipher.keyLength !== 256 ||
    envelope.cipher.tagLength !== localBackupGcmTagBits
  ) {
    return { ok: false, code: "UNSUPPORTED_VERSION" };
  }

  if (
    !isCanonicalIsoDate(envelope.createdAt) ||
    typeof envelope.sourceScopeFingerprint !== "string" ||
    envelope.sourceScopeFingerprint.trim() !== envelope.sourceScopeFingerprint ||
    envelope.sourceScopeFingerprint.length === 0 ||
    typeof envelope.kdf.salt !== "string" ||
    typeof envelope.cipher.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  const salt = decodeLocalBackupBase64(envelope.kdf.salt);
  const iv = decodeLocalBackupBase64(envelope.cipher.iv);
  const ciphertext = decodeLocalBackupBase64(envelope.ciphertext);

  if (
    !salt.ok ||
    salt.bytes.byteLength !== localBackupSaltBytes ||
    !iv.ok ||
    iv.bytes.byteLength !== localBackupIvBytes ||
    !ciphertext.ok ||
    ciphertext.bytes.byteLength < localBackupGcmTagBits / 8 ||
    !isValidByteLength(ciphertext.bytes.byteLength, localBackupPayloadByteLimit)
  ) {
    if (salt.ok) salt.bytes.fill(0);
    if (iv.ok) iv.bytes.fill(0);
    if (ciphertext.ok) ciphertext.bytes.fill(0);
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  const metadata: LocalBackupMetadataV1 = {
    format: localBackupFormat,
    version: localBackupVersion,
    createdAt: envelope.createdAt,
    sourceScopeFingerprint: envelope.sourceScopeFingerprint,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: localBackupPbkdf2Iterations,
      salt: envelope.kdf.salt,
    },
    cipher: {
      name: "AES-GCM",
      keyLength: 256,
      tagLength: localBackupGcmTagBits,
      iv: envelope.cipher.iv,
    },
  };

  return {
    ok: true,
    envelope: {
      metadata,
      salt: salt.bytes,
      iv: iv.bytes,
      ciphertext: ciphertext.bytes,
    },
  };
}

export function serializeLocalBackupPayload(
  payload: LocalBackupPayloadV1,
): { ok: true; bytes: Uint8Array } | { ok: false; code: "PAYLOAD_TOO_LARGE" } {
  const bytes = encodeUtf8(payload);
  if (!isValidByteLength(bytes.byteLength, localBackupPayloadByteLimit)) {
    bytes.fill(0);
    return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  }
  return { ok: true, bytes };
}

export function parseLocalBackupPayloadBytes(bytes: Uint8Array): LocalBackupPayloadParseResult {
  if (!isValidByteLength(bytes.byteLength, localBackupPayloadByteLimit)) {
    return { ok: false, code: "PAYLOAD_TOO_LARGE" };
  }

  const decoded = decodeJson(bytes);
  if (
    !decoded.ok ||
    !isRecord(decoded.value) ||
    !hasExactKeys(decoded.value, payloadKeys) ||
    decoded.value.schemaVersion !== 1 ||
    !isRecord(decoded.value.data) ||
    !hasExactKeys(decoded.value.data, dataKeys)
  ) {
    return { ok: false, code: "INVALID_DATA" };
  }

  const data = decoded.value.data;
  const rebuilt = buildLocalBackupPayload({
    libraryBooks: JSON.stringify(data.libraryBooks),
    translations: JSON.stringify(data.translations),
    vocabulary: JSON.stringify(data.vocabulary),
    sentences: JSON.stringify(data.sentences),
    notes: JSON.stringify(data.notes),
    readerSelections: JSON.stringify(data.readerSelections),
  });

  return rebuilt.ok ? rebuilt : { ok: false, code: "INVALID_DATA" };
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

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const envelopeKeys = [
  "format",
  "version",
  "createdAt",
  "sourceScopeFingerprint",
  "kdf",
  "cipher",
  "ciphertext",
] as const;
const kdfKeys = ["name", "hash", "iterations", "salt"] as const;
const cipherKeys = ["name", "keyLength", "tagLength", "iv"] as const;
const payloadKeys = ["schemaVersion", "data"] as const;
const dataKeys = [
  "libraryBooks",
  "translations",
  "vocabulary",
  "sentences",
  "notes",
  "readerSelections",
] as const;

function isValidByteLength(value: number, maximum: number) {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}

function encodeUtf8(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson(bytes: Uint8Array):
  | { ok: true; value: unknown }
  | { ok: false } {
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
    };
  } catch {
    return { ok: false };
  }
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
