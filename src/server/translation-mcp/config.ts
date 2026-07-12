import { z } from "zod";
import { isAllowedServerHttpUrl } from "../../lib/security/server-url-policy.ts";

const serverConfigSchema = z.object({
  NODE_ENV: z.string().optional(),
  MCP_TRANSLATION_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  TRANSLATION_MCP_SECRET: z.string().min(32),
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1).max(200),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(180_000).default(60_000),
  MCP_TRUSTED_HOSTS: z.string().optional(),
});

export type TranslationMcpServerConfig = {
  port: number;
  mcpSecret: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiRequestTimeoutMs: number;
  trustedHosts: string[];
};

export function parseTranslationMcpServerConfig(
  env: Record<string, string | undefined>,
): { ok: true; value: TranslationMcpServerConfig } | { ok: false; message: string } {
  const result = serverConfigSchema.safeParse(env);

  const trustedHosts = result.success ? parseTrustedHosts(result.data.MCP_TRUSTED_HOSTS) : null;
  if (!result.success || !isAllowedServerHttpUrl(result.data.AI_BASE_URL, result.data.NODE_ENV) || !trustedHosts || (result.data.NODE_ENV === "production" && !result.data.MCP_TRUSTED_HOSTS?.trim())) {
    return { ok: false, message: "翻译 MCP 服务配置不完整或格式无效。" };
  }

  return {
    ok: true,
    value: {
      port: result.data.MCP_TRANSLATION_PORT,
      mcpSecret: result.data.TRANSLATION_MCP_SECRET,
      aiBaseUrl: result.data.AI_BASE_URL.replace(/\/+$/, ""),
      aiApiKey: result.data.AI_API_KEY,
      aiModel: result.data.AI_MODEL,
      aiRequestTimeoutMs: result.data.AI_REQUEST_TIMEOUT_MS,
      trustedHosts,
    },
  };
}

function parseTrustedHosts(value: string | undefined): string[] | null {
  if (!value?.trim()) return ["localhost", "127.0.0.1", "[::1]"];
  const hosts = [...new Set(value.split(",").map((host) => host.trim().toLowerCase()))];
  if (!hosts.length || hosts.some((host) => !host || host.length > 253 || host.includes("..") || (!/^\[::1\]$/.test(host) && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)))) return null;
  return hosts;
}
