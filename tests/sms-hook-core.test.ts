import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleSendSmsHook } from "../src/server/sms-hook/hook-core.ts";

const secretBase64 = Buffer.alloc(32, 3).toString("base64");
const now = 1_788_000_000;

function payload(phone = "+8613800000000", otp = "123456") {
  return JSON.stringify({ user: { phone }, sms: { otp } });
}

function signedHeaders(rawBody: string, timestamp = now, signatures?: string[]) {
  const webhookId = "msg_test";
  const signature = createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest("base64");
  return new Headers({
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": (signatures ?? [`v1,${signature}`]).join(" "),
  });
}

function invoke(overrides: Partial<Parameters<typeof handleSendSmsHook>[0]> = {}) {
  const rawBody = overrides.rawBody ?? payload();
  return handleSendSmsHook({
    rawBody,
    headers: overrides.headers ?? signedHeaders(rawBody),
    webhookSecretBase64: secretBase64,
    nowUnixSeconds: now,
    send: async () => undefined,
    ...overrides,
  });
}

test("verifies Standard Webhooks and sends only the normalized phone and OTP", async () => {
  const rawBody = payload();
  const sent: Array<{ phone: string; token: string }> = [];
  const result = await invoke({
    rawBody,
    headers: signedHeaders(rawBody),
    send: async (message) => { sent.push(message); },
  });

  assert.deepEqual(result, { status: 204, code: "OK" });
  assert.deepEqual(sent, [{ phone: "+8613800000000", token: "123456" }]);
  assert.equal(JSON.stringify(result).includes("13800000000"), false);
  assert.equal(JSON.stringify(result).includes("123456"), false);
});

test("accepts one valid signature among multiple v1 signatures", async () => {
  const rawBody = payload();
  const valid = signedHeaders(rawBody).get("webhook-signature")!;
  const headers = signedHeaders(rawBody, now, ["v1,AAAA", valid, "v2,ignored"]);
  assert.deepEqual(await invoke({ rawBody, headers }), { status: 204, code: "OK" });
});

test("rejects missing or malformed webhook headers before calling the provider", async () => {
  for (const headers of [
    new Headers(),
    new Headers({ "webhook-id": "msg_test", "webhook-timestamp": String(now), "webhook-signature": "invalid" }),
    new Headers({ "webhook-id": "bad id", "webhook-timestamp": String(now), "webhook-signature": "v1,AAAA" }),
  ]) {
    let calls = 0;
    const result = await invoke({ headers, send: async () => { calls += 1; } });
    assert.deepEqual(result, { status: 401, code: "UNAUTHORIZED" });
    assert.equal(calls, 0);
  }
});

test("rejects an invalid signature without calling the provider", async () => {
  let calls = 0;
  const rawBody = payload();
  const headers = signedHeaders(`${rawBody}tampered`);
  assert.deepEqual(await invoke({ rawBody, headers, send: async () => { calls += 1; } }), {
    status: 401,
    code: "UNAUTHORIZED",
  });
  assert.equal(calls, 0);
});

test("rejects timestamps outside the five minute window", async () => {
  for (const timestamp of [now - 301, now + 301]) {
    const rawBody = payload();
    assert.deepEqual(await invoke({ rawBody, headers: signedHeaders(rawBody, timestamp) }), {
      status: 401,
      code: "STALE_REQUEST",
    });
  }
});

test("rejects oversized, malformed and duplicate-key JSON after verification", async () => {
  const bodies = [
    "x".repeat(8 * 1024 + 1),
    "{not-json}",
    '{"user":{"phone":"+8613800000000","phone":"+8613900000000"},"sms":{"otp":"123456"}}',
  ];
  for (const rawBody of bodies) {
    assert.deepEqual(await invoke({ rawBody, headers: signedHeaders(rawBody) }), {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }
});

test("accepts only a mainland E.164 phone and a six digit OTP", async () => {
  for (const rawBody of [
    payload("13800000000"),
    payload("+85291234567"),
    payload("+8613800000000", "12345"),
    payload("+8613800000000", "12345a"),
    JSON.stringify({ user: { phone: "+8613800000000", extra: true }, sms: { otp: "123456" } }),
  ]) {
    assert.deepEqual(await invoke({ rawBody, headers: signedHeaders(rawBody) }), {
      status: 400,
      code: "INVALID_REQUEST",
    });
  }
});

test("maps provider failures to a stable response without leaking the cause", async () => {
  const secret = "provider-secret-that-must-not-leak";
  const result = await invoke({ send: async () => { throw new Error(secret); } });
  assert.deepEqual(result, { status: 503, code: "PROVIDER_UNAVAILABLE" });
  assert.equal(JSON.stringify(result).includes(secret), false);
});
