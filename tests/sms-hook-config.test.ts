import assert from "node:assert/strict";
import test from "node:test";

import { parseSmsHookConfig } from "../src/server/sms-hook/config.ts";

const hookSecretBase64 = Buffer.alloc(32, 7).toString("base64");
const validEnvironment = {
  SMS_HOOK_SECRET: `v1,whsec_${hookSecretBase64}`,
  TENCENTCLOUD_SECRET_ID: "test-secret-id-abcdefghijklmnopqrstuvwxyz",
  TENCENTCLOUD_SECRET_KEY: "abcdefghijklmnopqrstuvwxyz123456",
  TENCENT_SMS_SDK_APP_ID: "1400123456",
  TENCENT_SMS_SIGN_NAME: "流浪书页",
  TENCENT_SMS_TEMPLATE_ID: "1234567",
  TENCENT_SMS_REGION: "ap-guangzhou",
};

test("parses a complete Guangzhou SMS hook configuration", () => {
  const result = parseSmsHookConfig(validEnvironment);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    port: 9000,
    webhookSecretBase64: hookSecretBase64,
    secretId: validEnvironment.TENCENTCLOUD_SECRET_ID,
    secretKey: validEnvironment.TENCENTCLOUD_SECRET_KEY,
    sdkAppId: validEnvironment.TENCENT_SMS_SDK_APP_ID,
    signName: validEnvironment.TENCENT_SMS_SIGN_NAME,
    templateId: validEnvironment.TENCENT_SMS_TEMPLATE_ID,
    region: "ap-guangzhou",
  });
});

test("reports missing configuration keys without values", () => {
  const result = parseSmsHookConfig({ TENCENT_SMS_REGION: "ap-guangzhou" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "SMS_HOOK_NOT_CONFIGURED");
  assert.deepEqual(result.error.keys, [
    "SMS_HOOK_SECRET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID",
  ]);
});

test("rejects invalid secrets, identifiers, region, sign and port without leaking values", () => {
  const secretId = "leak-secret-id";
  const secretKey = "leak-secret-key";
  const hookSecret = "v1,whsec_secret-that-must-not-leak";
  const result = parseSmsHookConfig({
    ...validEnvironment,
    SMS_HOOK_SECRET: hookSecret,
    TENCENTCLOUD_SECRET_ID: secretId,
    TENCENTCLOUD_SECRET_KEY: secretKey,
    TENCENT_SMS_SDK_APP_ID: "app-id",
    TENCENT_SMS_SIGN_NAME: "bad\nsign",
    TENCENT_SMS_TEMPLATE_ID: "template-id",
    TENCENT_SMS_REGION: "ap-shanghai",
    SMS_HOOK_PORT: "65536",
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SMS_HOOK_CONFIG_INVALID");
    assert.deepEqual(result.error.keys, [
      "SMS_HOOK_SECRET",
      "TENCENTCLOUD_SECRET_ID",
      "TENCENTCLOUD_SECRET_KEY",
      "TENCENT_SMS_SDK_APP_ID",
      "TENCENT_SMS_SIGN_NAME",
      "TENCENT_SMS_TEMPLATE_ID",
      "TENCENT_SMS_REGION",
      "SMS_HOOK_PORT",
    ]);
  }
  for (const value of [secretId, secretKey, hookSecret]) {
    assert.equal(serialized.includes(value), false);
  }
});

test("requires a canonical base64 webhook secret containing at least 32 bytes", () => {
  for (const SMS_HOOK_SECRET of [
    Buffer.alloc(32, 1).toString("base64"),
    "v1,whsec_not-base64!",
    `v1,whsec_${Buffer.alloc(31, 1).toString("base64")}`,
  ]) {
    const result = parseSmsHookConfig({ ...validEnvironment, SMS_HOOK_SECRET });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error.keys, ["SMS_HOOK_SECRET"]);
  }
});

test("accepts only integer ports from 1 through 65535", () => {
  for (const SMS_HOOK_PORT of ["0", "12.5", "65536", "not-a-port"]) {
    const result = parseSmsHookConfig({ ...validEnvironment, SMS_HOOK_PORT });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error.keys, ["SMS_HOOK_PORT"]);
  }
  const valid = parseSmsHookConfig({ ...validEnvironment, SMS_HOOK_PORT: "9443" });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.port, 9443);
});
