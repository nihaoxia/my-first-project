# Stray Pages

Stray Pages 是一个面向小说导入、译本创建、双语阅读和学习收藏的 Next.js 应用。当前仓库既支持无需外部服务的本地 TXT 流程，也已实现 Supabase Auth、PostgreSQL 云端数据、私有 Storage 和本地数据导入；通过独立 MCP Server 可接入 OpenAI 兼容模型完成真实逐章翻译。生产使用仍需部署 Supabase migration、配置短信供应商和密钥。

## 国内生产架构

生产目标固定为腾讯云广州：Linux 云服务器运行 Caddy、Next.js、自托管 Supabase、Translation MCP 和腾讯云短信 Hook，原文写入广州私有 COS，镜像存放在 TCR 私有仓库，模型使用腾讯混元兼容接口。生产不依赖海外托管平台登录；中国大陆公开上线前必须完成 ICP备案。详细部署、备份、恢复、验收与回滚步骤见 [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md)。

## 当前可用范围

- 开发环境 Mock 手机号登录，体验验证码为 `123456`；
- Supabase 手机号 OTP 登录、数据库用户资料与服务端权限校验；
- 云端原版书、译本、翻译进度、阅读进度和学习资料的跨设备持久化；
- 私有 Supabase Storage 原文上传、短时签名下载、删除和失败补偿清理；
- 本地书架、译本和学习资料的一次性幂等云端导入；
- TXT 导入、UTF-8/GB18030 解码、自动拆章和章节编辑；
- Streamable HTTP MCP 翻译服务、逐章进度、失败暂停和手动重试；
- 按登录账号隔离的本地书架、译本、阅读收藏和笔记；
- 译本章节导航、词汇本、句子本和笔记本；
- 管理页及 Prisma 数据模型的本地原型。

TXT 单文件上限为 2 MB。开发环境可选择本地模式，数据保存在浏览器当前账号作用域的 `localStorage` 中；完整 Supabase 服务端配置可用时，账号、书籍、译本、阅读进度和学习资料走云端路径。EPUB、MOBI、PDF 解析、AI 问答和语音控件尚未接入，不会伪装成可用功能。

## 环境要求

- Node.js 22.6 或更高版本；
- pnpm 11.5.3；
- 如需验证 Prisma 或运行数据库相关代码，需要 PostgreSQL/Supabase 连接信息。

复制环境变量模板：

```bash
cp .env.example .env.local
```

开发环境至少可以使用：

```dotenv
MOCK_AUTH_ENABLED=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`MOCK_AUTH_ENABLED` 在生产环境默认关闭。未接入真实身份系统前，不应在生产环境开启 Mock 登录。

## 配置 Supabase 云端模式

本地 Supabase 需要 Docker Desktop 正在运行。启动并重置数据库：

```bash
pnpm supabase:start
pnpm supabase:reset
```

将 `pnpm supabase:status` 输出的 API URL、anon key 和 service role key 写入 `.env.local`，并使用本地 PostgreSQL 连接串：

```dotenv
CLOUD_MODE=required
AUTH_MODE=supabase
MOCK_AUTH_ENABLED=false
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
SUPABASE_ORIGINAL_BOOKS_BUCKET=original-books
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

本地 Docker 的测试手机号为 `+8613800000000`，验证码为 `123456`。这个固定验证码只存在于 `supabase/config.toml` 的本地开发配置；生产项目必须在 Supabase 控制台配置真实短信供应商。

远程部署时，先把 `supabase/migrations/202607110001_cloud_foundation.sql` 应用到目标项目，再配置同名环境变量。生产环境强制使用 Supabase Auth 和 HTTPS Supabase URL，缺失或部分配置会拒绝启动云端能力，不会静默退回本地数据。

## 配置 MCP 真实翻译

在 `.env.local` 中配置网站到 MCP 的连接，以及 MCP 到 OpenAI 兼容模型的连接：

```dotenv
TRANSLATION_MCP_URL=http://127.0.0.1:8787/mcp
TRANSLATION_MCP_SECRET=replace-with-at-least-32-random-characters
TRANSLATION_MCP_TIMEOUT_MS=180000
MCP_TRANSLATION_PORT=8787
MCP_TRUSTED_HOSTS=localhost,127.0.0.1,[::1]

AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-provider-key
AI_MODEL=replace-with-compatible-model-name
AI_REQUEST_TIMEOUT_MS=60000
```

`TRANSLATION_MCP_SECRET` 必须至少 32 个字符，并且网站进程与 MCP 进程必须使用同一个值。所有这些变量都是服务端变量，不能添加 `NEXT_PUBLIC_` 前缀，也不能提交真实值。

生产环境中的 `AI_BASE_URL` 必须使用 HTTPS；网站到同一 Compose 内 MCP 的地址固定为 `http://translation-mcp:8787/mcp`，其他生产 HTTP MCP 地址均被拒绝。开发环境只允许通过 HTTP 访问 `localhost`、`127.0.0.1` 或 `[::1]`。`MCP_TRUSTED_HOSTS` 是逗号分隔、无协议和端口的 Host 白名单。当前翻译网关没有搜索工具，因此联网术语查证仍不可用，云端 API 会明确拒绝启用请求。

OpenAI 兼容厂商只需替换 `AI_BASE_URL`、`AI_API_KEY` 和 `AI_MODEL`。例如 DeepSeek 可使用其 `/v1` 兼容地址和 `deepseek-chat`，通义千问可使用百炼兼容地址和已开通的模型名；具体模型可用性以账号所在供应商为准。

模型会收到用户选中的章节原文、目标语言和术语表。启用前应确认所用供应商的数据处理、保留和隐私条款。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm mcp:translation:dev
```

另开一个终端启动网站：

```bash
pnpm dev
```

MCP 健康检查地址是 `http://127.0.0.1:8787/health`。它只返回是否就绪，不返回模型地址、模型名或密钥。

访问 `http://localhost:3000`。普通手机号会得到普通用户角色；仅开发体验中，以 `0000` 结尾的手机号会得到 Mock 管理员角色。

## 验证命令

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm mcp:translation:build
pnpm build
```

Prisma 验证需要 `DATABASE_URL`。仅做 schema 检查时可以临时使用格式正确的占位 URL：

```bash
DATABASE_URL=postgresql://review:review@localhost:5432/stray_pages pnpm db:validate
```

## 数据与安全说明

- Mock 会话是开发工具，不是生产凭据；生产环境默认忽略 Mock Cookie。
- Supabase 会话以 `auth.getUser()` 和数据库 `UserProfile` 为权威来源，不信任客户端声明的角色。
- 云端业务查询同时限定当前用户和资源 ID；数据库表强制 RLS，Storage bucket 为私有且对象路径绑定用户与书籍。
- 原文对象上传与数据库事务使用持久化清理意图和补偿流程，避免失败后留下无归属对象。
- 浏览器数据按账号哈希作用域隔离，旧的无作用域数据不会自动分配给任何新登录用户。
- 浏览器存储被禁用或空间不足时，界面会显示错误，不会声称保存成功。
- 模型 API Key 和 MCP secret 只由服务端读取；浏览器只调用同源 `/api/translation` 路由。
- 每章成功后才保存完整译文；任一分段失败时整章失败，不会写入半章或回退到模板译文。
- 页面关闭时不会在后台继续。遗留的“翻译中”任务会变为需要手动重试，避免刷新后无提示地重复调用模型。
- 本地模式数据仍可能被清理浏览器数据、无痕模式或设备故障删除；生产环境应启用已实现的 Supabase 云端模式，并配置备份与保留策略。
- Prisma schema 与权威 Supabase migration 已覆盖核心模型和数据库安全约束；生产部署必须按运行手册应用 migration，禁止用 `prisma db push` 替代。

## 生产接入清单

完整的腾讯云广州资源、自托管 Supabase、COS、短信、TCR、migration、验收和回滚步骤见
[`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md)。

正式上线前至少需要完成：

1. 把权威 Supabase migration 应用到目标项目并验证 RLS、Auth trigger 和私有 Storage；
2. 配置生产短信供应商、Supabase/PostgreSQL 密钥、备份和数据保留策略；
3. 完成 EPUB/MOBI/PDF 解析流水线；
4. AI 问答、联网术语查证和语音供应商；
5. 生产后台队列、分布式幂等、余额冻结与真实结算；
6. 可观测性、限流、审计、密钥管理和上线环境安全策略。

## MCP 翻译故障排查

- 创建页显示“尚未配置”：检查 `TRANSLATION_MCP_URL` 和 `TRANSLATION_MCP_SECRET` 是否同时存在。
- 创建页显示“无法连接”：确认 `pnpm mcp:translation:dev` 正在运行，并访问 `/health`。
- MCP Server 启动失败：检查 secret 是否达到 32 字符，以及 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 是否完整。
- 章节显示请求过多：模型供应商返回了 429；等待配额恢复后点击“重试本章”。
- 章节显示超时：增加 `AI_REQUEST_TIMEOUT_MS` 或选择响应更快的模型；不要把超时设为超过 180000。
- 401：网站与 MCP Server 的 `TRANSLATION_MCP_SECRET` 不一致。
