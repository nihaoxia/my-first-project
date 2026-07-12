import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

let subject: typeof import("../src/lib/auth/account-action-core.ts") | undefined;
try { subject = await import("../src/lib/auth/account-action-core.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("account-action-core must be implemented"); return subject; }

function service(calls: string[]) {
  return {
    async register(username: string, password: string) {
      calls.push(`register:${username}:${password}`);
      return { userId: "user", accountLabel: username, recoveryCode: "r".repeat(43), sessionToken: "s".repeat(43) };
    },
    async login(username: string, password: string) {
      calls.push(`login:${username}:${password}`);
      return { userId: "user", accountLabel: username, sessionToken: "s".repeat(43) };
    },
    async recover(username: string, recoveryCode: string, password: string) {
      calls.push(`recover:${username}:${recoveryCode}:${password}`);
      return { userId: "user", accountLabel: username, recoveryCode: "n".repeat(43), sessionToken: "s".repeat(43) };
    },
    async logout(token: string) { calls.push(`logout:${token}`); },
  };
}

test("register, login, recovery and logout preserve only safe navigation state", async () => {
  const calls: string[] = [];
  const cookies: string[] = [];
  const core = api().createAccountActionOrchestrator({
    service: service(calls),
    setSession(token: string) { cookies.push(`set:${token}`); },
    clearSession() { cookies.push("clear"); },
  });
  assert.deepEqual(await core.register({ username: "reader_01", password: "password value", next: "/upload" }), {
    ok: true, destination: "/upload", recoveryCode: "r".repeat(43), accountLabel: "reader_01",
  });
  assert.deepEqual(await core.login({ username: "reader_01", password: "password value", next: "https://evil.example" }), {
    ok: true, destination: "/library",
  });
  assert.deepEqual(await core.recover({ username: "reader_01", recoveryCode: "old", newPassword: "new password value", next: "/study/notes" }), {
    ok: true, destination: "/study/notes", recoveryCode: "n".repeat(43), accountLabel: "reader_01",
  });
  await core.logout("t".repeat(43));
  assert.deepEqual(cookies, [`set:${"s".repeat(43)}`, `set:${"s".repeat(43)}`, `set:${"s".repeat(43)}`, "clear"]);
  assert.equal(JSON.stringify(await core.login({ username: "reader_01", password: "password value", next: "//evil.example" })).includes("evil.example"), false);
});

test("credential and provider failures are stable and never echo secrets", async () => {
  const secret = "raw-provider-secret";
  const broken = service([]);
  broken.login = async () => { throw Object.assign(new Error(secret), { code: "INVALID_CREDENTIALS" }); };
  broken.register = async () => { throw Object.assign(new Error(secret), { code: "USERNAME_UNAVAILABLE" }); };
  broken.recover = async () => { throw new Error(secret); };
  const core = api().createAccountActionOrchestrator({ service: broken, setSession() {}, clearSession() {} });
  const results = [
    await core.login({ username: "secret-user", password: secret }),
    await core.register({ username: "secret-user", password: secret }),
    await core.recover({ username: "secret-user", recoveryCode: secret, newPassword: secret }),
  ];
  assert.deepEqual(results.map((result) => result.error), [
    "INVALID_CREDENTIALS", "USERNAME_UNAVAILABLE", "INVALID_CREDENTIALS",
  ]);
  assert.equal(JSON.stringify(results).includes(secret), false);
  assert.equal(JSON.stringify(results).includes("secret-user"), false);
});

test("server actions and page expose username account flows without SMS or Supabase", () => {
  const actions = readFileSync("src/app/login/actions.ts", "utf8");
  const page = ["src/app/login/page.tsx", "src/app/login/account-forms.tsx"]
    .map((path) => readFileSync(path, "utf8")).join("\n");
  for (const name of ["registerAccount", "loginAccount", "recoverAccount", "logoutSession"]) {
    assert.match(actions, new RegExp(`export async function ${name}`));
  }
  assert.match(actions, /getEdgeOneAuthService/);
  assert.doesNotMatch(actions, /getSupabaseAuthService|sendOtp|verifyOtp/);
  assert.match(page, /name="username"/);
  assert.match(page, /name="password"/);
  assert.match(page, /name="recoveryCode"/);
  assert.match(page, /恢复码只显示这一次/);
  assert.doesNotMatch(page, /手机号|短信|验证码|type="tel"/);
});
