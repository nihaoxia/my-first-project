import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("pins every direct dependency to an exact version", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const specs = [...Object.values(packageJson.dependencies), ...Object.values(packageJson.devDependencies)];
  assert.equal(specs.every((specifier) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(specifier)), true);
});

test("type-checks test sources instead of excluding them", () => {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { exclude?: string[] };
  assert.equal(tsconfig.exclude?.includes("tests") ?? false, false);
});

test("documents local setup and runs every production verification gate in CI", () => {
  assert.equal(existsSync("README.md"), true);
  assert.equal(existsSync(".github/workflows/ci.yml"), true);
  const readme = readFileSync("README.md", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  assert.match(readme, /pnpm typecheck/);
  for (const command of [
    "pnpm db:generate",
    "pnpm test",
    "pnpm verify:deployment",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm db:validate",
    "pnpm mcp:translation:build",
    "pnpm sms-hook:build",
    "pnpm build",
  ]) assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workflow, /docker compose[\s\S]*?config --quiet/);
  for (const dockerfile of ["Dockerfile.web", "Dockerfile.translation-mcp", "Dockerfile.sms-hook"]) {
    assert.match(workflow, new RegExp(`docker build[^\\n]+${dockerfile.replace(".", "\\.")}`));
  }
  assert.ok(workflow.indexOf("pnpm db:generate") < workflow.indexOf("pnpm typecheck"));
});

test("documents and continuously verifies the Tencent production contract", () => {
  assert.equal(existsSync("docs/PRODUCTION_RUNBOOK.md"), true);
  const readme = readFileSync("README.md", "utf8");
  const runbook = readFileSync("docs/PRODUCTION_RUNBOOK.md", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const environment = readFileSync(".env.example", "utf8");

  assert.match(readme, /docs\/PRODUCTION_RUNBOOK\.md/);
  assert.match(readme, /腾讯云广州/);
  assert.match(readme, /自托管 Supabase/);
  for (const section of [
    "腾讯云实名认证",
    "广州",
    "TCR",
    "COS",
    "短信签名",
    "ICP备案",
    "migration",
    "快照",
    "加密备份",
    "恢复演练",
    "密钥泄漏",
    "回滚",
    "验收",
  ]) assert.match(runbook, new RegExp(section));
  assert.doesNotMatch(runbook, /Vercel|Railway|Twilio|Singapore|(?:^|[^自])托管 Supabase/i);
  assert.match(workflow, /pnpm verify:deployment/);
  assert.match(environment, /^PORT=$/m);
  assert.match(environment, /^PRODUCTION_APP_URL=$/m);
  assert.match(environment, /^PRODUCTION_SUPABASE_URL=$/m);
  assert.doesNotMatch(environment, /^PORT=\d+|^PRODUCTION_APP_URL=https:\/\//m);
});
