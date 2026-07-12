import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SMS_HOOK_BODY_BYTES = 8 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export type SmsHookResult =
  | { status: 204; code: "OK" }
  | { status: 400; code: "INVALID_REQUEST" }
  | { status: 401; code: "UNAUTHORIZED" | "STALE_REQUEST" }
  | { status: 503; code: "PROVIDER_UNAVAILABLE" };

export type SendSmsMessage = { phone: string; token: string };

export async function handleSendSmsHook(input: {
  rawBody: string;
  headers: Headers;
  webhookSecretBase64: string;
  nowUnixSeconds: number;
  send(message: SendSmsMessage): Promise<void>;
}): Promise<SmsHookResult> {
  const headerResult = parseWebhookHeaders(input.headers);
  if (!headerResult) return { status: 401, code: "UNAUTHORIZED" };
  if (Math.abs(input.nowUnixSeconds - headerResult.timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    return { status: 401, code: "STALE_REQUEST" };
  }
  if (!verifySignature({
    ...headerResult,
    rawBody: input.rawBody,
    secretBase64: input.webhookSecretBase64,
  })) {
    return { status: 401, code: "UNAUTHORIZED" };
  }
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_SMS_HOOK_BODY_BYTES) {
    return { status: 400, code: "INVALID_REQUEST" };
  }

  const message = parsePayload(input.rawBody);
  if (!message) return { status: 400, code: "INVALID_REQUEST" };

  try {
    await input.send(message);
    return { status: 204, code: "OK" };
  } catch {
    return { status: 503, code: "PROVIDER_UNAVAILABLE" };
  }
}

function parseWebhookHeaders(headers: Headers) {
  const webhookId = headers.get("webhook-id");
  const timestampText = headers.get("webhook-timestamp");
  const signatureText = headers.get("webhook-signature");
  if (
    !webhookId ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(webhookId) ||
    !timestampText ||
    !/^\d{1,12}$/.test(timestampText) ||
    !signatureText
  ) return null;

  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp)) return null;
  const signatures = signatureText
    .trim()
    .split(/\s+/)
    .filter((item) => item.startsWith("v1,"))
    .map((item) => item.slice(3));
  if (signatures.length === 0) return null;
  return { webhookId, timestamp, signatures };
}

function verifySignature(input: {
  webhookId: string;
  timestamp: number;
  signatures: string[];
  rawBody: string;
  secretBase64: string;
}) {
  let secret: Buffer;
  try {
    secret = Buffer.from(input.secretBase64, "base64");
  } catch {
    return false;
  }
  if (secret.length < 32) return false;
  const expected = createHmac("sha256", secret)
    .update(`${input.webhookId}.${input.timestamp}.${input.rawBody}`)
    .digest();

  return input.signatures.some((signature) => {
    let actual: Buffer;
    try {
      actual = Buffer.from(signature, "base64");
    } catch {
      return false;
    }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

function parsePayload(rawBody: string): SendSmsMessage | null {
  if (hasDuplicateObjectKeys(rawBody)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isExactRecord(payload, ["user", "sms"])) return null;
  if (!isExactRecord(payload.user, ["phone"]) || !isExactRecord(payload.sms, ["otp"])) {
    return null;
  }
  const phone = payload.user.phone;
  const token = payload.sms.otp;
  if (typeof phone !== "string" || !/^\+861\d{10}$/.test(phone)) return null;
  if (typeof token !== "string" || !/^\d{6}$/.test(token)) return null;
  return { phone, token };
}

function isExactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function hasDuplicateObjectKeys(text: string) {
  const stack: Array<
    | { type: "object"; keys: Set<string>; expectingKey: boolean }
    | { type: "array" }
  > = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") { index += 2; continue; }
        if (text[index] === '"') break;
        index += 1;
      }
      if (index >= text.length) return false;
      const frame = stack.at(-1);
      if (frame?.type === "object" && frame.expectingKey) {
        let key: string;
        try { key = JSON.parse(text.slice(start, index + 1)) as string; }
        catch { return false; }
        if (frame.keys.has(key)) return true;
        frame.keys.add(key);
        frame.expectingKey = false;
      }
      continue;
    }
    if (char === "{") stack.push({ type: "object", keys: new Set(), expectingKey: true });
    else if (char === "[") stack.push({ type: "array" });
    else if (char === "}" || char === "]") stack.pop();
    else if (char === ",") {
      const frame = stack.at(-1);
      if (frame?.type === "object") frame.expectingKey = true;
    }
  }
  return false;
}
