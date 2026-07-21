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
  buildLocalBackupMergePlan,
  resolveLocalBackupRestoreSelection,
  type LocalBackupMergeErrorCode,
  type LocalBackupMergePlan,
  type LocalBackupRestoreGroup,
  type LocalBackupRestoreMode,
} from "./local-backup-merge.ts";

export {
  allLocalBackupRestoreGroups,
  type LocalBackupRestoreGroup,
  type LocalBackupRestoreMode,
} from "./local-backup-merge.ts";

type RestoreScopeInput = {
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
  currentScopeFingerprint: string;
};

type CommonRestoreInput = RestoreScopeInput & {
  storage: LocalStorageAdapter;
  payload: LocalBackupPayloadV1;
  selectedGroups: readonly LocalBackupRestoreGroup[];
};

export type LocalBackupMergeInspection = {
  selectedGroups: readonly LocalBackupRestoreGroup[];
  inspectedScopeFingerprint: string;
  currentRawValues: Partial<Record<LocalBackupDataKey, string | null>>;
  preview: LocalBackupMergePlan["preview"];
  changedDataKeys: readonly LocalBackupDataKey[];
  targetRawValues: Partial<Record<LocalBackupDataKey, string>>;
};

export type LocalBackupMergeInspectionResult =
  | { ok: true; inspection: LocalBackupMergeInspection }
  | {
      ok: false;
      code:
        | "SCOPE_MISMATCH"
        | "INVALID_SELECTION"
        | "READ_FAILED"
        | Exclude<LocalBackupMergeErrorCode, "INVALID_SELECTION">;
    };

export type LocalBackupRestoreResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "SCOPE_MISMATCH"
        | "INVALID_MODE"
        | "INVALID_SELECTION"
        | "INVALID_MERGE_INSPECTION"
        | "CURRENT_DATA_CHANGED"
        | "READ_FAILED"
        | Exclude<LocalBackupMergeErrorCode, "INVALID_SELECTION">;
    }
  | { ok: false; code: "WRITE_FAILED"; rollback: "complete" | "failed" };

export type LocalBackupRestoreInput = CommonRestoreInput &
  (
    | { mode: "replace"; mergeInspection?: never }
    | { mode: "merge"; mergeInspection: LocalBackupMergeInspection }
  );

export function inspectLocalBackupMerge(
  input: CommonRestoreInput,
): LocalBackupMergeInspectionResult {
  const scope = validateRestoreScope(input);
  if (!scope.ok) return scope;

  const selected = resolveLocalBackupRestoreSelection(input.selectedGroups);
  if (!selected.ok) return selected;

  const currentRawValues = readSelectedRawValues(input, selected.dataKeys);
  if (!currentRawValues.ok) return currentRawValues;

  const plan = buildLocalBackupMergePlan({
    currentRawValues: currentRawValues.values,
    payload: input.payload,
    selectedGroups: selected.groups,
  });
  if (!plan.ok) return plan;

  return {
    ok: true,
    inspection: {
      selectedGroups: [...selected.groups],
      inspectedScopeFingerprint: input.currentScopeFingerprint,
      currentRawValues: { ...currentRawValues.values },
      preview: structuredClone(plan.preview),
      changedDataKeys: [...plan.changedDataKeys],
      targetRawValues: { ...plan.targetRawValues },
    },
  };
}

export function restoreLocalBackup(input: LocalBackupRestoreInput): LocalBackupRestoreResult {
  const runtimeInput = input as CommonRestoreInput & {
    mode: unknown;
    mergeInspection?: unknown;
  };
  const scope = validateRestoreScope(runtimeInput);
  if (!scope.ok) return scope;
  if (!isLocalBackupRestoreMode(runtimeInput.mode)) {
    return { ok: false, code: "INVALID_MODE" };
  }

  const selected = resolveLocalBackupRestoreSelection(runtimeInput.selectedGroups);
  if (!selected.ok) return selected;

  const mergeInspection =
    runtimeInput.mode === "merge"
      ? validateMergeInspection(
          runtimeInput.mergeInspection,
          runtimeInput.payload,
          selected.groups,
          selected.dataKeys,
          runtimeInput.currentScopeFingerprint,
        )
      : null;
  if (runtimeInput.mode === "merge" && !mergeInspection) {
    return { ok: false, code: "INVALID_MERGE_INSPECTION" };
  }

  const currentRawValues = readSelectedRawValues(runtimeInput, selected.dataKeys);
  if (!currentRawValues.ok) return currentRawValues;

  let targets: Array<{
    dataKey: LocalBackupDataKey;
    key: string;
    value: string | null;
  }>;

  if (runtimeInput.mode === "merge") {
    if (
      selected.dataKeys.some(
        (dataKey) =>
          currentRawValues.values[dataKey] !== mergeInspection!.currentRawValues[dataKey],
      )
    ) {
      return { ok: false, code: "CURRENT_DATA_CHANGED" };
    }

    const plan = buildLocalBackupMergePlan({
      currentRawValues: currentRawValues.values,
      payload: runtimeInput.payload,
      selectedGroups: selected.groups,
    });
    if (!plan.ok) return plan;
    if (!mergePlansMatch(plan, mergeInspection!)) {
      return { ok: false, code: "CURRENT_DATA_CHANGED" };
    }

    targets = plan.changedDataKeys.map((dataKey) => {
      const entry = getStorageEntry(dataKey);
      return {
        dataKey,
        key: buildScopedLocalStorageKey(entry.baseKey, runtimeInput.currentScopeFingerprint),
        value: plan.targetRawValues[dataKey]!,
      };
    });
  } else {
    targets = selected.dataKeys.map((dataKey) => {
      const entry = getStorageEntry(dataKey);
      return {
        dataKey,
        key: buildScopedLocalStorageKey(entry.baseKey, runtimeInput.currentScopeFingerprint),
        value: serializeBackupCategory(dataKey, runtimeInput.payload),
      };
    });
  }

  const snapshots = new Map<string, string | null>();
  for (const dataKey of selected.dataKeys) {
    const entry = getStorageEntry(dataKey);
    const key = buildScopedLocalStorageKey(entry.baseKey, runtimeInput.currentScopeFingerprint);
    snapshots.set(key, currentRawValues.values[dataKey] ?? null);
  }

  const attempted: string[] = [];
  for (const { key, value } of targets) {
    attempted.push(key);
    const result =
      value === null
        ? safeRemoveLocalStorage(runtimeInput.storage, key)
        : safeWriteLocalStorage(runtimeInput.storage, key, value);
    if (!result.ok) {
      return rollbackAttemptedKeys(runtimeInput.storage, attempted, snapshots);
    }
  }

  return { ok: true };
}

function validateRestoreScope(input: RestoreScopeInput) {
  return !input.currentScopeFingerprint ||
    input.sourceScopeFingerprint !== input.currentScopeFingerprint ||
    input.inspectedScopeFingerprint !== input.currentScopeFingerprint
    ? ({ ok: false, code: "SCOPE_MISMATCH" } as const)
    : ({ ok: true } as const);
}

function readSelectedRawValues(
  input: Pick<CommonRestoreInput, "storage" | "currentScopeFingerprint">,
  dataKeys: readonly LocalBackupDataKey[],
):
  | { ok: true; values: Partial<Record<LocalBackupDataKey, string | null>> }
  | { ok: false; code: "READ_FAILED" } {
  const values: Partial<Record<LocalBackupDataKey, string | null>> = {};
  for (const dataKey of dataKeys) {
    const entry = getStorageEntry(dataKey);
    const key = buildScopedLocalStorageKey(entry.baseKey, input.currentScopeFingerprint);
    const result = safeReadLocalStorage(input.storage, key);
    if (!result.ok) return { ok: false, code: "READ_FAILED" };
    values[dataKey] = result.value;
  }
  return { ok: true, values };
}

function validateMergeInspection(
  value: unknown,
  payload: LocalBackupPayloadV1,
  selectedGroups: readonly LocalBackupRestoreGroup[],
  selectedDataKeys: readonly LocalBackupDataKey[],
  currentScopeFingerprint: string,
): LocalBackupMergeInspection | null {
  if (!isRecord(value)) return null;
  if (
    value.inspectedScopeFingerprint !== currentScopeFingerprint ||
    !arraysEqual(value.selectedGroups, selectedGroups) ||
    !isExactRawValueRecord(value.currentRawValues, selectedDataKeys)
  ) {
    return null;
  }

  const expected = buildLocalBackupMergePlan({
    currentRawValues: value.currentRawValues,
    payload,
    selectedGroups,
  });
  if (!expected.ok) return null;

  const candidate = {
    preview: value.preview,
    changedDataKeys: value.changedDataKeys,
    targetRawValues: value.targetRawValues,
  };
  if (safeStableJson(candidate) !== safeStableJson(expectedPlanShape(expected))) {
    return null;
  }

  return value as LocalBackupMergeInspection;
}

function mergePlansMatch(
  plan: LocalBackupMergePlan,
  inspection: LocalBackupMergeInspection,
) {
  return (
    safeStableJson(expectedPlanShape(plan)) ===
    safeStableJson({
      preview: inspection.preview,
      changedDataKeys: inspection.changedDataKeys,
      targetRawValues: inspection.targetRawValues,
    })
  );
}

function expectedPlanShape(plan: LocalBackupMergePlan) {
  return {
    preview: plan.preview,
    changedDataKeys: plan.changedDataKeys,
    targetRawValues: plan.targetRawValues,
  };
}

function isExactRawValueRecord(
  value: unknown,
  selectedDataKeys: readonly LocalBackupDataKey[],
): value is Partial<Record<LocalBackupDataKey, string | null>> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === selectedDataKeys.length &&
    selectedDataKeys.every(
      (dataKey) =>
        Object.prototype.hasOwnProperty.call(value, dataKey) &&
        (typeof value[dataKey] === "string" || value[dataKey] === null),
    )
  );
}

function arraysEqual(value: unknown, expected: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((candidate, index) => candidate === expected[index])
  );
}

function safeStableJson(value: unknown) {
  try {
    return JSON.stringify(value, (_key, candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return candidate;
      }
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    });
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalBackupRestoreMode(value: unknown): value is LocalBackupRestoreMode {
  return value === "merge" || value === "replace";
}

function getStorageEntry(dataKey: LocalBackupDataKey) {
  const entry = localBackupStorageEntries.find((candidate) => candidate.dataKey === dataKey);
  if (!entry) throw new Error(`Missing local backup storage entry: ${dataKey}`);
  return entry;
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
