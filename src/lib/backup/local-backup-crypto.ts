import {
  buildLocalBackupFile,
  buildLocalBackupMetadata,
  buildLocalBackupPreview,
  localBackupGcmTagBits,
  localBackupMimeType,
  parseLocalBackupPayloadBytes,
  serializeLocalBackupAdditionalData,
  serializeLocalBackupPayload,
  type LocalBackupPayloadV1,
  type LocalBackupPreview,
  type ParsedLocalBackupEnvelope,
} from "./local-backup-core.ts";

export type LocalBackupCreatePassphraseErrorCode =
  | "PASSPHRASE_TOO_SHORT"
  | "PASSPHRASE_TOO_LONG"
  | "PASSPHRASE_MISMATCH"
  | "PASSPHRASE_INVALID_UNICODE";

export type LocalBackupCryptoRuntime = {
  subtle: SubtleCrypto;
  getRandomValues(bytes: Uint8Array): Uint8Array;
};

export type LocalBackupEncryptionResult =
  | {
      ok: true;
      fileName: string;
      mimeType: typeof localBackupMimeType;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      code:
        | LocalBackupCreatePassphraseErrorCode
        | "PAYLOAD_TOO_LARGE"
        | "CIPHERTEXT_TOO_LARGE"
        | "FILE_TOO_LARGE"
        | "CRYPTO_UNAVAILABLE";
    };

export type LocalBackupRestoreCandidate = {
  payload: LocalBackupPayloadV1;
  preview: LocalBackupPreview;
  createdAt: string;
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
};

export type LocalBackupDecryptionResult =
  | { ok: true; candidate: LocalBackupRestoreCandidate }
  | {
      ok: false;
      code:
        | "AUTHENTICATION_FAILED"
        | "SCOPE_MISMATCH"
        | "INVALID_DATA"
        | "CRYPTO_UNAVAILABLE";
    };

export function validateLocalBackupCreatePassphrase(
  passphrase: string,
  confirmation: string,
): { ok: true } | { ok: false; code: LocalBackupCreatePassphraseErrorCode } {
  if (!isWellFormedUnicode(passphrase) || !isWellFormedUnicode(confirmation)) {
    return { ok: false, code: "PASSPHRASE_INVALID_UNICODE" };
  }

  if (passphrase !== confirmation) {
    return { ok: false, code: "PASSPHRASE_MISMATCH" };
  }

  const length = Array.from(passphrase).length;
  if (length < 12) return { ok: false, code: "PASSPHRASE_TOO_SHORT" };
  if (length > 128) return { ok: false, code: "PASSPHRASE_TOO_LONG" };
  return { ok: true };
}

export function validateLocalBackupRestorePassphrase(
  passphrase: string,
): { ok: true } | { ok: false; code: "AUTHENTICATION_FAILED" } {
  const length = Array.from(passphrase).length;
  return isWellFormedUnicode(passphrase) && length >= 12 && length <= 128
    ? { ok: true }
    : { ok: false, code: "AUTHENTICATION_FAILED" };
}

export function createBrowserLocalBackupCryptoRuntime(): LocalBackupCryptoRuntime {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new Error("Web Crypto unavailable");
  }

  return {
    subtle: webCrypto.subtle,
    getRandomValues(bytes) {
      webCrypto.getRandomValues(bytes);
      return bytes;
    },
  };
}

export async function encryptLocalBackup(
  input: {
    payload: LocalBackupPayloadV1;
    passphrase: string;
    confirmation: string;
    sourceScopeFingerprint: string;
    now: Date;
  },
  providedRuntime?: LocalBackupCryptoRuntime,
): Promise<LocalBackupEncryptionResult> {
  const validation = validateLocalBackupCreatePassphrase(
    input.passphrase,
    input.confirmation,
  );
  if (!validation.ok) return validation;

  let runtime: LocalBackupCryptoRuntime;
  try {
    runtime = providedRuntime ?? createBrowserLocalBackupCryptoRuntime();
  } catch {
    return { ok: false, code: "CRYPTO_UNAVAILABLE" };
  }

  let passwordBytes: Uint8Array<ArrayBuffer> | undefined;
  let payloadBytes: Uint8Array<ArrayBuffer> | undefined;
  let salt: Uint8Array<ArrayBuffer> | undefined;
  let iv: Uint8Array<ArrayBuffer> | undefined;
  let additionalData: Uint8Array<ArrayBuffer> | undefined;
  let ciphertext: Uint8Array<ArrayBuffer> | undefined;

  try {
    const serialized = serializeLocalBackupPayload(input.payload);
    if (!serialized.ok) return serialized;
    payloadBytes = moveToCryptoBytes(serialized.bytes);
    passwordBytes = new TextEncoder().encode(input.passphrase);
    salt = new Uint8Array(16);
    iv = new Uint8Array(12);
    runtime.getRandomValues(salt);
    runtime.getRandomValues(iv);

    const metadata = buildLocalBackupMetadata({
      createdAt: input.now.toISOString(),
      sourceScopeFingerprint: input.sourceScopeFingerprint,
      salt,
      iv,
    });
    additionalData = moveToCryptoBytes(serializeLocalBackupAdditionalData(metadata));
    const key = await deriveAesKey(runtime.subtle, passwordBytes, salt, "encrypt");
    const encrypted = await runtime.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData,
        tagLength: localBackupGcmTagBits,
      },
      key,
      payloadBytes,
    );
    ciphertext = new Uint8Array(encrypted);

    return buildLocalBackupFile({ metadata, ciphertext, now: input.now });
  } catch {
    return { ok: false, code: "CRYPTO_UNAVAILABLE" };
  } finally {
    passwordBytes?.fill(0);
    payloadBytes?.fill(0);
    salt?.fill(0);
    iv?.fill(0);
    additionalData?.fill(0);
    ciphertext?.fill(0);
  }
}

export async function decryptLocalBackup(
  input: {
    envelope: ParsedLocalBackupEnvelope;
    passphrase: string;
    currentScopeFingerprint: string;
  },
  providedRuntime?: LocalBackupCryptoRuntime,
): Promise<LocalBackupDecryptionResult> {
  const validation = validateLocalBackupRestorePassphrase(input.passphrase);
  if (!validation.ok) return validation;

  let runtime: LocalBackupCryptoRuntime;
  try {
    runtime = providedRuntime ?? createBrowserLocalBackupCryptoRuntime();
  } catch {
    return { ok: false, code: "CRYPTO_UNAVAILABLE" };
  }

  let passwordBytes: Uint8Array<ArrayBuffer> | undefined;
  let salt: Uint8Array<ArrayBuffer> | undefined;
  let iv: Uint8Array<ArrayBuffer> | undefined;
  let additionalData: Uint8Array<ArrayBuffer> | undefined;
  let ciphertext: Uint8Array<ArrayBuffer> | undefined;
  let plaintextBytes: Uint8Array<ArrayBuffer> | undefined;

  try {
    passwordBytes = new TextEncoder().encode(input.passphrase);
    salt = Uint8Array.from(input.envelope.salt);
    iv = Uint8Array.from(input.envelope.iv);
    ciphertext = Uint8Array.from(input.envelope.ciphertext);
    additionalData = moveToCryptoBytes(
      serializeLocalBackupAdditionalData(input.envelope.metadata),
    );
    const key = await deriveAesKey(
      runtime.subtle,
      passwordBytes,
      salt,
      "decrypt",
    );
    const decrypted = await runtime.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData,
        tagLength: localBackupGcmTagBits,
      },
      key,
      ciphertext,
    );
    plaintextBytes = new Uint8Array(decrypted);

    if (input.envelope.metadata.sourceScopeFingerprint !== input.currentScopeFingerprint) {
      return { ok: false, code: "SCOPE_MISMATCH" };
    }

    const parsed = parseLocalBackupPayloadBytes(plaintextBytes);
    if (!parsed.ok) return { ok: false, code: "INVALID_DATA" };

    return {
      ok: true,
      candidate: {
        payload: parsed.payload,
        preview: buildLocalBackupPreview(input.envelope.metadata.createdAt, parsed.payload),
        createdAt: input.envelope.metadata.createdAt,
        sourceScopeFingerprint: input.envelope.metadata.sourceScopeFingerprint,
        inspectedScopeFingerprint: input.currentScopeFingerprint,
      },
    };
  } catch {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  } finally {
    passwordBytes?.fill(0);
    salt?.fill(0);
    iv?.fill(0);
    additionalData?.fill(0);
    ciphertext?.fill(0);
    plaintextBytes?.fill(0);
  }
}

async function deriveAesKey(
  subtle: SubtleCrypto,
  passwordBytes: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  usage: "encrypt" | "decrypt",
) {
  const material = await subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function moveToCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = Uint8Array.from(bytes);
  bytes.fill(0);
  return copy;
}

function isWellFormedUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
