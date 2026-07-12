import { buildScopedLocalStorageKey, localStorageScopeAttribute } from "./local-storage-scope.ts";

export type LocalStorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LocalStorageReadResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: "unavailable" | "scope-unavailable" };
export type LocalStorageMutationResult =
  | { ok: true }
  | { ok: false; reason: "quota-exceeded" | "unavailable" | "scope-unavailable" };

export type LocalStorageFailureReason =
  | Extract<LocalStorageReadResult, { ok: false }>["reason"]
  | Extract<LocalStorageMutationResult, { ok: false }>["reason"];

const localStorageFailureSnapshotPrefix = "\u0000stray-pages-storage-error:";

export function toLocalStorageSnapshot(result: LocalStorageReadResult): string | null {
  return result.ok
    ? result.value
    : `${localStorageFailureSnapshotPrefix}${result.reason}`;
}

export function getLocalStorageSnapshotFailure(
  snapshot: string | null | undefined,
): Extract<LocalStorageReadResult, { ok: false }>["reason"] | null {
  if (!snapshot?.startsWith(localStorageFailureSnapshotPrefix)) {
    return null;
  }

  const reason = snapshot.slice(localStorageFailureSnapshotPrefix.length);
  return reason === "unavailable" || reason === "scope-unavailable" ? reason : "unavailable";
}

export function getLocalStorageFailureMessage(reason: LocalStorageFailureReason) {
  if (reason === "quota-exceeded") {
    return "浏览器本地空间不足，内容尚未保存。请移除不需要的本地书籍，或改用更小的 TXT 文件。";
  }

  if (reason === "scope-unavailable") {
    return "当前登录状态无法确定本地数据归属，请重新登录后再试。";
  }

  return "浏览器已禁用或无法访问本地存储，内容尚未保存。请检查隐私设置后重试。";
}

export function safeReadLocalStorage(storage: LocalStorageAdapter, key: string): LocalStorageReadResult {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

const legacyImportKeys = new Set(["stray-pages.study-vocabulary", "stray-pages.study-sentences", "stray-pages.study-notes", "stray-pages.reader-selections"]);
export function readLegacyLocalStorage(storage: LocalStorageAdapter, baseKey: string, scope: string | null): LocalStorageReadResult {
  if (!legacyImportKeys.has(baseKey)) return { ok: false, reason: "unavailable" };
  return safeReadLocalStorage(storage, scope ? buildScopedLocalStorageKey(baseKey, scope) : baseKey);
}

export function safeWriteLocalStorage(
  storage: LocalStorageAdapter,
  key: string,
  value: string,
): LocalStorageMutationResult {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: isQuotaExceededError(error) ? "quota-exceeded" : "unavailable" };
  }
}

export function safeRemoveLocalStorage(
  storage: LocalStorageAdapter,
  key: string,
): LocalStorageMutationResult {
  try {
    storage.removeItem(key);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function readScopedLocalStorage(baseKey: string): LocalStorageReadResult {
  const target = getBrowserStorage(baseKey);
  return target.ok ? safeReadLocalStorage(target.storage, target.key) : target;
}

export function writeScopedLocalStorage(baseKey: string, value: string): LocalStorageMutationResult {
  const target = getBrowserStorage(baseKey);
  return target.ok ? safeWriteLocalStorage(target.storage, target.key, value) : target;
}

export function removeScopedLocalStorage(baseKey: string): LocalStorageMutationResult {
  const target = getBrowserStorage(baseKey);
  return target.ok ? safeRemoveLocalStorage(target.storage, target.key) : target;
}

function getBrowserStorage(baseKey: string):
  | { ok: true; storage: LocalStorageAdapter; key: string }
  | { ok: false; reason: "unavailable" | "scope-unavailable" } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, reason: "unavailable" };
  }

  const element = document.querySelector<HTMLElement>(`[${localStorageScopeAttribute}]`);
  const scope = element?.getAttribute(localStorageScopeAttribute)?.trim();
  if (!scope) {
    return { ok: false, reason: "scope-unavailable" };
  }

  try {
    return { ok: true, storage: window.localStorage, key: buildScopedLocalStorageKey(baseKey, scope) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" || candidate.code === 22 || candidate.code === 1014;
}
