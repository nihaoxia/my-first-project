# Stray Pages 生产接入前本地体检实现计划

> **面向 AI 代理的工作流：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不联网、不安装依赖、不执行真实部署、不读取或提交真实 `.env` 的前提下，建立生产接入前的本地体检层：环境变量要求、外部服务接入顺序、后台风险摘要和阶段完成度。

**架构：** 新增 `src/lib/launch/production-preflight.ts` 作为纯逻辑模块，只接收调用方传入的键值对象，不直接读取 `process.env`。后台 mock 数据使用安全的示例输入生成摘要。普通用户页面不展示环境变量、API、模型、成本或后台接入细节；后台页面可展示生产体检摘要。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 生产环境变量要求清单。
- 本地配置体检函数，识别缺失项、占位值、格式风险和真实外部服务阻塞项。
- 生产接入顺序建议，便于后续真实部署时逐项推进。
- 后台页面展示本地生产体检摘要。
- 阶段 10 readiness 清单、路线图和开发日志更新。

本计划不包含：

- 真实 Vercel 部署。
- 真实 Supabase 连接或 Prisma 迁移。
- 真实短信、支付、AI Provider、对象存储或后台队列接入。
- 读取、输出或提交真实 `.env`。
- 新增第三方依赖。
- Playwright 浏览器安装或截图级视觉验收。

## 文件结构

- 创建：`src/lib/launch/production-preflight.ts`，生产接入前配置体检纯逻辑。
- 创建：`src/lib/project/stage-ten-readiness.ts`，阶段 10 本地完成项和外部阻塞项。
- 测试：`tests/production-preflight.test.ts`。
- 测试：`tests/stage-ten-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`，接入生产体检 mock 摘要。
- 修改：`src/app/admin/page.tsx`，后台展示生产体检摘要。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：生产环境配置体检纯逻辑

**文件：**

- 创建：`src/lib/launch/production-preflight.ts`
- 测试：`tests/production-preflight.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖生产必需环境变量清单、缺失项识别、占位值识别、URL 格式检查、生产环境必须关闭开发期 mock 登录，以及体检结果不能暴露真实密钥值。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `production-preflight.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小生产体检模块**

导出 `getProductionEnvRequirements`、`evaluateProductionPreflight` 和 `getProductionRolloutSteps`。所有函数只处理调用方传入的普通对象，不直接读取 `process.env`。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增生产体检测试通过，既有测试仍通过。

## 任务 2：后台摘要和阶段 10 readiness

**文件：**

- 创建：`src/lib/project/stage-ten-readiness.ts`
- 测试：`tests/stage-ten-readiness.test.ts`
- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/admin/page.tsx`

- [x] **步骤 1：编写失败测试**

覆盖阶段 10 本地完成项全部为 `complete`，并明确真实部署、真实 Supabase、真实短信/支付/AI、真实队列和截图级验收仍为后续项。

- [x] **步骤 2：实现 readiness 模块**

保持与阶段 2-9 readiness 模块一致的结构。

- [x] **步骤 3：接入后台 mock 摘要**

在 `mock-data.ts` 中生成生产体检摘要。后台页面展示必需项数量、缺失项数量、风险数量和接入顺序；普通用户页面不接入该数据。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增 readiness 测试通过，既有测试仍通过。

## 任务 3：文档收口和最终验证

**文件：**

- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-24-production-preflight-local.md`

- [x] **步骤 1：更新路线图**

新增阶段 10，标记为“已完成（本地范围）”，说明当前只完成生产接入前本地体检，真实外部服务仍未接入。

- [x] **步骤 2：更新开发日志**

记录新增模块、后台影响范围、普通用户页面无复杂概念暴露、验证命令和剩余真实接入项。

- [x] **步骤 3：标记计划任务完成**

将本计划所有实际完成的步骤标记为 `[x]`。

- [x] **步骤 4：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`；构建后恢复 `next-env.d.ts` 到 `./.next/dev/types/routes.d.ts`，并确认 `.env`、`.env.local`、`.env.production` 无差异。
