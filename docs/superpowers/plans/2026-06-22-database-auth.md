# Stray Pages 数据库结构和账号系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Stray Pages 建立第一版真实数据底座，包括 Prisma 数据模型、Supabase 配置入口、开发期模拟手机号登录、用户资料、余额账户和基础权限边界。

**架构：** 使用 Supabase PostgreSQL 作为数据库和账号底座，Prisma 管理业务数据模型和类型。第一阶段先完成本地 schema、数据访问边界和模拟登录流程；真实 Supabase 项目、短信验证码和生产环境密钥在用户提供配置后接入。

**技术栈：** Next.js App Router、React、TypeScript、Supabase、Prisma、PostgreSQL、Server Actions、pnpm。

---

## 范围边界

本计划包含：

- 安装 Prisma 和 Supabase 客户端依赖。
- 创建 Prisma schema 初稿。
- 创建数据库模型：
  - 用户资料。
  - 原版书。
  - 译本书。
  - 章节。
  - 翻译任务。
  - 账户余额。
  - 余额流水。
  - 冻结记录。
  - 术语。
  - 词汇本。
  - 句子本。
  - AI 问答限频记录。
- 创建 Prisma Client 单例。
- 创建 Supabase 客户端文件结构。
- 创建 `.env.example` 的数据库和认证变量说明。
- 创建开发期模拟手机号登录页面逻辑。
- 创建基础登录态保护结构。
- 创建管理员权限字段和后台保护入口。
- 更新路线图和开发日志。

本计划不包含：

- 真实短信验证码服务。
- 真实支付。
- 文件上传。
- EPUB/TXT 解析。
- AI 翻译。
- 后台任务队列。
- 生产 Supabase 项目创建。
- 数据库迁移到真实远程环境。

## 前置条件

需要用户后续提供：

- Supabase 项目 URL。
- Supabase anon key。
- Supabase service role key。
- PostgreSQL `DATABASE_URL`。
- PostgreSQL `DIRECT_URL`，如果 Prisma 迁移需要直连。

开发期可以先使用本地 `.env` 占位，不提交真实密钥。

## 文件结构

将创建或修改：

- 修改：`package.json`，增加 Prisma/Supabase 脚本和依赖。
- 创建：`prisma/schema.prisma`，数据库模型定义。
- 创建：`src/lib/db.ts`，Prisma Client 单例。
- 创建：`src/lib/supabase/client.ts`，浏览器 Supabase 客户端。
- 创建：`src/lib/supabase/server.ts`，服务端 Supabase 客户端入口。
- 创建：`src/lib/auth/mock-session.ts`，开发期模拟会话工具。
- 创建：`src/app/login/actions.ts`，开发期模拟登录 Server Action。
- 修改：`src/app/login/page.tsx`，接入模拟登录表单结构。
- 创建：`src/app/(protected)/layout.tsx`，后续登录保护布局占位。
- 创建：`src/app/admin/layout.tsx`，后台管理员保护占位。
- 修改：`.env.example`，补充数据库和认证变量。
- 修改：`docs/ROADMAP.md`，阶段 2 标记为进行中。
- 修改：`docs/DEV_LOG.md`，记录阶段 2 启动和计划。

---

## 任务 1：安装数据库和认证依赖

**文件：**

- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

步骤：

1. 安装依赖：

```powershell
pnpm add @prisma/client @supabase/ssr @supabase/supabase-js
pnpm add -D prisma
```

2. 在 `package.json` 增加脚本：

```json
{
  "db:generate": "prisma generate",
  "db:format": "prisma format",
  "db:validate": "prisma validate"
}
```

3. 运行：

```powershell
pnpm db:generate
pnpm db:validate
pnpm lint
pnpm build
```

完成标准：

- 依赖安装完成。
- Prisma CLI 可运行。
- 项目仍可 lint 和 build。

## 任务 2：创建 Prisma schema 初稿

**文件：**

- 创建：`prisma/schema.prisma`

步骤：

1. 定义 datasource 和 generator。
2. 定义枚举：
   - `BookFormat`
   - `BookLanguage`
   - `TranslationStatus`
   - `ChapterStatus`
   - `TaskStatus`
   - `LedgerType`
   - `TermType`
   - `UserRole`
3. 定义核心模型：
   - `UserProfile`
   - `AccountBalance`
   - `BalanceLedger`
   - `BalanceHold`
   - `OriginalBook`
   - `TranslatedBook`
   - `Chapter`
   - `TranslatedChapter`
   - `TranslationTask`
   - `Term`
   - `VocabularyItem`
   - `SentenceItem`
   - `AiRateLimit`

完成标准：

- `pnpm db:format` 通过。
- `pnpm db:validate` 通过。
- 模型覆盖规格中的第一版核心数据。

## 任务 3：创建数据库访问边界

**文件：**

- 创建：`src/lib/db.ts`

步骤：

1. 创建 Prisma Client 单例。
2. 避免开发环境热重载生成多个 Prisma Client。
3. 只在服务端导入该文件。

完成标准：

- TypeScript 类型检查通过。
- `pnpm lint` 通过。
- `pnpm build` 通过。

## 任务 4：创建 Supabase 客户端入口

**文件：**

- 创建：`src/lib/supabase/client.ts`
- 创建：`src/lib/supabase/server.ts`

步骤：

1. 浏览器端使用 public URL 和 anon key。
2. 服务端入口读取 cookie。
3. 不在客户端暴露 service role key。
4. 缺失环境变量时给出明确错误。

完成标准：

- 文件边界清楚。
- 不泄露服务端密钥。
- `pnpm lint` 和 `pnpm build` 通过。

## 任务 5：开发期模拟手机号登录

**文件：**

- 创建：`src/lib/auth/mock-session.ts`
- 创建：`src/app/login/actions.ts`
- 修改：`src/app/login/page.tsx`

步骤：

1. 登录页改为服务端表单。
2. 手机号输入后，开发期使用固定验证码 `123456`。
3. 模拟登录成功后写入开发期 cookie。
4. 登录失败显示错误信息。
5. 页面明确标注“开发期模拟验证码”。

完成标准：

- 不接真实短信。
- 登录流程能在本地形成可测试闭环。
- 后续可替换为 Supabase Auth 手机号验证码。

## 任务 6：权限边界和开发期路由保护

**文件：**

- 创建：`src/app/(protected)/layout.tsx`
- 创建：`src/app/admin/layout.tsx`
- 创建：`src/proxy.ts`
- 修改：`src/lib/auth/mock-session.ts`

步骤：

1. [x] 创建普通登录保护布局。
2. [x] 创建后台管理员保护布局。
3. [x] 使用 Next.js 16 `src/proxy.ts` 实现开发期路由保护。
4. [x] 未登录访问私人页面时跳转到 `/login?next=...`。
5. [x] 普通用户访问后台时跳转到 `/library?error=admin`。
6. [x] 管理员允许访问后台。
7. [x] 已登录用户访问登录页时跳转到 `/library`。
8. [ ] 后续真实登录接入后，把开发期 mock session 替换为 Supabase Auth session。

完成标准：

- 权限边界有明确文件入口。已完成。
- 不破坏现有静态页面。已完成。
- 开发期路由保护行为可通过本地 HTTP 访问验证。已完成。

## 任务 7：文档和最终验证

**文件：**

- 修改：`.env.example`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

步骤：

1. 更新 `.env.example`：

```text
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

2. 更新 `ROADMAP.md`，阶段 2 设为进行中；完成后改为已完成。
3. 更新 `DEV_LOG.md`，记录模型、验证命令和未接入真实服务的原因。
4. 运行：

```powershell
pnpm db:format
pnpm db:validate
pnpm lint
pnpm build
```

完成标准：

- 文档状态和实现状态一致。
- 所有验证命令通过。

## 当前执行约束

- 不执行 `git commit`。
- 不执行 `git push`。
- 需要安装新依赖时，先单独请求授权。
- 不提交真实 `.env`。
- 不创建真实 Supabase 项目，除非用户明确要求并提供配置。
