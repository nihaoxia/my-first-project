import { buildScopedLocalStorageKey } from "../storage/local-storage-scope.ts";
import {
  safeReadLocalStorage,
  safeRemoveLocalStorage,
  safeWriteLocalStorage,
  type LocalStorageAdapter,
} from "../storage/safe-local-storage.ts";
import {
  localBackupStorageEntries,
  type LocalBackupDataKey,
  type LocalBackupPayloadV1,
} from "./local-backup-core.ts";
import {
  resolveLocalBackupRestoreSelection,
  type LocalBackupRestoreGroup,
} from "./local-backup-merge.ts";

export {
  allLocalBackupRestoreGroups,
  type LocalBackupRestoreGroup,
} from "./local-backup-merge.ts";

export type LocalBackupRestoreResult =
  | { ok: true }
  | { ok: false; code: "SCOPE_MISMATCH" | "INVALID_SELECTION" | "READ_FAILED" }
  | { ok: false; code: "WRITE_FAILED"; rollback: "complete" | "failed" };

export function restoreLocalBackup(input: {
  storage: LocalStorageAdapter;
  payload: LocalBackupPayloadV1;
  selectedGroups: readonly LocalBackupRestoreGroup[];
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
  currentScopeFingerprint: string;
}): LocalBackupRestoreResult {
  if (
    !input.currentScopeFingerprint ||
    input.sourceScopeFingerprint !== input.currentScopeFingerprint ||
    input.inspectedScopeFingerprint !== input.currentScopeFingerprint
  ) {
    return { ok: false, code: "SCOPE_MISMATCH" };
  }

  const selected = resolveLocalBackupRestoreSelection(input.selectedGroups);
  if (!selected.ok) return selected;

  const targets = localBackupStorageEntries
    .filter((entry) => selected.dataKeys.includes(entry.dataKey))
    .map((entry) => ({
      ...entry,
      key: buildScopedLocalStorageKey(entry.baseKey, input.currentScopeFingerprint),
      value: serializeBackupCategory(entry.dataKey, input.payload),
    }));
  const snapshots = new Map<string, string | null>();

  for (const { key } of targets) {
    const result = safeReadLocalStorage(input.storage, key);
    if (!result.ok) return { ok: false, code: "READ_FAILED" };
    snapshots.set(key, result.value);
  }

  const attempted: string[] = [];

  for (const { key, value } of targets) {
    attempted.push(key);
    const result =
      value === null
        ? safeRemoveLocalStorage(input.storage, key)
        : safeWriteLocalStorage(input.storage, key, value);

    if (!result.ok) {
      return rollbackAttemptedKeys(input.storage, attempted, snapshots);
    }
  }

  return { ok: true };
}

function serializeBackupCategory(
  dataKey: LocalBackupDataKey,
  payload: LocalBackupPayloadV1,
) {
  if (dataKey === "readerSelections") {
    const selections = payload.data.readerSelections;
    return selections.vocabularyTexts.length === 0 && selections.sentenceTexts.length === 0
      ? null
      : JSON.stringify(selections);
  }

  const records = payload.data[dataKey];
  return records.length === 0 ? null : JSON.stringify(records);
}

function rollbackAttemptedKeys(
  storage: LocalStorageAdapter,
  attempted: string[],
  snapshots: Map<string, string | null>,
): LocalBackupRestoreResult {
  let rollbackFailed = false;

  for (const key of attempted.slice().reverse()) {
    const originalValue = snapshots.get(key) ?? null;
    const result =
      originalValue === null
        ? safeRemoveLocalStorage(storage, key)
        : safeWriteLocalStorage(storage, key, originalValue);
    if (!result.ok) rollbackFailed = true;
  }

  return {
    ok: false,
    code: "WRITE_FAILED",
    rollback: rollbackFailed ? "failed" : "complete",
  };
}
