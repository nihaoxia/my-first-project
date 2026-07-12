import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseAuthService,
  normalizePhoneForSupabase,
} from "../src/lib/auth/supabase-auth-service-core.ts";

test("normalizes mainland phone numbers and sends an OTP without a fixed token", async () => {
  let payload: unknown;
  const service = createSupabaseAuthService({
    async signInWithOtp(input) { payload = input; return { error: null }; },
    async verifyOtp() { return { error: null }; },
    async signOut() { return { error: null }; },
  });
  assert.equal(normalizePhoneForSupabase(" +86 138 1111 2222 "), "+8613811112222");
  assert.deepEqual(await service.sendOtp("13811112222"), { ok: true });
  assert.deepEqual(payload, { phone: "+8613811112222" });
});

test("verifies a six-digit token using the sms OTP type", async () => {
  let payload: unknown;
  const service = createSupabaseAuthService({
    async signInWithOtp() { return { error: null }; },
    async verifyOtp(input) { payload = input; return { error: null }; },
    async signOut() { return { error: null }; },
  });
  assert.deepEqual(await service.verifyOtp("13811112222", " 654321 "), { ok: true });
  assert.deepEqual(payload, { phone: "+8613811112222", token: "654321", type: "sms" });
});

test("rejects invalid phone numbers and tokens before calling Supabase", async () => {
  let calls = 0;
  const service = createSupabaseAuthService({
    async signInWithOtp() { calls += 1; return { error: null }; },
    async verifyOtp() { calls += 1; return { error: null }; },
    async signOut() { return { error: null }; },
  });
  assert.deepEqual(await service.sendOtp("123"), {
    ok: false,
    error: { code: "INVALID_PHONE", message: "请输入有效的中国大陆手机号。", retryable: false },
  });
  assert.deepEqual(await service.verifyOtp("13811112222", "abc"), {
    ok: false,
    error: { code: "INVALID_OTP", message: "请输入 6 位短信验证码。", retryable: false },
  });
  assert.equal(calls, 0);
});

test("maps provider failures to stable redacted errors", async () => {
  const secret = "service-role-secret";
  const phone = "+8613811112222";
  const service = createSupabaseAuthService({
    async signInWithOtp() { return { error: { message: `rate limit ${phone} ${secret}`, status: 429 } }; },
    async verifyOtp() { return { error: { message: `invalid ${phone} ${secret}`, status: 400 } }; },
    async signOut() { return { error: { message: secret, status: 500 } }; },
  });
  const send = await service.sendOtp("13811112222");
  const verify = await service.verifyOtp("13811112222", "123456");
  const signOut = await service.signOut();
  assert.deepEqual(send, { ok: false, error: { code: "OTP_RATE_LIMITED", message: "验证码发送过于频繁，请稍后再试。", retryable: true } });
  assert.deepEqual(verify, { ok: false, error: { code: "OTP_INVALID", message: "验证码无效或已过期，请重新获取。", retryable: false } });
  assert.deepEqual(signOut, { ok: false, error: { code: "SIGN_OUT_FAILED", message: "退出登录失败，请稍后重试。", retryable: true } });
  assert.equal(JSON.stringify([send, verify, signOut]).includes(secret), false);
  assert.equal(JSON.stringify([send, verify, signOut]).includes(phone), false);
});

test("maps thrown provider/network errors without exposing their details", async () => {
  const secret = "network-secret";
  const service = createSupabaseAuthService({
    async signInWithOtp() { throw new Error(secret); },
    async verifyOtp() { throw new Error(secret); },
    async signOut() { throw new Error(secret); },
  });
  const results = [
    await service.sendOtp("13811112222"),
    await service.verifyOtp("13811112222", "123456"),
    await service.signOut(),
  ];
  assert.equal(results.every((result) => !result.ok && result.error.retryable), true);
  assert.equal(JSON.stringify(results).includes(secret), false);
});
