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
