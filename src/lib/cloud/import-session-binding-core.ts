import { createHmac, timingSafeEqual } from "node:crypto";

export const CLOUD_IMPORT_SESSION_BINDING_TTL_MS = 30 * 60 * 1_000;
const PURPOSE = "stray-pages:local-study-cloud-import";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAC = /^[A-Za-z0-9_-]{43}$/u;

type BindingInput = {
  userId: string;
  secret: string;
  now?: Date;
};

export function createCloudImportSessionBinding(input: BindingInput): string {
  assertInputs(input.userId, input.secret);
  const issuedAtMs = (input.now ?? new Date()).getTime();
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < 0) throw new Error("INVALID_IMPORT_SESSION_BINDING");
  const issuedAt = Math.floor(issuedAtMs / 1_000);
  const expiresAt = Math.floor((issuedAtMs + CLOUD_IMPORT_SESSION_BINDING_TTL_MS) / 1_000);
  const payload = `v1.${issuedAt}.${expiresAt}`;
  return `${payload}.${sign(input.secret, input.userId, payload)}`;
}

export function verifyCloudImportSessionBinding(input: BindingInput & { token: string }): boolean {
  try {
    assertInputs(input.userId, input.secret);
    if (typeof input.token !== "string" || input.token.length > 128) return false;
    const parts = input.token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || !/^\d{10}$/u.test(parts[1]) || !/^\d{10}$/u.test(parts[2]) || !MAC.test(parts[3])) return false;
    const issuedAt = Number(parts[1]);
    const expiresAt = Number(parts[2]);
    if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt - issuedAt !== CLOUD_IMPORT_SESSION_BINDING_TTL_MS / 1_000) return false;
    const nowMs = (input.now ?? new Date()).getTime();
    if (!Number.isFinite(nowMs) || nowMs < issuedAt * 1_000 - 60_000 || nowMs > expiresAt * 1_000) return false;
    const payload = parts.slice(0, 3).join(".");
    const expected = Buffer.from(sign(input.secret, input.userId, payload));
    const actual = Buffer.from(parts[3]);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(secret: string, userId: string, payload: string): string {
  return createHmac("sha256", secret)
    .update(`${PURPOSE}\u0000${userId}\u0000${payload}`, "utf8")
    .digest("base64url");
}

function assertInputs(userId: string, secret: string): void {
  if (!UUID.test(userId) || typeof secret !== "string" || secret.length < 64 || secret.length > 512) {
    throw new Error("INVALID_IMPORT_SESSION_BINDING");
  }
}
