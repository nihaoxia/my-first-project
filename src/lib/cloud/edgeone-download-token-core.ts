import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { parseOriginalBookObjectPath } from "./storage-core.ts";

export type EdgeOneDownloadToken = {
  payload: string;
  signature: string;
};

export class EdgeOneDownloadTokenError extends Error {
  readonly code: "INVALID_DOWNLOAD_TOKEN" | "DOWNLOAD_TOKEN_EXPIRED";

  constructor(code: "INVALID_DOWNLOAD_TOKEN" | "DOWNLOAD_TOKEN_EXPIRED") {
    super(code);
    this.code = code;
    this.name = "EdgeOneDownloadTokenError";
  }
}

function invalid(): never {
  throw new EdgeOneDownloadTokenError("INVALID_DOWNLOAD_TOKEN");
}

function base64UrlEncode(value: string): string {
  const bytes = utf8ToBytes(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) invalid();
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    return invalid();
  }
}

function assertSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length < 64 || secret.length > 512) invalid();
}

function sign(payload: string, secret: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) return false;
  const a = hexToBytes(left);
  const b = hexToBytes(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function createEdgeOneDownloadToken(input: {
  objectPath: string;
  expiresAt: number;
  nonce: string;
  secret: string;
}): EdgeOneDownloadToken {
  assertSecret(input.secret);
  if (
    !parseOriginalBookObjectPath(input.objectPath) ||
    !Number.isSafeInteger(input.expiresAt) ||
    !/^[A-Za-z0-9_-]{12,128}$/u.test(input.nonce)
  ) invalid();
  const payload = base64UrlEncode(JSON.stringify({
    p: input.objectPath,
    e: input.expiresAt,
    n: input.nonce,
  }));
  return { payload, signature: sign(payload, input.secret) };
}

export function verifyEdgeOneDownloadToken(
  token: EdgeOneDownloadToken,
  input: { now: Date; secret: string; expectedUserId: string },
): { objectPath: string } {
  assertSecret(input.secret);
  if (
    !token ||
    typeof token.payload !== "string" ||
    typeof token.signature !== "string" ||
    !equalHex(token.signature, sign(token.payload, input.secret)) ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) invalid();
  let decoded: unknown;
  try { decoded = JSON.parse(base64UrlDecode(token.payload)); } catch { return invalid(); }
  if (!decoded || typeof decoded !== "object") invalid();
  const value = decoded as { p?: unknown; e?: unknown; n?: unknown };
  if (
    typeof value.p !== "string" ||
    !Number.isSafeInteger(value.e) ||
    typeof value.n !== "string" ||
    !/^[A-Za-z0-9_-]{12,128}$/u.test(value.n)
  ) invalid();
  const path = parseOriginalBookObjectPath(value.p);
  if (!path || path.userId !== input.expectedUserId) invalid();
  const nowSeconds = Math.floor(input.now.getTime() / 1000);
  if ((value.e as number) <= nowSeconds) {
    throw new EdgeOneDownloadTokenError("DOWNLOAD_TOKEN_EXPIRED");
  }
  if ((value.e as number) - nowSeconds > 60) invalid();
  return { objectPath: value.p };
}
