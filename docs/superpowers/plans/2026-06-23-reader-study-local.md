# Stray Pages 阅读器和学习收藏本地闭环实现计划

> **面向 AI 代理的工作流：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不接入真实 AI、不联网、不写入远程数据库的前提下，完成阶段 7 的本地阅读学习体验骨架：阅读器视图状态、阅读助手本地解释、词汇本和句子本收藏数据形状。

**架构：** 阶段 7 继续沿用“纯逻辑先行，页面接入其次，真实外部服务后置”的方式。阅读模式、阅读设置、章节视图、学习收藏和阅读助手解释都先放在 `src/lib/reader` 下的可测试模块中；页面只消费这些模块生成的 mock 视图数据。普通用户页面只展示“阅读、解释、收藏、搜索、筛选”等直观动作，不展示模型、token、API、术语联网查证或内部成本概念。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 阅读器模式：译文、原文、对照。
- 阅读设置：字号、行距、正文宽度、主题偏好，并提供可保存的数据形状。
- 章节阅读视图模型：目录、当前章节、上一章、下一章和段落对照数据。
- AI 阅读助手本地解释：解释词、解释句子、解释段落、回答当前段落问题。
- 词汇本和句子本收藏数据形状：从选中文本生成收藏草稿，支持备注和来源章节。
- 词汇本和句子本的本地搜索、按书筛选、删除预览状态。
- 阶段 7 readiness 清单、路线图和开发日志更新。

本计划不包含：

- 真实 AI 阅读助手调用。
- 真实 API key 或 `.env` 配置。
- 真实联网查证。
- 真实远程数据库写入。
- 真实用户跨设备同步。
- TXT/EPUB 导出；导出属于阶段 8。

## 文件结构

- 创建：`src/lib/reader/reader-view.ts`，阅读器模式、阅读设置、章节视图模型和段落展示逻辑。
- 创建：`src/lib/reader/reading-assistant.ts`，本地阅读助手解释和问题回答数据形状。
- 创建：`src/lib/reader/study-collections.ts`，词汇本、句子本收藏草稿、搜索、筛选和删除预览逻辑。
- 创建：`src/lib/project/stage-seven-readiness.ts`，阶段 7 本地完成项和外部阻塞项。
- 测试：`tests/reader-view.test.ts`。
- 测试：`tests/reading-assistant.test.ts`。
- 测试：`tests/study-collections.test.ts`。
- 测试：`tests/stage-seven-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`，接入阶段 7 本地视图数据。
- 修改：`src/app/reader/page.tsx`，展示可用的阅读模式、阅读设置摘要、阅读助手结果和收藏动作。
- 修改：`src/app/study/vocabulary/page.tsx`，使用收藏模块生成的词汇本视图数据。
- 修改：`src/app/study/sentences/page.tsx`，使用收藏模块生成的句子本视图数据。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。
- 修改：`docs/superpowers/plans/2026-06-23-reader-study-local.md`。

## 任务 1：阅读器视图状态纯逻辑

**文件：**

- 创建：`src/lib/reader/reader-view.ts`
- 测试：`tests/reader-view.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖以下行为：根据当前章节构建目录和上一章/下一章；支持译文、原文、对照三种模式；阅读设置会被规范化到安全范围；对照模式按段落索引配对，缺失译文时显示空字符串。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `reader-view.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小阅读器视图逻辑**

实现纯函数，不访问浏览器、不读写 localStorage、不依赖页面组件。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增阅读器视图测试通过，既有测试仍通过。

## 任务 2：阅读助手本地解释

**文件：**

- 创建：`src/lib/reader/reading-assistant.ts`
- 测试：`tests/reading-assistant.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖解释词、解释句子、解释段落和当前段落问题回答。输出只包含用户可理解的解释、来源和可收藏目标，不暴露模型、token、API 或联网查证。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `reading-assistant.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小本地解释逻辑**

使用确定性模板生成解释，保留后续替换真实 AI Provider 的输入输出形状。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增阅读助手测试通过，既有测试仍通过。

## 任务 3：词汇本和句子本收藏逻辑

**文件：**

- 创建：`src/lib/reader/study-collections.ts`
- 测试：`tests/study-collections.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖从选中文本生成词汇收藏草稿、从句子生成句子收藏草稿、重复词汇合并备注、搜索词汇、搜索句子、按书筛选和删除预览状态。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因为 `study-collections.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小收藏逻辑**

保持数据结构贴近 Prisma 中现有 `VocabularyItem` 和 `SentenceItem`，但不写入真实数据库。

- [x] **步骤 4：运行测试验证通过**

运行：`pnpm test`

预期：新增收藏测试通过，既有测试仍通过。

## 任务 4：页面和 mock 数据接入

**文件：**

- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/reader/page.tsx`
- 修改：`src/app/study/vocabulary/page.tsx`
- 修改：`src/app/study/sentences/page.tsx`

- [x] **步骤 1：接入阶段 7 mock 视图数据**

在 `mock-data.ts` 中使用已测试模块生成阅读器、阅读助手、词汇本和句子本展示数据。

- [x] **步骤 2：更新阅读器页面**

阅读器页面展示目录、章节导航、模式切换入口、阅读设置摘要、当前解释结果、收藏到词汇本和句子本的动作提示。页面不展示复杂后台概念。

- [x] **步骤 3：更新词汇本和句子本页面**

学习页展示搜索、按书筛选、备注、来源和删除入口的本地状态。

- [x] **步骤 4：运行验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`。

## 任务 5：阶段 7 readiness 和文档收口

**文件：**

- 创建：`src/lib/project/stage-seven-readiness.ts`
- 测试：`tests/stage-seven-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-23-reader-study-local.md`

- [x] **步骤 1：编写失败测试**

覆盖阶段 7 本地完成项全部为 `complete`，并明确真实 AI、真实数据库持久化、跨设备同步和导出仍是后续项。

- [x] **步骤 2：实现 readiness 模块**

保持与阶段 2-6 readiness 模块一致的结构。

- [x] **步骤 3：更新文档**

将 ROADMAP 阶段 7 标记为本地范围完成，并在 DEV_LOG 记录功能、影响范围和验证命令。

- [x] **步骤 4：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，构建输出继续包含 `Proxy (Middleware)`；不提交、不推送。
