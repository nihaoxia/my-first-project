import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseTranslationMcpServerConfig } from "../src/server/translation-mcp/config.ts";

const validEnvironment = {
  NODE_ENV: "production",
  TRANSLATION_MCP_SECRET: "x".repeat(32),
  AI_BASE_URL: "https://api.example.com/v1",
  AI_API_KEY: "private-test-key",
  AI_MODEL: "production-model",
  MCP_TRUSTED_HOSTS: "mcp.example.com",
};

test("Railway PORT is used when the explicit MCP port is absent", () => {
  const result = parseTranslationMcpServerConfig({ ...validEnvironment, PORT: "9000" });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.port, 9000);
});

test("the explicit MCP port takes precedence over Railway PORT", () => {
  const result = parseTranslationMcpServerConfig({
    ...validEnvironment,
    PORT: "9000",
    MCP_TRANSLATION_PORT: "8787",
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.port, 8787);
});

test("an empty platform PORT is treated as absent", () => {
  const result = parseTranslationMcpServerConfig({
    ...validEnvironment,
    PORT: "",
    MCP_TRANSLATION_PORT: "8787",
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.port, 8787);
});

test("invalid platform ports fail with the stable public configuration error", () => {
  assert.deepEqual(
    parseTranslationMcpServerConfig({ ...validEnvironment, PORT: "0" }),
    { ok: false, message: "翻译 MCP 服务配置不完整或格式无效。" },
  );
});

test("deployment manifests run only the website and MCP production entrypoints", () => {
  const railway = readFileSync("railway.toml", "utf8");
  const vercel = readFileSync("vercel.json", "utf8");

  assert.match(railway, /pnpm mcp:translation:build/);
  assert.match(railway, /pnpm mcp:translation:start/);
  assert.match(railway, /healthcheckPath\s*=\s*"\/health"/);
  assert.match(railway, /restartPolicyType\s*=\s*"ON_FAILURE"/);
  assert.match(vercel, /"framework"\s*:\s*"nextjs"/);
  assert.match(vercel, /"buildCommand"\s*:\s*"pnpm build"/);
  assert.doesNotMatch(
    `${railway}\n${vercel}`,
    /SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|AI_API_KEY|TRANSLATION_MCP_SECRET/,
  );
});
