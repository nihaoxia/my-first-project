# MCP 真实翻译接入实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪。当前工作区含用户既有未提交修改；不要执行 `git commit`、`git push`、清理或回滚。

**目标：** 让 Stray Pages 的本地译本流程通过独立 Streamable HTTP MCP Server 调用 OpenAI 兼容模型，按章保存真实译文，并支持失败恢复和刷新后安全续跑。

**架构：** Next.js Route Handler 作为受保护的 MCP Client，调用固定环境变量配置的 Translation MCP Server；MCP Server 将 `translate_segments` Tool 映射到 OpenAI 兼容 Chat Completions。浏览器任务页一次运行一章，每章成功后写入账号作用域 localStorage，失败不回退到演示译文。

**技术栈：** Next.js 16 App Router、React 19、TypeScript 6、`@modelcontextprotocol/sdk` 1.29.0、Zod 4.4.3、tsx 4.23.0、tsup 8.5.1、Node 原生测试。

---

## 文件结构

### 新建

- `src/lib/translation/mcp-contract.ts`：MCP Tool 输入、输出、错误和 HTTP DTO 的唯一契约与解析器。
- `src/server/translation-mcp/config.ts`：MCP Server 环境变量校验。
- `src/server/translation-mcp/openai-compatible-gateway.ts`：OpenAI 兼容请求、超时、响应解析和错误归类。
- `src/server/translation-mcp/translate-segments-tool.ts`：受限并发翻译核心和 MCP Tool 返回映射。
- `src/server/translation-mcp/server.ts`：MCP Server 注册、HTTP transport、Bearer 鉴权和 health endpoint。
- `src/server/translation-mcp/index.ts`：独立进程入口和优雅关闭。
- `src/lib/translation/mcp-translation-provider.ts`：Next.js 服务端 MCP Client，继续实现现有 `TranslationProvider` 接口。
- `src/lib/translation/translation-api-service.ts`：会话、Origin、输入、并发锁、能力探测和错误到 HTTP 的纯服务层。
- `src/app/api/translation/capabilities/route.ts`：翻译能力探测 Route Handler。
- `src/app/api/translation/chapters/route.ts`：单章翻译 Route Handler。
- `src/lib/translation/local-translation-runner.ts`：浏览器逐章执行的纯状态选择与中断恢复规则。
- `tests/mcp-translation-contract.test.ts`。
- `tests/openai-compatible-gateway.test.ts`。
- `tests/translate-segments-tool.test.ts`。
- `tests/translation-mcp-server.test.ts`。
- `tests/mcp-translation-provider.test.ts`。
- `tests/translation-api-service.test.ts`。
- `tests/local-translation-runner.test.ts`。

### 修改

- `package.json`、`pnpm-lock.yaml`：精确依赖与 MCP 脚本。
- `.env.example`：MCP 和 OpenAI 兼容配置占位符。
- `src/lib/library/local-translation-storage.ts`：queued/processing/ready/partial/failed 持久化状态机。
- `tests/local-translation-storage.test.ts`：任务创建、完成、失败、重试和兼容性。
- `src/components/translation/local-translation-create.tsx`：只创建排队译本，不再生成模板译文。
- `src/components/translation/translation-create-panel.tsx`：能力探测、真实翻译文案和禁用状态。
- `src/components/translation/local-translation-tasks.tsx`：逐章调用、进度保存、失败重试和恢复。
- `src/components/ui/status-pill.tsx`：新任务状态标签。
- `src/lib/product-capabilities.ts`、`src/app/page.tsx`：诚实描述 MCP 可配置能力。
- `README.md`：双进程启动、配置、安全和故障排查。
- `.github/workflows/ci.yml`：增加 MCP bundle 构建。

## 任务 1：安装精确依赖并建立脚本边界

**文件：**

- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：安装运行时依赖**

运行：

```powershell
pnpm add --save-exact @modelcontextprotocol/sdk@1.29.0 zod@4.4.3
```

预期：`package.json` 使用精确版本，lockfile importer 与之相同。

- [ ] **步骤 2：安装构建依赖**

运行：

```powershell
pnpm add --save-dev --save-exact tsx@4.23.0 tsup@8.5.1
```

- [ ] **步骤 3：添加 MCP 脚本**

在 `package.json` 增加：

```json
{
  "scripts": {
    "mcp:translation:dev": "tsx watch src/server/translation-mcp/index.ts",
    "mcp:translation:build": "tsup src/server/translation-mcp/index.ts --format esm --platform node --target node22 --out-dir dist/translation-mcp --clean",
    "mcp:translation:start": "node dist/translation-mcp/index.js"
  }
}
```

- [ ] **步骤 4：验证依赖仍精确固定**

运行：

```powershell
node --experimental-strip-types --test tests/project-maintainability.test.ts
```

预期：所有直接依赖精确版本测试通过。

## 任务 2：用 TDD 建立共享 MCP 契约

**文件：**

- 创建：`tests/mcp-translation-contract.test.ts`
- 创建：`src/lib/translation/mcp-contract.ts`

- [ ] **步骤 1：编写失败测试**

测试必须覆盖：合法输入、11 段、1201 字单段、总字符超过 12000、非法语言、重复 segment ID、成功输出缺 ID、空译文和错误 DTO。

核心断言：

```ts
test("rejects duplicate and oversized translation segments", () => {
  const duplicate = parseTranslateSegmentsInput({
    ...validInput,
    segments: [validInput.segments[0], validInput.segments[0]],
  });
  assert.equal(duplicate.ok, false);

  const oversized = parseTranslateSegmentsInput({
    ...validInput,
    segments: [{ ...validInput.segments[0], text: "字".repeat(1201) }],
  });
  assert.equal(oversized.ok, false);
});

test("rejects provider output that does not align with source ids", () => {
  const result = parseTranslateSegmentsOutput(
    { ...validOutput, translations: [{ segmentId: "other", index: 0, translatedText: "Translation" }] },
    validInput.segments,
  );
  assert.deepEqual(result, { ok: false, code: "PROVIDER_RESPONSE_INVALID" });
});
```

- [ ] **步骤 2：运行测试并确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/mcp-translation-contract.test.ts
```

预期：FAIL，原因是 `mcp-contract.ts` 不存在。

- [ ] **步骤 3：实现最小契约模块**

导出：

```ts
export const supportedMcpTargetLanguages = [
  "中文", "英文", "日文", "韩文", "俄语", "德语", "西班牙语", "法语",
] as const;

export type TranslationServiceErrorCode =
  | "AUTH_REQUIRED"
  | "ORIGIN_REJECTED"
  | "INVALID_INPUT"
  | "TRANSLATION_BUSY"
  | "MCP_NOT_CONFIGURED"
  | "MCP_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RESPONSE_INVALID"
  | "TRANSLATION_FAILED";

export function parseTranslateSegmentsInput(value: unknown): ParseResult<TranslateSegmentsInput>;
export function parseTranslateSegmentsOutput(
  value: unknown,
  sourceSegments: TranslateSegmentInput[],
): ParseResult<TranslateSegmentsOutput>;
```

使用 Zod 做形状和长度校验，再用纯逻辑检查 ID 唯一、总字符数和输出集合完全相等。

- [ ] **步骤 4：运行测试确认绿灯**

运行同一步骤 2，预期全部通过。

## 任务 3：用 TDD 实现 OpenAI 兼容 Gateway

**文件：**

- 创建：`tests/openai-compatible-gateway.test.ts`
- 创建：`src/server/translation-mcp/config.ts`
- 创建：`src/server/translation-mcp/openai-compatible-gateway.ts`

- [ ] **步骤 1：编写 Gateway 失败测试**

使用注入的 `fetchImpl`，不访问真实网络：

```ts
test("returns only the translated content from a compatible response", async () => {
  const gateway = createOpenAiCompatibleGateway(validConfig, async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: "The mist crossed the bridge." } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    }), { status: 200 }),
  );

  const result = await gateway.translateSegment(validSegmentRequest);
  assert.deepEqual(result, {
    text: "The mist crossed the bridge.",
    inputTokens: 20,
    outputTokens: 8,
  });
});
```

另外覆盖 429 → `PROVIDER_RATE_LIMITED`、AbortError → `PROVIDER_TIMEOUT`、空 choices/空 content → `PROVIDER_RESPONSE_INVALID`、500 → `TRANSLATION_FAILED`，并断言错误不包含上游响应正文。

- [ ] **步骤 2：运行测试确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/openai-compatible-gateway.test.ts
```

预期：FAIL，Gateway 模块不存在。

- [ ] **步骤 3：实现配置解析和 Gateway**

`parseTranslationMcpServerConfig` 校验：

```ts
{
  port: 8787,
  mcpSecret: stringMin32,
  aiBaseUrl: absoluteHttpUrl,
  aiApiKey: nonEmpty,
  aiModel: nonEmpty,
  aiRequestTimeoutMs: integerBetween5000And180000,
}
```

Gateway 用 AbortController 调用 `${baseUrl}/chat/completions`，请求体只包含 `model`、`messages`、`temperature: 0.2`。提示词复用小说翻译约束，响应只接受非空 `choices[0].message.content`。

- [ ] **步骤 4：运行 Gateway 测试确认绿灯**

预期全部通过，测试输出不含密钥和原始 Provider 错误正文。

## 任务 4：用 TDD 实现 `translate_segments` Tool 核心

**文件：**

- 创建：`tests/translate-segments-tool.test.ts`
- 创建：`src/server/translation-mcp/translate-segments-tool.ts`

- [ ] **步骤 1：编写失败测试**

用可控制完成顺序的 Fake Gateway 验证最大并发为 3、结果恢复 input index 顺序、token usage 求和、任一段失败时整个调用失败。

```ts
test("keeps source order when segment calls finish out of order", async () => {
  const result = await translateSegmentsWithGateway(validInput, delayedGateway, 3);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok ? result.output.translations.map(item => item.segmentId) : [],
    ["segment-1", "segment-2", "segment-3"],
  );
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行目标测试，预期模块不存在。

- [ ] **步骤 3：实现固定并发 worker pool**

导出：

```ts
export async function translateSegmentsWithGateway(
  input: TranslateSegmentsInput,
  gateway: OpenAiCompatibleGateway,
  concurrency = 3,
): Promise<TranslateSegmentsExecutionResult>;

export function toMcpToolResult(result: TranslateSegmentsExecutionResult): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
```

任何失败不返回部分成功数组；错误文本只包含稳定代码和中文操作建议。

- [ ] **步骤 4：运行测试确认绿灯**

预期并发、顺序和错误用例全部通过。

## 任务 5：搭建并集成测试 Streamable HTTP MCP Server

**文件：**

- 创建：`tests/translation-mcp-server.test.ts`
- 创建：`src/server/translation-mcp/server.ts`
- 创建：`src/server/translation-mcp/index.ts`

- [ ] **步骤 1：编写协议集成失败测试**

测试在 `127.0.0.1` 随机端口启动服务，用 SDK `Client` 与 `StreamableHTTPClientTransport`：

```ts
const tools = await client.listTools();
assert.equal(tools.tools.some(tool => tool.name === "translate_segments"), true);

const result = await client.callTool({
  name: "translate_segments",
  arguments: validInput,
});
assert.equal(result.isError, undefined);
```

另测：无 Bearer、错误 Bearer、`GET /health`、未知路径、超过 body limit。

- [ ] **步骤 2：运行测试确认红灯**

预期：FAIL，server 工厂不存在。

- [ ] **步骤 3：实现可注入的 HTTP Server 工厂**

```ts
export function createTranslationMcpHttpServer(input: {
  secret: string;
  execute: typeof translateSegmentsWithGateway;
}): NodeHttpServer;
```

每个 MCP 请求创建隔离的 `McpServer` 与无状态 `StreamableHTTPServerTransport`，先注册 Tool 再连接。`/mcp` 只接受授权 POST，`/health` 不返回模型和 URL。

- [ ] **步骤 4：实现进程入口**

`index.ts` 解析环境、创建 Gateway、监听端口；SIGINT/SIGTERM 关闭 HTTP server。日志只用 `console.error`，且不记录原文/译文/密钥。

- [ ] **步骤 5：运行协议测试和 bundle**

```powershell
node --experimental-strip-types --test tests/translation-mcp-server.test.ts
pnpm mcp:translation:build
```

预期：测试通过，生成 `dist/translation-mcp/index.js`。

## 任务 6：用 TDD 实现 Next.js MCP Provider 与 API 服务层

**文件：**

- 创建：`tests/mcp-translation-provider.test.ts`
- 创建：`tests/translation-api-service.test.ts`
- 创建：`src/lib/translation/mcp-translation-provider.ts`
- 创建：`src/lib/translation/translation-api-service.ts`

- [ ] **步骤 1：编写 MCP Provider 失败测试**

注入 Fake MCP Client Adapter，验证调用 `translate_segments`、输入映射、输出二次校验、`isError`、非 JSON、重复/缺失 ID 和超时关闭。

```ts
test("closes the MCP client after a successful translation", async () => {
  const adapter = createFakeMcpAdapter(validToolResult);
  const provider = createMcpTranslationProvider(validEnv, () => adapter);
  await provider.translateSegments(providerInput);
  assert.equal(adapter.closed, true);
});
```

- [ ] **步骤 2：运行 Provider 测试确认红灯**

预期模块不存在。

- [ ] **步骤 3：实现服务端 MCP Provider**

文件首行导入 `server-only`。使用 SDK Client 和带 Authorization header 的 Streamable HTTP transport；`finally` 中关闭。将 SDK Tool result 解析为共享契约，再映射到现有 `TranslationProviderResult`。

- [ ] **步骤 4：编写 API 服务失败测试**

覆盖：无会话、Origin 不同源、非法输入、缺配置、同用户并发、Gateway 成功、各稳定错误的 HTTP status，以及 capabilities 不泄漏配置。

- [ ] **步骤 5：实现纯 API 服务**

```ts
export async function handleTranslateChapter(input: {
  request: TranslationChapterHttpRequest;
  sessionScope: string | null;
  origin: string | null;
  appUrl: string;
  providerFactory: () => TranslationProvider;
}): Promise<TranslationHttpResult>;
```

模块维护进程内 `Set<string>` 并发锁，必须在 `finally` 中释放。capabilities 使用注入的 2 秒 health probe。

- [ ] **步骤 6：运行两个测试文件确认绿灯**

预期全部通过。

## 任务 7：添加受保护的 Next.js Route Handlers

**文件：**

- 创建：`src/app/api/translation/capabilities/route.ts`
- 创建：`src/app/api/translation/chapters/route.ts`
- 修改：`src/lib/auth/access-policy.ts`
- 修改：`src/proxy.ts`
- 修改：`tests/proxy-config.test.ts`

- [ ] **步骤 1：先扩展代理配置测试并确认失败**

断言 matcher 包含 `/api/translation/:path*`，且访问策略把该路径视为登录后路由。

- [ ] **步骤 2：运行配置测试确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/proxy-config.test.ts tests/access-policy.test.ts
```

- [ ] **步骤 3：实现薄 Route Handler**

两条路由只负责：读取 `getMockSession()`、Origin、JSON，调用纯服务层，将 `{ status, body }` 转成 `Response.json`。不要在 Route 文件复制验证逻辑。

- [ ] **步骤 4：更新 proxy/access policy 并确认绿灯**

API 仍在 Route Handler 内再次鉴权，proxy 只是第一层，不作为唯一安全边界。

## 任务 8：用 TDD 把本地译本改为可恢复状态机

**文件：**

- 修改：`tests/local-translation-storage.test.ts`
- 创建：`tests/local-translation-runner.test.ts`
- 修改：`src/lib/library/local-translation-storage.ts`
- 创建：`src/lib/translation/local-translation-runner.ts`

- [ ] **步骤 1：编写排队译本失败测试**

替换“创建后全部 ready”的旧期望：

```ts
test("creates queued chapters without template translations", () => {
  const translation = buildQueuedLocalTranslationFromOrder(validBuildInput);
  assert.equal(translation.status, "queued");
  assert.equal(translation.tasks.every(task => task.status === "queued"), true);
  assert.equal(translation.chapters.every(chapter => chapter.translatedParagraphs.length === 0), true);
});
```

补充测试：开始任务、成功完成、质量待复核、失败、手动重试、部分成功、全部完成、损坏数据拒绝解析。

- [ ] **步骤 2：编写 runner 失败测试**

覆盖 `getNextQueuedTask`、只允许一个 translating、把刷新遗留 translating 转为 failed、只对失败任务生成重试更新。

- [ ] **步骤 3：运行两个测试确认红灯**

预期旧实现因直接 ready 和模板译文失败。

- [ ] **步骤 4：实现最小状态机**

导出：

```ts
buildQueuedLocalTranslationFromOrder(...)
startStoredLocalTranslationTask(...)
completeStoredLocalTranslationTask(...)
failStoredLocalTranslationTask(...)
retryStoredLocalTranslationTask(...)
recoverInterruptedStoredLocalTranslationTasks(...)
```

每次更新返回新数组，不原地修改；找不到 task 或状态不允许时返回 typed failure。Parser 深层验证所有新字段。

- [ ] **步骤 5：运行测试确认绿灯**

同时运行 `tests/local-library-translation.test.ts` 和 `tests/reader-view.test.ts`，保证只显示已完成章节。

## 任务 9：接入创建页和任务页

**文件：**

- 修改：`src/components/translation/local-translation-create.tsx`
- 修改：`src/components/translation/translation-create-panel.tsx`
- 修改：`src/components/translation/local-translation-tasks.tsx`
- 修改：`src/components/ui/status-pill.tsx`
- 修改：`tests/user-facing-copy.test.ts`

- [ ] **步骤 1：先写用户行为和纯 orchestration 失败测试**

用户文案测试必须断言不再出现“生成本地演示译本”，而是出现“开始 MCP 翻译”；runner 测试已覆盖任务选择，组件只消费这些纯函数。

- [ ] **步骤 2：运行相关测试确认红灯**

- [ ] **步骤 3：创建页生成 queued 记录**

使用 `buildQueuedLocalTranslationFromOrder`，保存后提供任务页链接；不发送网络请求，不写任何模板译文。组件加载时请求 capabilities；未配置或不可用时禁用按钮并显示可操作提示。

- [ ] **步骤 4：任务页逐章执行**

`LocalTranslationTasks`：

1. 初次加载先恢复遗留 translating 为 failed；
2. 使用 ref 防止 React Strict Mode 重复启动；
3. 取第一个 queued task，先持久化 translating；
4. POST `/api/translation/chapters`；
5. 成功后 `assessTranslationQuality` 并完成 task；
6. 失败后保存稳定 code/message；
7. 自动继续下一 queued task；
8. failed 行显示“重试本章”；
9. 没有 ready 章节时禁用阅读器。

- [ ] **步骤 5：增加状态标签与可访问状态**

状态 Pill 支持等待、翻译中、完成、失败；进行中区域用 `aria-live="polite"`，错误用 `role="alert"`，按钮在请求中禁用。

- [ ] **步骤 6：运行相关测试、Lint 和 TypeScript**

```powershell
node --experimental-strip-types --test tests/local-translation-storage.test.ts tests/local-translation-runner.test.ts tests/user-facing-copy.test.ts
node node_modules/eslint/bin/eslint.js src/components/translation src/lib/translation src/lib/library/local-translation-storage.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

## 任务 10：更新配置、文档、能力文案与 CI

**文件：**

- 修改：`.env.example`
- 修改：`src/lib/product-capabilities.ts`
- 修改：`src/app/page.tsx`
- 修改：`tests/product-capabilities.test.ts`
- 修改：`README.md`
- 修改：`.github/workflows/ci.yml`

- [ ] **步骤 1：先更新能力测试并确认失败**

断言首页默认不声称 MCP 已在线，文案说明“配置 MCP 与模型服务后可用”，并保留非 TXT、问答、语音未接入边界。

- [ ] **步骤 2：补齐 `.env.example`**

只加入空值或安全占位符：

```dotenv
TRANSLATION_MCP_URL=http://127.0.0.1:8787/mcp
TRANSLATION_MCP_SECRET=
MCP_TRANSLATION_PORT=8787
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=
AI_REQUEST_TIMEOUT_MS=60000
```

- [ ] **步骤 3：更新 README**

提供两个终端命令、变量职责、OpenAI/DeepSeek/通义兼容示例、密钥不得使用 `NEXT_PUBLIC_`、health 检查、常见 401/429/timeout 排查、数据会发送到第三方模型的隐私说明。

- [ ] **步骤 4：CI 增加 MCP bundle**

在生产构建前运行：

```yaml
- name: Build translation MCP server
  run: pnpm mcp:translation:build
```

- [ ] **步骤 5：运行能力与维护性测试确认绿灯**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/project-maintainability.test.ts
```

## 任务 11：完整验证与真实浏览器回归

**文件：**

- 不新增生产文件；发现问题时先补失败测试再修复。

- [ ] **步骤 1：运行全套自动化门禁**

```powershell
node --experimental-strip-types --test tests/*.test.ts
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit --incremental false
$env:DATABASE_URL='postgresql://review:review@localhost:5432/stray_pages'
node node_modules/prisma/build/index.js validate
pnpm mcp:translation:build
node node_modules/next/dist/bin/next build
git diff --check
```

预期：全部退出码 0，生产构建列出 App Router 和 `/api/translation` 路由。

- [ ] **步骤 2：启动可控 Fake OpenAI 兼容测试服务**

只在本地回归期间使用测试 fixture；不要把真实 API Key 写入仓库。Fake 服务必须返回输入对应的确定性译文，并能切换 429、超时和空 content。

- [ ] **步骤 3：启动 MCP Server 与 Next.js**

分别使用临时环境变量启动，确认 `/health` 不泄漏配置。

- [ ] **步骤 4：浏览器验证成功路径**

- 登录测试账号；
- 上传或使用本地 TXT；
- 选择两个章节创建译本；
- 任务页观察 queued → translating → ready；
- 刷新后结果仍存在；
- 阅读器显示 Fake 兼容服务返回的译文，不含旧模板句。

- [ ] **步骤 5：浏览器验证失败路径**

- 让 Fake Provider 返回 429，确认章节 failed 且其他已成功章节保留；
- 恢复 Provider，点击“重试本章”并完成；
- 停止 MCP Server，确认创建页或任务页显示可恢复错误且不生成演示译文；
- 刷新 translating 状态，确认不会自动重复调用而是要求手动重试。

- [ ] **步骤 6：结束测试进程并审计工作区**

关闭所有临时服务器和浏览器标签。确认：

```powershell
git status --short
git diff --check
rg -n "AI_API_KEY|TRANSLATION_MCP_SECRET" src tests README.md .env.example
rg -n "Fake AI|本地演示译文|A clear literary translation is ready" src/components src/app
```

密钥搜索只允许变量名和安全占位说明，不允许真实值；用户真实翻译路径不得残留 Fake/模板回退。

## 计划自检

- 规格中的 MCP Tool、Provider、API、状态机、UI、错误、安全、文档和验证均有对应任务。
- 所有生产行为都先有明确失败测试和红灯验证步骤。
- 计划没有依赖 PostgreSQL、真实队列或生产计费，保持在用户选择的本地优先范围。
- 所有新依赖使用 2026-07-11 查询到的精确版本。
- 不包含真实密钥、未决设计、占位实现或自动提交步骤。
