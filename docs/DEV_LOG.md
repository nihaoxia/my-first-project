# Stray Pages 开发日志

本文档用于记录 Stray Pages 的开发过程、已完成事项、重要决策和后续待办。

## 维护规则

- 每完成一个功能、修复一个重要问题、调整一个关键技术决策，都要更新本日志。
- 日志应写清楚做了什么、为什么做、影响范围是什么。
- 如果某次开发涉及用户可见功能，需要记录验证方式。
- 如果某次开发留下未完成事项，需要记录在对应日期的“后续待办”里。
- 提交到 GitHub 前，应确认本日志已经同步更新。

## 2026-06-22

### 已完成

- 阅读并理解 `STRAY_PAGES_SPEC.md` 项目规格草案。
- 明确项目第一版是公开体验版网站，不是 App。
- 明确第一版电脑端优先，手机端只保证基础可访问。
- 明确用户希望页面好看、功能齐全。
- 技术路线选择为折中路线：第一版速度优先，但关键底座不能做成一次性玩具方案。
- 初步推荐技术栈为：
  - Next.js + React + TypeScript。
  - Tailwind CSS + shadcn/ui + Radix UI + lucide-react。
  - Supabase PostgreSQL + Auth + Storage。
  - Prisma。
  - Trigger.dev 或 Inngest。
  - AI Provider 抽象层。
  - Vercel AI SDK。
- 创建 `docs/TECH_STACK.md`，用于持续记录技术栈和关键技术决策。
- 创建 `docs/DEV_LOG.md`，用于持续记录开发日志。
- 明确后续开发过程需要提交到 GitHub，并开始整理仓库准备工作。
- 添加 `.gitignore`，避免后续把依赖目录、构建产物、环境变量、本地工具缓存提交到 GitHub。
- 尝试初始化 Git 仓库，但当前空 `.git` 目录只读，无法写入 Git 初始化文件。
- 创建 `docs/GITHUB_SETUP.md`，记录后续 GitHub 仓库准备和提交流程。
- 用户删除异常空 `.git` 目录后，重新初始化本地 Git 仓库。
- 将默认分支设置为 `main`。
- 用户手动配置 GitHub 远程仓库 `https://github.com/nihaoxia/my-first-project.git`。
- 用户手动完成首次推送，本地 `main` 分支已推送到 GitHub。
- 创建第一阶段实现计划 `docs/superpowers/plans/2026-06-22-project-foundation.md`。
- 第一阶段计划范围为项目基础骨架：Next.js、TypeScript、Tailwind、基础页面、环境变量示例和验证流程。
- 切换到本地开发分支 `feature/project-foundation` 执行项目基础骨架。
- 创建 Next.js 项目基础文件、TypeScript 配置、Tailwind/PostCSS 配置、ESLint 配置、核心页面占位、基础应用壳、按钮组件和 `.env.example`。
- 系统自带 `npm` 在当前沙盒中因访问 `C:\Users\34140` 权限失败无法运行。
- Codex 内置 `pnpm` 可运行，但安装依赖时被权限审查拦截，依赖安装需由用户在本机执行。
- 使用 Codex 内置 `pnpm` 完成依赖安装，并批准 `sharp` 构建脚本。
- 将 ESLint 从 `latest` 调整为 `^9.0.0`，避免 ESLint 10 与 `eslint-plugin-react` 当前版本不兼容。
- 使用 Codex 内置 Node 24 完成 `pnpm build`。当前系统默认 Node 18.20.8 低于 Next.js 16 要求，项目开发环境需要 Node 20.9 或更高版本。
- 验证通过：
  - `pnpm lint`
  - `pnpm build`
  - 本地开发服务器核心路由 `/`、`/login`、`/library`、`/reader`、`/admin` 均返回 200。
- Playwright 库可用，但本机 Playwright 浏览器二进制尚未安装，因此本轮未完成截图级视觉验证。
- 创建 `docs/ROADMAP.md`，记录第一版公开体验版的阶段计划、预计时间、当前状态和完成标准。
- 将阶段 0 标记为已完成，将阶段 1 标记为进行中。
- 创建第二阶段实现计划 `docs/superpowers/plans/2026-06-22-static-product-prototype.md`。
- 第二阶段范围限定为静态产品原型，不接数据库、不做真实上传、不接 AI。
- 完成第二阶段静态产品原型：
  - 扩展导航和路由常量。
  - 新增集中静态数据 `src/lib/mock-data.ts`。
  - 新增 `StatusPill` 和 `MetricCard` 通用组件。
  - 完善首页和书架页。
  - 新增上传页和章节预览页。
  - 新增译本创建页和翻译队列页。
  - 完善阅读器静态版。
  - 新增词汇本和句子本页面。
  - 完善基础后台静态页。
- 第二阶段验证通过：
  - `pnpm lint`
  - `pnpm build`
  - 本地开发服务器路由 `/`、`/library`、`/upload`、`/books/demo-book/chapters`、`/books/demo-book/translate`、`/translations/demo-translation/tasks`、`/reader`、`/study/vocabulary`、`/study/sentences`、`/admin` 均返回 200。
- 将 `docs/ROADMAP.md` 的阶段 1 标记为已完成。
- 创建阶段 2 实施计划 `docs/superpowers/plans/2026-06-22-database-auth.md`。
- 将 `docs/ROADMAP.md` 的阶段 2 标记为进行中。
- 阶段 2 已完成本地数据底座初稿：
  - 安装 Prisma 7、Supabase SSR/client、Prisma PostgreSQL adapter 和 `pg`。
  - 新增 Prisma 7 配置 `prisma.config.ts`。
  - 新增 Prisma schema `prisma/schema.prisma`，覆盖用户、余额、书籍、章节、译本、翻译任务、术语、词汇本、句子本和 AI 限频记录。
  - 新增 Prisma Client 工厂 `src/lib/db.ts`。
  - 新增 Supabase 浏览器端和服务端客户端入口。
  - 新增开发期模拟手机号登录工具和 Server Action。
  - 重写登录页，使用开发期固定验证码 `123456`。
  - 新增普通保护布局和后台布局占位。
  - 更新 `.env.example`，补充数据库和开发期认证变量。
- 阶段 2 验证通过：
  - `prisma format`
  - `prisma validate`
  - `prisma generate`
  - `pnpm lint`
  - `pnpm build`
  - 本地开发服务器路由 `/`、`/login`、`/library`、`/admin` 均返回 200。
- 阶段 2 完成开发期路由保护：
  - 将 Next.js 16 的路由保护入口迁移为 `src/proxy.ts`。当前项目使用 `src/app` 结构，代理文件需要放在 `src` 目录内，和 `app` 同级。
  - 未登录访问私人页面会跳转到 `/login?next=...`。
  - 普通用户可以访问 `/library`，但访问 `/admin` 会跳转到 `/library?error=admin`。
  - 管理员可以访问 `/admin`，已登录用户访问 `/login` 会跳转到 `/library`。
  - 修复开发期 mock session 的 URL 编码 cookie 解析问题。
- 阶段 2 路由保护验证通过：
  - `pnpm lint`
  - `pnpm build`
  - 本地开发服务器实测：未登录 `/library` -> `/login?next=%2Flibrary`。
  - 本地开发服务器实测：未登录 `/admin` -> `/login?next=%2Fadmin`。
  - 本地开发服务器实测：普通用户 `/library` 返回 200。
  - 本地开发服务器实测：普通用户 `/admin` -> `/library?error=admin`。
  - 本地开发服务器实测：管理员 `/admin` 返回 200。
  - 本地开发服务器实测：管理员 `/login` -> `/library`。
- 阶段 2 继续完善真实 Supabase 接入前的本地账号/权限边界和上传解析准备：
  - 新增 `src/lib/auth/mock-policy.ts`，集中维护开发期手机号格式校验、固定验证码、管理员手机号后缀和安全登录跳转规则。
  - 登录 Server Action 改为复用统一账号策略，并保留受保护页面的 `next` 跳转目标；登录成功后只允许跳回站内路径，避免外部 URL 跳转。
  - 新增 `src/lib/upload/file-policy.ts`，提前建立 TXT/EPUB 上传格式判断、20 MB 开发期单文件大小上限、空文件和不支持格式的校验结果。
  - 上传页改为从上传策略模块读取支持格式和大小上限，减少后续接入真实上传时的重复规则。
  - 新增 Node 原生单元测试 `tests/auth-mock-policy.test.ts` 和 `tests/upload-file-policy.test.ts`，覆盖开发期账号策略、安全跳转和上传文件边界。
  - 将 `tests` 目录排除出 Next 应用 TypeScript 构建输入，避免测试专用 `.ts` 导入影响生产构建。
- 本轮阶段 2 增量验证通过：
  - Node 原生测试：12 项通过，0 项失败。运行时存在 Node 对 TypeScript 测试文件模块类型的提示，不影响测试结果。
  - `pnpm lint`
  - `pnpm build`
- 阶段 2 仍保持进行中：真实 Supabase 项目、真实数据库连接和短信验证码服务尚未接入。

### 后续待办

- 执行阶段 2：数据库结构和账号系统。
- 接入真实 Supabase 项目配置后，运行 Prisma 迁移并验证数据库连接。
- 后续接入真实 Supabase Auth 后，将开发期 mock session 替换为真实登录态。
- 安装或配置 Playwright 浏览器二进制，用于后续截图级视觉验证。
- 将本机 Node.js 升级到 20.9 或更高版本，避免使用系统 Node 18 时无法运行 Next.js 16 构建。
- 确认第一版主要面向国内用户还是海外/国际用户。
- 在 Trigger.dev 和 Inngest 之间做最终选择。
- 确认 AI 模型供应商和成本估算方式。
- 设计数据库结构初稿。
- 梳理页面信息架构和主要界面清单。
- 制定 MVP 开发顺序。
