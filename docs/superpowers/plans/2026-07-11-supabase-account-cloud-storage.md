# Supabase ���号、云端数据与对象存储实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使用 Supabase Auth、PostgreSQL 和私有 Storage 替换生产路径中的 Mock 账号、localStorage 主数据与本地原文件。

**架构：** Supabase SQL migration 是 Auth trigger、RLS 和 Storage policy 的部署权威源；Prisma 负责 Next.js 服务端类型化查询。所有业务服务接收已验证 `AppSession`，并通过注入式 Repository/Storage 边界实现单元测试与本地 Supabase 集成测试。

**技术栈：** Next.js 16 Server Actions/Route Handlers、Supabase Auth/Storage/PostgreSQL、Prisma 7、Node Test、Supabase CLI、Docker。

---

## 文件结构

- `supabase/config.toml`：本地 Supabase 与手机号 OTP 开发配置。
- `supabase/migrations/202607110001_cloud_foundation.sql`：业务表、Auth trigger、RLS、Storage bucket 与策略。
- `src/lib/cloud/config.ts`：生产/开发云端配置解析。
- `src/lib/auth/app-session.ts`：统一真实/开发会话。
- `src/lib/auth/supabase-auth-service.ts`：OTP 发送、验证和退出的稳定服务接口。
- `src/lib/cloud/storage.ts`：私有对象路径、上传、签名 URL 与删除。
- `src/lib/cloud/books.ts`：原书/章节事务与补偿。
- `src/lib/cloud/translations.ts`：云端译本、任务 attempt 与完成事务。
- `src/lib/cloud/study.ts`：词汇、句子、笔记和阅读状态。
- `src/app/api/cloud/**`：云端资源 Route Handlers。
- `src/components/cloud/**`：云端上传、书架、译本和本地数据导入客户端。
- `tests/cloud-*.test.ts`：各边界的 TDD 单元测试。
- `tests/integration/cloud-foundation.test.ts`：本地 Supabase 集成测试。

### 任务 1：云端配置与本地 Supabase 骨架

**文件：**
- 创建：`tests/cloud-config.test.ts`
- 创建：`src/lib/cloud/config.ts`
- 创建：`supabase/config.toml`
- 修改：`.env.example`
- 修改：`package.json`

- [ ] 编写失败测试，覆盖 `required/optional`、生产禁止 Mock、URL/key/bucket 缺失和安全错误输出。
- [ ] 运行 `node --experimental-strip-types --test tests/cloud-config.test.ts`，确认模块缺失红灯。
- [ ] 实现最小配置解析并精确固定 Supabase CLI 版本。
- [ ] 再次运行聚焦测试并确认通过。

### 任务 2：数据库、Auth trigger、RLS 与 Storage migration

**文件：**
- 创建：`supabase/migrations/202607110001_cloud_foundation.sql`
- 修改：`prisma/schema.prisma`
- 创建：`tests/cloud-migration-contract.test.ts`

- [ ] 先写 migration 契约测试，要求 trigger、私有 bucket、所有权 policy、`StudyNote`、`ReadingState` 和关键唯一约束存在。
- [ ] 运行测试确认 migration 缺失红灯。
- [ ] 编写幂等 SQL migration 并同步 Prisma schema。
- [ ] 运行契约测试、`pnpm db:format`、`pnpm db:validate` 和 `pnpm db:generate`。

### 任务 3：真实 Supabase 会话与 OTP

**文件：**
- 创建：`tests/app-session.test.ts`
- 创建：`tests/supabase-auth-service.test.ts`
- 创建：`src/lib/auth/app-session.ts`
- 创建：`src/lib/auth/supabase-auth-service.ts`
- 修改：`src/app/login/actions.ts`
- 修改：`src/app/login/page.tsx`
- 修改：`src/components/app-shell.tsx`
- 修改：`src/proxy.ts`
- 修改：`src/lib/auth/access-policy.ts`

- [ ] 先写失败测试，覆盖真实用户映射、BANNED、Mock 仅开发可用、OTP 发送/验证/退出与稳定错误。
- [ ] 运行聚焦测试确认红灯。
- [ ] 实现统一 `AppSession` 和 Auth 服务。
- [ ] 把登录页改为发送/验证两步表单，并把 AppShell、Proxy、翻译 API 切换到 `getAppSession()`。
- [ ] 运行 Auth、Route 和翻译 API 测试确认通过。

### 任务 4：私有 Storage 与云端书籍导入

**文件：**
- 创建：`tests/cloud-storage.test.ts`
- 创建：`tests/cloud-books.test.ts`
- 创建：`src/lib/cloud/storage.ts`
- 创建：`src/lib/cloud/books.ts`
- 创建：`src/app/api/cloud/books/route.ts`
- 创建：`src/app/api/cloud/books/[bookId]/route.ts`
- 创建：`src/app/api/cloud/books/[bookId]/download/route.ts`
- 修改：`src/components/upload/local-chapter-preview.tsx`
- 修改：`src/components/library/library-shelf.tsx`

- [ ] 先写失败测试，覆盖私有路径、文件校验、章节映射、事务写入、上传失败和数据库失败补偿。
- [ ] 运行聚焦测试确认红灯。
- [ ] 实现 Storage 和书籍服务，所有查询同时限定 `userId` 与资源 ID。
- [ ] 实现 multipart Route Handlers、signed URL 与删除。
- [ ] 云端配置可用时让上传保存和书架读取以云端为主。
- [ ] 运行聚焦测试和上传/书架现有回归测试。

### 任务 5：云端译本与翻译任务状态

**文件：**
- 创建：`tests/cloud-translations.test.ts`
- 创建：`src/lib/cloud/translations.ts`
- 创建：`src/app/api/cloud/translations/route.ts`
- 创建：`src/app/api/cloud/translations/[translationId]/tasks/route.ts`
- 创建：`src/app/api/cloud/translations/[translationId]/tasks/[taskId]/route.ts`
- 修改：`src/components/translation/local-translation-create.tsx`
- 修改：`src/components/translation/local-translation-tasks.tsx`
- 修改：`src/components/reader/local-translation-reader.tsx`

- [ ] 先写失败测试，覆盖创建任务、claim attempt、完成、失败、重试、过期 attempt 和按用户隔离。
- [ ] 运行聚焦测试确认红灯。
- [ ] 实现 Prisma 事务服务和 Route Handlers。
- [ ] 云端模式下把译本创建、任务状态与阅读器切换到云端 API；本地 optional 模式保留现有实现。
- [ ] 运行云端与现有 MCP/本地译本回归测试。

### 任务 6：学习数据、阅读进度与本地导入

**文件：**
- 创建：`tests/cloud-study.test.ts`
- 创建：`tests/cloud-import.test.ts`
- 创建：`src/lib/cloud/study.ts`
- 创建：`src/lib/cloud/import.ts`
- 创建：`src/app/api/cloud/study/route.ts`
- 创建：`src/app/api/cloud/import/route.ts`
- 修改：`src/components/reader/reader-workspace.tsx`
- 修改：`src/components/study/vocabulary-workspace.tsx`
- 修改：`src/components/study/sentences-workspace.tsx`
- 修改：`src/components/study/notes-workspace.tsx`

- [ ] 先写失败测试，覆盖 CRUD、阅读进度、所有权和本地导入幂等。
- [ ] 运行聚焦测试确认红灯。
- [ ] 实现服务、API 和客户端云端持久化。
- [ ] 增加一次性本地数据导入，成功后保留本地副本直到用户确认清理。
- [ ] 运行学习与阅读现有回归测试。

### 任务 7：本地 Supabase 集成、文档和生产门禁

**文件：**
- 创建：`tests/integration/cloud-foundation.test.ts`
- 修改：`README.md`
- 修改：`.github/workflows/ci.yml`
- 修改：`docs/ROADMAP.md`
- 修改：`src/lib/project/stage-two-readiness.ts`
- 修改：`src/lib/project/stage-three-readiness.ts`

- [ ] 启动本地 Supabase，执行 migration reset。
- [ ] 验证两个用户的 RLS 隔离、Auth trigger、私有对象上传/签名读取/删除和数据库事务。
- [ ] 浏览器回归真实登录、上传、云端书架、翻译一章、重新登录恢复数据。
- [ ] 更新部署、短信供应商、bucket、migration 和本地数据导入文档。
- [ ] 运行全量测试、Lint、TypeScript、Prisma、Next build、MCP build、migration lint 与 `git diff --check`。
- [ ] 请求独立代码审查，修复所有阻断项并复跑完整门禁。
