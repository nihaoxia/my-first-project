import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveAppSession,
  type AppSessionDependencies,
} from "../src/lib/auth/app-session-core.ts";

const edgeOneEnvironment = {
  NODE_ENV: "production",
  AUTH_MODE: "edgeone",
};

test("uses the strong EdgeOne session as the production authority", async () => {
  let calls = 0;
  const dependencies: AppSessionDependencies = {
    async validateEdgeOneSession() {
      calls += 1;
      return {
        userId: "11111111-1111-4111-8111-111111111111",
        accountLabel: "reader_01",
        role: "ADMIN",
      };
    },
  };

  assert.deepEqual(await resolveAppSession(edgeOneEnvironment, dependencies), {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      accountLabel: "reader_01",
    },
    role: "ADMIN",
  });
  assert.equal(calls, 1);
});

test("fails closed for missing, malformed, or banned EdgeOne sessions", async () => {
  const resolve = (value: unknown) => resolveAppSession(edgeOneEnvironment, {
    async validateEdgeOneSession() { return value as never; },
  });
  assert.equal(await resolve(null), null);
  assert.equal(await resolve({ userId: "bad", accountLabel: "reader_01", role: "USER" }), null);
  assert.equal(await resolve({ userId: "11111111-1111-4111-8111-111111111111", accountLabel: "bad label", role: "USER" }), null);
  assert.equal(await resolve({ userId: "11111111-1111-4111-8111-111111111111", accountLabel: "reader_01", role: "BANNED" }), null);
});

test("maps explicitly enabled development mock sessions to accountLabel", async () => {
  const dependencies: AppSessionDependencies = {
    async validateEdgeOneSession() { throw new Error("EdgeOne must not run"); },
    async getMockSession() { return { phone: "13811112222", role: "USER" }; },
  };
  assert.deepEqual(await resolveAppSession({
    NODE_ENV: "development",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
  }, dependencies), {
    user: {
      id: "00000000-0000-4000-8000-013811112222",
      accountLabel: "本地用户 2222",
    },
    role: "USER",
  });
  await assert.rejects(
    resolveAppSession({ NODE_ENV: "production", AUTH_MODE: "mock", MOCK_AUTH_ENABLED: "true" }, dependencies),
    /AUTH_MODE_FORBIDDEN/,
  );
});

test("production rejects legacy or missing auth modes instead of falling back", async () => {
  const dependencies: AppSessionDependencies = {
    async validateEdgeOneSession() { return null; },
    async getMockSession() { return { phone: "13811112222", role: "USER" }; },
  };
  for (const authMode of [undefined, "supabase"] as const) {
    await assert.rejects(
      resolveAppSession({ NODE_ENV: "production", AUTH_MODE: authMode }, dependencies),
      /AUTH_MODE_FORBIDDEN/,
    );
  }
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
  ]) assert.match(readFileSync(file, "utf8"), /<AppShell(?:\s+wide)?\s+requireAuth/);
});

test("the server session reads only the EdgeOne cookie on the production path", () => {
  const source = readFileSync("src/lib/auth/app-session.ts", "utf8");
  assert.match(source, /await connection\(\)/);
  assert.match(source, /readEdgeOneSessionCookie/);
  assert.match(source, /validateSession/);
  assert.doesNotMatch(source, /createSupabaseServerClient|getSupabaseAuthService/);
});
