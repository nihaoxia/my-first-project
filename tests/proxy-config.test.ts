import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("proxy matcher includes every protected top-level route", () => {
  const proxySource = readFileSync("src/proxy.ts", "utf8");

  for (const matcher of [
    "/library/:path*",
    "/upload/:path*",
    "/books/:path*",
    "/translations/:path*",
    "/reader/:path*",
    "/study/:path*",
    "/me/:path*",
    "/admin/:path*",
  ]) {
    assert.match(proxySource, new RegExp(`"${escapeRegExp(matcher)}"`));
  }
});

test("proxy refreshes Supabase auth cookies using getUser without server secrets", () => {
  const proxySource = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxySource, /createServerClient/);
  assert.match(proxySource, /auth\.getUser\(\)/);
  assert.match(proxySource, /from\("UserProfile"\)/);
  assert.match(proxySource, /select\("role"\)/);
  assert.doesNotMatch(proxySource, /auth\.getSession\(\)/);
  assert.doesNotMatch(proxySource, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
