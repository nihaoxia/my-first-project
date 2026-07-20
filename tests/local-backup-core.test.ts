import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalBackupFile,
  buildLocalBackupFileName,
  buildLocalBackupMetadata,
  buildLocalBackupPayload,
  buildLocalBackupPreview,
  decodeLocalBackupBase64,
  encodeLocalBackupBase64,
  localBackupFileByteLimit,
  localBackupMimeType,
  localBackupPayloadByteLimit,
  localBackupStorageEntries,
  parseLocalBackupFile,
  parseLocalBackupPayloadBytes,
  serializeLocalBackupAdditionalData,
  serializeLocalBackupPayload,
  validateLocalBackupFileName,
  validateLocalBackupFileSize,
  validateLocalBackupPayloadSize,
  type LocalBackupEnvelopeV1,
} from "../src/lib/backup/local-backup-core.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

test("uses exactly the six approved scoped storage keys in restore order", () => {
  assert.deepEqual(
    localBackupStorageEntries.map(({ dataKey }) => dataKey),
    [
      "libraryBooks",
      "translations",
      "vocabulary",
      "sentences",
      "notes",
      "readerSelections",
    ],
  );
  assert.equal(localBackupStorageEntries.length, 6);
  assert.doesNotMatch(
    localBackupStorageEntries.map(({ baseKey }) => baseKey).join("\n"),
    /local-upload-draft|cloud-import-v1/u,
  );
});

test("normalizes all six categories and builds a content-free preview", () => {
  const result = buildLocalBackupPayload(buildBackupRawValues());

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(buildLocalBackupPreview("2026-07-21T09:00:00.000Z", result.payload), {
    createdAt: "2026-07-21T09:00:00.000Z",
    libraryBooks: 1,
    translations: 1,
    vocabulary: 1,
    sentences: 1,
    notes: 1,
    readerSelectionVocabulary: 1,
    readerSelectionSentences: 1,
    readerSelections: 2,
  });
});

test("normalizes missing approved keys to explicit empty categories", () => {
  const result = buildLocalBackupPayload({
    libraryBooks: null,
    translations: null,
    vocabulary: null,
    sentences: null,
    notes: null,
    readerSelections: null,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.payload, {
    schemaVersion: 1,
    data: {
      libraryBooks: [],
      translations: [],
      vocabulary: [],
      sentences: [],
      notes: [],
      readerSelections: {
        vocabularyTexts: [],
        sentenceTexts: [],
      },
    },
  });
});

test("rejects every malformed category without keeping partial records", () => {
  for (const { dataKey } of localBackupStorageEntries) {
    const raw = buildBackupRawValues();
    raw[dataKey] = "not-json";

    assert.equal(buildLocalBackupPayload(raw).ok, false, dataKey);
  }
});

test("rejects duplicate ids in every id-bearing category", () => {
  for (const dataKey of [
    "libraryBooks",
    "translations",
    "vocabulary",
    "sentences",
    "notes",
  ] as const) {
    const raw = buildBackupRawValues();
    const records = JSON.parse(raw[dataKey]!) as unknown[];
    raw[dataKey] = JSON.stringify([...records, records[0]]);

    assert.deepEqual(buildLocalBackupPayload(raw), {
      ok: false,
      code: "DUPLICATE_ID",
    });
  }
});

test("rejects local translations whose original book is absent", () => {
  const raw = buildBackupRawValues();
  raw.libraryBooks = "[]";

  assert.deepEqual(buildLocalBackupPayload(raw), {
    ok: false,
    code: "MISSING_ORIGINAL_BOOK",
  });
});

test("fixes the local backup filename, MIME type, and byte budgets", () => {
  const localDate = new Date(2026, 6, 21, 23, 30, 0);

  assert.equal(buildLocalBackupFileName(localDate), "stray-pages-backup-2026-07-21.spbackup");
  assert.equal(localBackupMimeType, "application/octet-stream");
  assert.equal(localBackupFileByteLimit, 16 * 1024 * 1024);
  assert.equal(localBackupPayloadByteLimit, 12 * 1024 * 1024);
  assert.equal(validateLocalBackupFileName("backup.spbackup").ok, true);
  assert.equal(validateLocalBackupFileName("BACKUP.SPBACKUP").ok, true);
  assert.equal(validateLocalBackupFileName("backup.json").ok, false);
  assert.equal(validateLocalBackupFileSize(localBackupFileByteLimit).ok, true);
  assert.equal(validateLocalBackupFileSize(localBackupFileByteLimit + 1).ok, false);
  assert.equal(validateLocalBackupPayloadSize(localBackupPayloadByteLimit).ok, true);
  assert.equal(validateLocalBackupPayloadSize(localBackupPayloadByteLimit + 1).ok, false);

  for (const invalid of [-1, 1.5, Number.NaN]) {
    assert.equal(validateLocalBackupFileSize(invalid).ok, false);
    assert.equal(validateLocalBackupPayloadSize(invalid).ok, false);
  }
});

test("round-trips only canonical standard Base64", () => {
  const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
  const encoded = encodeLocalBackupBase64(bytes);

  assert.equal(encoded, "AAEC/f7/");
  assert.deepEqual(decodeLocalBackupBase64(encoded), { ok: true, bytes });

  for (const malformed of ["AA-_", "AA E=", "AAE", "AAE===", "AAE=\n", "===="]) {
    assert.equal(decodeLocalBackupBase64(malformed).ok, false, malformed);
  }
});

test("serializes authenticated metadata in the fixed property order", () => {
  const metadata = buildLocalBackupMetadata({
    createdAt: "2026-07-21T09:00:00.000Z",
    sourceScopeFingerprint: "user-scope-test",
    salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    iv: Uint8Array.from({ length: 12 }, (_, index) => index + 16),
  });

  assert.equal(
    new TextDecoder().decode(serializeLocalBackupAdditionalData(metadata)),
    '{"format":"stray-pages-browser-local-backup","version":1,"createdAt":"2026-07-21T09:00:00.000Z","sourceScopeFingerprint":"user-scope-test","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":{"name":"AES-GCM","keyLength":256,"tagLength":128,"iv":"EBESExQVFhcYGRob"}}',
  );
});

test("builds and strictly parses a canonical version-one envelope", () => {
  const metadata = buildLocalBackupMetadata({
    createdAt: "2026-07-21T09:00:00.000Z",
    sourceScopeFingerprint: "user-scope-test",
    salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    iv: Uint8Array.from({ length: 12 }, (_, index) => index + 16),
  });
  const ciphertext = Uint8Array.from({ length: 32 }, (_, index) => index + 32);
  const built = buildLocalBackupFile({
    metadata,
    ciphertext,
    now: new Date(2026, 6, 21, 10, 0, 0),
  });

  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.fileName, "stray-pages-backup-2026-07-21.spbackup");
  assert.equal(built.mimeType, localBackupMimeType);

  const parsed = parseLocalBackupFile({
    fileName: built.fileName,
    fileSize: built.bytes.byteLength,
    bytes: built.bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.envelope.metadata, metadata);
  assert.deepEqual(parsed.envelope.salt, Uint8Array.from({ length: 16 }, (_, index) => index));
  assert.deepEqual(parsed.envelope.iv, Uint8Array.from({ length: 12 }, (_, index) => index + 16));
  assert.deepEqual(parsed.envelope.ciphertext, ciphertext);
});

test("rejects extension and declared byte mismatches before trusting the envelope", () => {
  const bytes = new TextEncoder().encode("{}");

  assert.deepEqual(
    parseLocalBackupFile({ fileName: "backup.json", fileSize: bytes.length, bytes }),
    { ok: false, code: "INVALID_EXTENSION" },
  );
  assert.deepEqual(
    parseLocalBackupFile({
      fileName: "backup.spbackup",
      fileSize: localBackupFileByteLimit + 1,
      bytes,
    }),
    { ok: false, code: "FILE_TOO_LARGE" },
  );
  assert.deepEqual(
    parseLocalBackupFile({ fileName: "backup.spbackup", fileSize: bytes.length + 1, bytes }),
    { ok: false, code: "AUTHENTICATION_FAILED" },
  );
});

test("rejects malformed, truncated, non-canonical, and unsupported envelopes", () => {
  const valid = buildEnvelopeObject();
  const malformedValues: unknown[] = [
    "{",
    { ...valid, unexpected: true },
    { ...valid, createdAt: "2026-07-21T17:00:00+08:00" },
    { ...valid, sourceScopeFingerprint: "" },
    { ...valid, ciphertext: "AA==" },
  ];

  for (const value of malformedValues) {
    const bytes =
      typeof value === "string" ? new TextEncoder().encode(value) : encodeEnvelope(value);
    assert.deepEqual(
      parseLocalBackupFile({ fileName: "backup.spbackup", fileSize: bytes.length, bytes }),
      { ok: false, code: "AUTHENTICATION_FAILED" },
    );
  }

  for (const value of [
    { ...valid, version: 2 },
    { ...valid, kdf: { ...valid.kdf, iterations: 599_999 } },
    { ...valid, kdf: { ...valid.kdf, extra: true } },
    { ...valid, cipher: { ...valid.cipher, name: "AES-CBC" } },
  ]) {
    const bytes = encodeEnvelope(value);
    assert.deepEqual(
      parseLocalBackupFile({ fileName: "backup.spbackup", fileSize: bytes.length, bytes }),
      { ok: false, code: "UNSUPPORTED_VERSION" },
    );
  }

  const invalidUtf8 = Uint8Array.from([0xc3, 0x28]);
  assert.deepEqual(
    parseLocalBackupFile({
      fileName: "backup.spbackup",
      fileSize: invalidUtf8.length,
      bytes: invalidUtf8,
    }),
    { ok: false, code: "AUTHENTICATION_FAILED" },
  );
});

test("serializes and reparses only exact validated payload shapes", () => {
  const built = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const serialized = serializeLocalBackupPayload(built.payload);
  assert.equal(serialized.ok, true);
  if (!serialized.ok) return;
  assert.deepEqual(parseLocalBackupPayloadBytes(serialized.bytes), built);

  for (const invalid of [
    { ...built.payload, unexpected: true },
    { ...built.payload, data: { ...built.payload.data, unexpected: [] } },
    {
      ...built.payload,
      data: Object.fromEntries(
        Object.entries(built.payload.data).filter(([key]) => key !== "notes"),
      ),
    },
  ]) {
    assert.deepEqual(
      parseLocalBackupPayloadBytes(new TextEncoder().encode(JSON.stringify(invalid))),
      { ok: false, code: "INVALID_DATA" },
    );
  }
});

function buildEnvelopeObject(): LocalBackupEnvelopeV1 {
  return {
    format: "stray-pages-browser-local-backup",
    version: 1,
    createdAt: "2026-07-21T09:00:00.000Z",
    sourceScopeFingerprint: "user-scope-test",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600_000,
      salt: encodeLocalBackupBase64(Uint8Array.from({ length: 16 }, (_, index) => index)),
    },
    cipher: {
      name: "AES-GCM",
      keyLength: 256,
      tagLength: 128,
      iv: encodeLocalBackupBase64(Uint8Array.from({ length: 12 }, (_, index) => index + 16)),
    },
    ciphertext: encodeLocalBackupBase64(Uint8Array.from({ length: 32 }, (_, index) => index + 32)),
  };
}

function encodeEnvelope(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}
