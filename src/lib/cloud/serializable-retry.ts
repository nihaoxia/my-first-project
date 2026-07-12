export type SerializableRetryOptions = {
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export async function withSerializableRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: SerializableRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.min(4, Math.max(1, options.maxAttempts ?? 3));
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  for (let attempt = 1; ; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      if (attempt >= maxAttempts || !isSerializableConflict(error)) throw error;
      await sleep(5 * attempt + Math.floor(random() * 16));
    }
  }
}

export async function withSerializableReconciliation<T>(
  operation: () => Promise<T>,
  confirm: () => Promise<{ confirmed: true; value: T } | { confirmed: false }>,
  options: SerializableRetryOptions = {},
): Promise<T> {
  return withSerializableRetry(async () => {
    try { return await operation(); }
    catch (error) {
      const result = await confirm();
      if (result.confirmed) return result.value;
      throw error;
    }
  }, options);
}

export function isSerializableConflict(error: unknown) {
  if (!isRecord(error)) return false;
  const candidates = [error.code, error.sqlState, error.sqlstate, isRecord(error.meta) ? error.meta.code : undefined];
  return candidates.some((code) => code === "P2034" || code === "40001" || code === "40P01");
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
