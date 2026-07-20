import { getAppSession } from "@/lib/auth/app-session";
import { verifyEdgeOneDownloadToken } from "@/lib/cloud/edgeone-download-token-core";
import { getAuthoritativeBlobStore } from "@/lib/edgeone/blob-store";
import { getEdgeOneRuntimeConfig } from "@/lib/edgeone/runtime-config";

export const runtime = "edge";

function noStore(status: number, code: string): Response {
  return Response.json({ error: code }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const session = await getAppSession();
  if (!session) return noStore(401, "AUTH_REQUIRED");
  const url = new URL(request.url);
  const payload = url.searchParams.get("payload");
  const signature = url.searchParams.get("signature");
  if (!payload || !signature) return noStore(400, "INVALID_DOWNLOAD_TOKEN");

  try {
    const config = getEdgeOneRuntimeConfig();
    const verified = verifyEdgeOneDownloadToken({ payload, signature }, {
      now: new Date(),
      secret: config.sessionSecret,
      expectedUserId: session.user.id,
    });
    const bytes = await getAuthoritativeBlobStore(config.blobStore)
      .getBytes(`objects/${verified.objectPath}`);
    if (!bytes) return noStore(404, "OBJECT_NOT_FOUND");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": 'attachment; filename="original.txt"',
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined;
    return noStore(code === "DOWNLOAD_TOKEN_EXPIRED" ? 410 : 403,
      code === "DOWNLOAD_TOKEN_EXPIRED" ? code : "INVALID_DOWNLOAD_TOKEN");
  }
}
