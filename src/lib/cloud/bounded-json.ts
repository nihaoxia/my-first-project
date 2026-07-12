export function validateBoundedJson(value: unknown, limits: { maxDepth?: number; maxNodes?: number; maxWidth?: number } = {}) {
  const maxDepth = limits.maxDepth ?? 32, maxNodes = limits.maxNodes ?? 10_000, maxWidth = limits.maxWidth ?? 1_000;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]; let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!; nodes += 1;
    if (nodes > maxNodes || current.depth > maxDepth) return false;
    const item = current.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") { if (!Number.isFinite(item)) return false; continue; }
    if (typeof item !== "object") return false;
    const children = Array.isArray(item) ? item : Object.values(item as Record<string, unknown>);
    if (children.length > maxWidth) return false;
    for (const child of children) stack.push({ value: child, depth: current.depth + 1 });
  }
  return true;
}
