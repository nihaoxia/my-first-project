import assert from "node:assert/strict";
import test from "node:test";

type Resolver = (environment: Record<string, string | undefined>) =>
  | {
      ok: true;
      config: {
        authMode: "edgeone";
        dataProvider: "edgeone";
        storageProvider: "edgeone";
        blobStore: string;
        sessionSecret: string;
        freeBlobConfirmed: boolean;
        freeModelConfirmed: boolean;
      };
    }
  | {
      ok: false;
      error: {
        code: "ZERO_COST_CONFIG_INVALID" | "ZERO_COST_CONFIG_MISSING";
        invalidKeys: string[];
        missingKeys: string[];
      };
    };

let resolveEdgeOneRuntimeConfig: Resolver | undefined;
try {
  ({ resolveEdgeOneRuntimeConfig } = await import(
    "../src/lib/edgeone/runtime-config-core.ts"
  ));
} catch {
  // The first TDD run deliberately exercises the missing production module.
}

const validEnvironment = {
  NODE_ENV: "production",
  AUTH_MODE: "edgeone",
  CLOUD_DATA_PROVIDER: "edgeone",
  CLOUD_STORAGE_PROVIDER: "edgeone",
  EDGEONE_BLOB_STORE: "stray-pages-production",
  EDGEONE_SESSION_SECRET: "x".repeat(64),
};

function resolver(): Resolver {
  if (typeof resolveEdgeOneRuntimeConfig !== "function") {
    assert.fail("resolveEdgeOneRuntimeConfig must be implemented");
  }
  return resolveEdgeOneRuntimeConfig;
}

test("zero-cost production accepts only EdgeOne auth, data and Blob", () => {
  assert.deepEqual(resolver()(validEnvironment), {
    ok: true,
    config: {
      authMode: "edgeone",
      dataProvider: "edgeone",
      storageProvider: "edgeone",
      blobStore: "stray-pages-production",
      sessionSecret: "x".repeat(64),
      freeBlobConfirmed: false,
      freeModelConfirmed: false,
    },
  });
});

test("zero-cost production rejects every populated paid-provider key", () => {
  const paidKeys = [
    "DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
    "COS_BUCKET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY",
    "TENCENT_SMS_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TRANSLATION_MCP_URL",
    "TRANSLATION_MCP_SECRET",
    "AI_BASE_URL",
    "AI_API_KEY",
    "AI_MODEL",
  ];

  for (const key of paidKeys) {
    const result = resolver()({ ...validEnvironment, [key]: "sensitive-value" });
    assert.equal(result.ok, false, key);
    if (!result.ok) {
      assert.deepEqual(result.error.invalidKeys, [key]);
      assert.doesNotMatch(JSON.stringify(result), /sensitive-value/);
    }
  }
});

test("zero-cost production requires every EdgeOne selector and secret", () => {
  for (const key of [
    "AUTH_MODE",
    "CLOUD_DATA_PROVIDER",
    "CLOUD_STORAGE_PROVIDER",
    "EDGEONE_BLOB_STORE",
    "EDGEONE_SESSION_SECRET",
  ]) {
    const environment = { ...validEnvironment, [key]: undefined };
    const result = resolver()(environment);
    assert.equal(result.ok, false, key);
    if (!result.ok) assert.deepEqual(result.error.missingKeys, [key]);
  }
});

test("zero-cost production rejects alternate providers and malformed values", () => {
  const cases = [
    ["AUTH_MODE", "supabase"],
    ["CLOUD_DATA_PROVIDER", "prisma"],
    ["CLOUD_STORAGE_PROVIDER", "cos"],
    ["EDGEONE_BLOB_STORE", "Invalid Store"],
    ["EDGEONE_SESSION_SECRET", "too-short"],
  ] as const;

  for (const [key, value] of cases) {
    const result = resolver()({ ...validEnvironment, [key]: value });
    assert.equal(result.ok, false, key);
    if (!result.ok) assert.deepEqual(result.error.invalidKeys, [key]);
  }
});

test("empty legacy keys do not make an otherwise free configuration paid", () => {
  assert.equal(
    resolver()({ ...validEnvironment, COS_BUCKET: "   ", DATABASE_URL: "" }).ok,
    true,
  );
});

test("free model calls require an explicit boolean confirmation", () => {
  const confirmed = resolver()({ ...validEnvironment, EDGEONE_FREE_MODEL_CONFIRMED: "true" });
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) assert.equal(confirmed.config.freeModelConfirmed, true);

  const disabled = resolver()({ ...validEnvironment, EDGEONE_FREE_MODEL_CONFIRMED: "false" });
  assert.equal(disabled.ok, true);
  if (disabled.ok) assert.equal(disabled.config.freeModelConfirmed, false);

  const invalid = resolver()({ ...validEnvironment, EDGEONE_FREE_MODEL_CONFIRMED: "yes" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.deepEqual(invalid.error.invalidKeys, ["EDGEONE_FREE_MODEL_CONFIRMED"]);
});

test("Blob writes require an explicit boolean confirmation while omitted means read-only", () => {
  const confirmed = resolver()({ ...validEnvironment, EDGEONE_FREE_BLOB_CONFIRMED: "true" });
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) assert.equal(confirmed.config.freeBlobConfirmed, true);

  const disabled = resolver()({ ...validEnvironment, EDGEONE_FREE_BLOB_CONFIRMED: "false" });
  assert.equal(disabled.ok, true);
  if (disabled.ok) assert.equal(disabled.config.freeBlobConfirmed, false);

  const invalid = resolver()({ ...validEnvironment, EDGEONE_FREE_BLOB_CONFIRMED: "yes" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.deepEqual(invalid.error.invalidKeys, ["EDGEONE_FREE_BLOB_CONFIRMED"]);
});
