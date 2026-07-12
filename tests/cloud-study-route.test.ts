import assert from "node:assert/strict";
import test from "node:test";
import { handleCloudStudyRoute } from "../src/lib/cloud/study-route-core.ts";

const id = "11111111-1111-4111-8111-111111111111";
function deps(role: "USER" | "BANNED" = "USER") { const calls: unknown[][] = []; return { calls, dependencies: { getSession: async () => ({ userId: id, role }), service: { list: async (...args: unknown[]) => { calls.push(["list", ...args]); return { items: [], nextCursor: null }; }, create: async (...args: unknown[]) => { calls.push(["create", ...args]); return { id }; }, update: async (...args: unknown[]) => { calls.push(["update", ...args]); return { id }; }, delete: async (...args: unknown[]) => { calls.push(["delete", ...args]); return { deleted: true }; }, upsertReading: async (...args: unknown[]) => { calls.push(["reading", ...args]); return { id }; } } } }; }

test("study route derives identity from active session and dispatches CRUD", async () => {
  const h = deps();
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study?kind=vocabulary"), h.dependencies)).status, 200);
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "note", title: "x", content: "", target: { type: "freeform" } }) }), h.dependencies)).status, 201);
  assert.deepEqual(h.calls.map((call) => call[0]), ["list", "create"]);
  assert.equal(h.calls[0][1], id);
});

test("study GET validates cursor pagination and returns the page envelope", async () => {
  const h = deps();
  const response = await handleCloudStudyRoute(new Request(`http://x/api/cloud/study?kind=note&limit=25&cursor=${id}`), h.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], nextCursor: null });
  assert.deepEqual(h.calls[0], ["list", id, { kind: "note", bookId: undefined, limit: "25", cursor: id }]);
  for (const query of ["kind=note&limit=0", "kind=note&limit=101", "kind=note&cursor=no", "kind=note&unknown=1"]) {
    assert.equal((await handleCloudStudyRoute(new Request(`http://x/api/cloud/study?${query}`), deps().dependencies)).status, 400);
  }
});

test("study route rejects banned, media type, malformed and oversized requests with stable errors", async () => {
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study?kind=note"), deps("BANNED").dependencies)).status, 401);
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "POST", body: "{}" }), deps().dependencies)).status, 415);
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), deps().dependencies)).status, 400);
  assert.equal((await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "note", title: "x", content: "x".repeat(17_000), target: { type: "freeform" } }) }), deps().dependencies)).status, 413);
});

test("study route maps owner-scoped not-found and conflicts without leaking errors", async () => {
  const h = deps(); h.dependencies.service.update = async () => { throw Object.assign(new Error("database secret"), { code: "STUDY_ITEM_NOT_FOUND" }); };
  const response = await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, kind: "note", title: "x" }) }), h.dependencies);
  assert.equal(response.status, 404); assert.doesNotMatch(await response.text(), /database secret/);
});

test("deep study JSON maps validation to stable 400", async () => {
  const h = deps(); h.dependencies.service.upsertReading = async () => { throw Object.assign(new Error("deep"), { code: "INVALID_STUDY_INPUT" }); };
  // The service separately covers depth 12,000. Forty levels remain below the
  // route's authoritative 16 KiB body limit, so this verifies the 400 mapping.
  const deep = `${"[".repeat(40)}0${"]".repeat(40)}`;
  const response = await handleCloudStudyRoute(new Request("http://x/api/cloud/study", { method: "POST", headers: { "content-type": "application/json" }, body: `{"kind":"reading","settings":${deep}}` }), h.dependencies);
  assert.equal(response.status, 400); assert.doesNotMatch(await response.text(), /RangeError/);
});
