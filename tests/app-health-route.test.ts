import assert from "node:assert/strict";
import test from "node:test";

import { buildAppHealthResponse } from "../src/app/api/health/route.ts";

const secret = "health-secret-that-must-not-leak";
const validEnvironment = {
  NODE_ENV: "production",
  CLOUD_MODE: "required",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: "https://api.example.com",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  CLOUD_STORAGE_PROVIDER: "cos",
  DATABASE_URL: "postgresql://user:password@postgres:5432/postgres",
  COS_SECRET_ID: `health-secret-id-${secret}`,
  COS_SECRET_KEY: secret,
  COS_BUCKET: "original-books-1250000000",
  COS_REGION: "ap-guangzhou",
  TRANSLATION_MCP_URL: "http://translation-mcp:8787/mcp",
  TRANSLATION_MCP_SECRET: secret.repeat(2),
  TRANSLATION_MCP_TIMEOUT_MS: "180000",
};

test("app health reports stable configured capabilities without internal details", async () => {
  const response = buildAppHealthResponse(validEnvironment);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    status: "ok",
    configured: true,
    capabilities: { auth: true, storage: true, translation: true },
  });
  const serialized = JSON.stringify(body);
  for (const value of [secret, "postgres", "api.example.com", "original-books", "translation-mcp"]) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("app health fails closed with stable false capabilities", async () => {
  const response = buildAppHealthResponse({ NODE_ENV: "production" });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: "unavailable",
    configured: false,
    capabilities: { auth: false, storage: false, translation: false },
  });
});
