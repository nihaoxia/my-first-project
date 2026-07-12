import { runProductionSmoke } from "../src/lib/deployment/production-smoke-core.ts";

const timeout = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS ?? "10000");
const result = await runProductionSmoke({
  appUrl: process.env.PRODUCTION_APP_URL ?? "",
  supabaseUrl: process.env.PRODUCTION_SUPABASE_URL ?? "",
  timeoutMs: timeout,
});

process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.ok) process.exitCode = 1;
