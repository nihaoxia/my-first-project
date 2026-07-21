import { readRequestBytesWithLimit } from "./books-route-core.ts";

type Session = { userId: string; role: "USER" | "ADMIN" | "BANNED" } | null;
export const MAX_IMPORT_BODY_BYTES = 2 * 1024 * 1024;
export const CLOUD_IMPORT_SESSION_BINDING_HEADER = "x-stray-pages-import-binding";
export type CloudImportRouteDependencies = {
  getSession(): Promise<Session>;
  verifySessionBinding(userId: string, token: string): Promise<boolean> | boolean;
  service: { import(userId: string, body: unknown): Promise<unknown> };
};

export async function handleCloudImportRoute(request: Request, dependencies: CloudImportRouteDependencies) {
  let session: Session;
  try { session = await dependencies.getSession(); } catch (cause) { return mapped(cause); }
  if (!session || session.role === "BANNED") return error("AUTH_REQUIRED", 401, "Authentication is required.");
  if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  const binding = request.headers.get(CLOUD_IMPORT_SESSION_BINDING_HEADER) ?? "";
  let bindingValid = false;
  try { bindingValid = Boolean(binding && await dependencies.verifySessionBinding(session.userId, binding)); } catch { bindingValid = false; }
  if (!bindingValid) return error("SESSION_CHANGED", 409, "The signed-in account changed. Inspect local data again.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return error("UNSUPPORTED_MEDIA_TYPE", 415, "JSON is required.");
  try {
    const bytes = await readRequestBytesWithLimit(request, MAX_IMPORT_BODY_BYTES);
    let body: unknown;
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (hasDuplicateObjectKeys(text)) throw new Error("duplicate keys"); body = JSON.parse(text); }
    catch { return error("INVALID_IMPORT", 400, "The import manifest is invalid."); }
    return Response.json({ result: await dependencies.service.import(session.userId, body) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) { return mapped(cause); }
}
function mapped(cause: unknown) { const code = isRecord(cause) && typeof cause.code === "string" ? cause.code : "INTERNAL_ERROR"; if (code === "REQUEST_BODY_TOO_LARGE") return error(code, 413, "The import manifest is too large."); if (code === "INVALID_IMPORT") return error(code, 400, "The import manifest is invalid."); if (["CLOUD_NOT_CONFIGURED", "CLOUD_CONFIG_INVALID"].includes(code)) return error(code, 500, "Cloud service is not configured."); return error("INTERNAL_ERROR", 500, "The cloud import failed."); }
function error(code: string, status: number, message: string) { return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function hasDuplicateObjectKeys(text: string) {
  const stack: Array<{ type: "object"; keys: Set<string>; expectingKey: boolean } | { type: "array" }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length) { if (text[index] === "\\") { index += 2; continue; } if (text[index] === '"') break; index += 1; }
      if (index >= text.length) return false;
      const frame = stack.at(-1);
      if (frame?.type === "object" && frame.expectingKey) {
        let key: string;
        try { key = JSON.parse(text.slice(start, index + 1)) as string; } catch { return false; }
        if (frame.keys.has(key)) return true;
        frame.keys.add(key); frame.expectingKey = false;
      }
      continue;
    }
    if (char === "{") stack.push({ type: "object", keys: new Set(), expectingKey: true });
    else if (char === "[") stack.push({ type: "array" });
    else if (char === "}" || char === "]") stack.pop();
    else if (char === ",") { const frame = stack.at(-1); if (frame?.type === "object") frame.expectingKey = true; }
  }
  return false;
}
