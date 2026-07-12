import assert from "node:assert/strict";
import test from "node:test";
import { readLegacyLocalStorage } from "../src/lib/storage/safe-local-storage.ts";
import { buildScopedLocalStorageKey } from "../src/lib/storage/local-storage-scope.ts";

test("reads allowlisted mock-scoped and historical unscoped study keys", () => {
  const values = new Map<string, string>([[buildScopedLocalStorageKey("stray-pages.study-notes", "legacy-mock"), "scoped"], ["stray-pages.study-notes", "unscoped"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem() {}, removeItem() {} };
  assert.deepEqual(readLegacyLocalStorage(storage, "stray-pages.study-notes", "legacy-mock"), { ok: true, value: "scoped" });
  assert.deepEqual(readLegacyLocalStorage(storage, "stray-pages.study-notes", null), { ok: true, value: "unscoped" });
  assert.deepEqual(readLegacyLocalStorage(storage, "auth-token", null), { ok: false, reason: "unavailable" });
});
