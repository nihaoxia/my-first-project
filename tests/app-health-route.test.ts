import assert from "node:assert/strict";
import test from "node:test";

import { buildAppHealthResponse } from "../src/app/api/health/route.ts";

const secret = "health-secret-that-must-not-leak";
const validEnvironment = {
  NODE_ENV: "production",
  AUTH_MODE: "edgeone",
  CLOUD_DATA_PROVIDER: "edgeone",
  CLOUD_STORAGE_PROVIDER: "edgeone",
  EDGEONE_BLOB_STORE: "stray-pages-production",
  EDGEONE_SESSION_SECRET: secret.repeat(3),
  EDGEONE_FREE_MODEL_CONFIRMED: "false",
};

test("app health reports stable configured capabilities without internal details", async () => {
  const response = buildAppHealthResponse(validEnvironment);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    status: "ok",
    configured: true,
    capabilities: { web: true, auth: true, blob: true, quota: true },
  });
  const serialized = JSON.stringify(body);
  for (const value of [secret, "stray-pages-production", "edgeone"]) {
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
    capabilities: { web: true, auth: false, blob: false, quota: false },
  });
});
