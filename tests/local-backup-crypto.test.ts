import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLocalBackupPayload,
  parseLocalBackupFile,
  type ParsedLocalBackupEnvelope,
} from "../src/lib/backup/local-backup-core.ts";
import {
  decryptLocalBackup,
  encryptLocalBackup,
  validateLocalBackupCreatePassphrase,
  validateLocalBackupRestorePassphrase,
  type LocalBackupCryptoRuntime,
} from "../src/lib/backup/local-backup-crypto.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

const validPassphrase = "独立备份口令甲乙丙丁戊己";

test("accepts only exact well-formed 12 to 128 code-point create passphrases", () => {
  assert.deepEqual(validateLocalBackupCreatePassphrase("甲".repeat(12), "甲".repeat(12)), {
    ok: true,
  });
  assert.deepEqual(validateLocalBackupCreatePassphrase("😀".repeat(128), "😀".repeat(128)), {
    ok: true,
  });
  assert.deepEqual(validateLocalBackupCreatePassphrase("甲".repeat(11), "甲".repeat(11)), {
    ok: false,
    code: "PASSPHRASE_TOO_SHORT",
  });
  assert.deepEqual(validateLocalBackupCreatePassphrase("甲".repeat(129), "甲".repeat(129)), {
    ok: false,
    code: "PASSPHRASE_TOO_LONG",
  });
  assert.deepEqual(
    validateLocalBackupCreatePassphrase("甲".repeat(12), "甲".repeat(11) + "乙"),
    { ok: false, code: "PASSPHRASE_MISMATCH" },
  );
  assert.deepEqual(
    validateLocalBackupCreatePassphrase("甲".repeat(11) + "\ud800", "甲".repeat(11) + "\ud800"),
    { ok: false, code: "PASSPHRASE_INVALID_UNICODE" },
  );
  assert.deepEqual(
    validateLocalBackupCreatePassphrase("e\u0301".repeat(12), "é".repeat(12)),
    { ok: false, code: "PASSPHRASE_MISMATCH" },
  );
  assert.deepEqual(validateLocalBackupRestorePassphrase("short"), {
    ok: false,
    code: "AUTHENTICATION_FAILED",
  });
});

test("creates and decrypts an authenticated version-one backup", async () => {
  const encrypted = await createEncryptedFixture();
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;

  const parsed = parseLocalBackupFile({
    fileName: encrypted.fileName,
    fileSize: encrypted.bytes.byteLength,
    bytes: encrypted.bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(
    Array.from(parsed.envelope.salt),
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    Array.from(parsed.envelope.iv),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );

  const decrypted = await decryptLocalBackup(
    {
      envelope: parsed.envelope,
      passphrase: validPassphrase,
      currentScopeFingerprint: "user-scope-test",
    },
    deterministicRuntime(),
  );

  assert.equal(decrypted.ok, true);
  if (!decrypted.ok) return;
  assert.equal(decrypted.candidate.preview.libraryBooks, 1);
  assert.equal(decrypted.candidate.preview.readerSelections, 2);
  assert.equal(decrypted.candidate.sourceScopeFingerprint, "user-scope-test");
  assert.equal(decrypted.candidate.inspectedScopeFingerprint, "user-scope-test");
});

test("uses fresh random salt and IV for every encrypted backup", async () => {
  let call = 0;
  const runtime: LocalBackupCryptoRuntime = {
    subtle: globalThis.crypto.subtle,
    getRandomValues(bytes) {
      call += 1;
      bytes.fill(call);
      return bytes;
    },
  };

  const first = await createEncryptedFixture(runtime);
  const second = await createEncryptedFixture(runtime);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  const firstEnvelope = parseEncryptedFixture(first.fileName, first.bytes);
  const secondEnvelope = parseEncryptedFixture(second.fileName, second.bytes);
  assert.notDeepEqual(firstEnvelope.salt, secondEnvelope.salt);
  assert.notDeepEqual(firstEnvelope.iv, secondEnvelope.iv);
});

test("folds wrong passwords, ciphertext changes, truncation, and AAD changes into authentication failure", async () => {
  const encrypted = await createEncryptedFixture();
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;
  const envelope = parseEncryptedFixture(encrypted.fileName, encrypted.bytes);

  const wrongPassword = await decryptLocalBackup(
    {
      envelope,
      passphrase: "完全不同的备份口令甲乙丙丁",
      currentScopeFingerprint: "user-scope-test",
    },
    deterministicRuntime(),
  );
  assert.deepEqual(wrongPassword, { ok: false, code: "AUTHENTICATION_FAILED" });

  const changedCiphertext = cloneEnvelope(envelope);
  changedCiphertext.ciphertext[0] ^= 1;
  const changed = await decryptLocalBackup(
    {
      envelope: changedCiphertext,
      passphrase: validPassphrase,
      currentScopeFingerprint: "user-scope-test",
    },
    deterministicRuntime(),
  );
  assert.deepEqual(changed, { ok: false, code: "AUTHENTICATION_FAILED" });

  const truncated = cloneEnvelope(envelope);
  truncated.ciphertext = truncated.ciphertext.slice(0, -1);
  assert.deepEqual(
    await decryptLocalBackup(
      {
        envelope: truncated,
        passphrase: validPassphrase,
        currentScopeFingerprint: "user-scope-test",
      },
      deterministicRuntime(),
    ),
    { ok: false, code: "AUTHENTICATION_FAILED" },
  );

  const changedMetadata = cloneEnvelope(envelope);
  changedMetadata.metadata = {
    ...changedMetadata.metadata,
    createdAt: "2026-07-21T09:00:01.000Z",
  };
  assert.deepEqual(
    await decryptLocalBackup(
      {
        envelope: changedMetadata,
        passphrase: validPassphrase,
        currentScopeFingerprint: "user-scope-test",
      },
      deterministicRuntime(),
    ),
    { ok: false, code: "AUTHENTICATION_FAILED" },
  );
});

test("checks the current account scope only after successful authentication", async () => {
  const encrypted = await createEncryptedFixture();
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;
  const envelope = parseEncryptedFixture(encrypted.fileName, encrypted.bytes);

  assert.deepEqual(
    await decryptLocalBackup(
      {
        envelope,
        passphrase: validPassphrase,
        currentScopeFingerprint: "user-another-scope",
      },
      deterministicRuntime(),
    ),
    { ok: false, code: "SCOPE_MISMATCH" },
  );

  const changedScopeMetadata = cloneEnvelope(envelope);
  changedScopeMetadata.metadata = {
    ...changedScopeMetadata.metadata,
    sourceScopeFingerprint: "user-another-scope",
  };
  assert.deepEqual(
    await decryptLocalBackup(
      {
        envelope: changedScopeMetadata,
        passphrase: validPassphrase,
        currentScopeFingerprint: "user-another-scope",
      },
      deterministicRuntime(),
    ),
    { ok: false, code: "AUTHENTICATION_FAILED" },
  );
});

test("keeps the crypto module local, fixed, non-extractable, and cleanup-aware", () => {
  const source = readFileSync("src/lib/backup/local-backup-crypto.ts", "utf8");

  assert.match(source, /600_000/u);
  assert.match(source, /SHA-256/u);
  assert.match(source, /AES-GCM/u);
  assert.match(source, /importKey\("raw",[\s\S]*"PBKDF2", false, \["deriveKey"\]\)/u);
  assert.match(source, /\{ name: "AES-GCM", length: 256 \},\s*false,/u);
  assert.match(source, /\.fill\(0\)/u);
  assert.doesNotMatch(source, /Math\.random|fetch\(|XMLHttpRequest|WebSocket|console\./u);
  assert.doesNotMatch(source, /from ["'][^"']*(?:crypto-js|noble|sjcl|forge)/u);
});

async function createEncryptedFixture(runtime = deterministicRuntime()) {
  const payload = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(payload.ok, true);
  if (!payload.ok) throw new Error("expected valid local backup fixture");

  return encryptLocalBackup(
    {
      payload: payload.payload,
      passphrase: validPassphrase,
      confirmation: validPassphrase,
      sourceScopeFingerprint: "user-scope-test",
      now: new Date(2026, 6, 21, 17, 0, 0),
    },
    runtime,
  );
}

function deterministicRuntime(): LocalBackupCryptoRuntime {
  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues(bytes) {
      bytes.forEach((_, index) => {
        bytes[index] = index + 1;
      });
      return bytes;
    },
  };
}

function parseEncryptedFixture(fileName: string, bytes: Uint8Array) {
  const parsed = parseLocalBackupFile({ fileName, fileSize: bytes.byteLength, bytes });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected valid encrypted fixture");
  return parsed.envelope;
}

function cloneEnvelope(envelope: ParsedLocalBackupEnvelope): ParsedLocalBackupEnvelope {
  return {
    metadata: structuredClone(envelope.metadata),
    salt: envelope.salt.slice(),
    iv: envelope.iv.slice(),
    ciphertext: envelope.ciphertext.slice(),
  };
}
