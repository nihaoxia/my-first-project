import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalBackupPayload,
  localBackupStorageEntries,
} from "../src/lib/backup/local-backup-core.ts";
import { restoreLocalBackup } from "../src/lib/backup/local-backup-restore.ts";
import { buildScopedLocalStorageKey } from "../src/lib/storage/local-storage-scope.ts";
import type { LocalStorageAdapter } from "../src/lib/storage/safe-local-storage.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

const scope = "user-scope-test";

test("replaces six scoped categories in fixed order and removes backup-empty data", () => {
  const payload = buildPayload();
  payload.data.notes = [];
  const harness = createStorageHarness(buildCurrentValues("old"));

  const result = restoreLocalBackup(restoreInput(harness.storage, payload));

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(
    harness.events.slice(0, 6),
    actualKeys().map((key) => `read:${key}`),
  );
  assert.deepEqual(
    harness.events.slice(6),
    [
      `primary:write:${actualKey("libraryBooks")}`,
      `primary:write:${actualKey("translations")}`,
      `primary:write:${actualKey("vocabulary")}`,
      `primary:write:${actualKey("sentences")}`,
      `primary:remove:${actualKey("notes")}`,
      `primary:write:${actualKey("readerSelections")}`,
    ],
  );
  assert.equal(harness.values.has(actualKey("notes")), false);
  assert.deepEqual(JSON.parse(harness.values.get(actualKey("libraryBooks"))!), payload.data.libraryBooks);
  assert.deepEqual(
    JSON.parse(harness.values.get(actualKey("readerSelections"))!),
    payload.data.readerSelections,
  );
});

test("does not mutate any key when one of the six snapshot reads fails", () => {
  for (let failureIndex = 0; failureIndex < 6; failureIndex += 1) {
    const before = buildCurrentValues(`read-${failureIndex}`);
    const harness = createStorageHarness(before, { failReadAt: failureIndex });

    assert.deepEqual(restoreLocalBackup(restoreInput(harness.storage)), {
      ok: false,
      code: "READ_FAILED",
    });
    assert.deepEqual(harness.values, before);
    assert.equal(harness.events.some((event) => /^(?:write|remove):/u.test(event)), false);
  }
});

test("rolls back every attempted key in reverse order for each primary failure position", () => {
  for (let failureIndex = 0; failureIndex < 6; failureIndex += 1) {
    const before = buildCurrentValues(`write-${failureIndex}`);
    const harness = createStorageHarness(before, {
      failPrimaryMutationAt: failureIndex,
      mutateBeforePrimaryFailure: true,
    });

    assert.deepEqual(restoreLocalBackup(restoreInput(harness.storage)), {
      ok: false,
      code: "WRITE_FAILED",
      rollback: "complete",
    });
    assert.deepEqual(harness.values, before);

    const primary = harness.events.filter((event) => event.startsWith("primary:"));
    const rollback = harness.events.filter((event) => event.startsWith("rollback:"));
    assert.equal(primary.length, failureIndex + 1);
    assert.deepEqual(
      rollback.map(eventKey),
      actualKeys().slice(0, failureIndex + 1).reverse(),
    );
  }
});

test("restores originally missing keys as missing after a later write fails", () => {
  const before = buildCurrentValues("missing");
  before.delete(actualKey("libraryBooks"));
  const harness = createStorageHarness(before, { failPrimaryMutationAt: 1 });

  assert.deepEqual(restoreLocalBackup(restoreInput(harness.storage)), {
    ok: false,
    code: "WRITE_FAILED",
    rollback: "complete",
  });
  assert.deepEqual(harness.values, before);
  assert.equal(
    harness.events.some(
      (event) => event === `rollback:remove:${actualKey("libraryBooks")}`,
    ),
    true,
  );
});

test("reports rollback failure but continues restoring the other attempted keys", () => {
  const before = buildCurrentValues("rollback-failure");
  const failedRollbackKey = actualKey("translations");
  const harness = createStorageHarness(before, {
    failPrimaryMutationAt: 3,
    failRollbackKey: failedRollbackKey,
  });

  assert.deepEqual(restoreLocalBackup(restoreInput(harness.storage)), {
    ok: false,
    code: "WRITE_FAILED",
    rollback: "failed",
  });
  assert.deepEqual(
    harness.events.filter((event) => event.startsWith("rollback:")).map(eventKey),
    actualKeys().slice(0, 4).reverse(),
  );
  assert.equal(harness.values.get(actualKey("libraryBooks")), before.get(actualKey("libraryBooks")));
  assert.equal(harness.values.get(actualKey("vocabulary")), before.get(actualKey("vocabulary")));
});

test("rejects any account scope change before reading or writing storage", () => {
  for (const overrides of [
    { sourceScopeFingerprint: "other" },
    { inspectedScopeFingerprint: "other" },
    { currentScopeFingerprint: "other" },
  ]) {
    const harness = createStorageHarness(buildCurrentValues("scope"));

    assert.deepEqual(
      restoreLocalBackup({ ...restoreInput(harness.storage), ...overrides }),
      { ok: false, code: "SCOPE_MISMATCH" },
    );
    assert.deepEqual(harness.events, []);
  }
});

function buildPayload() {
  const result = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected valid backup payload");
  return structuredClone(result.payload);
}

function restoreInput(storage: LocalStorageAdapter, payload = buildPayload()) {
  return {
    storage,
    payload,
    sourceScopeFingerprint: scope,
    inspectedScopeFingerprint: scope,
    currentScopeFingerprint: scope,
  };
}

function actualKeys() {
  return localBackupStorageEntries.map(({ baseKey }) => buildScopedLocalStorageKey(baseKey, scope));
}

function actualKey(dataKey: (typeof localBackupStorageEntries)[number]["dataKey"]) {
  const entry = localBackupStorageEntries.find((candidate) => candidate.dataKey === dataKey);
  if (!entry) throw new Error(`missing storage entry: ${dataKey}`);
  return buildScopedLocalStorageKey(entry.baseKey, scope);
}

function buildCurrentValues(label: string) {
  return new Map(actualKeys().map((key, index) => [key, JSON.stringify([`${label}-${index}`])]));
}

function eventKey(event: string) {
  return event.split(":").slice(2).join(":");
}

function createStorageHarness(
  initial: Map<string, string>,
  options: {
    failReadAt?: number;
    failPrimaryMutationAt?: number;
    mutateBeforePrimaryFailure?: boolean;
    failRollbackKey?: string;
  } = {},
) {
  const values = new Map(initial);
  const events: string[] = [];
  let readIndex = 0;
  let primaryMutationIndex = 0;
  let rollingBack = false;

  function mutation(kind: "write" | "remove", key: string, value?: string) {
    const phase = rollingBack ? "rollback" : "primary";
    events.push(`${phase}:${kind}:${key}`);

    if (rollingBack && key === options.failRollbackKey) {
      throw new Error("rollback failed");
    }

    if (!rollingBack && primaryMutationIndex === options.failPrimaryMutationAt) {
      if (options.mutateBeforePrimaryFailure) {
        if (kind === "write") values.set(key, value!);
        else values.delete(key);
      }
      rollingBack = true;
      throw new Error("primary mutation failed");
    }

    primaryMutationIndex += 1;
    if (kind === "write") values.set(key, value!);
    else values.delete(key);
  }

  const storage: LocalStorageAdapter = {
    getItem(key) {
      events.push(`read:${key}`);
      if (readIndex === options.failReadAt) throw new Error("read failed");
      readIndex += 1;
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      mutation("write", key, value);
    },
    removeItem(key) {
      mutation("remove", key);
    },
  };

  return { storage, values, events };
}
