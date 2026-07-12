# Stray Pages 生产级验证环境设计

## 1. 目标与范围

本阶段把当前已经实现的 Supabase Auth、PostgreSQL、私有 Storage、Next.js 网站与独立 Translation MCP Server 部署为一个受限的生产级验证环境。环境必须允许测试人员使用真实短信 OTP 登录、上传 TXT、创建云端译本、调用真实模型完成至少一章翻译，并在退出后重新登录恢复全部云端数据。

本阶段不面向公众开放注册，不承诺中国大陆网络质量，不接支付、后台 worker、EPUB、AI 阅读问答或语音。这些能力按照总目标中的既定顺序在后续独立规格中实现。

## 2. 固定平台选择

- Next.js 网站：Vercel，连接 GitHub 仓库 `nihaoxia/my-first-project` 的 `main` 分支。
- Auth、PostgreSQL 与 Storage：Supabase 托管项目，新加坡区域。
- 手机短信：Twilio Messaging Service，通过 Supabase Phone Auth 发送真实 OTP；公开注册保持关闭，仅验证明确列入测试清单的手机号。
- Translation MCP Server：Railway 常驻 Node.js 服务。
- 模型：OpenAI 兼容 Chat Completions 服务；模型密钥只保存在 Railway。
- 第一阶段域名：Vercel 与 Railway 自动分配的 HTTPS 域名。

选择 Railway 而不是 Vercel 承载 MCP，是因为当前 MCP 进程是具有独立健康检查的常驻 Streamable HTTP Server，不依赖 Vercel Serverless 请求生命周期。选择 Supabase 新加坡区域，是为了让数据库、Vercel 和 Railway 之间保持合理的亚太网络距离，同时保留后续迁移到其他区域的边界。

## 3. 部署拓扑与信任边界

```text
测试用户浏览器
  │
  ├─ HTTPS ─► Vercel / Next.js
  │              ├─ Supabase anon key ─► Supabase Auth
  │              ├─ DATABASE_URL ──────► Supabase PostgreSQL
  │              ├─ service role key ──► Supabase Storage
  │              └─ MCP bearer secret ─► Railway MCP
  │
  └─ OTP SMS ◄── Twilio ◄── Supabase Auth

Railway MCP
  └─ AI_API_KEY ─► OpenAI 兼容模型服务
```

浏览器只能接收 Supabase URL 和 anon key。Vercel 持有数据库连接、service role key 和网站到 MCP 的共享 secret。Railway 持有相同的 MCP secret 和模型密钥。Twilio 凭据只进入 Supabase Auth Provider 配置。任何平台日志、响应和构建产物都不得包含这些密钥。

## 4. Supabase 部署设计

### 4.1 项目与迁移

创建一个新加坡区域的托管 Supabase 项目。`supabase/migrations/202607110001_cloud_foundation.sql` 是唯一权威基础迁移；禁止用 `prisma db push` 替代它。迁移完成后执行数据库 lint，并验证 Prisma schema 与迁移契约测试。

迁移必须建立：

- `UserProfile`、`AccountBalance`、原版书、章节、译本、翻译任务、学习资料、阅读状态和导入 receipt；
- Auth 用户创建 trigger；
- 所有用户数据表的 RLS 与 `FORCE ROW LEVEL SECURITY`；
- 被封禁用户的 fail-closed 读取策略；
- `original-books` 私有 Storage bucket；
- 绑定 `auth.uid()` 的对象路径策略；
- Storage 清理意图和翻译执行 receipt。

### 4.2 Auth 与短信

Supabase Auth 启用 Phone provider，Twilio 使用 Messaging Service SID。第一阶段只允许测试清单中的手机号参与验证；测试清单保存在受控的部署运行手册中，不进入 Git 仓库。OTP 有效期、发送频率和验证频率沿用仓库的安全边界，并在 Supabase Dashboard 中设置一致值。

固定验证码 `123456` 只保留在本地 Docker 的 `supabase/config.toml`。Vercel 生产环境必须设置 `AUTH_MODE=supabase`、`CLOUD_MODE=required` 和 `MOCK_AUTH_ENABLED=false`，生产页面不得展示本地验证码。

### 4.3 Storage

`original-books` 必须保持私有、TXT-only、单对象 2 MiB 上限。上传路径由服务端生成，格式为用户与书籍绑定的固定路径。下载只通过短时签名 URL。删除数据库记录与删除对象之间使用已经实现的持久化清理意图和补偿流程。

## 5. Vercel 部署设计

Vercel 项目连接 `main`，生产构建执行仓库的 `pnpm build`。环境变量只通过 Vercel 项目设置写入 Production 环境：

- `NODE_ENV=production`
- `CLOUD_MODE=required`
- `AUTH_MODE=supabase`
- `MOCK_AUTH_ENABLED=false`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ORIGINAL_BOOKS_BUCKET=original-books`
- `DATABASE_URL`
- `TRANSLATION_MCP_URL`
- `TRANSLATION_MCP_SECRET`
- `TRANSLATION_MCP_TIMEOUT_MS=180000`

Supabase Auth 的 Site URL 设置为 Vercel 生产 URL，Additional Redirect URLs 只包含受控的 Vercel production/preview URL。生产部署不得因为构建期缺少请求 Cookie 而预渲染失败。

## 6. Railway MCP 部署设计

Railway 服务从同一 GitHub 仓库构建，仅运行 Translation MCP：

- 构建：`pnpm install --frozen-lockfile && pnpm mcp:translation:build`
- 启动：`pnpm mcp:translation:start`
- 健康检查：`GET /health`
- MCP endpoint：`POST /mcp`

Railway 环境变量：

- `NODE_ENV=production`
- `PORT` 使用 Railway 注入的监听端口；部署实现会让 MCP 配置在没有显式 `MCP_TRANSLATION_PORT` 时读取 `PORT`
- `MCP_TRUSTED_HOSTS` 为 Railway 分配域名
- `TRANSLATION_MCP_SECRET`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_REQUEST_TIMEOUT_MS=60000`

`/health` 只能返回是否就绪，不得返回模型名、模型 URL、secret 或 API key。`/mcp` 只允许受信 Host 和携带正确 Bearer secret 的 POST 请求。

## 7. 配置与密钥生命周期

部署过程中生成两个独立的高熵 secret：网站到 MCP 的 bearer secret，以及平台自身生成的数据库与服务密钥。真实值不写入 `.env.example`、README、部署日志、测试快照或 Git 历史。

密钥轮换顺序：先在 Railway 接受新 MCP secret，再更新 Vercel，验证成功后移除旧值；Supabase service role、数据库密码、Twilio token 和模型 key 按各平台轮换流程执行。轮换失败时回退平台环境变量，不回退数据库 migration。

## 8. 失败与回滚

- Supabase migration 失败：停止 Vercel 切换，不执行 `db push`，根据 SQL 错误修复新 migration 后重试。
- 短信失败：保持公开注册关闭，保留已有测试会话，不回退到 Mock Auth。
- Vercel 构建失败：生产 alias 保持在上一成功部署。
- MCP 健康检查失败：Vercel 保持部署，但翻译 capability 显示不可用，不生成演示译文。
- 模型超时或限流：任务记录稳定错误，余额冻结按现有事务释放，用户可重试。
- Storage 上传失败：不写业务数据库；数据库提交失败时执行对象补偿或留下持久化清理意图。

## 9. 验证与完成标准

本阶段只有以下证据全部存在才算完成：

1. GitHub `main` 对应的 Vercel production deployment 构建成功并可通过 HTTPS 访问。
2. Railway `/health` 返回就绪，未授权 `/mcp` 返回 401，合法 MCP 调用成功。
3. Supabase migration 已应用，数据库 lint 通过，私有 `original-books` bucket 存在。
4. 新 Phone Auth 用户会自动得到 `UserProfile` 和 `AccountBalance`。
5. 真实短信 OTP 登录、退出和重新登录成功，生产页面不显示固定验证码。
6. 两个测试账号的数据库 RLS 和 Storage 对象均互相隔离。
7. 测试账号可以上传 TXT、保存章节、获得签名下载 URL并删除书籍。
8. 测试账号可以创建云端译本，通过 Railway MCP 完成至少一章真实翻译。
9. 退出并重新登录后，书籍、译本、译文、阅读进度和学习资料仍可恢复。
10. 浏览器网络响应、Vercel、Railway 和 Supabase 可见日志中没有真实密钥、OTP 或未脱敏手机号。
11. 仓库全量测试、ESLint、TypeScript、Prisma validate、MCP build、Next build 和 `git diff --check` 全部通过。

## 10. 后续顺序

本阶段完成后，严格进入总目标的第 2 项：启动本地 Docker Supabase，补齐真实 migration reset、双用户 RLS/Storage 集成测试和浏览器 E2E。后续 worker、限流监控、管理后台、支付、EPUB、AI 阅读能力、质检审核和手机端打磨均不在本规格中提前实现。
