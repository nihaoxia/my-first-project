import assert from "node:assert/strict";
import test from "node:test";

import { createShelfCategory, defaultShelfCollections } from "../src/lib/library/library-categories.ts";

test("creates a new shelf category with normalized title", () => {
  const result = createShelfCategory(defaultShelfCollections, "  旅行阅读  ");

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.category.title, "旅行阅读");
  assert.equal(result.categories.length, defaultShelfCollections.length + 1);
  assert.equal(result.category.detail, "共 0 本");
});

test("rejects empty shelf category names", () => {
  assert.deepEqual(createShelfCategory(defaultShelfCollections, "   "), {
    ok: false,
    reason: "empty-title",
  });
});

test("rejects duplicated shelf category names", () => {
  assert.deepEqual(createShelfCategory(defaultShelfCollections, "最近在读"), {
    ok: false,
    reason: "duplicate-title",
  });
});
