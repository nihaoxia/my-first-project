# Stray Pages 后台审计与数据安全本地准备实现计划

> **面向 AI 代理的工作流：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不联网、不安装依赖、不接入真实数据库、不读取或提交真实 `.env` 的前提下，建立后台操作审计、敏感信息脱敏和数据保留策略的本地准备层。

**架构：** 新增 `src/lib/admin/admin-audit-policy.ts` 作为纯逻辑模块，定义后台关键操作、原因要求、风险等级、审计记录构建和敏感值脱敏。新增 `src/lib/admin/data-retention-policy.ts` 定义本地数据保留策略摘要。后台 mock 数据生成审计和保留策略摘要，仅在管理员页面展示；普通用户页面不接入这些内部概念。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 后台关键操作审计策略。
- 审计记录数据形状和敏感字段脱敏规则。
- 数据保留策略本地摘要。
- 后台页面展示审计和数据安全摘要。
- 阶段 11 readiness 清单、路线图和开发日志更新。

本计划不包含：

- 真实审计表写入。
- 真实管理员操作执行。
- 真实数据库、对象存储、短信、支付、AI Provider 或后台队列接入。
- 读取、输出或提交真实 `.env`。
- 新增第三方依赖。

## 文件结构

- 创建：`src/lib/admin/admin-audit-policy.ts`，后台审计策略和脱敏纯逻辑。
- 创建：`src/lib/admin/data-retention-policy.ts`，数据保留策略纯逻辑。
- 创建：`src/lib/project/stage-eleven-readiness.ts`，阶段 11 本地完成项和外部阻塞项。
- 测试：`tests/admin-audit-policy.test.ts`。
- 测试：`tests/data-retention-policy.test.ts`。
- 测试：`tests/stage-eleven-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`，接入阶段 11 后台摘要。
- 修改：`src/app/admin/page.tsx`，后台展示审计和数据安全摘要。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：后台审计策略和脱敏规则

**文件：**

- 创建：`src/lib/admin/admin-audit-policy.ts`
- 测试：`tests/admin-audit-policy.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖后台关键操作清单、原因要求、审计记录构建、敏感值脱敏和高风险操作识别。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `admin-audit-policy.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小审计策略模块**

导出 `getAdminAuditActions`、`buildAdminAuditRecord`、`redactAuditValue` 和 `summarizeAdminAuditRecords`。所有函数只处理调用方传入的对象，不执行真实后台操作，不写数据库。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增后台审计测试通过，既有测试仍通过。

## 任务 2：数据保留策略和阶段 11 readiness

**文件：**

- 创建：`src/lib/admin/data-retention-policy.ts`
- 创建：`src/lib/project/stage-eleven-readiness.ts`
- 测试：`tests/data-retention-policy.test.ts`
- 测试：`tests/stage-eleven-readiness.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖数据保留策略清单、导出/审计/上传/学习数据的保留周期摘要，以及阶段 11 本地完成项和真实持久化阻塞项。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为新模块尚不存在而失败。

- [x] **步骤 3：实现数据保留和 readiness 模块**

保持与现有阶段 readiness 模块一致的结构。数据保留策略只返回本地摘要，不删除真实数据。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增测试通过，既有测试仍通过。

## 任务 3：后台展示和文档收口

**文件：**

- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/admin/page.tsx`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-24-admin-audit-data-safety-local.md`

- [x] **步骤 1：接入后台 mock 摘要**

在 `mock-data.ts` 中生成审计摘要、脱敏示例和数据保留策略摘要。普通用户页面不接入该数据。

- [x] **步骤 2：后台页面展示**

在 `src/app/admin/page.tsx` 新增“操作审计”和“数据安全”卡片，只展示后台可见摘要。

- [x] **步骤 3：更新路线图**

新增阶段 11，标记为“已完成（本地范围）”，说明当前只完成本地审计与数据安全准备，真实数据库写入和真实管理员操作仍未接入。

- [x] **步骤 4：更新开发日志**

记录新增模块、后台影响范围、普通用户页面无复杂概念暴露、验证命令和剩余真实接入项。

- [x] **步骤 5：标记计划任务完成**

将本计划所有实际完成的步骤标记为 `[x]`。

- [x] **步骤 6：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`；构建后恢复 `next-env.d.ts` 到 `./.next/dev/types/routes.d.ts`，并确认 `.env`、`.env.local`、`.env.production` 无差异。
