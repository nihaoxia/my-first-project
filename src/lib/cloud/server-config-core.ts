import {
  resolveCloudConfig,
  type CloudConfigEnvironment,
  type CloudConfigError,
  type ConfiguredCloudConfig,
  type UnconfiguredCloudConfig,
} from "./config.ts";

export interface CloudServerConfigEnvironment extends CloudConfigEnvironment {
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly DATABASE_URL?: string;
}

export interface CloudServerConfig extends ConfiguredCloudConfig {
  readonly serverConfigured: true;
  readonly supabaseServiceRoleKey: string;
  readonly databaseUrl: string;
}

export type CloudServerConfigResult =
  | {
      readonly ok: true;
      readonly config: UnconfiguredCloudConfig | CloudServerConfig;
    }
  | { readonly ok: false; readonly error: CloudConfigError };

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:";
  } catch {
    return false;
  }
}

export function resolveCloudServerConfig(
  environment: CloudServerConfigEnvironment = process.env,
): CloudServerConfigResult {
  const publicResult = resolveCloudConfig(environment);
  if (!publicResult.ok) return publicResult;
  if (!publicResult.config.configured) {
    return { ok: true, config: publicResult.config };
  }

  const supabaseServiceRoleKey = normalize(environment.SUPABASE_SERVICE_ROLE_KEY);
  const databaseUrl = normalize(environment.DATABASE_URL);
  const missingKeys = [
    ...(!supabaseServiceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ...(!databaseUrl ? ["DATABASE_URL"] : []),
  ];

  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: {
        code: "CLOUD_NOT_CONFIGURED",
        message: "云端服务配置不完整。",
        invalidKeys: [],
        missingKeys,
      },
    };
  }

  if (!isPostgresUrl(databaseUrl!)) {
    return {
      ok: false,
      error: {
        code: "CLOUD_CONFIG_INVALID",
        message: "云端服务配置无效。",
        invalidKeys: ["DATABASE_URL"],
        missingKeys: [],
      },
    };
  }

  return {
    ok: true,
    config: {
      ...publicResult.config,
      serverConfigured: true,
      supabaseServiceRoleKey: supabaseServiceRoleKey!,
      databaseUrl: databaseUrl!,
    },
  };
}
