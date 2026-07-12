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
