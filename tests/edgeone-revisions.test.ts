import assert from "node:assert/strict";
import test from "node:test";

let moduleUnderTest: typeof import("../src/lib/edgeone/revisions-core.ts") | undefined;
try {
  moduleUnderTest = await import("../src/lib/edgeone/revisions-core.ts");
} catch {
  // Expected during the first TDD run.
}

function api() {
  if (!moduleUnderTest) assert.fail("revisions-core must be implemented");
  return moduleUnderTest;
}

const root = {
  id: "10000000-0000-4000-8000-000000000001",
  parentIds: [],
  operationId: "20000000-0000-4000-8000-000000000001",
  createdAt: "2026-07-12T00:00:00.000Z",
  deleted: false,
  value: { title: "Root" },
};
const left = {
  ...root,
  id: "10000000-0000-4000-8000-000000000002",
  parentIds: [root.id],
  operationId: "20000000-0000-4000-8000-000000000002",
  value: { title: "Left" },
};
const right = {
  ...root,
  id: "10000000-0000-4000-8000-000000000003",
  parentIds: [root.id],
  operationId: "20000000-0000-4000-8000-000000000003",
  value: { title: "Right" },
};

test("an empty revision set is missing and one leaf is current", () => {
  assert.deepEqual(api().resolveRevisionState([]), { kind: "missing" });
  assert.deepEqual(api().resolveRevisionState([root, left]), {
    kind: "current",
    revision: left,
  });
});

test("parallel children remain a conflict instead of choosing last write", () => {
  const state = api().resolveRevisionState([root, right, left]);
  assert.equal(state.kind, "conflict");
  if (state.kind === "conflict") {
    assert.deepEqual(state.leaves.map((item) => item.id), [left.id, right.id]);
  }
});

test("a merge must reference every current conflict leaf", () => {
  assert.throws(
    () => api().assertMergeParents([left.id], [left, right]),
    { code: "INVALID_MERGE_PARENTS" },
  );
  assert.doesNotThrow(() => api().assertMergeParents([right.id, left.id], [left, right]));
});

test("missing parents, duplicate ids and cycles are rejected", () => {
  assert.throws(
    () => api().resolveRevisionState([{ ...left, parentIds: [right.id] }]),
    { code: "INVALID_REVISION_GRAPH" },
  );
  assert.throws(() => api().resolveRevisionState([root, root]), { code: "INVALID_REVISION_GRAPH" });
  assert.throws(
    () => api().resolveRevisionState([
      { ...left, parentIds: [right.id] },
      { ...right, parentIds: [left.id] },
    ]),
    { code: "INVALID_REVISION_GRAPH" },
  );
});
