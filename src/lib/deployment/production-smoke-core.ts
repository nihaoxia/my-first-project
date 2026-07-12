export type ProductionSmokeCheckName =
  | "configuration"
  | "app-health"
  | "app-home"
  | "supabase-auth"
  | "supabase-rest"
  | "security-headers";

export type ProductionSmokeCheckCode =
  | "OK"
  | "TIMEOUT"
  | "NETWORK"
  | "UNEXPECTED_STATUS"
  | "INVALID_CONFIG";

export type ProductionSmokeCheck = {
  name: ProductionSmokeCheckName;
  ok: boolean;
  status: number | null;
  code: ProductionSmokeCheckCode;
};

export type ProductionSmokeResult = { ok: boolean; checks: ProductionSmokeCheck[] };

export type ProductionSmokeConfig = {
  appUrl: string;
  supabaseUrl: string;
  timeoutMs?: number;
};

export type ProductionSmokeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CheckDefinition = {
  name: Exclude<ProductionSmokeCheckName, "configuration">;
  url: string;
  expectedStatus: number;
  validate?: (response: Response) => Promise<boolean>;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export async function runProductionSmoke(
  config: ProductionSmokeConfig,
  fetchImplementation: ProductionSmokeFetch = fetch,
): Promise<ProductionSmokeResult> {
  const normalized = normalizeConfig(config);
  if (!normalized) {
    return {
      ok: false,
      checks: [{ name: "configuration", ok: false, status: null, code: "INVALID_CONFIG" }],
    };
  }

  const checks: CheckDefinition[] = [
    {
      name: "app-health",
      url: new URL("/api/health", normalized.appUrl).toString(),
      expectedStatus: 200,
      validate: validateAppHealth,
    },
    { name: "app-home", url: normalized.appUrl, expectedStatus: 200 },
    {
      name: "supabase-auth",
      url: new URL("/auth/v1/health", normalized.supabaseUrl).toString(),
      expectedStatus: 200,
    },
    {
      name: "supabase-rest",
      url: new URL("/rest/v1/", normalized.supabaseUrl).toString(),
      expectedStatus: 200,
    },
    {
      name: "security-headers",
      url: normalized.appUrl,
      expectedStatus: 200,
      validate: validateSecurityHeaders,
    },
  ];

  const results: ProductionSmokeCheck[] = [];
  for (const check of checks) {
    results.push(await executeCheck(check, normalized.timeoutMs, fetchImplementation));
  }
  return { ok: results.every((check) => check.ok), checks: results };
}

async function executeCheck(
  definition: CheckDefinition,
  timeoutMs: number,
  fetchImplementation: ProductionSmokeFetch,
): Promise<ProductionSmokeCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(definition.url, {
      redirect: "follow",
      signal: controller.signal,
    });
    const validBody = definition.validate
      ? await definition.validate(response.clone()).catch(() => false)
      : true;
    const ok = response.status === definition.expectedStatus && validBody;
    return {
      name: definition.name,
      ok,
      status: response.status,
      code: ok ? "OK" : "UNEXPECTED_STATUS",
    };
  } catch (error) {
    return {
      name: definition.name,
      ok: false,
      status: null,
      code: isAbortError(error) ? "TIMEOUT" : "NETWORK",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateAppHealth(response: Response) {
  if (response.status !== 200) return false;
  const body: unknown = await response.json();
  return isRecord(body) && body.status === "ok" && body.configured === true;
}

async function validateSecurityHeaders(response: Response) {
  const hsts = response.headers.get("strict-transport-security") ?? "";
  return response.headers.get("x-content-type-options")?.toLowerCase() === "nosniff" && /max-age=\d+/i.test(hsts);
}

function normalizeConfig(config: ProductionSmokeConfig) {
  const appUrl = normalizeHttpsUrl(config.appUrl);
  const supabaseUrl = normalizeHttpsUrl(config.supabaseUrl);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!appUrl || !supabaseUrl || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    return null;
  }
  return { appUrl, supabaseUrl, timeoutMs };
}

function normalizeHttpsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}
