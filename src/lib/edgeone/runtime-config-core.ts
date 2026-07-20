export type EdgeOneRuntimeConfig = {
  authMode: "edgeone";
  dataProvider: "edgeone";
  storageProvider: "edgeone";
  blobStore: string;
  sessionSecret: string;
  freeBlobConfirmed: boolean;
  freeModelConfirmed: boolean;
};

export type EdgeOneRuntimeConfigError = {
  code: "ZERO_COST_CONFIG_INVALID" | "ZERO_COST_CONFIG_MISSING";
  invalidKeys: string[];
  missingKeys: string[];
};

export type EdgeOneRuntimeConfigResult =
  | { ok: true; config: EdgeOneRuntimeConfig }
  | { ok: false; error: EdgeOneRuntimeConfigError };

export const FORBIDDEN_ZERO_COST_PRODUCTION_KEYS = [
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENT_SMS_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TRANSLATION_MCP_URL",
  "TRANSLATION_MCP_SECRET",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
] as const;

const REQUIRED_KEYS = [
  "AUTH_MODE",
  "CLOUD_DATA_PROVIDER",
  "CLOUD_STORAGE_PROVIDER",
  "EDGEONE_BLOB_STORE",
  "EDGEONE_SESSION_SECRET",
] as const;

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function fail(
  code: EdgeOneRuntimeConfigError["code"],
  invalidKeys: string[] = [],
  missingKeys: string[] = [],
): EdgeOneRuntimeConfigResult {
  return { ok: false, error: { code, invalidKeys, missingKeys } };
}

export function resolveEdgeOneRuntimeConfig(
  environment: Record<string, string | undefined>,
): EdgeOneRuntimeConfigResult {
  const values = Object.fromEntries(
    REQUIRED_KEYS.map((key) => [key, normalize(environment[key])]),
  ) as Record<(typeof REQUIRED_KEYS)[number], string | undefined>;
  const missingKeys = REQUIRED_KEYS.filter((key) => values[key] === undefined);
  if (missingKeys.length > 0) {
    return fail("ZERO_COST_CONFIG_MISSING", [], [...missingKeys]);
  }

  const paidKeys = FORBIDDEN_ZERO_COST_PRODUCTION_KEYS.filter(
    (key) => normalize(environment[key]) !== undefined,
  );
  if (paidKeys.length > 0) {
    return fail("ZERO_COST_CONFIG_INVALID", [...paidKeys]);
  }

  const invalidKeys: string[] = [];
  const freeBlobConfirmation = normalize(environment.EDGEONE_FREE_BLOB_CONFIRMED);
  const freeModelConfirmation = normalize(environment.EDGEONE_FREE_MODEL_CONFIRMED);
  if (values.AUTH_MODE !== "edgeone") invalidKeys.push("AUTH_MODE");
  if (values.CLOUD_DATA_PROVIDER !== "edgeone") {
    invalidKeys.push("CLOUD_DATA_PROVIDER");
  }
  if (values.CLOUD_STORAGE_PROVIDER !== "edgeone") {
    invalidKeys.push("CLOUD_STORAGE_PROVIDER");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.EDGEONE_BLOB_STORE!)) {
    invalidKeys.push("EDGEONE_BLOB_STORE");
  }
  if (
    values.EDGEONE_SESSION_SECRET!.length < 64 ||
    values.EDGEONE_SESSION_SECRET!.length > 512
  ) {
    invalidKeys.push("EDGEONE_SESSION_SECRET");
  }
  if (freeModelConfirmation !== undefined && !["true", "false"].includes(freeModelConfirmation)) {
    invalidKeys.push("EDGEONE_FREE_MODEL_CONFIRMED");
  }
  if (freeBlobConfirmation !== undefined && !["true", "false"].includes(freeBlobConfirmation)) {
    invalidKeys.push("EDGEONE_FREE_BLOB_CONFIRMED");
  }
  if (invalidKeys.length > 0) {
    return fail("ZERO_COST_CONFIG_INVALID", invalidKeys);
  }

  return {
    ok: true,
    config: {
      authMode: "edgeone",
      dataProvider: "edgeone",
      storageProvider: "edgeone",
      blobStore: values.EDGEONE_BLOB_STORE!,
      sessionSecret: values.EDGEONE_SESSION_SECRET!,
      freeBlobConfirmed: freeBlobConfirmation === "true",
      freeModelConfirmed: freeModelConfirmation === "true",
    },
  };
}
