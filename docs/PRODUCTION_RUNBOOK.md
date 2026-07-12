# Stray Pages 生产级验证环境运行手册

本手册用于部署受限的生产级验证环境：Vercel 网站、Supabase 新加坡项目、Twilio SMS、Railway Translation MCP 和 OpenAI 兼容模型。真实密钥只进入平台环境变量或密码管理器，禁止写入 Git、聊天记录、构建日志和验收截图。

## 1. 部署前门禁

在干净的 `main` commit 上运行：

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm lint
pnpm typecheck
pnpm verify:deployment
pnpm mcp:translation:build
pnpm build
git diff --check
```

记录 commit SHA，不记录任何环境变量值。生产资源名称固定为 `stray-pages-production`，网站 Vercel 项目名固定为 `stray-pages`。

## 2. Supabase 新加坡项目

### 2.1 创建与关联

在 Supabase 创建 Singapore region 项目。数据库密码保存到密码管理器。通过官方 CLI 登录并把 project ref 放入当前终端变量；不要把 ref 和 token 写入仓库：

```bash
pnpm dlx supabase@2.90.0 login
pnpm dlx supabase@2.90.0 link --project-ref $SUPABASE_PROJECT_REF
```

PowerShell 使用 `$env:SUPABASE_PROJECT_REF`，Bash 使用 `$SUPABASE_PROJECT_REF`。关联信息位于被忽略的 `supabase/.temp`，不得提交。

### 2.2 应用权威 migration

唯一基础 migration 是 `supabase/migrations/202607110001_cloud_foundation.sql`。禁止使用 `prisma db push`：

```bash
pnpm dlx supabase@2.90.0 db push --include-all
pnpm dlx supabase@2.90.0 db lint --linked
```

确认 migration history、Auth trigger、RLS、`FORCE ROW LEVEL SECURITY` 和 `original-books` bucket 均已建立。迁移失败时新增前滚修复 migration，不修改已经应用的远程 migration。

### 2.3 保存连接信息

把以下值保存到密码管理器，稍后分别写入 Vercel：

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- service role key → `SUPABASE_SERVICE_ROLE_KEY`
- transaction pooler URL → `DATABASE_URL`
- direct database URL → `DIRECT_URL`，只用于迁移与受控运维，不提供给浏览器

浏览器只允许获得 Project URL 和 anon key。

## 3. Twilio 与 Supabase Phone Auth

### 3.1 Twilio

在 Twilio 创建 Messaging Service，绑定可发送目标测试号码所在地区的 sender。Account SID、Auth Token 和 Messaging Service SID保存到密码管理器。

### 3.2 Supabase Auth Provider

在 Supabase Dashboard 的 Authentication Providers 中启用 Phone/Twilio并填入三项 Twilio 凭据。设置：

- OTP 长度 6；
- OTP 有效期 10 分钟以内；
- 单号码发送最小间隔至少 30 秒；
- 项目处于受限验证状态，不发布公开注册链接；
- 测试号码清单只保存在受控验收记录，不进入 Git。

Vercel 必须使用 `AUTH_MODE=supabase`、`CLOUD_MODE=required`、`MOCK_AUTH_ENABLED=false`。固定 OTP `123456` 只属于本地 Docker配置。

### 3.3 Auth 验证

对两个测试号码各发送一次真实 OTP。登录后从 Supabase SQL Editor确认 Auth trigger分别创建 `UserProfile` 和 `AccountBalance`。验收记录只写测试账号代号，不记录手机号或 OTP。

## 4. Railway Translation MCP

### 4.1 创建服务

在 Railway 创建 `stray-pages-production` 项目，从 GitHub `nihaoxia/my-first-project` 的 `main` 创建服务。根目录保持仓库根目录；Railway读取 `railway.toml`：

- build：安装锁定依赖并执行 `pnpm mcp:translation:build`；
- start：`pnpm mcp:translation:start`；
- health：`/health`；
- restart：失败最多重试 3 次。

### 4.2 环境变量

在 Railway设置 `NODE_ENV=production`、`MCP_TRUSTED_HOSTS`、`TRANSLATION_MCP_SECRET`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 和 `AI_REQUEST_TIMEOUT_MS=60000`。`MCP_TRUSTED_HOSTS` 只填 Railway分配的纯主机名，不含协议和路径。

Railway 自动注入 `PORT`，不要在平台固定 `MCP_TRANSLATION_PORT`。MCP secret至少 32 字节，生成结果直接保存到密码管理器和平台密码框，不进入日志或提交。

### 4.3 Railway 验证

- `GET https://<railway-domain>/health` 返回 `{"status":"ok","configured":true}`；
- 未授权 `POST /mcp` 返回 401；
- 非受信 Host 被拒绝；
- 通过正式 MCP SDK调用 `translate_segments` 成功；
- Railway日志中没有 bearer secret、AI key、原文全文或未脱敏用户信息。

记录 deployment ID、域名、commit SHA和检查时间。

## 5. Vercel 网站

### 5.1 创建项目

在 Vercel导入 GitHub仓库，项目名 `stray-pages`，Production Branch设为 `main`，Framework Preset设为 Next.js。`vercel.json` 固定安装、构建命令和 `sin1` 区域。

### 5.2 Production 环境变量

在 Vercel Production环境写入：`CLOUD_MODE=required`、`AUTH_MODE=supabase`、`MOCK_AUTH_ENABLED=false`、`NEXT_PUBLIC_APP_URL`、三项 Supabase API 配置、`DATABASE_URL`、bucket、MCP URL/secret和 180000 ms MCP超时。不要把 service role key写入 Preview；Preview使用独立 Supabase项目或保持云端能力不可用。

### 5.3 URL 回填

首次成功部署后，把 Vercel production URL回填到 `NEXT_PUBLIC_APP_URL`。在 Supabase Auth URL Configuration中设置同一个 Site URL；Additional Redirect URLs只加入受控 Vercel preview URL。重新部署生产 alias。

## 6. 生产 Smoke

在受控终端临时设置 `PRODUCTION_APP_URL`、`TRANSLATION_MCP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和 `TRANSLATION_MCP_SECRET`，然后运行：

```bash
pnpm smoke:production
```

输出只包含检查名、HTTP状态和稳定错误码。不得包含 URL查询参数、响应正文、header或 secret。全部检查应为 `OK`。

## 7. 双用户验收

1. 账号 A真实 OTP登录，上传合法 TXT并确认章节。
2. 账号 B登录，确认无法读取 A 的数据库记录和 Storage对象。
3. 账号 B上传另一份 TXT，账号 A同样不能读取。
4. 账号 A创建云端译本，通过 Railway MCP完成至少一章真实翻译。
5. 保存词汇、句子、笔记和阅读进度。
6. 退出并重新登录，确认书籍、译本、译文和学习数据恢复。
7. 删除测试书籍，确认数据库与 Storage对象删除；失败时必须存在持久化清理意图。
8. 临时把一个测试资料角色设为 `BANNED`，确认其业务数据读取 fail closed；随后恢复测试角色。

## 8. 日志与密钥泄漏检查

检查浏览器 Network、Vercel Function Logs、Railway Logs和 Supabase Logs。禁止出现数据库密码、连接串、service role key、JWT正文、MCP secret、AI key、Twilio Auth Token、OTP、未脱敏手机号或用户上传原文全文。

### 密钥泄漏响应

发现泄漏时立即停止验收并按顺序轮换：泄漏平台 secret、所有复用位置、相关会话。MCP secret先让 Railway接受新值，再更新 Vercel并验证，最后删除旧值。数据库密码、service role、Twilio token和模型 key按平台轮换。清除可删除日志，记录事件时间、影响范围和轮换完成证据；不得把泄漏值复制到事件记录。

## 9. 回滚

- Vercel：production alias回退到上一成功 deployment。
- Railway：回滚到上一健康 deployment；MCP不可用时网站保留读写功能但翻译 capability显示不可用。
- 环境变量：恢复上一已验证版本并重新部署，不在代码中硬编码临时值。
- Supabase：只使用前滚 migration修复，禁止回滚或改写已应用的基础 migration。
- Twilio：短信故障时保持公开注册关闭，不回退到 Mock Auth。

## 10. 验收记录

记录网站与 MCP deployment ID/URL/commit、Supabase项目内部代号、最新 migration、smoke JSON、两个测试账号代号、RLS/Storage/OTP/翻译/恢复/删除/日志审计结果、验收时间和执行人。记录不得包含任何密钥、OTP或手机号。

所有检查通过后，才把生产部署阶段标记完成并进入本地 Supabase/Docker 集成测试。
