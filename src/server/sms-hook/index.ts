import { loadEnvFile } from "node:process";

import { parseSmsHookConfig } from "./config.ts";
import { createSmsHookServer } from "./server.ts";
import { createTencentSmsSenderFromConfig } from "./tencent-sms-provider.ts";

try {
  loadEnvFile(".env.local");
} catch (error) {
  if (!isMissingEnvFile(error)) console.error("[sms-hook] environment file could not be loaded");
}

const configResult = parseSmsHookConfig(process.env);
if (!configResult.ok) {
  console.error(`[sms-hook] ${configResult.error.code}: ${configResult.error.keys.join(",")}`);
  process.exitCode = 1;
} else {
  const config = configResult.value;
  const server = createSmsHookServer({
    configured: true,
    webhookSecretBase64: config.webhookSecretBase64,
    nowUnixSeconds: () => Math.floor(Date.now() / 1_000),
    send: createTencentSmsSenderFromConfig(config),
    log: (event) => console.error(JSON.stringify(event)),
  });
  server.listen(config.port, "0.0.0.0", () => {
    console.error(`[sms-hook] listening on 0.0.0.0:${config.port}`);
  });

  let shuttingDown = false;
  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[sms-hook] received ${signal}, shutting down`);
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10_000);
    timeout.unref();
    server.close((error) => {
      clearTimeout(timeout);
      if (error) process.exitCode = 1;
    });
  }
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

function isMissingEnvFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
