import assert from "node:assert/strict";
import test from "node:test";
import { handleCloudImportRoute, MAX_IMPORT_BODY_BYTES } from "../src/lib/cloud/import-route-core.ts";

const id = "11111111-1111-4111-8111-111111111111";
test("import endpoint is active-session POST-only and no-store", async () => {
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1, manifestId: id, items: [] }) }), { getSession: async () => ({ userId: id, role: "USER" }), service: { import: async (owner, body) => ({ owner, body }) } });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).result.owner, id);
});

test("import endpoint enforces content type and streaming body limit", async () => {
  const dependencies = { getSession: async () => ({ userId: id, role: "USER" as const }), service: { import: async () => ({}) } };
  assert.equal((await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", body: "{}" }), dependencies)).status, 415);
  const oversized = new Request("http://x/api/cloud/import", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(MAX_IMPORT_BODY_BYTES + 1) });
  assert.equal((await handleCloudImportRoute(oversized, dependencies)).status, 413);
});

test("import endpoint rejects duplicate JSON object keys before parsing", async () => {
  let calls = 0;
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: { "content-type": "application/json" }, body: `{"version":1,"version":1,"manifestId":"${id}","items":[]}` }), { getSession: async () => ({ userId: id, role: "USER" }), service: { import: async () => { calls += 1; return {}; } } });
  assert.equal(response.status, 400); assert.equal(calls, 0);
});

test("extremely deep JSON maps to stable 400 rather than leaking RangeError", async () => {
  const deep = `${"[".repeat(12_000)}0${"]".repeat(12_000)}`;
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: { "content-type": "application/json" }, body: `{"version":1,"manifestId":"${id}","items":${deep}}` }), { getSession: async () => ({ userId: id, role: "USER" }), service: { import: async () => { throw Object.assign(new Error("invalid"), { code: "INVALID_IMPORT" }); } } });
  assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /RangeError/);
});
