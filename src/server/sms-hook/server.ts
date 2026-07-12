import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  handleSendSmsHook,
  MAX_SMS_HOOK_BODY_BYTES,
  type SendSmsMessage,
  type SmsHookResult,
} from "./hook-core.ts";

export type SmsHookLogEvent = {
  event: "sms_hook_request";
  code: SmsHookResult["code"];
  status: SmsHookResult["status"];
};

export type SmsHookServerDependencies = {
  configured: boolean;
  webhookSecretBase64: string;
  nowUnixSeconds(): number;
  send(message: SendSmsMessage): Promise<void>;
  log(event: SmsHookLogEvent): void;
};

export function createSmsHookServer(dependencies: SmsHookServerDependencies) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, dependencies);
    } catch {
      json(response, 500, { error: { code: "INTERNAL_ERROR" } });
    }
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SmsHookServerDependencies,
) {
  const pathname = safePathname(request.url);
  if (pathname === "/health") {
    if (request.method !== "GET") {
      json(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
      return;
    }
    json(response, 200, { status: "ok", configured: dependencies.configured });
    return;
  }
  if (pathname !== "/hooks/send-sms") {
    json(response, 404, { error: { code: "NOT_FOUND" } });
    return;
  }
  if (request.method !== "POST") {
    json(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
    return;
  }
  if (!hasAuthenticationHeaders(request)) {
    request.resume();
    json(response, 401, { error: { code: "UNAUTHORIZED" } });
    return;
  }
  if (!dependencies.configured) {
    request.resume();
    json(response, 503, { error: { code: "PROVIDER_UNAVAILABLE" } });
    return;
  }

  const body = await readUtf8Body(request, MAX_SMS_HOOK_BODY_BYTES);
  const result = body === null
    ? { status: 400 as const, code: "INVALID_REQUEST" as const }
    : await handleSendSmsHook({
        rawBody: body,
        headers: requestHeaders(request),
        webhookSecretBase64: dependencies.webhookSecretBase64,
        nowUnixSeconds: dependencies.nowUnixSeconds(),
        send: dependencies.send,
      });
  dependencies.log({ event: "sms_hook_request", code: result.code, status: result.status });
  if (result.status === 204) {
    response.writeHead(204, securityHeaders());
    response.end();
    return;
  }
  json(response, result.status, { error: { code: result.code } });
}

function safePathname(url: string | undefined) {
  try { return new URL(url ?? "/", "http://localhost").pathname; }
  catch { return "/invalid"; }
}

function hasAuthenticationHeaders(request: IncomingMessage) {
  return ["webhook-id", "webhook-timestamp", "webhook-signature"]
    .every((name) => typeof request.headers[name] === "string" && request.headers[name]!.length > 0);
}

function requestHeaders(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (value) headers.set(name, value.join(", "));
  }
  return headers;
}

async function readUtf8Body(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) {
      request.resume();
      return null;
    }
    chunks.push(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
