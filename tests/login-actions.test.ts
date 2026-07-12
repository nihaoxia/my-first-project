import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createLoginActionOrchestrator } from "../src/lib/auth/login-action-core.ts";

const supabaseEnv = {
  NODE_ENV: "production",
  CLOUD_MODE: "required",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

test("orchestrates Supabase send and verify while preserving only a safe next path", async () => {
  const calls: string[] = [];
  const core = createLoginActionOrchestrator({
    async getSupabaseService() {
      return {
        async sendOtp(phone) { calls.push(`send:${phone}`); return { ok: true }; },
        async verifyOtp(phone, token) { calls.push(`verify:${phone}:${token}`); return { ok: true }; },
        async signOut() { calls.push("logout"); return { ok: true }; },
      };
    },
    async setMockSession() { throw new Error("mock must not run"); },
    async clearMockSession() { throw new Error("mock must not run"); },
  });
  assert.deepEqual(await core.send({ phone: "13811112222", next: "/upload?step=chapters" }, supabaseEnv), {
    destination: "/login?sent=1&next=%2Fupload%3Fstep%3Dchapters",
  });
  assert.deepEqual(await core.verify({ phone: "13811112222", token: "654321", next: "/upload?step=chapters" }, supabaseEnv), {
    destination: "/upload?step=chapters",
  });
  assert.deepEqual(calls, ["send:13811112222", "verify:13811112222:654321"]);
});

test("keeps provider and configuration errors stable and secret-free", async () => {
  const secret = "provider-secret";
  const core = createLoginActionOrchestrator({
    async getSupabaseService() {
      return {
        async sendOtp() { return { ok: false, error: { code: "OTP_SEND_FAILED", message: secret, retryable: true } }; },
        async verifyOtp() { throw new Error(secret); },
        async signOut() { throw new Error(secret); },
      };
    },
    async setMockSession() { throw new Error(secret); },
    async clearMockSession() { throw new Error(secret); },
  });
  const outcomes = [
    await core.send({ phone: "13811112222", next: "https://evil.example" }, supabaseEnv),
    await core.verify({ phone: "13811112222", token: "123456", next: "/library" }, supabaseEnv),
    await core.logout(supabaseEnv),
    await core.send({ phone: "13811112222", next: "/library" }, { NODE_ENV: "production" }),
  ];
  assert.deepEqual(outcomes, [
    { destination: "/login?error=OTP_SEND_FAILED" },
    { destination: "/login?error=OTP_INVALID" },
    { destination: "/me?authError=SIGN_OUT_FAILED" },
    { destination: "/login?error=CLOUD_NOT_CONFIGURED" },
  ]);
  const serialized = JSON.stringify(outcomes);
  for (const sensitive of [secret, "13811112222", "123456", "evil.example"]) {
    assert.equal(serialized.includes(sensitive), false);
  }
});

test("only treats logout as successful after the provider succeeds", async () => {
  let result: { ok: true } | { ok: false; error: { code: "SIGN_OUT_FAILED"; message: string; retryable: true } } = {
    ok: false,
    error: { code: "SIGN_OUT_FAILED", message: "raw", retryable: true },
  };
  const core = createLoginActionOrchestrator({
    async getSupabaseService() {
      return {
        async sendOtp() { return { ok: true }; },
        async verifyOtp() { return { ok: true }; },
        async signOut() { return result; },
      };
    },
    async setMockSession() {},
    async clearMockSession() {},
  });
  assert.deepEqual(await core.logout(supabaseEnv), { destination: "/me?authError=SIGN_OUT_FAILED" });
  result = { ok: true };
  assert.deepEqual(await core.logout(supabaseEnv), { destination: "/login" });
});

test("mock send verify and logout require both mock mode and explicit enablement", async () => {
  const calls: string[] = [];
  const core = createLoginActionOrchestrator({
    async getSupabaseService() { throw new Error("Supabase must not run"); },
    async setMockSession(phone) { calls.push(`set:${phone}`); },
    async clearMockSession() { calls.push("clear"); },
  });
  const enabled = { NODE_ENV: "development", CLOUD_MODE: "optional", AUTH_MODE: "mock", MOCK_AUTH_ENABLED: "true" };
  assert.deepEqual(await core.send({ phone: "13811112222", next: "/library" }, enabled), { destination: "/login?sent=1" });
  assert.deepEqual(await core.verify({ phone: "13811112222", token: "123456", next: "/library" }, enabled), { destination: "/library" });
  assert.deepEqual(await core.logout(enabled), { destination: "/login" });
  assert.deepEqual(calls, ["set:13811112222", "clear"]);

  assert.deepEqual(await core.send({ phone: "13811112222", next: "/library" }, { ...enabled, MOCK_AUTH_ENABLED: undefined }), {
    destination: "/login?error=AUTH_MODE_FORBIDDEN",
  });
});

test("server actions are thin redirects over the tested orchestrator and the page keeps two-step state", () => {
  const actions = readFileSync("src/app/login/actions.ts", "utf8");
  const page = readFileSync("src/app/login/page.tsx", "utf8");
  const mePage = readFileSync("src/app/me/page.tsx", "utf8");
  assert.match(actions, /createLoginActionOrchestrator/);
  assert.match(actions, /orchestrator\.send/);
  assert.match(actions, /orchestrator\.verify/);
  assert.match(actions, /orchestrator\.logout/);
  assert.doesNotMatch(actions, /signOut\(\)[^\n;]*;\s*\n\s*redirect\("\/login"\)/);
  assert.match(page, /params\?\.sent === "1"/);
  assert.match(page, /params\?\.error/);
  assert.match(page, /name="next"/);
  assert.match(page, /action=\{sendLoginOtp\}/);
  assert.match(page, /action=\{verifyLoginOtp\}/);
  assert.match(mePage, /authError/);
  assert.match(mePage, /退出登录失败，你仍处于登录状态/);
});
