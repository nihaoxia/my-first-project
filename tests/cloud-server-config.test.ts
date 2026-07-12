import assert from "node:assert/strict";
import test from "node:test";

import { resolveCloudServerConfig } from "../src/lib/cloud/server-config-core.ts";

const publicEnvironment = {
  NODE_ENV: "development",
  CLOUD_MODE: "required",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
};

test("server configuration returns normalized server-only secrets", () => {
  const result = resolveCloudServerConfig({
    ...publicEnvironment,
    SUPABASE_SERVICE_ROLE_KEY: "  local-service-role-key  ",
    DATABASE_URL: "  postgresql://postgres:postgres@127.0.0.1:54322/postgres  ",
  });

  assert.equal(result.ok, true);
  if (!result.ok || !result.config.configured) return;

  assert.equal(result.config.serverConfigured, true);
  assert.equal(result.config.storageProvider, "supabase");
  if (result.config.storageProvider !== "supabase") return;
  assert.equal(result.config.supabaseServiceRoleKey, "local-service-role-key");
  assert.equal(
    result.config.databaseUrl,
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
});

test("server configuration reports only missing server keys", () => {
  const result = resolveCloudServerConfig(publicEnvironment);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "CLOUD_NOT_CONFIGURED");
  assert.deepEqual(result.error.missingKeys, ["SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]);
});

test("server configuration validates PostgreSQL URLs without leaking secrets", () => {
  const secret = "service-role-secret-that-must-not-leak";
  const database = "https://secret-user:secret-password@database.example.com/app";
  const result = resolveCloudServerConfig({
    ...publicEnvironment,
    SUPABASE_SERVICE_ROLE_KEY: secret,
    DATABASE_URL: database,
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "CLOUD_CONFIG_INVALID");
    assert.deepEqual(result.error.invalidKeys, ["DATABASE_URL"]);
  }
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(database), false);
  assert.equal(serialized.includes("secret-password"), false);
});

test("optional local mode remains unconfigured without public or server values", () => {
  const result = resolveCloudServerConfig({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.config.configured, false);
  assert.equal("serverConfigured" in result.config, false);
});

test("COS storage requires a complete server-only configuration", () => {
  const secretId = "cos-secret-id-that-must-not-leak";
  const result = resolveCloudServerConfig({
    ...publicEnvironment,
    CLOUD_STORAGE_PROVIDER: "cos",
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/postgres",
    COS_SECRET_ID: secretId,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "CLOUD_NOT_CONFIGURED");
    assert.deepEqual(result.error.missingKeys, [
      "COS_SECRET_KEY",
      "COS_BUCKET",
      "COS_REGION",
    ]);
  }
  assert.equal(JSON.stringify(result).includes(secretId), false);
});

test("COS storage returns a normalized discriminated server configuration", () => {
  const result = resolveCloudServerConfig({
    ...publicEnvironment,
    CLOUD_STORAGE_PROVIDER: "cos",
    DATABASE_URL: " postgresql://postgres:postgres@postgres:5432/postgres ",
    COS_SECRET_ID: " secret-id ",
    COS_SECRET_KEY: " secret-key ",
    COS_BUCKET: " original-books-1250000000 ",
    COS_REGION: " ap-guangzhou ",
  });

  assert.equal(result.ok, true);
  if (!result.ok || !result.config.configured) return;
  assert.equal(result.config.storageProvider, "cos");
  if (result.config.storageProvider !== "cos") return;
  assert.equal(result.config.cosSecretId, "secret-id");
  assert.equal(result.config.cosSecretKey, "secret-key");
  assert.equal(result.config.cosBucket, "original-books-1250000000");
  assert.equal(result.config.cosRegion, "ap-guangzhou");
  assert.equal("supabaseServiceRoleKey" in result.config, false);
});

test("server configuration rejects unknown providers and malformed COS locations", () => {
  const unknown = resolveCloudServerConfig({
    ...publicEnvironment,
    CLOUD_STORAGE_PROVIDER: "oss",
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/postgres",
  });
  const malformed = resolveCloudServerConfig({
    ...publicEnvironment,
    CLOUD_STORAGE_PROVIDER: "cos",
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/postgres",
    COS_SECRET_ID: "secret-id",
    COS_SECRET_KEY: "secret-key",
    COS_BUCKET: "Original_Books",
    COS_REGION: "guangzhou",
  });

  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.deepEqual(unknown.error.invalidKeys, ["CLOUD_STORAGE_PROVIDER"]);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.deepEqual(malformed.error.invalidKeys, ["COS_BUCKET", "COS_REGION"]);
  }
});
