export const localStorageScopeAttribute = "data-local-storage-scope";

export function deriveLocalStorageScope(accountIdentifier: string) {
  const normalizedIdentifier = accountIdentifier.trim().toLowerCase();
  const firstHash = stableHash(normalizedIdentifier, 0x811c9dc5);
  const secondHash = stableHash(`stray-pages:${normalizedIdentifier}`, 0x9e3779b9);

  return `user-${firstHash.toString(36)}-${secondHash.toString(36)}`;
}

export function buildScopedLocalStorageKey(baseKey: string, scope: string) {
  const normalizedBaseKey = baseKey.trim();
  const normalizedScope = scope.trim();

  if (!normalizedBaseKey || !normalizedScope) {
    throw new Error("A base key and account scope are required for local storage.");
  }

  return `${normalizedBaseKey}.${normalizedScope}`;
}

function stableHash(value: string, seed: number) {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}
