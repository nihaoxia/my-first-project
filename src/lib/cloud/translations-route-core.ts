import { readRequestBytesWithLimit } from "./books-route-core.ts";

type Session = { userId: string; role: "USER" | "ADMIN" | "BANNED" } | null;
type TranslationService = {
  list(userId: string): Promise<unknown>; create(userId: string, body: unknown): Promise<unknown>;
  listTasks(userId: string, translationId: string): Promise<unknown>; run(userId: string, translationId: string, taskId: string, signal?: AbortSignal): Promise<unknown>;
  retry(userId: string, translationId: string, taskId: string): Promise<unknown>; cancel(userId: string, translationId: string, taskId: string): Promise<unknown>;
  getReader(userId: string, translationId: string): Promise<unknown>;
};
export type CloudTranslationsRouteDependencies = { getSession(): Promise<Session>; service: TranslationService };
export const TRANSLATION_JSON_LIMIT = 16 * 1024;

export async function handleCloudTranslationsCollection(request: Request, dependencies: CloudTranslationsRouteDependencies) {
  let userId: string | null; try { userId = await getUserId(dependencies); } catch (cause) { return mapped(cause); }
  if (!userId) return error("AUTH_REQUIRED", 401, "Authentication is required.");
  try {
    if (request.method === "GET") return Response.json({ translations: await dependencies.service.list(userId) }, noStore());
    if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
    const body = await readJson(request);
    const translation = await dependencies.service.create(userId, body);
    return Response.json({ translation }, { status: 201, headers: noStore().headers });
  } catch (cause) { return mapped(cause); }
}

export async function handleCloudTranslationTasks(request: Request, translationId: string, dependencies: CloudTranslationsRouteDependencies) {
  let userId: string | null; try { userId = await getUserId(dependencies); } catch (cause) { return mapped(cause); }
  if (!userId) return error("AUTH_REQUIRED", 401, "Authentication is required.");
  if (!validId(translationId)) return error("TRANSLATION_NOT_FOUND", 404, "Translation not found.");
  if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  try { return Response.json({ tasks: await dependencies.service.listTasks(userId, translationId) }, noStore()); }
  catch (cause) { return mapped(cause); }
}

export async function handleCloudTranslationTaskAction(request: Request, translationId: string, taskId: string, dependencies: CloudTranslationsRouteDependencies) {
  let userId: string | null; try { userId = await getUserId(dependencies); } catch (cause) { return mapped(cause); }
  if (!userId) return error("AUTH_REQUIRED", 401, "Authentication is required.");
  if (!validId(translationId) || !validId(taskId)) return error("TASK_NOT_FOUND", 404, "Task not found.");
  if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  try {
    const body = await readJson(request);
    if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.action !== "string" || !["run", "retry", "cancel"].includes(body.action)) return error("INVALID_REQUEST", 400, "Only a supported task action is allowed.");
    const result = body.action === "run" ? await dependencies.service.run(userId, translationId, taskId, request.signal) : body.action === "retry" ? await dependencies.service.retry(userId, translationId, taskId) : await dependencies.service.cancel(userId, translationId, taskId);
    return Response.json({ task: result }, noStore());
  } catch (cause) { return mapped(cause); }
}

export async function handleCloudTranslationReader(request: Request, translationId: string, dependencies: CloudTranslationsRouteDependencies) {
  let userId: string | null; try { userId = await getUserId(dependencies); } catch (cause) { return mapped(cause); }
  if (!userId) return error("AUTH_REQUIRED", 401, "Authentication is required.");
  if (!validId(translationId)) return error("TRANSLATION_NOT_FOUND", 404, "Translation not found.");
  if (request.method !== "GET") return error("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  try { return Response.json({ translation: await dependencies.service.getReader(userId, translationId) }, noStore()); }
  catch (cause) { return mapped(cause); }
}

async function readJson(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw Object.assign(new Error("json required"), { code: "UNSUPPORTED_MEDIA_TYPE" });
  const bytes = await readRequestBytesWithLimit(request, TRANSLATION_JSON_LIMIT);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw Object.assign(new Error("invalid json"), { code: "INVALID_REQUEST" }); }
}
async function getUserId(dependencies: CloudTranslationsRouteDependencies) { const session = await dependencies.getSession(); return session && session.role !== "BANNED" ? session.userId : null; }
function mapped(cause: unknown) {
  const code = isRecord(cause) && typeof cause.code === "string" ? cause.code : "INTERNAL_ERROR";
  if (code === "REQUEST_BODY_TOO_LARGE") return error(code, 413, "The request body is too large.");
  if (code === "UNSUPPORTED_MEDIA_TYPE") return error(code, 415, "JSON is required.");
  if (["INVALID_REQUEST", "INVALID_REQUEST_BODY", "INVALID_TRANSLATION"].includes(code)) return error("INVALID_REQUEST", 400, "The request is invalid.");
  if (["BOOK_NOT_FOUND", "TRANSLATION_NOT_FOUND", "TASK_NOT_FOUND"].includes(code)) return error(code, 404, code === "BOOK_NOT_FOUND" ? "Book not found." : code === "TRANSLATION_NOT_FOUND" ? "Translation not found." : "Task not found.");
  if (code === "TASK_BUSY") return error(code, 409, "A translation batch is already running. Refresh and try again.");
  if (code === "WEB_LOOKUP_UNAVAILABLE") return error(code, 409, "Web lookup is not available.");
  if (code === "CHECKPOINT_INVALID") return error(code, 409, "The stored translation checkpoint is invalid. Retry to reset it.");
  if (["TRANSLATION_CONFLICT", "TASK_CONFLICT", "RETRY_LIMIT_REACHED", "STALE_ATTEMPT"].includes(code)) return error(code, 409, "The translation state changed. Refresh and try again.");
  if (code === "PROVIDER_RATE_LIMITED") return error(code, 429, "The translation provider is busy.");
  if (code === "FREE_MODEL_UNAVAILABLE") return error(code, 503, "Free cloud translation is unavailable. Local translation or manual import remains available.");
  if (code === "FREE_QUOTA_EXHAUSTED") return error(code, 429, "The free monthly translation quota is exhausted. Existing data remains available.");
  if (code === "USAGE_LEDGER_UNAVAILABLE") return error(code, 503, "Translation usage cannot be verified, so new model calls are paused.");
  if (["TRANSLATION_FAILED", "PROVIDER_RESPONSE_INVALID", "PROVIDER_TIMEOUT", "MCP_UNAVAILABLE", "MCP_NOT_CONFIGURED"].includes(code)) return error(code, 502, "The translation provider failed.");
  if (code === "INSUFFICIENT_BALANCE") return error(code, 409, "Insufficient account balance.");
  if (["CLOUD_NOT_CONFIGURED", "CLOUD_CONFIG_INVALID", "AUTH_MODE_FORBIDDEN"].includes(code)) return error(code, 500, "Cloud service is not configured.");
  return error("INTERNAL_ERROR", 500, "The cloud translation operation failed.");
}
function error(code: string, status: number, message: string) { return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } }); }
function noStore() { return { headers: { "Cache-Control": "private, no-store" } }; }
function validId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
