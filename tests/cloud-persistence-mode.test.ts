import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveCloudConfig } from "../src/lib/cloud/config.ts";
import { resolveCloudPersistenceMode } from "../src/lib/cloud/persistence-mode.ts";
import { resolveCloudServerConfig } from "../src/lib/cloud/server-config-core.ts";

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

test("upload and library server surfaces use the same full server capability gate", () => {
  for (const path of ["src/app/upload/page.tsx", "src/app/library/page.tsx"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /getCloudServerConfig\(\)/);
    assert.match(source, /resolveCloudPersistenceMode/);
  }
});
