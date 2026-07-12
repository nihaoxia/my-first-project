import { readRequestBytesWithLimit } from "./books-route-core.ts";

type Session = { userId: string; role: "USER" | "ADMIN" | "BANNED" } | null;
type Service = { list(userId: string, filter: unknown): Promise<unknown>; create(userId: string, body: unknown): Promise<unknown>; update(userId: string, id: string, body: unknown): Promise<unknown>; delete(userId: string, id: string, kind: unknown): Promise<unknown>; upsertReading(userId: string, body: unknown): Promise<unknown> };
export type CloudStudyRouteDependencies = { getSession(): Promise<Session>; service: Service };
export const STUDY_JSON_LIMIT = 16 * 1024;

export async function handleCloudStudyRoute(request: Request, dependencies: CloudStudyRouteDependencies) {
  let session: Session;
  try { session = await dependencies.getSession(); } catch (cause) { return mapped(cause); }
  if (!session || session.role === "BANNED") return responseError("AUTH_REQUIRED", 401, "Authentication is required.");
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      if ([...url.searchParams.keys()].some((key) => !["kind", "bookId", "limit", "cursor"].includes(key)) || url.searchParams.getAll("kind").length !== 1 || ["bookId", "limit", "cursor"].some((key) => url.searchParams.getAll(key).length > 1)) return responseError("INVALID_REQUEST", 400, "The request is invalid.");
      const limit = url.searchParams.get("limit");
      const cursor = url.searchParams.get("cursor");
      if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) return responseError("INVALID_REQUEST", 400, "The request is invalid.");
      if (cursor !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor)) return responseError("INVALID_REQUEST", 400, "The request is invalid.");
      const page = await dependencies.service.list(session.userId, { kind: url.searchParams.get("kind"), bookId: url.searchParams.get("bookId") ?? undefined, limit: url.searchParams.get("limit") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined });
      return Response.json(page, noStore());
    }
    if (request.method === "DELETE") {
      if ([...url.searchParams.keys()].some((key) => !["kind", "id"].includes(key)) || url.searchParams.getAll("kind").length !== 1 || url.searchParams.getAll("id").length !== 1) return responseError("INVALID_REQUEST", 400, "The request is invalid.");
      return Response.json(await dependencies.service.delete(session.userId, url.searchParams.get("id")!, url.searchParams.get("kind")), noStore());
    }
    if (!["POST", "PATCH"].includes(request.method)) return responseError("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
    const body = await readJson(request);
    if (request.method === "POST") {
      const result = isRecord(body) && body.kind === "reading" ? await dependencies.service.upsertReading(session.userId, body) : await dependencies.service.create(session.userId, body);
      return Response.json({ item: result }, { status: 201, headers: noStore().headers });
    }
    if (!isRecord(body) || typeof body.id !== "string") return responseError("INVALID_REQUEST", 400, "The request is invalid.");
    const { id, ...updates } = body;
    return Response.json({ item: await dependencies.service.update(session.userId, id, updates) }, noStore());
  } catch (cause) { return mapped(cause); }
}

async function readJson(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw Object.assign(new Error("json required"), { code: "UNSUPPORTED_MEDIA_TYPE" });
  const bytes = await readRequestBytesWithLimit(request, STUDY_JSON_LIMIT);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw Object.assign(new Error("invalid json"), { code: "INVALID_REQUEST" }); }
}
function mapped(cause: unknown) { const code = isRecord(cause) && typeof cause.code === "string" ? cause.code : "INTERNAL_ERROR"; if (code === "REQUEST_BODY_TOO_LARGE") return responseError(code, 413, "The request body is too large."); if (code === "UNSUPPORTED_MEDIA_TYPE") return responseError(code, 415, "JSON is required."); if (code === "INVALID_STUDY_INPUT" || code === "INVALID_REQUEST") return responseError("INVALID_REQUEST", 400, "The request is invalid."); if (code === "SOURCE_NOT_FOUND" || code === "STUDY_ITEM_NOT_FOUND") return responseError("STUDY_ITEM_NOT_FOUND", 404, "Study item not found."); if (code === "STUDY_CONFLICT") return responseError(code, 409, "The study data changed. Refresh and try again."); if (["CLOUD_NOT_CONFIGURED", "CLOUD_CONFIG_INVALID"].includes(code)) return responseError(code, 500, "Cloud service is not configured."); return responseError("INTERNAL_ERROR", 500, "The cloud study operation failed."); }
function responseError(code: string, status: number, message: string) { return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } }); }
function noStore() { return { headers: { "Cache-Control": "private, no-store" } }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
