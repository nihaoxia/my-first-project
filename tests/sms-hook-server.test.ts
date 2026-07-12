import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createSmsHookServer } from "../src/server/sms-hook/server.ts";
import { createTencentSmsSender } from "../src/server/sms-hook/tencent-sms-provider.ts";

const secretBase64 = Buffer.alloc(32, 7).toString("base64");
const now = 1_788_000_000;

function signedHeaders(rawBody: string) {
  const id = "msg_server_test";
  const signature = createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${id}.${now}.${rawBody}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(now),
    "webhook-signature": `v1,${signature}`,
  };
}

async function withServer(
  dependencies: Parameters<typeof createSmsHookServer>[0],
  run: (origin: string) => Promise<void>,
) {
  const server = createSmsHookServer(dependencies);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  try {
    await run(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    );
  }
}

function dependencies(overrides: Partial<Parameters<typeof createSmsHookServer>[0]> = {}) {
  return {
    configured: true,
    webhookSecretBase64: secretBase64,
    nowUnixSeconds: () => now,
    send: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
}

test("health exposes only stable readiness and routing has fixed errors", async () => {
  await withServer(dependencies(), async (origin) => {
    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", configured: true });

    const method = await fetch(`${origin}/hooks/send-sms`, { method: "GET" });
    assert.equal(method.status, 405);
    assert.deepEqual(await method.json(), { error: { code: "METHOD_NOT_ALLOWED" } });

    const missing = await fetch(`${origin}/unknown`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: { code: "NOT_FOUND" } });
  });
});

test("SMS hook rejects missing authentication before buffering or calling the provider", async () => {
  let providerCalls = 0;
  await withServer(dependencies({ send: async () => { providerCalls += 1; } }), async (origin) => {
    const response = await fetch(`${origin}/hooks/send-sms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(9_000),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: "UNAUTHORIZED" } });
    assert.equal(providerCalls, 0);
  });
});

test("SMS hook returns 204 for a valid Supabase request", async () => {
  const rawBody = JSON.stringify({
    user: { phone: "+8613800000000" },
    sms: { otp: "123456" },
  });
  const sent: unknown[] = [];
  await withServer(dependencies({ send: async (message) => { sent.push(message); } }), async (origin) => {
    const response = await fetch(`${origin}/hooks/send-sms`, {
      method: "POST",
      headers: signedHeaders(rawBody),
      body: rawBody,
    });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  });
  assert.deepEqual(sent, [{ phone: "+8613800000000", token: "123456" }]);
});

test("provider failures return a redacted 503 response and redacted logs", async () => {
  const phone = "+8613800000000";
  const otp = "123456";
  const providerSecret = "provider-secret-response";
  const rawBody = JSON.stringify({ user: { phone }, sms: { otp } });
  const logs: unknown[] = [];
  await withServer(dependencies({
    send: async () => { throw new Error(providerSecret); },
    log: (event) => { logs.push(event); },
  }), async (origin) => {
    const response = await fetch(`${origin}/hooks/send-sms`, {
      method: "POST",
      headers: signedHeaders(rawBody),
      body: rawBody,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "PROVIDER_UNAVAILABLE" } });
  });
  const serialized = JSON.stringify(logs);
  for (const value of [phone, otp, providerSecret, secretBase64]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("Tencent provider sends only the approved OTP template parameters", async () => {
  const requests: unknown[] = [];
  const sender = createTencentSmsSender({
    sdkAppId: "1400123456",
    signName: "流浪书页",
    templateId: "1234567",
    client: {
      async SendSms(request) {
        requests.push(request);
        return { SendStatusSet: [{ Code: "Ok" }] };
      },
    },
  });

  await sender({ phone: "+8613800000000", token: "123456" });
  assert.deepEqual(requests, [{
    SmsSdkAppId: "1400123456",
    SignName: "流浪书页",
    TemplateId: "1234567",
    PhoneNumberSet: ["+8613800000000"],
    TemplateParamSet: ["123456"],
  }]);
});

test("Tencent provider converts SDK rejection and non-Ok statuses to a stable error", async () => {
  for (const client of [
    { SendSms: async () => { throw new Error("sdk-secret-message"); } },
    { SendSms: async () => ({ SendStatusSet: [{ Code: "Failed", Message: "secret response" }] }) },
    { SendSms: async () => ({ SendStatusSet: [] }) },
  ]) {
    const sender = createTencentSmsSender({
      sdkAppId: "1400123456",
      signName: "流浪书页",
      templateId: "1234567",
      client,
    });
    await assert.rejects(
      sender({ phone: "+8613800000000", token: "123456" }),
      (error: unknown) => {
        assert.deepEqual(error, { code: "SMS_PROVIDER_FAILED" });
        assert.equal(JSON.stringify(error).includes("secret"), false);
        return true;
      },
    );
  }
});
