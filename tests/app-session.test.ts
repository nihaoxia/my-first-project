import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveAppSession,
  type AppSessionDependencies,
} from "../src/lib/auth/app-session-core.ts";

const supabaseEnvironment = {
  NODE_ENV: "production",
  CLOUD_MODE: "required",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

test("uses getUser and the database profile as the authoritative Supabase session", async () => {
  let getUserCalls = 0;
  const dependencies: AppSessionDependencies = {
    async getUser() {
      getUserCalls += 1;
      return { id: "11111111-1111-4111-8111-111111111111" };
    },
    async getProfile(userId) {
      assert.equal(userId, "11111111-1111-4111-8111-111111111111");
      return { phone: "13811112222", role: "ADMIN" };
    },
  };

  assert.deepEqual(await resolveAppSession(supabaseEnvironment, dependencies), {
    userId: "11111111-1111-4111-8111-111111111111",
    phone: "13811112222",
    role: "ADMIN",
    authMode: "supabase",
  });
  assert.equal(getUserCalls, 1);
});

test("fails closed for missing, malformed, or banned database profiles", async () => {
  const base: AppSessionDependencies = {
    async getUser() { return { id: "11111111-1111-4111-8111-111111111111" }; },
    async getProfile() { return null; },
  };
  assert.equal(await resolveAppSession(supabaseEnvironment, base), null);
  assert.equal(await resolveAppSession(supabaseEnvironment, {
    ...base,
    async getProfile() { return { phone: "bad-phone", role: "ADMIN" }; },
  }), null);
  assert.equal(await resolveAppSession(supabaseEnvironment, {
    ...base,
    async getProfile() { return { phone: "13811112222", role: "OWNER" }; },
  }), null);
  assert.equal(await resolveAppSession(supabaseEnvironment, {
    ...base,
    async getProfile() { return { phone: "13811112222", role: "BANNED" }; },
  }), null);
});

test("does not read a self-declared role from auth metadata", async () => {
  const session = await resolveAppSession(supabaseEnvironment, {
    async getUser() {
      return { id: "11111111-1111-4111-8111-111111111111", user_metadata: { role: "ADMIN" } };
    },
    async getProfile() { return { phone: "13811112222", role: "USER" }; },
  });
  assert.equal(session?.role, "USER");
});

test("accepts the E.164 phone format stored by Supabase Auth and exposes a local phone", async () => {
  const session = await resolveAppSession(supabaseEnvironment, {
    async getUser() { return { id: "11111111-1111-4111-8111-111111111111" }; },
    async getProfile() { return { phone: "+8613811112222", role: "USER" }; },
  });
  assert.equal(session?.phone, "13811112222");
});

test("allows mock sessions only when mock mode is explicitly enabled outside production", async () => {
  const dependencies: AppSessionDependencies = {
    async getUser() { throw new Error("must not use Supabase"); },
    async getProfile() { throw new Error("must not query profile"); },
    async getMockSession() { return { phone: "13811112222", role: "USER" }; },
  };
  assert.deepEqual(await resolveAppSession({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
  }, dependencies), {
    userId: "00000000-0000-4000-8000-013811112222",
    phone: "13811112222",
    role: "USER",
    authMode: "mock",
  });

  await assert.rejects(
    resolveAppSession({ NODE_ENV: "production", AUTH_MODE: "mock", MOCK_AUTH_ENABLED: "true" }, dependencies),
    /AUTH_MODE_FORBIDDEN/,
  );
});

test("reports missing production Supabase configuration instead of falling back to mock", async () => {
  await assert.rejects(
    resolveAppSession({ NODE_ENV: "production" }, {
      async getUser() { return null; },
      async getProfile() { return null; },
      async getMockSession() { return { phone: "13811112222", role: "USER" }; },
    }),
    /CLOUD_NOT_CONFIGURED/,
  );
});

test("protected pages request an authoritative AppShell session check", () => {
  for (const file of [
    "src/app/library/page.tsx",
    "src/app/upload/page.tsx",
    "src/app/books/[bookId]/chapters/page.tsx",
    "src/app/books/[bookId]/translate/page.tsx",
    "src/app/translations/[translationId]/tasks/page.tsx",
    "src/app/reader/page.tsx",
    "src/app/study/vocabulary/page.tsx",
    "src/app/study/sentences/page.tsx",
    "src/app/study/notes/page.tsx",
    "src/app/me/page.tsx",
    "src/app/admin/page.tsx",
  ]) {
    assert.match(readFileSync(file, "utf8"), /<AppShell(?:\s+wide)?\s+requireAuth/);
  }
});

test("the server session defers configuration and cookie access to request time", () => {
  const source = readFileSync("src/lib/auth/app-session.ts", "utf8");

  assert.match(source, /import\s+\{\s*connection\s*\}\s+from\s+["']next\/server["']/);
  assert.match(
    source,
    /export async function getAppSession\(\)[\s\S]*?await connection\(\)[\s\S]*?resolveAppSession/,
  );
});
