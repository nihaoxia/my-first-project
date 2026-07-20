import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let subject: typeof import("../src/lib/cloud/service-factory-core.ts") | undefined;
try { subject = await import("../src/lib/cloud/service-factory-core.ts"); } catch { /* red */ }
function api() { if (!subject) assert.fail("EdgeOne service factory core must be implemented"); return subject; }

const environment = {
  NODE_ENV: "production",
  AUTH_MODE: "edgeone",
  CLOUD_DATA_PROVIDER: "edgeone",
  CLOUD_STORAGE_PROVIDER: "edgeone",
  EDGEONE_BLOB_STORE: "stray-pages-production",
  EDGEONE_SESSION_SECRET: "x".repeat(64),
  EDGEONE_FREE_MODEL_CONFIRMED: "false",
};

test("zero-cost production initializes only the EdgeOne service graph", () => {
  const calls = { edgeone: 0, prisma: 0, supabase: 0, cos: 0, sms: 0, mcp: 0 };
  const expected = { kind: "edgeone" as const };
  const result = api().createProductionCloudServices({
    environment,
    factories: {
      edgeone(config) { calls.edgeone += 1; assert.equal(config.blobStore, "stray-pages-production"); return expected; },
      prisma() { calls.prisma += 1; throw new Error("forbidden"); },
      supabase() { calls.supabase += 1; throw new Error("forbidden"); },
      cos() { calls.cos += 1; throw new Error("forbidden"); },
      sms() { calls.sms += 1; throw new Error("forbidden"); },
      mcp() { calls.mcp += 1; throw new Error("forbidden"); },
    },
  });
  assert.equal(result, expected);
  assert.deepEqual(calls, { edgeone: 1, prisma: 0, supabase: 0, cos: 0, sms: 0, mcp: 0 });
});

test("invalid or paid production selectors fail before every constructor", () => {
  let calls = 0;
  const factories = {
    edgeone() { calls += 1; return {}; }, prisma() { calls += 1; return {}; }, supabase() { calls += 1; return {}; },
    cos() { calls += 1; return {}; }, sms() { calls += 1; return {}; }, mcp() { calls += 1; return {}; },
  };
  assert.throws(() => api().createProductionCloudServices({
    environment: { ...environment, CLOUD_DATA_PROVIDER: "prisma" }, factories,
  }), { code: "ZERO_COST_CONFIG_INVALID" });
  assert.equal(calls, 0);
});

test("runtime factory imports no paid client and EdgeOne getters delegate to it", async () => {
  const factory = await readFile(new URL("../src/lib/cloud/service-factory.ts", import.meta.url), "utf8");
  assert.doesNotMatch(factory, /from\s+["'][^"']*(?:@prisma|supabase|cos-storage|mcp-translation|tencent.*sms)[^"']*["']/i);
  assert.match(factory, /createProductionCloudServices/);
  assert.match(factory, /createEdgeOneAccountService/);
  assert.match(factory, /createWriteGatedAuthoritativeBlobStore/);
  assert.match(factory, /config\.freeBlobConfirmed/);
  assert.match(factory, /createEdgeOneBooksRepository/);
  assert.match(factory, /createEdgeOneStudyRepository/);
  assert.match(factory, /createEdgeOneImportRepository/);
  assert.match(factory, /createEdgeOneTranslationsRepository/);

  for (const path of ["books.ts", "study.ts", "import.ts", "translations.ts", "storage.ts"]) {
    const source = await readFile(new URL(`../src/lib/cloud/${path}`, import.meta.url), "utf8");
    assert.match(source, /getCloudServices\(\)/, path);
  }
});
