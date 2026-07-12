export type CloudMode = "required" | "optional";
export type AuthMode = "supabase" | "mock";

export interface CloudConfigEnvironment {
  readonly [key: string]: string | undefined;
  readonly NODE_ENV?: string;
  readonly CLOUD_MODE?: string;
  readonly AUTH_MODE?: string;
  readonly MOCK_AUTH_ENABLED?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_ORIGINAL_BOOKS_BUCKET?: string;
}

interface CloudConfigBase {
  readonly cloudMode: CloudMode;
  readonly authMode: AuthMode;
  readonly mockAuthEnabled: boolean;
  readonly originalBooksBucket: string;
}

export interface UnconfiguredCloudConfig extends CloudConfigBase {
  readonly configured: false;
}

export interface ConfiguredCloudConfig extends CloudConfigBase {
  readonly configured: true;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}

export type CloudConfig = UnconfiguredCloudConfig | ConfiguredCloudConfig;

export type CloudConfigErrorCode =
  | "AUTH_MODE_FORBIDDEN"
  | "CLOUD_CONFIG_INVALID"
  | "CLOUD_NOT_CONFIGURED";

export interface CloudConfigError {
  readonly code: CloudConfigErrorCode;
  readonly message: string;
  readonly invalidKeys: string[];
  readonly missingKeys: string[];
}

export type CloudConfigResult =
  | { readonly ok: true; readonly config: CloudConfig }
  | { readonly ok: false; readonly error: CloudConfigError };

const CLOUD_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const DEFAULT_BUCKET = "original-books";

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isSupabaseUrl(value: string, production: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (production || url.protocol !== "http:") return false;

    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeServiceUrl(value: string | undefined): string | undefined {
  const normalized = normalize(value);
  return normalized?.replace(/\/+$/, "");
}

function isBucketName(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 63 &&
    !value.includes("..") &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value)
  );
}

function error(
  code: CloudConfigErrorCode,
  message: string,
  invalidKeys: string[] = [],
  missingKeys: string[] = [],
): CloudConfigResult {
  return {
    ok: false,
    error: { code, message, invalidKeys, missingKeys },
  };
}

export function resolveCloudConfig(
  environment: CloudConfigEnvironment = process.env,
): CloudConfigResult {
  const production = normalize(environment.NODE_ENV) === "production";
  const cloudModeValue = normalize(environment.CLOUD_MODE);
  const authModeValue = normalize(environment.AUTH_MODE);
  const invalidKeys: string[] = [];

  if (cloudModeValue && cloudModeValue !== "required" && cloudModeValue !== "optional") {
    invalidKeys.push("CLOUD_MODE");
  }
  if (authModeValue && authModeValue !== "supabase" && authModeValue !== "mock") {
    invalidKeys.push("AUTH_MODE");
  }

  const cloudMode: CloudMode =
    cloudModeValue === "required" || cloudModeValue === "optional"
      ? cloudModeValue
      : production
        ? "required"
        : "optional";
  const authMode: AuthMode =
    authModeValue === "supabase" || authModeValue === "mock"
      ? authModeValue
      : production
        ? "supabase"
        : "mock";
  const mockAuthEnabled = normalize(environment.MOCK_AUTH_ENABLED) === "true";
  const supabaseUrl = normalizeServiceUrl(environment.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalize(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const originalBooksBucket =
    normalize(environment.SUPABASE_ORIGINAL_BOOKS_BUCKET) ?? DEFAULT_BUCKET;

  if (supabaseUrl && !isSupabaseUrl(supabaseUrl, production)) {
    invalidKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!isBucketName(originalBooksBucket)) {
    invalidKeys.push("SUPABASE_ORIGINAL_BOOKS_BUCKET");
  }
  if (invalidKeys.length > 0) {
    return error("CLOUD_CONFIG_INVALID", "云端服务配置无效。", invalidKeys);
  }

  if (production && mockAuthEnabled) {
    return error(
      "AUTH_MODE_FORBIDDEN",
      "生产环境禁止启用 Mock 登录。",
      ["MOCK_AUTH_ENABLED"],
    );
  }
  if (production && authMode === "mock") {
    return error("AUTH_MODE_FORBIDDEN", "生产环境禁止使用 Mock 登录。", ["AUTH_MODE"]);
  }
  if (authMode === "mock" && !mockAuthEnabled) {
    return error(
      "AUTH_MODE_FORBIDDEN",
      "Mock 登录未启用。",
      ["MOCK_AUTH_ENABLED"],
    );
  }

  const values = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  };
  const missingKeys = CLOUD_KEYS.filter((key) => values[key] === undefined);
  const anyCloudValue = missingKeys.length < CLOUD_KEYS.length;

  if (missingKeys.length > 0) {
    if (cloudMode === "required" || authMode === "supabase" || anyCloudValue) {
      return error(
        "CLOUD_NOT_CONFIGURED",
        "云端服务配置不完整。",
        [],
        missingKeys,
      );
    }

    return {
      ok: true,
      config: {
        cloudMode,
        authMode,
        configured: false,
        mockAuthEnabled,
        originalBooksBucket,
      },
    };
  }

  return {
    ok: true,
    config: {
      cloudMode,
      authMode,
      configured: true,
      mockAuthEnabled,
      supabaseUrl: supabaseUrl!,
      supabaseAnonKey: supabaseAnonKey!,
      originalBooksBucket,
    },
  };
}
