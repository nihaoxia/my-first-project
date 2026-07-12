import assert from "node:assert/strict";
import test from "node:test";

let moduleUnderTest: typeof import("../src/lib/edgeone/index-events-core.ts") | undefined;
try {
  moduleUnderTest = await import("../src/lib/edgeone/index-events-core.ts");
} catch {
  // Expected during the first TDD run.
}

function api() {
  if (!moduleUnderTest) assert.fail("index-events-core must be implemented");
  return moduleUnderTest;
}

test("index events produce a stable candidate set without hiding raced resources", () => {
  const candidates = api().collectIndexedResourceIds([
    { id: "30000000-0000-4000-8000-000000000003", resourceId: "book-b", action: "delete", revisionId: "r3", createdAt: "2026-07-12T00:00:03.000Z" },
    { id: "30000000-0000-4000-8000-000000000001", resourceId: "book-a", action: "upsert", revisionId: "r1", createdAt: "2026-07-12T00:00:01.000Z" },
    { id: "30000000-0000-4000-8000-000000000002", resourceId: "book-b", action: "upsert", revisionId: "r2", createdAt: "2026-07-12T00:00:02.000Z" },
  ]);
  assert.deepEqual(candidates, ["book-a", "book-b"]);
});

test("duplicate event ids and invalid actions fail closed", () => {
  const event = { id: "30000000-0000-4000-8000-000000000001", resourceId: "book-a", action: "upsert" as const, revisionId: "r1", createdAt: "2026-07-12T00:00:01.000Z" };
  assert.throws(() => api().collectIndexedResourceIds([event, event]), { code: "INVALID_INDEX_EVENTS" });
  assert.throws(() => api().collectIndexedResourceIds([{ ...event, action: "replace" as never }]), { code: "INVALID_INDEX_EVENTS" });
});
