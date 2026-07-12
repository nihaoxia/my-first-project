import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("pins every direct dependency to an exact version", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const specs = [
    ...Object.values(packageJson.dependencies),
    ...Object.values(packageJson.devDependencies),
  ];

  assert.equal(specs.every((specifier) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(specifier)), true);
});

test("type-checks test sources instead of excluding them", () => {
  const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as {
    exclude?: string[];
  };

  assert.equal(tsconfig.exclude?.includes("tests") ?? false, false);
});

test("documents local setup and runs the full verification stack in CI", () => {
  assert.equal(existsSync("README.md"), true);
  assert.equal(existsSync(".github/workflows/ci.yml"), true);

  const readme = readFileSync("README.md", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  assert.equal(readme.includes("pnpm typecheck"), true);
  assert.equal(workflow.includes("pnpm test"), true);
  assert.equal(workflow.includes("pnpm lint"), true);
  assert.equal(workflow.includes("pnpm typecheck"), true);
  assert.equal(workflow.includes("pnpm build"), true);
});

test("documents and continuously verifies the production deployment contract", () => {
  assert.equal(existsSync("docs/PRODUCTION_RUNBOOK.md"), true);

  const readme = readFileSync("README.md", "utf8");
  const runbook = readFileSync("docs/PRODUCTION_RUNBOOK.md", "utf8");
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const environment = readFileSync(".env.example", "utf8");

  assert.match(readme, /docs\/PRODUCTION_RUNBOOK\.md/);
  for (const section of [
    "Supabase",
    "Twilio",
    "Railway",
    "Vercel",
    "回滚",
    "验收",
    "密钥泄漏",
  ]) {
    assert.match(runbook, new RegExp(section));
  }
  assert.match(workflow, /pnpm verify:deployment/);
  assert.match(environment, /^PORT=$/m);
  assert.match(environment, /^PRODUCTION_APP_URL=$/m);
  assert.doesNotMatch(environment, /^PORT=\d+|^PRODUCTION_APP_URL=https:\/\//m);
});
