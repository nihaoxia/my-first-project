export type ProductionSmokeCheckName =
  | "configuration"
  | "app-home"
  | "mcp-health"
  | "mcp-unauthorized"
  | "supabase-auth"
  | "supabase-rest"
  | "supabase-storage";

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

export type ProductionSmokeResult = {
  ok: boolean;
  checks: ProductionSmokeCheck[];
};

export type ProductionSmokeConfig = {
  appUrl: string;
  mcpUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mcpSecret: string;
  timeoutMs?: number;
};

export type ProductionSmokeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CheckDefinition = {
  name: Exclude<ProductionSmokeCheckName, "configuration">;
  url: string;
  init?: RequestInit;
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
      checks: [
        { name: "configuration", ok: false, status: null, code: "INVALID_CONFIG" },
      ],
    };
  }

  const publicHeaders = new Headers({
    apikey: normalized.supabaseAnonKey,
    authorization: `Bearer ${normalized.supabaseAnonKey}`,
  });
  const checks: CheckDefinition[] = [
    {
      name: "app-home",
      url: normalized.appUrl,
      expectedStatus: 200,
    },
    {
      name: "mcp-health",
      url: new URL("/health", normalized.mcpUrl).toString(),
      expectedStatus: 200,
      validate: validateMcpHealth,
    },
    {
      name: "mcp-unauthorized",
      url: normalized.mcpUrl,
      init: {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        body: "{}",
      },
      expectedStatus: 401,
    },
    {
      name: "supabase-auth",
      url: new URL("/auth/v1/health", normalized.supabaseUrl).toString(),
      init: { headers: publicHeaders },
      expectedStatus: 200,
    },
    {
      name: "supabase-rest",
      url: new URL("/rest/v1/", normalized.supabaseUrl).toString(),
      init: { headers: publicHeaders },
      expectedStatus: 200,
    },
    {
      name: "supabase-storage",
      url: new URL("/storage/v1/bucket", normalized.supabaseUrl).toString(),
      init: { headers: publicHeaders },
      expectedStatus: 200,
    },
  ];

  const results: ProductionSmokeCheck[] = [];
  for (const check of checks) {
    results.push(
      await executeCheck(check, normalized.timeoutMs, fetchImplementation),
    );
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
      ...definition.init,
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

async function validateMcpHealth(response: Response): Promise<boolean> {
  if (response.status !== 200) return false;
  const body: unknown = await response.json();
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).status === "ok" &&
    (body as Record<string, unknown>).configured === true
  );
}

function normalizeConfig(config: ProductionSmokeConfig) {
  const appUrl = normalizeHttpsUrl(config.appUrl);
  const mcpUrl = normalizeHttpsUrl(config.mcpUrl);
  const supabaseUrl = normalizeHttpsUrl(config.supabaseUrl);
  const supabaseAnonKey = config.supabaseAnonKey.trim();
  const mcpSecret = config.mcpSecret.trim();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    !appUrl ||
    !mcpUrl ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    mcpSecret.length < 32 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 60_000
  ) {
    return null;
  }
  return { appUrl, mcpUrl, supabaseUrl, supabaseAnonKey, mcpSecret, timeoutMs };
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

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
