import {
  resolveCloudConfig,
  type CloudConfigEnvironment,
  type CloudConfigError,
  type ConfiguredCloudConfig,
  type UnconfiguredCloudConfig,
} from "./config.ts";

export interface CloudServerConfigEnvironment extends CloudConfigEnvironment {
  readonly CLOUD_STORAGE_PROVIDER?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly DATABASE_URL?: string;
  readonly COS_SECRET_ID?: string;
  readonly COS_SECRET_KEY?: string;
  readonly COS_BUCKET?: string;
  readonly COS_REGION?: string;
}

interface CloudServerConfigBase extends ConfiguredCloudConfig {
  readonly serverConfigured: true;
  readonly databaseUrl: string;
}

export interface SupabaseStorageServerConfig extends CloudServerConfigBase {
  readonly storageProvider: "supabase";
  readonly supabaseServiceRoleKey: string;
}

export interface CosStorageServerConfig extends CloudServerConfigBase {
  readonly storageProvider: "cos";
  readonly cosSecretId: string;
  readonly cosSecretKey: string;
  readonly cosBucket: string;
  readonly cosRegion: string;
}

export type CloudServerConfig =
  | SupabaseStorageServerConfig
  | CosStorageServerConfig;

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

function isCosBucket(value: string): boolean {
  return /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,48}[a-z0-9])-\d{5,12}$/.test(value);
}

function isCosRegion(value: string): boolean {
  return value === "ap-guangzhou";
}

function configurationError(
  code: CloudConfigError["code"],
  invalidKeys: string[],
  missingKeys: string[],
): CloudServerConfigResult {
  return {
    ok: false,
    error: {
      code,
      message:
        code === "CLOUD_NOT_CONFIGURED"
          ? "云端服务配置不完整。"
          : "云端服务配置无效。",
      invalidKeys,
      missingKeys,
    },
  };
}

export function resolveCloudServerConfig(
  environment: CloudServerConfigEnvironment = process.env,
): CloudServerConfigResult {
  const publicResult = resolveCloudConfig(environment);
  if (!publicResult.ok) return publicResult;
  if (!publicResult.config.configured) {
    return { ok: true, config: publicResult.config };
  }

  const storageProviderValue = normalize(environment.CLOUD_STORAGE_PROVIDER);
  if (
    storageProviderValue &&
    storageProviderValue !== "supabase" &&
    storageProviderValue !== "cos"
  ) {
    return configurationError(
      "CLOUD_CONFIG_INVALID",
      ["CLOUD_STORAGE_PROVIDER"],
      [],
    );
  }

  const storageProvider: "supabase" | "cos" =
    storageProviderValue === "cos" ? "cos" : "supabase";
  const databaseUrl = normalize(environment.DATABASE_URL);
  const supabaseServiceRoleKey = normalize(environment.SUPABASE_SERVICE_ROLE_KEY);
  const cosSecretId = normalize(environment.COS_SECRET_ID);
  const cosSecretKey = normalize(environment.COS_SECRET_KEY);
  const cosBucket = normalize(environment.COS_BUCKET);
  const cosRegion = normalize(environment.COS_REGION);
  const missingKeys =
    storageProvider === "cos"
      ? [
          ...(!cosSecretId ? ["COS_SECRET_ID"] : []),
          ...(!cosSecretKey ? ["COS_SECRET_KEY"] : []),
          ...(!cosBucket ? ["COS_BUCKET"] : []),
          ...(!cosRegion ? ["COS_REGION"] : []),
          ...(!databaseUrl ? ["DATABASE_URL"] : []),
        ]
      : [
          ...(!supabaseServiceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
          ...(!databaseUrl ? ["DATABASE_URL"] : []),
        ];

  if (missingKeys.length > 0) {
    return configurationError("CLOUD_NOT_CONFIGURED", [], missingKeys);
  }

  const invalidKeys = [
    ...(!isPostgresUrl(databaseUrl!) ? ["DATABASE_URL"] : []),
    ...(storageProvider === "cos" && !isCosBucket(cosBucket!)
      ? ["COS_BUCKET"]
      : []),
    ...(storageProvider === "cos" && !isCosRegion(cosRegion!)
      ? ["COS_REGION"]
      : []),
  ];
  if (invalidKeys.length > 0) {
    return configurationError("CLOUD_CONFIG_INVALID", invalidKeys, []);
  }

  const base = {
    ...publicResult.config,
    serverConfigured: true as const,
    databaseUrl: databaseUrl!,
  };
  if (storageProvider === "cos") {
    return {
      ok: true,
      config: {
        ...base,
        storageProvider,
        cosSecretId: cosSecretId!,
        cosSecretKey: cosSecretKey!,
        cosBucket: cosBucket!,
        cosRegion: cosRegion!,
      },
    };
  }

  return {
    ok: true,
    config: {
      ...base,
      storageProvider,
      supabaseServiceRoleKey: supabaseServiceRoleKey!,
    },
  };
}
