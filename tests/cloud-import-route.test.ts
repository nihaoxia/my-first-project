import assert from "node:assert/strict";
import test from "node:test";
import { handleCloudImportRoute, MAX_IMPORT_BODY_BYTES } from "../src/lib/cloud/import-route-core.ts";

const id = "11111111-1111-4111-8111-111111111111";
const binding = "opaque-session-binding";
function headers() { return { "content-type": "application/json", "x-stray-pages-import-binding": binding }; }
function dependencies(overrides: { userId?: string; verify?: boolean; onImport?: () => void } = {}) {
  return {
    getSession: async () => ({ userId: overrides.userId ?? id, role: "USER" as const }),
    verifySessionBinding: async (_userId: string, candidate: string) => (overrides.verify ?? true) && candidate === binding,
    service: { import: async (owner: string, body: unknown) => { overrides.onImport?.(); return { owner, body }; } },
  };
}
test("import endpoint is active-session POST-only and no-store", async () => {
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: headers(), body: JSON.stringify({ version: 1, manifestId: id, items: [] }) }), dependencies());
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).result.owner, id);
});

test("import endpoint rejects a missing or cross-session page binding before reading or writing data", async () => {
  let calls = 0;
  const request = (candidate?: string) => new Request("http://x/api/cloud/import", {
    method: "POST",
    headers: { "content-type": "application/json", ...(candidate ? { "x-stray-pages-import-binding": candidate } : {}) },
    body: JSON.stringify({ version: 1, manifestId: id, items: [] }),
  });
  const missing = await handleCloudImportRoute(request(), dependencies({ onImport: () => { calls += 1; } }));
  const switched = await handleCloudImportRoute(request(binding), dependencies({ userId: "22222222-2222-4222-8222-222222222222", verify: false, onImport: () => { calls += 1; } }));
  assert.equal(missing.status, 409);
  assert.equal(switched.status, 409);
  assert.match(await switched.text(), /SESSION_CHANGED/);
  assert.equal(calls, 0);
});

test("import endpoint enforces content type and streaming body limit", async () => {
  const deps = dependencies();
  assert.equal((await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: { "x-stray-pages-import-binding": binding }, body: "{}" }), deps)).status, 415);
  const oversized = new Request("http://x/api/cloud/import", { method: "POST", headers: headers(), body: "x".repeat(MAX_IMPORT_BODY_BYTES + 1) });
  assert.equal((await handleCloudImportRoute(oversized, deps)).status, 413);
});

test("import endpoint rejects duplicate JSON object keys before parsing", async () => {
  let calls = 0;
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: headers(), body: `{"version":1,"version":1,"manifestId":"${id}","items":[]}` }), dependencies({ onImport: () => { calls += 1; } }));
  assert.equal(response.status, 400); assert.equal(calls, 0);
});

test("extremely deep JSON maps to stable 400 rather than leaking RangeError", async () => {
  const deep = `${"[".repeat(12_000)}0${"]".repeat(12_000)}`;
  const deps = dependencies();
  deps.service.import = async () => { throw Object.assign(new Error("invalid"), { code: "INVALID_IMPORT" }); };
  const response = await handleCloudImportRoute(new Request("http://x/api/cloud/import", { method: "POST", headers: headers(), body: `{"version":1,"manifestId":"${id}","items":${deep}}` }), deps);
  assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /RangeError/);
});
