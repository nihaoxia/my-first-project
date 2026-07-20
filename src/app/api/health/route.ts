import { resolveEdgeOneRuntimeConfig } from "../../../lib/edgeone/runtime-config-core.ts";

export const dynamic = "force-dynamic";

export function GET() {
  return buildAppHealthResponse(process.env);
}

export function buildAppHealthResponse(env: Record<string, string | undefined>) {
  const configured = resolveEdgeOneRuntimeConfig(env).ok;
  return Response.json(
    {
      status: configured ? "ok" : "unavailable",
      configured,
      capabilities: {
        web: true,
        auth: configured,
        blob: configured,
        quota: configured,
      },
    },
    {
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
