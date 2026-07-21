import { resolveEdgeOneRuntimeConfig } from "../edgeone/runtime-config-core.ts";
import { resolveCloudServerConfig } from "./server-config-core.ts";

export type CloudPersistenceMode = "cloud" | "local" | "unavailable";

type PersistenceConfigResult =
  | { ok: false }
  | { ok: true; config: { configured: boolean; authMode: "supabase" | "mock"; cloudMode: "required" | "optional"; serverConfigured?: true } };

export function resolveCloudPersistenceMode(result: PersistenceConfigResult): CloudPersistenceMode {
  if (!result.ok) return "unavailable";
  if (result.config.configured && result.config.authMode === "supabase" && result.config.serverConfigured) return "cloud";
  if (result.config.cloudMode === "optional" && result.config.authMode === "mock") return "local";
  return "unavailable";
}

export function resolveCloudPersistenceModeFromEnvironment(
  environment: Record<string, string | undefined>,
): CloudPersistenceMode {
  if (environment.AUTH_MODE?.trim() === "edgeone") {
    return resolveEdgeOneRuntimeConfig(environment).ok ? "cloud" : "unavailable";
  }
  return resolveCloudPersistenceMode(resolveCloudServerConfig(environment));
}
