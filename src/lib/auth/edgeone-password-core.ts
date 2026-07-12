import { hmac } from "@noble/hashes/hmac.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

export type PasswordHash = {
  algorithm: "scrypt";
  n: 32768;
  r: 8;
  p: 1;
  dkLen: 32;
  salt: string;
  digest: string;
};

type PasswordErrorCode =
  | "INVALID_USERNAME"
  | "INVALID_PASSWORD"
  | "INVALID_PASSWORD_HASH";

export class EdgeOnePasswordError extends Error {
  readonly code: PasswordErrorCode;

  constructor(code: PasswordErrorCode) {
    super(code);
    this.code = code;
    this.name = "EdgeOnePasswordError";
  }
}

const SCRYPT = { N: 32768, r: 8, p: 1, dkLen: 32, maxmem: 64 * 1024 * 1024 } as const;

function assertPassword(password: string): void {
  const length = typeof password === "string" ? Array.from(password).length : 0;
  if (length < 12 || length > 128) {
    throw new EdgeOnePasswordError("INVALID_PASSWORD");
  }
}

function assertRandomBytes(value: Uint8Array, length: number): void {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new EdgeOnePasswordError("INVALID_PASSWORD_HASH");
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function normalizeUsername(value: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9_]{3,32}$/u.test(normalized)) {
    throw new EdgeOnePasswordError("INVALID_USERNAME");
  }
  return normalized;
}

export function hashUsername(username: string, pepper: string): string {
  const normalized = normalizeUsername(username);
  if (typeof pepper !== "string" || pepper.length < 32) {
    throw new EdgeOnePasswordError("INVALID_USERNAME");
  }
  return bytesToHex(hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(normalized)));
}

export async function hashPassword(
  password: string,
  randomBytes: (length: number) => Uint8Array,
): Promise<PasswordHash> {
  assertPassword(password);
  const salt = randomBytes(16);
  assertRandomBytes(salt, 16);
  const digest = await scryptAsync(password, salt, SCRYPT);
  return {
    algorithm: "scrypt",
    n: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    dkLen: SCRYPT.dkLen,
    salt: bytesToHex(salt),
    digest: bytesToHex(digest),
  };
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  if (
    !stored ||
    stored.algorithm !== "scrypt" ||
    stored.n !== SCRYPT.N ||
    stored.r !== SCRYPT.r ||
    stored.p !== SCRYPT.p ||
    stored.dkLen !== SCRYPT.dkLen ||
    !/^[a-f0-9]{32}$/u.test(stored.salt) ||
    !/^[a-f0-9]{64}$/u.test(stored.digest)
  ) {
    throw new EdgeOnePasswordError("INVALID_PASSWORD_HASH");
  }
  assertPassword(password);
  const actual = await scryptAsync(password, hexToBytes(stored.salt), SCRYPT);
  return constantTimeEqual(actual, hexToBytes(stored.digest));
}

export function generateRecoveryCode(
  randomBytes: (length: number) => Uint8Array,
): string {
  const value = randomBytes(32);
  assertRandomBytes(value, 32);
  return bytesToBase64Url(value);
}

export function hashRecoveryCode(code: string): string {
  return bytesToHex(sha256(utf8ToBytes(code)));
}

