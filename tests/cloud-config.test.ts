import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  resolveCloudConfig,
  type CloudConfigEnvironment,
} from "../src/lib/cloud/config.ts";

const completeEnvironment = {
  NODE_ENV: "development",
  CLOUD_MODE: "required",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_ORIGINAL_BOOKS_BUCKET: "private-originals",
} satisfies CloudConfigEnvironment;

function parseTomlSectionLines(source: string, sectionName: string): Map<string, string> {
  const values = new Map<string, string>();
  let inSection = false;

  for (const rawLine of source.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      inSection = line === `[${sectionName}]`;
      continue;
    }
    if (!inSection) continue;

    const separator = line.indexOf("=");
    if (separator > 0) {
      values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }

  return values;
}

test("production defaults to required cloud mode and Supabase auth", () => {
  const result = resolveCloudConfig({
    ...completeEnvironment,
    NODE_ENV: "production",
    CLOUD_MODE: undefined,
    AUTH_MODE: undefined,
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.config.cloudMode, "required");
  assert.equal(result.config.authMode, "supabase");
  assert.equal(result.config.configured, true);
});

test("production rejects mock auth when the legacy flag is disabled", () => {
  const result = resolveCloudConfig({
    ...completeEnvironment,
    NODE_ENV: "production",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "AUTH_MODE_FORBIDDEN",
      message: "生产环境禁止使用 Mock 登录。",
      invalidKeys: ["AUTH_MODE"],
      missingKeys: [],
    },
  });
});

test("production rejects an enabled Mock flag even with Supabase auth", () => {
  const result = resolveCloudConfig({
    ...completeEnvironment,
    NODE_ENV: "production",
    AUTH_MODE: "supabase",
    MOCK_AUTH_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.code, "AUTH_MODE_FORBIDDEN");
  assert.deepEqual(result.error.invalidKeys, ["MOCK_AUTH_ENABLED"]);
});

test("development mock auth requires the explicit legacy enable flag", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "false",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.code, "AUTH_MODE_FORBIDDEN");
  assert.deepEqual(result.error.invalidKeys, ["MOCK_AUTH_ENABLED"]);
});

test("optional mode without any cloud values reports an unconfigured local fallback", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.config, {
    cloudMode: "optional",
    authMode: "mock",
    configured: false,
    mockAuthEnabled: true,
    originalBooksBucket: "original-books",
  });
});

test("required mode returns a stable missing-configuration error", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "required",
    AUTH_MODE: "supabase",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.code, "CLOUD_NOT_CONFIGURED");
  assert.equal(result.error.message, "云端服务配置不完整。");
  assert.deepEqual(result.error.missingKeys, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
});

test("optional mode rejects partial cloud configuration instead of silently falling back", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: completeEnvironment.NEXT_PUBLIC_SUPABASE_URL,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.code, "CLOUD_NOT_CONFIGURED");
  assert.deepEqual(result.error.missingKeys, ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
});

test("validates modes, public service URLs, and bucket names", () => {
  const result = resolveCloudConfig({
    ...completeEnvironment,
    CLOUD_MODE: "sometimes",
    AUTH_MODE: "password",
    NEXT_PUBLIC_SUPABASE_URL: "file:///tmp/supabase",
    SUPABASE_ORIGINAL_BOOKS_BUCKET: "../original books",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error.code, "CLOUD_CONFIG_INVALID");
  assert.deepEqual(result.error.invalidKeys, [
    "CLOUD_MODE",
    "AUTH_MODE",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ORIGINAL_BOOKS_BUCKET",
  ]);
});

for (const [name, nodeEnvironment, url, expectedOk] of [
  ["production HTTPS", "production", "https://project.supabase.co", true],
  ["production loopback HTTP", "production", "http://127.0.0.1:54321", false],
  ["development localhost HTTP", "development", "http://localhost:54321", true],
  ["development IPv4 loopback HTTP", "development", "http://127.0.0.1:54321", true],
  ["development IPv6 loopback HTTP", "development", "http://[::1]:54321", true],
  ["development LAN HTTP", "development", "http://192.168.1.20:54321", false],
  ["development remote HTTPS", "development", "https://project.supabase.co", true],
] as const) {
  test(`applies the Supabase URL policy for ${name}`, () => {
    const result = resolveCloudConfig({
      ...completeEnvironment,
      NODE_ENV: nodeEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: url,
    });

    assert.equal(result.ok, expectedOk);
    if (!expectedOk && !result.ok) {
      assert.equal(result.error.code, "CLOUD_CONFIG_INVALID");
      assert.deepEqual(result.error.invalidKeys, ["NEXT_PUBLIC_SUPABASE_URL"]);
    }
  });
}

for (const [bucket, expectedOk] of [
  ["abc", true],
  ["a.b-c", true],
  ["a".repeat(63), true],
  ["ab", false],
  ["a".repeat(64), false],
  ["original..books", false],
  ["Original-books", false],
  ["original_books", false],
  ["-original-books", false],
  ["original-books-", false],
] as const) {
  test(`validates the original-books bucket boundary: ${bucket.slice(0, 20)}`, () => {
    const result = resolveCloudConfig({
      ...completeEnvironment,
      SUPABASE_ORIGINAL_BOOKS_BUCKET: bucket,
    });

    assert.equal(result.ok, expectedOk);
    if (!expectedOk && !result.ok) {
      assert.deepEqual(result.error.invalidKeys, ["SUPABASE_ORIGINAL_BOOKS_BUCKET"]);
    }
  });
}

test("returns the normalized server configuration and the default private bucket", () => {
  const result = resolveCloudConfig({
    ...completeEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: "  http://127.0.0.1:54321/  ",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "  local-anon-key  ",
    SUPABASE_SERVICE_ROLE_KEY: "  local-service-role-key  ",
    DATABASE_URL: "  postgresql://postgres:postgres@127.0.0.1:54322/postgres  ",
    SUPABASE_ORIGINAL_BOOKS_BUCKET: " ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.config, {
    cloudMode: "required",
    authMode: "supabase",
    configured: true,
    mockAuthEnabled: false,
    supabaseUrl: "http://127.0.0.1:54321",
    supabaseAnonKey: "local-anon-key",
    originalBooksBucket: "original-books",
  });
});

test("public configuration succeeds without server-only secrets", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "production",
    CLOUD_MODE: "required",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.configured, true);
  assert.equal("serverConfigured" in result.config, false);
});

test("server-only values cannot change public configuration semantics", () => {
  const result = resolveCloudConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "required",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: " ",
    DATABASE_URL: "https://not-a-postgres-database.example.com",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.configured, true);
  assert.equal("serverConfigured" in result.config, false);

  const configSource = readFileSync(
    fileURLToPath(new URL("../src/lib/cloud/config.ts", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(configSource, /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/);
});

test("successful generic configuration never exposes server-only secrets", () => {
  const result = resolveCloudConfig(completeEnvironment);
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(serialized.includes(completeEnvironment.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(serialized.includes(completeEnvironment.DATABASE_URL), false);
  assert.equal(serialized.includes("postgres:postgres"), false);
});

test("configuration errors never contain secret values", () => {
  const secrets = {
    anon: "anon-secret-that-must-not-leak",
    serviceRole: "service-role-secret-that-must-not-leak",
    database: "postgresql://secret-user:secret-password@db.example.com/app",
  };
  const result = resolveCloudConfig({
    ...completeEnvironment,
    NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: secrets.anon,
    SUPABASE_SERVICE_ROLE_KEY: secrets.serviceRole,
    DATABASE_URL: secrets.database,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.equal(serialized.includes(secrets.anon), false);
  assert.equal(serialized.includes(secrets.serviceRole), false);
  assert.equal(serialized.includes(secrets.database), false);
  assert.equal(serialized.includes("secret-password"), false);
});

test("local Supabase declares a private text-only original-books bucket", () => {
  const configPath = fileURLToPath(new URL("../supabase/config.toml", import.meta.url));
  const config = readFileSync(configPath, "utf8");
  const bucket = parseTomlSectionLines(config, "storage.buckets.original-books");

  assert.equal(bucket.get("public"), "false");
  assert.equal(bucket.get("file_size_limit"), '"2MiB"');
  assert.equal(bucket.get("allowed_mime_types"), '["text/plain"]');
});

test("server secrets are isolated behind a server-only wrapper", () => {
  const wrapperPath = fileURLToPath(
    new URL("../src/lib/cloud/server-config.ts", import.meta.url),
  );
  const wrapper = readFileSync(wrapperPath, "utf8");

  assert.match(wrapper, /^import "server-only";/m);
  assert.match(wrapper, /getCloudServerConfig/);
  assert.match(wrapper, /resolveCloudServerConfig/);
});

test("Supabase server client consumes the complete centralized resolver", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/lib/supabase/server.ts", import.meta.url)),
    "utf8",
  );
  assert.match(source, /resolveCloudConfig/);
  assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)/);
});
