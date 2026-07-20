import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(new URL(path, root), "utf8");
  } catch {
    return "";
  }
}

test("EdgeOne deployment uses only the documented free production contract", async () => {
  const [source, deployedSource] = await Promise.all([
    readOrEmpty("edgeone.json"),
    readOrEmpty("deploy/edgeone/edgeone.json"),
  ]);
  assert.notEqual(source, "", "official EdgeOne config must exist at the project root");
  assert.notEqual(deployedSource, "", "missing deploy/edgeone/edgeone.json");
  assert.equal(deployedSource, source, "deployment reference must match the root config byte-for-byte");
  const config = JSON.parse(source) as {
    name?: string;
    buildCommand?: string;
    installCommand?: string;
    nodeVersion?: string;
    headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    cloudFunctions?: { mainlandRegions?: string[]; nodejs?: { maxDuration?: number } };
    schedules?: unknown;
  };

  assert.equal(config.name, "stray-pages");
  assert.equal(config.installCommand, "pnpm install --frozen-lockfile");
  assert.equal(config.buildCommand, "pnpm build");
  assert.match(config.nodeVersion ?? "", /^22\./);
  assert.deepEqual(config.cloudFunctions?.mainlandRegions, ["ap-guangzhou"]);
  assert.equal(Number.isInteger(config.cloudFunctions?.nodejs?.maxDuration), true);
  assert.ok((config.cloudFunctions?.nodejs?.maxDuration ?? Infinity) <= 120);
  assert.equal(config.schedules, undefined, "zero-cost deployment must not schedule background work");

  const globalHeaders = config.headers?.find((entry) => entry.source === "/*")?.headers ?? [];
  const headers = new Map(globalHeaders.map((entry) => [entry.key?.toLowerCase(), entry.value]));
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.match(headers.get("referrer-policy") ?? "", /strict-origin/i);
  assert.match(headers.get("content-security-policy") ?? "", /default-src 'self'/i);
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/i);

  assert.doesNotMatch(source, /docker|tcr|cos|sms|cvm|runinstances|buy\.cloud|purchase/iu);
});

test("EdgeOne environment sample exposes only zero-cost keys and no usable secret", async () => {
  const source = await readOrEmpty("deploy/edgeone/env.example");
  assert.notEqual(source, "", "missing deploy/edgeone/env.example");
  const entries = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const keys = entries.map((line) => line.slice(0, line.indexOf("=")));

  assert.deepEqual(keys, [
    "AUTH_MODE",
    "CLOUD_DATA_PROVIDER",
    "CLOUD_STORAGE_PROVIDER",
    "EDGEONE_BLOB_STORE",
    "EDGEONE_SESSION_SECRET",
    "EDGEONE_FREE_BLOB_CONFIRMED",
    "EDGEONE_FREE_MODEL_CONFIRMED",
    "MAKERS_MODELS_KEY",
    "EDGEONE_PRODUCTION_ORIGIN",
  ]);
  assert.match(source, /^AUTH_MODE=edgeone$/m);
  assert.match(source, /^CLOUD_DATA_PROVIDER=edgeone$/m);
  assert.match(source, /^CLOUD_STORAGE_PROVIDER=edgeone$/m);
  assert.match(source, /^EDGEONE_FREE_MODEL_CONFIRMED=false$/m);
  assert.match(source, /^EDGEONE_FREE_BLOB_CONFIRMED=false$/m);
  assert.match(source, /^EDGEONE_BLOB_STORE=$/m);
  assert.match(source, /^EDGEONE_SESSION_SECRET=$/m);
  assert.match(source, /^MAKERS_MODELS_KEY=$/m);
  assert.match(source, /^EDGEONE_PRODUCTION_ORIGIN=$/m);
  assert.doesNotMatch(source, /prisma|supabase|database_url|cos|tencent|sms|mcp|ai_api_key/iu);
});

test("zero-cost verifier and CI gate the canonical EdgeOne deployment", async () => {
  const [verifier, packageSource, workflow, factory, blobQuota, modelQuota] = await Promise.all([
    readOrEmpty("scripts/verify-zero-cost-production.mjs"),
    readOrEmpty("package.json"),
    readOrEmpty(".github/workflows/ci.yml"),
    readOrEmpty("src/lib/cloud/service-factory.ts"),
    readOrEmpty("src/lib/cloud/edgeone-storage-provider.ts"),
    readOrEmpty("src/lib/cloud/edgeone-translation-quota-core.ts"),
  ]);
  assert.notEqual(verifier, "", "missing zero-cost verifier");
  const packageJson = JSON.parse(packageSource) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.["verify:zero-cost"], "node scripts/verify-zero-cost-production.mjs");
  assert.equal(packageJson.scripts?.["smoke:edgeone"], "node scripts/edgeone-smoke.mjs");
  assert.match(workflow, /pnpm verify:zero-cost/);
  assert.match(workflow, /edgeone-deployment-contract\.test\.ts/);
  assert.match(workflow, /edgeone-smoke\.test\.ts/);

  assert.doesNotMatch(
    factory.match(/^import[^;]+;/gmu)?.join("\n") ?? "",
    /prisma|supabase|cos|sms|mcp/iu,
  );
  assert.match(blobQuota, /EDGEONE_BLOB_QUOTA_LEDGER_ID\s*=\s*"blob-storage-global"/u);
  assert.match(modelQuota, /EDGEONE_MODEL_QUOTA_LEDGER_ID\s*=\s*"translation-model-global"/u);
  for (const required of [
    "deploy/edgeone/edgeone.json",
    "deploy/edgeone/env.example",
    "src/lib/cloud/service-factory.ts",
    "blob-storage-global",
    "translation-model-global",
  ]) assert.match(verifier, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), required);
});

test("the paid production runbook is explicitly deprecated in favor of EdgeOne", async () => {
  const [legacy, current] = await Promise.all([
    readOrEmpty("docs/PRODUCTION_RUNBOOK.md"),
    readOrEmpty("docs/EDGEONE_ZERO_COST_RUNBOOK.md"),
  ]);
  assert.match(legacy.slice(0, 800), /已废弃|废弃/iu);
  assert.match(legacy.slice(0, 800), /EDGEONE_ZERO_COST_RUNBOOK\.md/u);
  assert.match(current, /500,?000|50\s*万/iu);
  assert.match(current, /450,?000|45\s*万/iu);
  assert.match(current, /999\s*MiB/iu);
  assert.match(current, /政策|价格|零费用/iu);
  assert.match(current, /无法确认|停止写入|fail closed/iu);
});

test("zero-cost verifier rejects adversarial deployment and dependency fixtures", async (context) => {
  const config = await readOrEmpty("edgeone.json");
  const environment = await readOrEmpty("deploy/edgeone/env.example");
  const verifierPath = new URL("scripts/verify-zero-cost-production.mjs", root);
  const cases: Array<{
    name: string;
    expectedOk: boolean;
    expectedCode?: string;
    mutate(fixture: Record<string, string>): void;
  }> = [
    {
      name: "valid baseline",
      expectedOk: true,
      mutate() {},
    },
    {
      name: "unknown agent field",
      expectedOk: false,
      expectedCode: "UNKNOWN_DEPLOYMENT_FIELD",
      mutate(fixture) {
        const parsed = JSON.parse(fixture["edgeone.json"]);
        parsed.agents = { framework: "paid-agent" };
        fixture["edgeone.json"] = `${JSON.stringify(parsed)}\n`;
        fixture["deploy/edgeone/edgeone.json"] = fixture["edgeone.json"];
      },
    },
    {
      name: "root contract drift",
      expectedOk: false,
      expectedCode: "DEPLOYMENT_CONTRACT_DRIFT",
      mutate(fixture) {
        fixture["deploy/edgeone/edgeone.json"] = fixture["edgeone.json"].replace("120", "60");
      },
    },
    {
      name: "dynamic production dependency",
      expectedOk: false,
      expectedCode: "DYNAMIC_IMPORT_FORBIDDEN",
      mutate(fixture) {
        fixture["src/lib/cloud/service-factory.ts"] += '\nawait import("adversarial-secret-provider");\n';
      },
    },
    {
      name: "semicolonless external production import",
      expectedOk: false,
      expectedCode: "EXTERNAL_PRODUCTION_IMPORT_FORBIDDEN",
      mutate(fixture) {
        fixture["src/lib/cloud/service-factory.ts"] += '\nimport "adversarial-secret-provider"\n';
      },
    },
    {
      name: "comment-only Blob write gate",
      expectedOk: false,
      expectedCode: "BLOB_WRITE_GATE_MISSING",
      mutate(fixture) {
        fixture["src/lib/cloud/service-factory.ts"] = [
          'import "server-only";',
          "// createWriteGatedAuthoritativeBlobStore(config.freeBlobConfirmed)",
        ].join("\n");
      },
    },
    {
      name: "extra paid environment key",
      expectedOk: false,
      expectedCode: "INVALID_EDGEONE_ENVIRONMENT",
      mutate(fixture) {
        fixture["deploy/edgeone/env.example"] += "DATABASE_URL=adversarial-secret\n";
      },
    },
  ];

  for (const entry of cases) {
    await context.test(entry.name, async () => {
      const directory = await mkdtemp(join(tmpdir(), "stray-pages-zero-cost-"));
      try {
        const fixture: Record<string, string> = {
          "edgeone.json": config,
          "deploy/edgeone/edgeone.json": config,
          "deploy/edgeone/env.example": environment,
          "src/lib/cloud/service-factory.ts": [
            'import "server-only";',
            'import { createWriteGatedAuthoritativeBlobStore } from "../edgeone/blob-store-core";',
            "const config = { freeBlobConfirmed: false };",
            "createWriteGatedAuthoritativeBlobStore(undefined, config.freeBlobConfirmed);",
          ].join("\n"),
          "src/lib/edgeone/blob-store-core.ts":
            "export function createWriteGatedAuthoritativeBlobStore() {}\n",
          "src/lib/cloud/edgeone-storage-provider.ts":
            'export const EDGEONE_BLOB_QUOTA_LEDGER_ID = "blob-storage-global";\n',
          "src/lib/cloud/edgeone-translation-quota-core.ts":
            'export const EDGEONE_MODEL_QUOTA_LEDGER_ID = "translation-model-global";\n',
        };
        entry.mutate(fixture);
        for (const [path, value] of Object.entries(fixture)) {
          const destination = join(directory, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, value, "utf8");
        }
        const result = spawnSync(process.execPath, [fileURLToPath(verifierPath), "--root", directory], {
          encoding: "utf8",
          windowsHide: true,
        });
        assert.equal(result.status === 0, entry.expectedOk, `${entry.name}: ${result.stderr}`);
        if (entry.expectedCode) assert.match(result.stderr, new RegExp(entry.expectedCode));
        assert.doesNotMatch(`${result.stdout}${result.stderr}`, /adversarial-secret/u);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
