import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  resolveSupabasePublicCredentials,
} from "../src/lib/supabase/public-credentials.ts";
import { createSupabaseBrowserClient } from "../src/lib/supabase/client.ts";

test("resolves and normalizes valid public Supabase credentials", () => {
  const result = resolveSupabasePublicCredentials({
    production: true,
    supabaseUrl: "  https://project.supabase.co/  ",
    supabaseAnonKey: "  public-anon-key  ",
  });

  assert.deepEqual(result, {
    ok: true,
    credentials: {
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "public-anon-key",
    },
  });
});

test("reports missing public credentials with stable key names", () => {
  const result = resolveSupabasePublicCredentials({ production: true });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "SUPABASE_PUBLIC_CONFIG_MISSING",
      message: "Supabase public configuration is unavailable.",
      invalidKeys: [],
      missingKeys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
  });
});

for (const invalidUrl of [
  "file:///tmp/supabase",
  "http://192.168.1.20:54321",
  "not-a-url",
]) {
  test(`rejects an unsafe public Supabase URL: ${invalidUrl}`, () => {
    const anonKey = "anon-secret-that-must-not-leak";
    const result = resolveSupabasePublicCredentials({
      production: false,
      supabaseUrl: invalidUrl,
      supabaseAnonKey: anonKey,
    });
    const serialized = JSON.stringify(result);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SUPABASE_PUBLIC_CONFIG_INVALID");
      assert.deepEqual(result.error.invalidKeys, ["NEXT_PUBLIC_SUPABASE_URL"]);
    }
    assert.equal(serialized.includes(invalidUrl), false);
    assert.equal(serialized.includes(anonKey), false);
  });
}

for (const [name, production, supabaseUrl, expectedOk] of [
  ["production HTTPS", true, "https://project.supabase.co", true],
  ["production loopback HTTP", true, "http://127.0.0.1:54321", false],
  ["development loopback HTTP", false, "http://127.0.0.1:54321", true],
] as const) {
  test(`applies browser public URL policy for ${name}`, () => {
    const result = resolveSupabasePublicCredentials({
      production,
      supabaseUrl,
      supabaseAnonKey: "public-anon-key",
    });

    assert.equal(result.ok, expectedOk);
    if (!expectedOk && !result.ok) {
      assert.equal(result.error.code, "SUPABASE_PUBLIC_CONFIG_INVALID");
      assert.deepEqual(result.error.invalidKeys, ["NEXT_PUBLIC_SUPABASE_URL"]);
    }
  });
}

test("browser client accepts injected credentials and factory for real behavior tests", () => {
  const calls: Array<[string, string]> = [];
  const sentinel = { kind: "browser-client" } as const;

  const client = createSupabaseBrowserClient({
    credentials: {
      production: false,
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "local-anon-key",
    },
    factory(url, key) {
      calls.push([url, key]);
      return sentinel;
    },
  });

  assert.equal(client, sentinel);
  assert.deepEqual(calls, [["http://127.0.0.1:54321", "local-anon-key"]]);
});

test("browser client source uses statically inlinable public environment references", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/lib/supabase/client.ts", import.meta.url)),
    "utf8",
  );

  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(source, /process\.env\.NODE_ENV\s*===\s*"production"/);
  assert.match(source, /resolveSupabasePublicCredentials/);
});
