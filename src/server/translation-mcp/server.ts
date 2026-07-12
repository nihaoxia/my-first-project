import { timingSafeEqual } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";

import {
  translateSegmentsInputSchema,
  type TranslateSegmentsInput,
} from "../../lib/translation/mcp-contract.ts";
import {
  toMcpToolResult,
  type TranslateSegmentsExecutionResult,
} from "./translate-segments-tool.ts";

type TranslationMcpHttpAppInput = {
  secret: string;
  trustedHosts?: string[];
  execute(
    input: TranslateSegmentsInput,
    signal?: AbortSignal,
  ): Promise<TranslateSegmentsExecutionResult>;
};

export function createTranslationMcpHttpApp(input: TranslationMcpHttpAppInput) {
  const app = express();
  app.use(hostHeaderValidation(input.trustedHosts ?? ["localhost", "127.0.0.1", "[::1]"]));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok", configured: true });
  });

  app.post(
    "/mcp",
    requireBearerSecret(input.secret),
    express.json({ limit: 256 * 1024 }),
    async (request, response) => {
      const server = createMcpServer(input.execute);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const cleanup = createIdempotentMcpCleanup(async () => {
        await Promise.allSettled([transport.close(), server.close()]);
      });
      response.once("close", () => void cleanup());

      try {
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch {
        if (!response.headersSent) {
          response.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      } finally {
        await cleanup();
      }
    },
  );

  app.get("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  app.delete("/mcp", (_request, response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  app.use(createMcpErrorHandler());

  return app;
}

export function createIdempotentMcpCleanup(close: () => void | Promise<void>) {
  let cleanupPromise: Promise<void> | null = null;
  return () => {
    cleanupPromise ??= Promise.resolve()
      .then(close)
      .catch(() => undefined);
    return cleanupPromise;
  };
}

function requireBearerSecret(expectedSecret: string): RequestHandler {
  return (request, response, next) => {
    if (!hasValidBearerSecret(request.get("authorization"), expectedSecret)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

function createMcpErrorHandler(): ErrorRequestHandler {
  return (error, _request, response, next) => {
    void next;
    const status = readHttpErrorStatus(error);
    response.status(status).json({
      jsonrpc: "2.0",
      error: {
        code: status === 400 ? -32700 : status === 413 ? -32001 : -32603,
        message:
          status === 400
            ? "Invalid JSON body."
            : status === 413
              ? "Payload too large."
              : "Internal server error.",
      },
      id: null,
    });
  };
}

function readHttpErrorStatus(error: unknown) {
  if (isRecord(error) && error.status === 413) return 413;
  if (isRecord(error) && error.status === 400) return 400;
  return 500;
}

function createMcpServer(execute: TranslationMcpHttpAppInput["execute"]) {
  const server = new McpServer({ name: "stray-pages-translation", version: "1.0.0" });

  server.registerTool(
    "translate_segments",
    {
      title: "翻译小说片段",
      description:
        "将最多 10 个带稳定 ID 的小说片段翻译成指定语言。返回相同 ID 和顺序的纯译文；不执行联网检索，单段最多 1200 字。",
      inputSchema: translateSegmentsInputSchema,
    },
    async (argumentsValue, extra) =>
      toMcpToolResult(await execute(argumentsValue, extra.signal)),
  );

  return server;
}

function hasValidBearerSecret(authorization: string | undefined, expectedSecret: string) {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const received = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
