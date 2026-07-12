import { resolveCloudServerConfig } from "../../../lib/cloud/server-config-core.ts";
import { parseMcpTranslationClientConfig } from "../../../lib/translation/mcp-translation-provider.ts";

export const dynamic = "force-dynamic";

export function GET() {
  return buildAppHealthResponse(process.env);
}

export function buildAppHealthResponse(env: Record<string, string | undefined>) {
  const cloud = resolveCloudServerConfig(env);
  const cloudReady = cloud.ok && cloud.config.configured && "serverConfigured" in cloud.config;
  const translationReady = parseMcpTranslationClientConfig(env).ok;
  const configured = cloudReady && translationReady;
  return Response.json(
    {
      status: configured ? "ok" : "unavailable",
      configured,
      capabilities: {
        auth: cloudReady,
        storage: cloudReady,
        translation: translationReady,
      },
    },
    {
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
