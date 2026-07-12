# Stray Pages 生产级验证环境实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 GitHub `main` 上的 Stray Pages 部署为由 Vercel、Supabase 新加坡项目、Twilio SMS、Railway MCP 和 OpenAI 兼容模型组成的受限生产级验证环境，并完成真实 OTP、RLS、Storage 与逐章翻译验收。

**架构：** Vercel 运行 Next.js 并通过 Prisma 与 service role 边界访问 Supabase；浏览器仅持有 Supabase anon key。Railway 独立运行 Streamable HTTP MCP Server，Vercel 使用共享 bearer secret 调用它，模型 key 只存在 Railway。部署工具只检查键名和能力状态，不打印任何 secret。

**技术栈：** Next.js 16、Node.js 24、pnpm 11、Supabase CLI/PostgreSQL/Auth/Storage、Prisma 7、Vercel、Railway、Twilio、Node Test。

---

## 文件结构

- `tests/production-deployment-contract.test.ts`：Railway/Vercel 配置、生产脚本和无密钥约束的契约测试。
- `tests/production-smoke.test.ts`：生产 smoke 核心的 URL、响应、脱敏和失败分类测试。
- `src/server/translation-mcp/config.ts`：兼容 Railway `PORT`，保留显式 MCP 端口优先级。
- `src/lib/deployment/production-smoke-core.ts`：无 secret 输出的生产健康检查纯逻辑。
- `scripts/production-smoke.mjs`：检查 Vercel、MCP health、未授权 MCP、Supabase Auth/REST/Storage 可达性。
- `railway.toml`：MCP 服务构建、启动、健康检查和重启策略。
- `vercel.json`：网站构建与 Node 区域/函数边界。
- `.env.example`：补齐生产部署键名，不写入真实值。
- `package.json`：生产 smoke 与部署门禁脚本。
- `README.md`：生产级验证环境部署与回滚手册入口。
- `docs/PRODUCTION_RUNBOOK.md`：Supabase、Twilio、Vercel、Railway 的逐步运行手册和验收记录格式。
- `.github/workflows/ci.yml`：验证部署配置与 production smoke 核心测试。

### 任务 1：Railway 端口与部署配置契约

**文件：**
- 创建：`tests/production-deployment-contract.test.ts`
- 修改：`src/server/translation-mcp/config.ts`
- 创建：`railway.toml`
- 创建：`vercel.json`

- [ ] **步骤 1：编写失败测试**

在契约测试中验证：

```ts
test("Railway PORT is accepted only when the explicit MCP port is absent", () => {
  assert.equal(parseTranslationMcpServerConfig({ ...valid, PORT: "9000" }).config?.port, 9000);
  assert.equal(parseTranslationMcpServerConfig({ ...valid, PORT: "9000", MCP_TRANSLATION_PORT: "8787" }).config?.port, 8787);
});

test("deployment manifests run only the website and MCP production entrypoints", () => {
  assert.match(readFileSync("railway.toml", "utf8"), /pnpm mcp:translation:build/);
  assert.match(readFileSync("railway.toml", "utf8"), /pnpm mcp:translation:start/);
  assert.match(readFileSync("railway.toml", "utf8"), /\/health/);
  assert.doesNotMatch(readFileSync("vercel.json", "utf8"), /service.role|AI_API_KEY|TRANSLATION_MCP_SECRET/i);
});
```

- [ ] **步骤 2：验证红灯**

运行：

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts
```

预期：`PORT` 未进入 schema，且 `railway.toml`、`vercel.json` 不存在。

- [ ] **步骤 3：最小实现**

`src/server/translation-mcp/config.ts` 增加：

```ts
PORT: z.coerce.number().int().min(1).max(65_535).optional(),
MCP_TRANSLATION_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
```

解析端口使用：

```ts
const port = result.data.MCP_TRANSLATION_PORT ?? result.data.PORT ?? 8787;
```

`railway.toml` 固定 Nixpacks 构建、MCP build/start、`/health`、失败重启和单副本初始部署。`vercel.json` 只固定 Next.js framework、构建命令和新加坡函数区域，不包含环境变量值。

- [ ] **步骤 4：验证绿灯与回归**

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts tests/openai-compatible-gateway.test.ts
pnpm mcp:translation:build
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add tests/production-deployment-contract.test.ts src/server/translation-mcp/config.ts railway.toml vercel.json
git commit -m "feat: add production deployment manifests"
```

### 任务 2：无密钥生产 Smoke 工具

**文件：**
- 创建：`tests/production-smoke.test.ts`
- 创建：`src/lib/deployment/production-smoke-core.ts`
- 创建：`scripts/production-smoke.mjs`
- 修改：`package.json`

- [ ] **步骤 1：编写失败测试**

测试真实行为边界：

```ts
test("smoke summary reports capabilities without echoing credentials", async () => {
  const secret = "secret-that-must-never-appear";
  const result = await runProductionSmoke({
    appUrl: "https://app.example.com",
    mcpUrl: "https://mcp.example.com/mcp",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: secret,
    mcpSecret: secret,
  }, fakeFetch);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(result.checks.map((check) => check.name), [
    "app-home", "mcp-health", "mcp-unauthorized", "supabase-auth", "supabase-rest", "supabase-storage",
  ]);
});
```

同时覆盖 HTTPS 强制、超时、非 JSON、301/401/5xx 分类以及响应正文不进入结果。

- [ ] **步骤 2：验证红灯**

```bash
node --experimental-strip-types --test tests/production-smoke.test.ts
```

预期：模块不存在。

- [ ] **步骤 3：实现核心与 CLI**

核心只输出：

```ts
type SmokeCheck = {
  name: "app-home" | "mcp-health" | "mcp-unauthorized" | "supabase-auth" | "supabase-rest" | "supabase-storage";
  ok: boolean;
  status: number | null;
  code: "OK" | "TIMEOUT" | "NETWORK" | "UNEXPECTED_STATUS" | "INVALID_CONFIG";
};
```

脚本只从进程环境读取 `PRODUCTION_APP_URL`、`TRANSLATION_MCP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和 `TRANSLATION_MCP_SECRET`，打印固定 JSON summary并按失败返回非零退出码。

- [ ] **步骤 4：添加命令并验证**

`package.json`：

```json
"smoke:production": "node scripts/production-smoke.mjs",
"verify:deployment": "node --experimental-strip-types --test tests/production-deployment-contract.test.ts tests/production-smoke.test.ts"
```

运行聚焦测试与缺配置 smoke，预期聚焦测试通过、缺配置 smoke 以稳定 `INVALID_CONFIG` 失败且不打印环境变量值。

- [ ] **步骤 5：提交**

```bash
git add tests/production-smoke.test.ts src/lib/deployment/production-smoke-core.ts scripts/production-smoke.mjs package.json
git commit -m "feat: add secret-safe production smoke checks"
```

### 任务 3：生产运行手册与 CI 门禁

**文件：**
- 创建：`docs/PRODUCTION_RUNBOOK.md`
- 修改：`.env.example`
- 修改：`README.md`
- 修改：`.github/workflows/ci.yml`
- 修改：`tests/project-maintainability.test.ts`

- [ ] **步骤 1：先修改契约测试并验证红灯**

要求 CI 包含 `pnpm verify:deployment`，README 链接运行手册，运行手册包含 Supabase migration、Twilio、Vercel、Railway、回滚、验收和密钥泄漏响应章节。

- [ ] **步骤 2：编写运行手册**

手册使用精确顺序：

1. 创建 Supabase Singapore 项目并保存密钥到密码管理器；
2. `supabase login`、`supabase link --project-ref`、`supabase db push --include-all`、`supabase db lint --linked`；
3. 配置 Twilio Messaging Service、Supabase Phone Provider、Site URL和测试号码清单；
4. 创建 Railway 项目并配置 MCP/AI 环境变量；
5. 创建 Vercel 项目并配置 Supabase/MCP环境变量；
6. 执行 smoke、双用户隔离与真实翻译验收；
7. 记录部署 URL、commit SHA、migration version和不含密钥的检查结果；
8. 失败时按平台 alias、环境变量和 migration 前滚策略回滚。

- [ ] **步骤 3：更新 CI 与环境模板**

CI 在单元测试后执行 `pnpm verify:deployment`。`.env.example` 增加 `PORT` 与 `PRODUCTION_APP_URL` 的空值/本地安全示例，但不新增真实 token。

- [ ] **步骤 4：运行文档契约与完整门禁**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm verify:deployment
pnpm mcp:translation:build
pnpm build
git diff --check
```

- [ ] **步骤 5：提交**

```bash
git add docs/PRODUCTION_RUNBOOK.md .env.example README.md .github/workflows/ci.yml tests/project-maintainability.test.ts
git commit -m "docs: add production deployment runbook"
```

### 任务 4：创建 Supabase 与 Twilio 生产资源

**外部资源：** Supabase、Twilio。

- [ ] **步骤 1：发现登录状态**

优先使用官方 CLI/API；没有 CLI 或认证时使用已有浏览器会话。不得读取浏览器 cookie、密码存储或本地 secret 文件。

- [ ] **步骤 2：创建 Supabase Singapore 项目**

项目名使用 `stray-pages-production`。数据库密码由平台生成或密码管理器生成，不在终端输出。保存 project ref、API URL、anon key、service role key、pooler `DATABASE_URL` 和 direct migration URL到平台/密码管理器。

- [ ] **步骤 3：应用 migration**

使用已链接项目执行权威 migration和 linked lint。禁止 `prisma db push`。迁移失败只通过新增修复 migration 前滚。

- [ ] **步骤 4：配置 Twilio**

创建 Messaging Service，配置 Supabase Phone Provider，设置发送/验证频率与测试手机号清单。发送一次真实 OTP 并确认数据库 trigger 创建资料与余额。

- [ ] **步骤 5：验证 Supabase**

使用两个测试账号验证 RLS、私有 Storage 上传/签名读取/删除、被封禁用户拒绝和日志脱敏。把不含手机号与密钥的结果写入运行记录。

### 任务 5：部署 Railway MCP

**外部资源：** Railway、OpenAI 兼容模型服务。

- [ ] **步骤 1：创建 Railway 项目与 GitHub 服务**

项目名 `stray-pages-production`，连接仓库 `nihaoxia/my-first-project`，部署 `main`。

- [ ] **步骤 2：配置环境变量**

生成至少 32 字节的 MCP secret并分别写入 Railway 与待创建 Vercel 项目。Railway写入模型 URL/key/model、受信 Host和超时；不得在终端回显值。

- [ ] **步骤 3：部署并验证**

验证 `/health` 200、未授权 `/mcp` 401、错误 Host拒绝、合法 Tool调用成功、日志无密钥。

- [ ] **步骤 4：记录证据**

记录 Railway deployment ID、HTTPS域名、commit SHA和健康检查时间，不记录环境变量值。

### 任务 6：部署 Vercel 网站

**外部资源：** Vercel。

- [ ] **步骤 1：创建并连接项目**

项目名 `stray-pages`，连接 GitHub `main`，framework preset Next.js，生产分支 `main`。

- [ ] **步骤 2：配置环境变量**

写入 Supabase、数据库、MCP、生产站点和严格 Auth模式。Preview使用独立或受限配置，不复用生产 service role key。

- [ ] **步骤 3：更新 Supabase URL**

获得 Vercel production URL后，更新 `NEXT_PUBLIC_APP_URL`、Supabase Site URL和受控 Redirect URLs，触发新 deployment。

- [ ] **步骤 4：验证网站**

执行 `pnpm smoke:production`，验证首页、安全 header、登录页不显示固定验证码、未登录跳转和 MCP capability。

### 任务 7：生产端到端验收与交接

**外部资源：** Vercel、Supabase、Twilio、Railway、浏览器。

- [ ] **步骤 1：真实 OTP 与双用户隔离**

两个测试号码分别登录；验证只能读取自己的书籍、学习数据与 Storage对象。

- [ ] **步骤 2：上传与翻译闭环**

上传合法 TXT、检查章节、创建云端译本、运行至少一章 MCP翻译、保存学习收藏与阅读进度。

- [ ] **步骤 3：恢复与删除**

退出、重新登录、确认全部数据恢复；删除书籍并确认数据库记录与 Storage对象或持久化清理意图状态正确。

- [ ] **步骤 4：日志和密钥审计**

检查浏览器响应、Vercel、Railway、Supabase可见日志；不得出现 service role、数据库密码、MCP secret、AI key、OTP或未脱敏手机号。

- [ ] **步骤 5：最终门禁和记录**

重新运行完整本地门禁，记录 production URL、deployment ID、commit、migration和 11 项规格验收结果。第 1 项全部通过后更新总计划并进入本地 Supabase/Docker集成测试。
