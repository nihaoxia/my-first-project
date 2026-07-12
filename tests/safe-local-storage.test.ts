import assert from "node:assert/strict";
import test from "node:test";

import {
  safeReadLocalStorage,
  safeRemoveLocalStorage,
  safeWriteLocalStorage,
  getLocalStorageSnapshotFailure,
  toLocalStorageSnapshot,
  type LocalStorageAdapter,
} from "../src/lib/storage/safe-local-storage.ts";

function createStorage(initial: Record<string, string> = {}): LocalStorageAdapter {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("safe storage helpers preserve successful read, write, and remove results", () => {
  const storage = createStorage({ draft: "old" });

  assert.deepEqual(safeReadLocalStorage(storage, "draft"), { ok: true, value: "old" });
  assert.deepEqual(safeWriteLocalStorage(storage, "draft", "new"), { ok: true });
  assert.deepEqual(safeReadLocalStorage(storage, "draft"), { ok: true, value: "new" });
  assert.deepEqual(safeRemoveLocalStorage(storage, "draft"), { ok: true });
  assert.deepEqual(safeReadLocalStorage(storage, "draft"), { ok: true, value: null });
});

test("preserves storage read failures in stable external-store snapshots", () => {
  const snapshot = toLocalStorageSnapshot({ ok: false, reason: "scope-unavailable" });

  assert.equal(typeof snapshot, "string");
  assert.equal(getLocalStorageSnapshotFailure(snapshot), "scope-unavailable");
  assert.equal(getLocalStorageSnapshotFailure("[]"), null);
  assert.equal(toLocalStorageSnapshot({ ok: true, value: null }), null);
});

test("safe storage reports quota exhaustion separately", () => {
  const storage = createStorage();
  storage.setItem = () => {
    throw new DOMException("Storage quota exceeded", "QuotaExceededError");
  };

  assert.deepEqual(safeWriteLocalStorage(storage, "draft", "large value"), {
    ok: false,
    reason: "quota-exceeded",
  });
});

test("safe storage turns unavailable browser storage into recoverable results", () => {
  const storage = createStorage();
  storage.getItem = () => {
    throw new Error("storage disabled");
  };
  storage.setItem = () => {
    throw new Error("storage disabled");
  };
  storage.removeItem = () => {
    throw new Error("storage disabled");
  };

  assert.deepEqual(safeReadLocalStorage(storage, "draft"), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual(safeWriteLocalStorage(storage, "draft", "value"), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual(safeRemoveLocalStorage(storage, "draft"), {
    ok: false,
    reason: "unavailable",
  });
});
