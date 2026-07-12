import { loadEnvFile } from "node:process";

import { parseTranslationMcpServerConfig } from "./config.ts";
import { createOpenAiCompatibleGateway } from "./openai-compatible-gateway.ts";
import { createTranslationMcpHttpApp } from "./server.ts";
import { translateSegmentsWithGateway } from "./translate-segments-tool.ts";

let envLoadFailed = false;

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (!isMissingEnvFile(error)) {
    console.error("[translation-mcp] failed to load .env.local");
    envLoadFailed = true;
  }
}

const configResult = envLoadFailed
  ? { ok: false as const, message: "无法读取翻译 MCP 环境配置。" }
  : parseTranslationMcpServerConfig(process.env);

if (!configResult.ok) {
  console.error(`[translation-mcp] ${configResult.message}`);
  process.exitCode = 1;
} else {
  const config = configResult.value;
  const gateway = createOpenAiCompatibleGateway(config);
  const app = createTranslationMcpHttpApp({
    secret: config.mcpSecret,
    trustedHosts: config.trustedHosts,
    execute: (input, signal) => translateSegmentsWithGateway(input, gateway, 3, signal),
  });
  const httpServer = app.listen(config.port, config.listenHost, () => {
    console.error(`[translation-mcp] listening on ${config.listenHost}:${config.port}`);
  });

  function shutdown(signal: string) {
    console.error(`[translation-mcp] received ${signal}, shutting down`);
    httpServer.close((error?: Error) => {
      if (error) {
        console.error("[translation-mcp] shutdown failed");
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

function isMissingEnvFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
