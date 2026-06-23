# Stray Pages 导出和后台管理本地闭环实现计划

> **面向 AI 代理的工作流：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不接入真实对象存储、不写入远程数据库、不安装依赖的前提下，完成阶段 8 的本地导出数据层和基础后台运营摘要。

**架构：** 阶段 8 继续沿用纯逻辑优先。译本导出、学习资料导出和后台摘要分别放入 `src/lib/export` 与 `src/lib/admin` 下的小模块；页面只展示导出入口、文件名、格式和摘要，不触发真实下载、不生成真实 EPUB 压缩包。真实文件下载、EPUB 打包、远程数据查询和后台操作审计后续在外部配置就绪后接入。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 译本 TXT 导出内容生成。
- EPUB 导出草稿数据形状：书名、语言、章节清单和待打包文件名，不生成真实 `.epub` 二进制。
- 词汇本 CSV 导出内容生成。
- 句子本 Markdown 导出内容生成。
- 后台导出和运营摘要：用户、余额、任务、失败记录、用量和导出文件数。
- 阶段 8 readiness 清单、路线图和开发日志更新。

本计划不包含：

- 真实浏览器文件下载。
- 真实 EPUB zip / OPF / NCX / manifest 打包。
- 真实远程数据库查询。
- 真实后台封禁、充值、退款或审计写入。
- 新增第三方依赖。

## 文件结构

- 创建：`src/lib/export/translation-export.ts`，译本 TXT 导出和 EPUB 导出草稿。
- 创建：`src/lib/export/study-export.ts`，词汇本 CSV 和句子本 Markdown 导出。
- 创建：`src/lib/admin/admin-export-summary.ts`，后台运营与导出摘要。
- 创建：`src/lib/project/stage-eight-readiness.ts`，阶段 8 本地完成项和外部阻塞项。
- 测试：`tests/translation-export.test.ts`。
- 测试：`tests/study-export.test.ts`。
- 测试：`tests/admin-export-summary.test.ts`。
- 测试：`tests/stage-eight-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`，接入阶段 8 导出和后台摘要数据。
- 修改：`src/app/reader/page.tsx`，展示译本导出入口和本地文件名。
- 修改：`src/app/study/vocabulary/page.tsx`，展示词汇 CSV 导出文件名。
- 修改：`src/app/study/sentences/page.tsx`，展示句子 Markdown 导出文件名。
- 修改：`src/app/admin/page.tsx`，展示后台导出和运营摘要。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：译本导出纯逻辑

**文件：**

- 创建：`src/lib/export/translation-export.ts`
- 测试：`tests/translation-export.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖 TXT 导出标题、章节顺序、段落分隔、稳定文件名；覆盖 EPUB 导出草稿包含书名、语言、章节文件清单和未打包状态。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `translation-export.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小译本导出逻辑**

只生成字符串和草稿对象，不写文件、不压缩、不访问浏览器。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增译本导出测试通过，既有测试仍通过。

## 任务 2：学习资料导出纯逻辑

**文件：**

- 创建：`src/lib/export/study-export.ts`
- 测试：`tests/study-export.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖词汇 CSV 转义、表头、备注、来源；覆盖句子 Markdown 原文、译文、解释、备注和来源。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `study-export.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小学习资料导出逻辑**

使用纯字符串生成，不写真实文件。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增学习导出测试通过，既有测试仍通过。

## 任务 3：后台导出和运营摘要

**文件：**

- 创建：`src/lib/admin/admin-export-summary.ts`
- 测试：`tests/admin-export-summary.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖后台摘要统计用户、余额记录、翻译任务、失败任务、导出文件数和最近导出文件名。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `admin-export-summary.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小后台摘要逻辑**

只消费 mock 数据和导出结果，不接真实数据库。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增后台摘要测试通过，既有测试仍通过。

## 任务 4：页面和 mock 数据接入

**文件：**

- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/reader/page.tsx`
- 修改：`src/app/study/vocabulary/page.tsx`
- 修改：`src/app/study/sentences/page.tsx`
- 修改：`src/app/admin/page.tsx`

- [x] **步骤 1：接入阶段 8 mock 数据**

在 `mock-data.ts` 中生成译本 TXT 导出、EPUB 草稿、词汇 CSV、句子 Markdown 和后台摘要。

- [x] **步骤 2：更新用户页面导出入口**

阅读器和学习页展示导出格式、文件名和本地准备状态，不触发真实下载。

- [x] **步骤 3：更新后台页面摘要**

后台展示导出文件数、最近导出、用户/余额/任务/失败记录/用量摘要。

- [x] **步骤 4：运行验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`。

## 任务 5：阶段 8 readiness 和文档收口

**文件：**

- 创建：`src/lib/project/stage-eight-readiness.ts`
- 测试：`tests/stage-eight-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-23-export-admin-local.md`

- [x] **步骤 1：编写失败测试**

覆盖阶段 8 本地完成项全部为 `complete`，并明确真实下载、真实 EPUB 打包、远程数据库查询和真实后台操作审计仍是后续项。

- [x] **步骤 2：实现 readiness 模块**

保持与阶段 2-7 readiness 模块一致的结构。

- [x] **步骤 3：更新文档**

将 ROADMAP 阶段 8 标记为本地范围完成，并在 DEV_LOG 记录功能、影响范围和验证命令。

- [x] **步骤 4：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`；不提交、不推送。
