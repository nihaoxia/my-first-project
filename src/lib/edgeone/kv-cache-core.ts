export type EdgeOneKvBinding = {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type EdgeOneListCache = {
  getList<T>(key: string, sourceRevisionSetHash: string): Promise<T[] | null>;
  putList<T>(key: string, sourceRevisionSetHash: string, items: T[]): Promise<void>;
  remove(key: string): Promise<void>;
};

const MAX_AGE_MS = 60_000;

export function createEdgeOneListCache(
  kv: EdgeOneKvBinding,
  now: () => Date = () => new Date(),
): EdgeOneListCache {
  return {
    async getList<T>(key: string, sourceRevisionSetHash: string) {
      try {
        const raw = await kv.get(key);
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        if (
          record.sourceRevisionSetHash !== sourceRevisionSetHash ||
          typeof record.generatedAt !== "string" ||
          !Array.isArray(record.items)
        ) return null;
        const age = now().getTime() - Date.parse(record.generatedAt);
        if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
        return record.items as T[];
      } catch {
        return null;
      }
    },
    async putList<T>(key: string, sourceRevisionSetHash: string, items: T[]) {
      await kv.put(key, JSON.stringify({
        sourceRevisionSetHash,
        generatedAt: now().toISOString(),
        items,
      }));
    },
    async remove(key: string) {
      await kv.delete(key);
    },
  };
}
