# Stray Pages 上线前本地整理实现计划

> **面向 AI 代理的工作流：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不联网、不安装依赖、不执行真实部署、不写入远程数据库的前提下，完成阶段 9 的本地上线准备层：版权/隐私提示、安全限频策略、错误/空状态文案、部署准备清单和阶段完成度。

**架构：** 阶段 9 继续采用纯逻辑优先。上线提示、安全策略、空状态文案和发布清单放入 `src/lib/launch` 下的小模块，页面只消费这些模块生成的本地展示数据。普通用户页面只展示清晰的版权、隐私、使用限制和排队提示，不展示 token、模型、API、术语联网查证、术语本或后台成本。后台可以展示更完整的上线准备和限频摘要。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 用户可读的版权与隐私提示文案。
- 上传、翻译、阅读助手等动作的本地限频策略数据形状。
- 错误、空状态和加载状态的统一文案数据形状。
- 公开体验版上线准备清单：环境变量、路由保护、真实服务接入、人工检查项。
- 后台页面展示上线准备摘要和限频摘要。
- 阶段 9 readiness 清单、路线图和开发日志更新。

本计划不包含：

- 真实 Vercel 部署。
- 真实 Supabase 生产连接。
- 真实短信、支付、AI Provider、对象存储或后台队列接入。
- Playwright 浏览器安装或截图级视觉验收。
- 新增第三方依赖。

## 文件结构

- 创建：`src/lib/launch/legal-notices.ts`，版权、隐私和公开体验版提示。
- 创建：`src/lib/launch/rate-limit-policy.ts`，本地限频和成本保护策略数据形状。
- 创建：`src/lib/launch/launch-states.ts`，错误、空状态、加载状态和发布清单。
- 创建：`src/lib/project/stage-nine-readiness.ts`，阶段 9 本地完成项和外部阻塞项。
- 测试：`tests/launch-legal-notices.test.ts`。
- 测试：`tests/launch-rate-limit-policy.test.ts`。
- 测试：`tests/launch-states.test.ts`。
- 测试：`tests/stage-nine-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`，接入阶段 9 本地上线准备数据。
- 修改：`src/app/page.tsx`，展示公开体验版版权与隐私提示入口。
- 修改：`src/app/upload/page.tsx`，复用统一版权和隐私提示。
- 修改：`src/app/books/[bookId]/translate/page.tsx`，展示简单的排队和限频提示。
- 修改：`src/app/admin/page.tsx`，展示后台上线准备和限频摘要。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：版权与隐私提示纯逻辑

**文件：**

- 创建：`src/lib/launch/legal-notices.ts`
- 测试：`tests/launch-legal-notices.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖上传版权提示必须包含“有权处理”，公开体验提示必须声明不提供公开书库或资源搜索，隐私提示必须说明私人书架和不公开分享。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `legal-notices.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小版权与隐私提示模块**

导出固定的本地提示对象和按场景筛选函数，不访问远程配置。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增版权与隐私提示测试通过，既有测试仍通过。

## 任务 2：限频和成本保护策略纯逻辑

**文件：**

- 创建：`src/lib/launch/rate-limit-policy.ts`
- 测试：`tests/launch-rate-limit-policy.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖上传、创建译本、阅读助手提问和导出动作的本地限制；覆盖超限时返回普通用户可读提示，不包含 token、模型、API 等复杂词。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `rate-limit-policy.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小限频策略模块**

实现 `getLaunchRateLimitPolicies` 和 `evaluateLocalRateLimit`，只返回本地策略判断，不写数据库。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增限频策略测试通过，既有测试仍通过。

## 任务 3：错误/空状态和发布清单

**文件：**

- 创建：`src/lib/launch/launch-states.ts`
- 测试：`tests/launch-states.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖空书架、上传失败、任务排队、上线准备清单和生产环境阻塞项。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `launch-states.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小上线状态模块**

生成错误状态、空状态、加载状态和发布清单；真实部署、真实 Supabase、真实 AI、真实队列保留为阻塞项。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增上线状态测试通过，既有测试仍通过。

## 任务 4：页面和 mock 数据接入

**文件：**

- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/page.tsx`
- 修改：`src/app/upload/page.tsx`
- 修改：`src/app/books/[bookId]/translate/page.tsx`
- 修改：`src/app/admin/page.tsx`

- [x] **步骤 1：接入阶段 9 mock 数据**

在 `mock-data.ts` 中生成公开体验提示、限频摘要、错误/空状态和发布准备摘要。

- [x] **步骤 2：更新用户页面**

首页、上传页和创建译本页展示简单版权、隐私、排队和使用限制提示，不展示内部复杂概念。

- [x] **步骤 3：更新后台页面**

后台展示上线准备清单、限频策略摘要和阻塞项。

- [x] **步骤 4：运行验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`。

## 任务 5：阶段 9 readiness 和文档收口

**文件：**

- 创建：`src/lib/project/stage-nine-readiness.ts`
- 测试：`tests/stage-nine-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-23-launch-readiness-local.md`

- [x] **步骤 1：编写失败测试**

覆盖阶段 9 本地完成项全部为 `complete`，并明确真实部署、真实生产 Supabase、真实短信/支付/AI、截图级验收仍为后续项。

- [x] **步骤 2：实现 readiness 模块**

保持与阶段 2-8 readiness 模块一致的结构。

- [x] **步骤 3：更新文档**

将 ROADMAP 阶段 9 标记为本地范围完成，并在 DEV_LOG 记录功能、影响范围和验证命令。

- [x] **步骤 4：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`；不提交、不推送。
