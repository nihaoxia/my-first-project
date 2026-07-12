import { createServer } from "node:http";

const port = Number.parseInt(process.env.FAKE_OPENAI_PORT ?? "8788", 10);
let mode = "success";

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", mode });
  }

  if (request.method === "POST" && request.url === "/__test/mode") {
    const body = await readJson(request);
    mode = body?.mode === "rate-limit" || body?.mode === "invalid" ? body.mode : "success";
    return sendJson(response, 200, { mode });
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    return sendJson(response, 404, { error: "Not found" });
  }

  if (mode === "rate-limit") {
    return sendJson(response, 429, { error: { message: "test rate limit" } });
  }

  if (mode === "invalid") {
    return sendJson(response, 200, { choices: [] });
  }

  const body = await readJson(request);
  const userMessage = Array.isArray(body?.messages)
    ? body.messages.find((message) => message?.role === "user")?.content
    : "";
  const targetIsChinese = typeof userMessage === "string" && userMessage.includes("目标语言：中文");
  const content = targetIsChinese
    ? "这是由 MCP 测试服务通过完整协议链路生成的译文。"
    : "This translation was generated through the complete MCP test pipeline.";

  return sendJson(response, 200, {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 24, completion_tokens: 12 },
  });
});

server.listen(port, "127.0.0.1", () => {
  console.error(`[fake-openai] listening on 127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close());
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 256 * 1024) return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
