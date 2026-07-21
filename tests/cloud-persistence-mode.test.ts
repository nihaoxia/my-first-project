import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveCloudConfig } from "../src/lib/cloud/config.ts";
import { resolveCloudPersistenceMode } from "../src/lib/cloud/persistence-mode.ts";
import * as persistenceModeModule from "../src/lib/cloud/persistence-mode.ts";
import { resolveCloudServerConfig } from "../src/lib/cloud/server-config-core.ts";

type EnvironmentResolver = (environment: Record<string, string | undefined>) =>
  "cloud" | "local" | "unavailable";

const resolveCloudPersistenceModeFromEnvironment = (
  persistenceModeModule as unknown as {
    resolveCloudPersistenceModeFromEnvironment?: EnvironmentResolver;
  }
).resolveCloudPersistenceModeFromEnvironment;

const edgeOneEnvironment = {
  NODE_ENV: "production",
  AUTH_MODE: "edgeone",
  CLOUD_DATA_PROVIDER: "edgeone",
  CLOUD_STORAGE_PROVIDER: "edgeone",
  EDGEONE_BLOB_STORE: "stray-pages-production",
  EDGEONE_SESSION_SECRET: "x".repeat(64),
  EDGEONE_FREE_BLOB_CONFIRMED: "false",
  EDGEONE_FREE_MODEL_CONFIRMED: "false",
};

test("only explicit optional mock development falls back to local persistence", () => {
  assert.equal(resolveCloudPersistenceMode(resolveCloudConfig({ NODE_ENV: "development", CLOUD_MODE: "optional", AUTH_MODE: "mock", MOCK_AUTH_ENABLED: "true" })), "local");
  assert.equal(resolveCloudPersistenceMode(resolveCloudConfig({ NODE_ENV: "production" })), "unavailable");
});

test("configured Supabase selects cloud persistence", () => {
  assert.equal(resolveCloudPersistenceMode(resolveCloudServerConfig({ NODE_ENV: "development", CLOUD_MODE: "required", AUTH_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", DATABASE_URL: "postgresql://localhost/db" })), "cloud");
});

test("public credentials without either server secret are unavailable and never local fallback", () => {
  const base = { NODE_ENV: "development", CLOUD_MODE: "required", AUTH_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  assert.equal(resolveCloudPersistenceMode(resolveCloudServerConfig({ ...base, DATABASE_URL: "postgresql://localhost/db" })), "unavailable");
  assert.equal(resolveCloudPersistenceMode(resolveCloudServerConfig({ ...base, SUPABASE_SERVICE_ROLE_KEY: "service" })), "unavailable");
});

test("current EdgeOne production configuration selects cloud persistence", () => {
  assert.equal(typeof resolveCloudPersistenceModeFromEnvironment, "function");
  assert.equal(resolveCloudPersistenceModeFromEnvironment!(edgeOneEnvironment), "cloud");
  assert.equal(
    resolveCloudPersistenceModeFromEnvironment!({
      ...edgeOneEnvironment,
      EDGEONE_SESSION_SECRET: "too-short",
    }),
    "unavailable",
  );
  assert.equal(
    resolveCloudPersistenceModeFromEnvironment!({
      ...edgeOneEnvironment,
      DATABASE_URL: "postgresql://paid-provider.example/db",
    }),
    "unavailable",
  );
});

test("environment resolver preserves legacy local and configured cloud development modes", () => {
  assert.equal(typeof resolveCloudPersistenceModeFromEnvironment, "function");
  assert.equal(resolveCloudPersistenceModeFromEnvironment!({
    NODE_ENV: "development",
    CLOUD_MODE: "optional",
    AUTH_MODE: "mock",
    MOCK_AUTH_ENABLED: "true",
  }), "local");
  assert.equal(resolveCloudPersistenceModeFromEnvironment!({
    NODE_ENV: "development",
    CLOUD_MODE: "required",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    DATABASE_URL: "postgresql://localhost/db",
  }), "cloud");
});

test("all cloud server surfaces use the same current production capability gate", () => {
  for (const path of [
    "src/app/upload/page.tsx",
    "src/app/library/page.tsx",
    "src/app/me/page.tsx",
    "src/app/study/vocabulary/page.tsx",
    "src/app/study/sentences/page.tsx",
    "src/app/study/notes/page.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /resolveCloudPersistenceModeFromEnvironment\(process\.env\)/);
    assert.doesNotMatch(source, /getCloudServerConfig/);
  }
});
