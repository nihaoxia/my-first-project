import { ORIGINAL_BOOK_MAX_BYTES } from "./storage-core.ts";
import { MAX_CHAPTER_EDIT_BYTES, validateChapterEditPayloadBytes } from "./upload-limits.ts";

type Session = { userId: string; role: "USER" | "ADMIN" | "BANNED" } | null;
type BooksService = {
  list(userId: string): Promise<unknown>;
  create(userId: string, input: { title: string; author?: string | null; sourceLanguage?: string; fileName: string; mimeType?: string; bytes: Uint8Array; chapterEdits: unknown }): Promise<unknown>;
  get(userId: string, bookId: string): Promise<unknown>;
  updateMetadata(userId: string, bookId: string, input: { title?: string; author?: string | null }): Promise<unknown>;
  delete(userId: string, bookId: string): Promise<unknown>;
  getDownloadUrl(userId: string, bookId: string): Promise<unknown>;
};
export type CloudBooksRouteDependencies = { getSession(): Promise<Session>; service: BooksService };
export const MULTIPART_BODY_LIMIT = ORIGINAL_BOOK_MAX_BYTES + MAX_CHAPTER_EDIT_BYTES + 128 * 1024;
const JSON_BODY_LIMIT = 16 * 1024;

class RequestBodyError extends Error {
  readonly code: "REQUEST_BODY_TOO_LARGE" | "INVALID_REQUEST_BODY";
  constructor(code: "REQUEST_BODY_TOO_LARGE" | "INVALID_REQUEST_BODY") { super(code); this.code = code; this.name = "RequestBodyError"; }
}

export async function readRequestBytesWithLimit(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new RequestBodyError("REQUEST_BODY_TOO_LARGE");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* request is already rejected */ }
        throw new RequestBodyError("REQUEST_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("INVALID_REQUEST_BODY");
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function handleCloudBooksCollection(request: Request, dependencies: CloudBooksRouteDependencies): Promise<Response> {
  let session: Exclude<Session, null> | null;
  try { session = await usableSession(dependencies); } catch (error) { return mappedError(error); }
  if (!session) return errorResponse("AUTH_REQUIRED", 401, "Authentication is required.");
  if (request.method === "GET") {
    try { return Response.json({ books: await dependencies.service.list(session.userId) }); }
    catch (error) { return mappedError(error); }
  }
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return errorResponse("UNSUPPORTED_MEDIA_TYPE", 415, "A multipart TXT upload is required.");
  try {
    const requestBytes = await readRequestBytesWithLimit(request, MULTIPART_BODY_LIMIT);
    const headers = new Headers(request.headers);
    headers.set("content-length", String(requestBytes.byteLength));
    const boundedBody = requestBytes.buffer.slice(requestBytes.byteOffset, requestBytes.byteOffset + requestBytes.byteLength) as ArrayBuffer;
    const boundedRequest = new Request(request.url, { method: "POST", headers, body: boundedBody });
    let form: FormData;
    try { form = await boundedRequest.formData(); }
    catch { return errorResponse("INVALID_REQUEST", 400, "Malformed multipart request."); }
    const allowedFields = new Set(["title", "author", "sourceLanguage", "file", "chapterEdits"]);
    if ([...form.keys()].some((key) => !allowedFields.has(key))) return errorResponse("INVALID_REQUEST", 400, "Unsupported upload fields.");
    if ([...allowedFields].some((key) => form.getAll(key).length > 1)) return errorResponse("INVALID_REQUEST", 400, "Duplicate upload fields.");
    const file = form.get("file");
    const title = stringField(form, "title");
    if (!(file instanceof File) || !title) return errorResponse("INVALID_REQUEST", 400, "Title and TXT file are required.");
    const author = optionalField(form, "author");
    const sourceLanguage = optionalField(form, "sourceLanguage");
    if (title.length > 200 || (author && author.length > 200) || (sourceLanguage && sourceLanguage.length > 20) || file.name.length > 255) return errorResponse("INVALID_REQUEST", 400, "Upload metadata is too long.");
    if (file.size > ORIGINAL_BOOK_MAX_BYTES) return errorResponse("FILE_TOO_LARGE", 413, "The TXT file is too large.");
    const chapterEditsValue = form.get("chapterEdits");
    if (typeof chapterEditsValue !== "string" || !chapterEditsValue.trim()) return errorResponse("INVALID_REQUEST", 400, "Chapter edits are required.");
    const chapterEditsRaw = chapterEditsValue;
    try { validateChapterEditPayloadBytes(new TextEncoder().encode(chapterEditsRaw)); }
    catch { return errorResponse("CHAPTER_EDITS_TOO_LARGE", 413, "Chapter edits are too large."); }
    let chapterEdits: unknown;
    try { chapterEdits = JSON.parse(chapterEditsRaw); } catch { return errorResponse("INVALID_REQUEST", 400, "Chapter edits are invalid."); }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const book = await dependencies.service.create(session.userId, {
      title, author, sourceLanguage: sourceLanguage ?? undefined,
      fileName: file.name, mimeType: file.type, bytes, chapterEdits,
    });
    return Response.json({ book }, { status: 201 });
  } catch (error) { return mappedError(error); }
}

export async function handleCloudBookResource(request: Request, bookId: string, dependencies: CloudBooksRouteDependencies): Promise<Response> {
  let session: Exclude<Session, null> | null;
  try { session = await usableSession(dependencies); } catch (error) { return mappedError(error); }
  if (!session) return errorResponse("AUTH_REQUIRED", 401, "Authentication is required.");
  try {
    if (request.method === "GET") return Response.json({ book: await dependencies.service.get(session.userId, bookId) });
    if (request.method === "DELETE") return Response.json(await dependencies.service.delete(session.userId, bookId));
    if (request.method === "PATCH") {
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return errorResponse("UNSUPPORTED_MEDIA_TYPE", 415, "JSON is required.");
      const bytes = await readRequestBytesWithLimit(request, JSON_BODY_LIMIT);
      let body: unknown;
      try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { return errorResponse("INVALID_REQUEST", 400, "Malformed JSON."); }
      if (!isRecord(body) || Object.keys(body).some((key) => !["title", "author"].includes(key))) return errorResponse("INVALID_REQUEST", 400, "Unsupported metadata fields.");
      if ((body.title !== undefined && typeof body.title !== "string") || (body.author !== undefined && body.author !== null && typeof body.author !== "string")) return errorResponse("INVALID_REQUEST", 400, "Invalid metadata.");
      return Response.json({ book: await dependencies.service.updateMetadata(session.userId, bookId, { title: body.title as string | undefined, author: body.author as string | null | undefined }) });
    }
    return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  } catch (error) { return mappedError(error); }
}

export async function handleCloudBookDownload(request: Request, bookId: string, dependencies: CloudBooksRouteDependencies): Promise<Response> {
  let session: Exclude<Session, null> | null;
  try { session = await usableSession(dependencies); } catch (error) { return mappedError(error); }
  if (!session) return errorResponse("AUTH_REQUIRED", 401, "Authentication is required.");
  if (request.method !== "GET") return errorResponse("METHOD_NOT_ALLOWED", 405, "Method not allowed.");
  try {
    const result = await dependencies.service.getDownloadUrl(session.userId, bookId) as { url?: unknown };
    if (typeof result.url !== "string" || !/^https?:\/\//i.test(result.url)) throw new Error("invalid signed URL");
    return new Response(null, {
      status: 303,
      headers: { Location: result.url, "Cache-Control": "private, no-store" },
    });
  }
  catch (error) { return mappedError(error); }
}

async function usableSession(dependencies: CloudBooksRouteDependencies) { const session = await dependencies.getSession(); return session?.role === "BANNED" ? null : session; }
function stringField(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; }
function optionalField(form: FormData, key: string) { const value = stringField(form, key); return value || null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorResponse(code: string, status: number, message: string) { return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } }); }
function mappedError(error: unknown): Response {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "INTERNAL_ERROR";
  if (code === "FILE_TOO_LARGE") return errorResponse(code, 413, "The TXT file is too large.");
  if (code === "REQUEST_BODY_TOO_LARGE") return errorResponse(code, 413, "The request body is too large.");
  if (code === "CHAPTER_EDITS_TOO_LARGE") return errorResponse(code, 413, "Chapter edits are too large.");
  if (code === "INVALID_REQUEST_BODY") return errorResponse(code, 400, "The request body is invalid.");
  if (code === "UNSUPPORTED_MEDIA_TYPE") return errorResponse(code, 415, "Only UTF-8 text/plain TXT files are supported.");
  if (["INVALID_OBJECT_PATH", "EMPTY_FILE", "INVALID_TEXT_FILE", "INVALID_BOOK_ID", "INVALID_BOOK_METADATA", "INVALID_CHAPTER_EDITS", "TOO_MANY_CHAPTERS"].includes(code)) return errorResponse(code, 400, "The request is invalid.");
  if (code === "BOOK_NOT_FOUND") return errorResponse(code, 404, "Book not found.");
  if (code === "BOOK_UPDATE_FAILED" || code === "BOOK_DELETE_FAILED") return errorResponse(code, 409, "The book could not be changed.");
  if (code === "CLEANUP_PERSIST_FAILED") return errorResponse(code, 500, "The cloud operation could not be safely started.");
  if (code === "CLOUD_NOT_CONFIGURED" || code === "CLOUD_CONFIG_INVALID" || code === "AUTH_MODE_FORBIDDEN") return errorResponse(code, 500, "Cloud service is not configured.");
  return errorResponse("INTERNAL_ERROR", 500, "The cloud operation failed.");
}
