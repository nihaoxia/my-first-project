import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("platform PORT is used when the explicit MCP port is absent", () => {
  const result = parseTranslationMcpServerConfig({ ...validEnvironment, PORT: "9000" });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.port, 9000);
});

test("the explicit MCP port takes precedence over platform PORT", () => {
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

test("MCP listens on loopback by default and allows an explicit container host", () => {
  const local = parseTranslationMcpServerConfig(validEnvironment);
  const container = parseTranslationMcpServerConfig({
    ...validEnvironment,
    MCP_TRANSLATION_HOST: "0.0.0.0",
  });

  assert.equal(local.ok, true);
  assert.equal(container.ok, true);
  if (local.ok) assert.equal(local.value.listenHost, "127.0.0.1");
  if (container.ok) assert.equal(container.value.listenHost, "0.0.0.0");
});

test("MCP rejects arbitrary listen hosts", () => {
  assert.equal(
    parseTranslationMcpServerConfig({
      ...validEnvironment,
      MCP_TRANSLATION_HOST: "192.168.1.10",
    }).ok,
    false,
  );
});

test("Tencent production manifests expose only the HTTPS edge", () => {
  const compose = readFileSync(
    "deploy/tencent-cloud/docker-compose.production.yml",
    "utf8",
  );
  const caddy = readFileSync("deploy/tencent-cloud/Caddyfile", "utf8");

  for (const service of [
    "edge",
    "web",
    "translation-mcp",
    "sms-hook",
    "supabase-gateway",
    "supabase-auth",
    "supabase-rest",
    "postgres",
  ]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  }
  assert.match(compose, /"80:80"/);
  assert.match(compose, /"443:443"/);
  assert.doesNotMatch(compose, /"(?:5432|8787|9000):(?:5432|8787|9000)"/);
  assert.match(compose, /TCR_NAMESPACE/);
  assert.match(compose, /RELEASE_SHA/);
  assert.doesNotMatch(compose, /:latest(?:\s|$)/m);
  assert.match(caddy, /\{\$APP_HOST\}/);
  assert.match(caddy, /\{\$API_HOST\}/);
  assert.equal(existsSync("railway.toml"), false);
  assert.equal(existsSync("vercel.json"), false);
});

test("Tencent deployment examples never contain usable secrets", () => {
  const files = [
    "deploy/tencent-cloud/docker-compose.production.yml",
    "deploy/tencent-cloud/Caddyfile",
    "deploy/tencent-cloud/Dockerfile.web",
    "deploy/tencent-cloud/Dockerfile.translation-mcp",
    "deploy/tencent-cloud/Dockerfile.sms-hook",
    "deploy/tencent-cloud/env.example",
    "deploy/tencent-cloud/secrets.example.env",
    "deploy/tencent-cloud/kong.yml",
  ];
  const source = files.map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(source, /AKID[A-Za-z0-9]{12,}/);
  for (const line of source.split(/\r?\n/)) {
    const sensitive =
      /(?:password|secret|token|api[_-]?key)[ \t]*[:=][ \t]*(.*)$/i.exec(line);
    if (!sensitive) continue;
    const value = sensitive[1].trim();
    assert.equal(value === "" || value.startsWith("${"), true, line);
  }
});

test("self-hosted Auth routes OTP delivery through the private Tencent SMS hook", () => {
  const compose = readFileSync("deploy/tencent-cloud/docker-compose.production.yml", "utf8");
  const auth = serviceBlock(compose, "supabase-auth");
  const secretsExample = readFileSync("deploy/tencent-cloud/secrets.example.env", "utf8");

  assert.match(auth, /GOTRUE_HOOK_SEND_SMS_URI:\s*http:\/\/sms-hook:9000\/hooks\/send-sms/);
  assert.match(auth, /env_file:[\s\S]*?PRODUCTION_SECRETS_FILE/);
  assert.match(secretsExample, /^GOTRUE_HOOK_SEND_SMS_SECRET=$/m);
  assert.match(auth, /GOTRUE_EXTERNAL_PHONE_ENABLED:\s*"true"/);
  assert.match(auth, /GOTRUE_SITE_URL:\s*https:\/\/\$\{APP_HOST\}/);
  assert.match(auth, /API_EXTERNAL_URL:\s*https:\/\/\$\{API_HOST\}/);
  assert.doesNotMatch(auth, /test_otp|123456|twilio/i);
  assert.match(auth, /sms-hook:[\s\S]*?condition:\s*service_healthy/);
});

test("production services read secrets from a root-managed env file and web uses private COS", () => {
  const compose = readFileSync("deploy/tencent-cloud/docker-compose.production.yml", "utf8");
  const environmentExample = readFileSync("deploy/tencent-cloud/env.example", "utf8");
  const secretsExample = readFileSync("deploy/tencent-cloud/secrets.example.env", "utf8");
  const web = serviceBlock(compose, "web");

  assert.match(environmentExample, /^PRODUCTION_SECRETS_FILE=/m);
  assert.doesNotMatch(environmentExample, /^(?:SUPABASE_SERVICE_ROLE_KEY|POSTGRES_PASSWORD|SMS_HOOK_SECRET|TENCENTCLOUD_SECRET_KEY)=/m);
  for (const service of ["web", "translation-mcp", "sms-hook", "supabase-gateway", "supabase-auth", "supabase-rest", "postgres"]) {
    assert.match(serviceBlock(compose, service), /env_file:[\s\S]*?PRODUCTION_SECRETS_FILE/);
  }
  assert.match(web, /CLOUD_STORAGE_PROVIDER:\s*cos/);
  assert.match(web, /COS_REGION:\s*ap-guangzhou/);
  assert.doesNotMatch(compose, /\$\{(?:SUPABASE_SERVICE_ROLE_KEY|POSTGRES_PASSWORD|SMS_HOOK_SECRET|TENCENTCLOUD_SECRET_KEY)(?::-[^}]*)?\}/);
  for (const key of [
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "DATABASE_URL",
    "GOTRUE_HOOK_SEND_SMS_SECRET",
    "SMS_HOOK_SECRET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
  ]) assert.match(secretsExample, new RegExp(`^${key}=$`, "m"));
});

test("MCP, SMS and database remain private while PostgreSQL is durable and health-gated", () => {
  const compose = readFileSync("deploy/tencent-cloud/docker-compose.production.yml", "utf8");
  for (const service of ["translation-mcp", "sms-hook", "postgres"]) {
    const block = serviceBlock(compose, service);
    assert.match(block, /networks:[\s\S]*?- private-net/);
    assert.doesNotMatch(block, /- edge-net/);
    assert.doesNotMatch(block, /ports:/);
  }
  const postgres = serviceBlock(compose, "postgres");
  assert.match(postgres, /postgres-data:\/var\/lib\/postgresql\/data/);
  assert.match(postgres, /healthcheck:/);
  assert.match(postgres, /pg_isready/);
  assert.match(postgres, /stop_grace_period:\s*60s/);
  assert.doesNotMatch(compose, /^  (?:studio|analytics):/m);
});

test("Kong exposes only Auth and REST and local fixed OTP is explicitly non-production", () => {
  const kong = readFileSync("deploy/tencent-cloud/kong.yml", "utf8");
  const localConfig = readFileSync("supabase/config.toml", "utf8");
  assert.deepEqual([...kong.matchAll(/^  - name:\s*([^\s]+)$/gm)].map((match) => match[1]), ["auth", "rest"]);
  assert.match(localConfig, /local Docker development only/i);
  assert.match(localConfig, /self-hosted production Compose/i);
  assert.doesNotMatch(localConfig, /remote Supabase project/i);
});

function serviceBlock(compose: string, service: string) {
  const match = compose.match(new RegExp(`^  ${service}:[\\s\\S]*?(?=^  [a-z][a-z0-9-]*:|^networks:|^volumes:)`, "m"));
  assert.ok(match, `missing ${service} service block`);
  return match[0];
}
