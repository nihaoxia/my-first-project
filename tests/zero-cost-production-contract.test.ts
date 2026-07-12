import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimePath = new URL(
  "../src/lib/edgeone/runtime-config-core.ts",
  import.meta.url,
);
const runtimeWrapperPath = new URL(
  "../src/lib/edgeone/runtime-config.ts",
  import.meta.url,
);
const envExamplePath = new URL("../.env.example", import.meta.url);

async function readOrEmpty(url: URL): Promise<string> {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

test("zero-cost runtime names every paid key it must reject", async () => {
  const source = await readOrEmpty(runtimePath);
  for (const key of [
    "DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "TENCENT_SMS_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
  ]) {
    assert.match(source, new RegExp(`\\b${key}\\b`), key);
  }
});

test("environment example documents EdgeOne without usable secrets", async () => {
  const source = await readOrEmpty(envExamplePath);
  assert.match(source, /AUTH_MODE=edgeone/);
  assert.match(source, /CLOUD_DATA_PROVIDER=edgeone/);
  assert.match(source, /CLOUD_STORAGE_PROVIDER=edgeone/);
  assert.match(source, /EDGEONE_BLOB_STORE=/);
  assert.match(source, /EDGEONE_SESSION_SECRET=/);
  assert.doesNotMatch(
    source,
    /EDGEONE_SESSION_SECRET=(?!replace-with-|$)[^\r\n]{32,}/,
  );
});

test("runtime wrapper is server-only and never returns an invalid configuration", async () => {
  const source = await readOrEmpty(runtimeWrapperPath);
  assert.match(source, /^import "server-only";/);
  assert.match(source, /resolveEdgeOneRuntimeConfig\(process\.env\)/);
  assert.match(source, /if \(!result\.ok\)/);
  assert.match(source, /return result\.config/);
});

test("authoritative authentication modules never depend on eventually consistent KV", async () => {
  for (const path of [
    "../src/lib/auth/edgeone-password-core.ts",
    "../src/lib/auth/edgeone-account-core.ts",
    "../src/lib/auth/edgeone-account-service-core.ts",
    "../src/lib/auth/edgeone-account.ts",
    "../src/lib/auth/edgeone-auth-rate-limit-core.ts",
  ]) {
    const source = await readOrEmpty(new URL(path, import.meta.url));
    assert.notEqual(source, "", path);
    assert.doesNotMatch(source, /kv-cache/iu, path);
  }
});
