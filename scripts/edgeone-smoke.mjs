import { isIP } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

function configurationFailure() {
  return {
    ok: false,
    checks: [{ name: "configuration", ok: false, status: null, code: "INVALID_CONFIG" }],
  };
}

function parseOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || !value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const ipCandidate = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port && url.port !== "443" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !hostname.endsWith(".edgeone.app") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      isIP(ipCandidate) !== 0
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

async function readLimitedBody(response, maximum) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) {
    throw Object.assign(new Error("RESPONSE_TOO_LARGE"), { code: "RESPONSE_TOO_LARGE" });
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw Object.assign(new Error("RESPONSE_TOO_LARGE"), { code: "RESPONSE_TOO_LARGE" });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function isExactHealthPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value;
  if (Object.keys(body).sort().join(",") !== "capabilities,configured,status") return false;
  const capabilities = body.capabilities;
  return body.status === "ok" &&
    body.configured === true &&
    capabilities &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities) &&
    Object.keys(capabilities).sort().join(",") === "auth,blob,quota,web" &&
    capabilities.web === true &&
    capabilities.auth === true &&
    capabilities.blob === true &&
    capabilities.quota === true;
}

async function checkEndpoint({ name, url, expectedStatus, timeoutMs, maxResponseBytes, parseHealth }, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { accept: parseHealth ? "application/json" : "text/html,application/json;q=0.9" },
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      return { name, ok: false, status: response.status, code: "REDIRECT_FORBIDDEN" };
    }
    let bytes;
    try {
      bytes = await readLimitedBody(response, maxResponseBytes);
    } catch (error) {
      if (error?.code === "RESPONSE_TOO_LARGE") {
        return { name, ok: false, status: response.status, code: "RESPONSE_TOO_LARGE" };
      }
      throw error;
    }
    if (response.status !== expectedStatus) {
      return { name, ok: false, status: response.status, code: "UNEXPECTED_STATUS" };
    }
    if (parseHealth) {
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return { name, ok: false, status: response.status, code: "INVALID_HEALTH" };
      }
      if (!isExactHealthPayload(body)) {
        return { name, ok: false, status: response.status, code: "INVALID_HEALTH" };
      }
    }
    return { name, ok: true, status: response.status, code: "OK" };
  } catch (error) {
    const timeout = controller.signal.aborted || error?.name === "AbortError";
    return { name, ok: false, status: null, code: timeout ? "TIMEOUT" : "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}

export async function runEdgeOneSmoke(input, fetchImpl = globalThis.fetch) {
  const origin = parseOrigin(input?.origin);
  const timeoutMs = positiveInteger(input?.timeoutMs, DEFAULT_TIMEOUT_MS, 60_000);
  const maxResponseBytes = positiveInteger(
    input?.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    1024 * 1024,
  );
  if (!origin || timeoutMs === null || maxResponseBytes === null || typeof fetchImpl !== "function") {
    return configurationFailure();
  }
  const definitions = [
    { name: "home", path: "/", expectedStatus: 200, parseHealth: false },
    { name: "health", path: "/api/health", expectedStatus: 200, parseHealth: true },
    { name: "private-api", path: "/api/cloud/books", expectedStatus: 401, parseHealth: false },
  ];
  const checks = [];
  for (const definition of definitions) {
    checks.push(await checkEndpoint({
      ...definition,
      url: `${origin}${definition.path}`,
      timeoutMs,
      maxResponseBytes,
    }, fetchImpl));
  }
  return { ok: checks.every((check) => check.ok), checks };
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const timeoutMs = Number(process.env.EDGEONE_SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = Number(
    process.env.EDGEONE_SMOKE_MAX_RESPONSE_BYTES ?? DEFAULT_MAX_RESPONSE_BYTES,
  );
  const result = await runEdgeOneSmoke({
    origin: process.env.EDGEONE_PRODUCTION_ORIGIN ?? "",
    timeoutMs,
    maxResponseBytes,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
