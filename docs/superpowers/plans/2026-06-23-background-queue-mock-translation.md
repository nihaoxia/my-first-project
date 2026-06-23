# Stray Pages 后台任务队列和模拟翻译实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不接真实后台队列、不接真实 AI、不写真实远程数据库的前提下，建立本地可测试的翻译任务状态流转和模拟译文生成闭环。

**架构：** 阶段 5 延续“纯逻辑先行，页面接入其次，真实外部服务后置”的方式。新增本地任务队列状态机负责 queued/running/succeeded/failed/canceled 等状态流转，模拟翻译器负责从原文章节生成可展示译文，余额操作复用阶段 2 的冻结、返还和扣费纯函数。页面只展示本地模拟结果，不启动真实长任务。

**技术栈：** Next.js App Router、React、TypeScript、现有 mock 数据、Node 原生测试。

---

## 范围边界

本计划包含：

- 本地翻译任务状态流转。
- 模拟后台任务队列批次结果。
- 模拟译文章节生成。
- 成功、失败、取消对任务和余额状态的影响。
- 任务页展示模拟队列进度、失败原因和余额处理结果。
- 阅读器展示模拟译文。
- 阶段 5 readiness 清单、路线图和开发日志更新。

本计划不包含：

- Trigger.dev、Inngest、BullMQ 或其他真实队列依赖。
- 真实 AI 翻译、术语抽取、联网查证和质量检查。
- 真实远程数据库写入。
- 真实支付、充值、退款和对账。
- 新增第三方依赖。

## 本地阶段 5 收口说明

- 本地翻译任务队列状态机、模拟译文生成、余额冻结转扣/返还、任务页展示、阅读器展示、后台队列摘要和 readiness 清单均已完成。
- 当前实现不启动真实后台进程，不访问网络，不接真实 AI，不写入远程数据库。
- 真实后台队列、真实 AI 翻译、远程数据库持久化和真实支付仍保留为后续接入项。

## 文件结构

- 创建：`src/lib/translation/mock-translation-queue.ts`，本地翻译任务队列状态机和批次摘要。
- 创建：`src/lib/translation/mock-translator.ts`，模拟译文生成和阅读器章节内容。
- 创建：`src/lib/project/stage-five-readiness.ts`，阶段 5 本地完成项和外部阻塞项。
- 修改：`src/lib/mock-data.ts`，把任务页、阅读器和后台展示数据接入阶段 5 模拟模块。
- 修改：`src/app/translations/[translationId]/tasks/page.tsx`，展示本地队列流转、失败/取消和余额处理说明。
- 修改：`src/app/reader/page.tsx`，展示由模拟译文模块生成的译文章节。
- 修改：`src/app/admin/page.tsx`，后台队列监控改为读取本地模拟队列摘要。
- 测试：`tests/mock-translation-queue.test.ts`。
- 测试：`tests/mock-translator.test.ts`。
- 测试：`tests/stage-five-readiness.test.ts`。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。
- 修改：本计划文档。

## 任务 1：本地翻译任务队列状态机

**文件：**

- 创建：`src/lib/translation/mock-translation-queue.ts`
- 测试：`tests/mock-translation-queue.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖以下行为：从阶段 4 的任务草稿生成 queued 任务；运行批次后成功任务会从 frozen 转为 charged；失败任务会 release frozen；取消 queued 任务会 release frozen；队列摘要能统计 queued/running/succeeded/failed/canceled。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因 `mock-translation-queue.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小状态机**

实现本地纯函数，不使用定时器、不启动后台进程、不访问网络。

- [x] **步骤 4：运行验证**

运行：`pnpm test`

预期：新增队列测试通过，既有测试仍通过。

## 任务 2：模拟译文生成

**文件：**

- 创建：`src/lib/translation/mock-translator.ts`
- 测试：`tests/mock-translator.test.ts`

- [x] **步骤 1：编写失败测试**

覆盖以下行为：模拟译文保留章节 ID 和标题；按段落生成英文风格译文；空段落会被过滤；阅读器数据能返回当前章节。

- [x] **步骤 2：运行测试验证失败**

运行：`pnpm test`

预期：因 `mock-translator.ts` 尚不存在而失败。

- [x] **步骤 3：实现最小模拟翻译器**

使用确定性文本模板生成译文，避免随机输出导致测试不稳定。

- [x] **步骤 4：运行验证**

运行：`pnpm test`

预期：新增模拟译文测试通过，既有测试仍通过。

## 任务 3：页面和 mock 数据接入

**文件：**

- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/translations/[translationId]/tasks/page.tsx`
- 修改：`src/app/reader/page.tsx`
- 修改：`src/app/admin/page.tsx`

- [x] **步骤 1：复用已测试模块生成页面数据**

任务页显示模拟队列状态、进度、冻结/扣费/返还结果和失败原因；阅读器展示模拟译文；后台队列监控读取队列摘要。

- [x] **步骤 2：运行验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，build 输出继续包含 `Proxy (Middleware)`。

## 任务 4：阶段 5 readiness 和文档收口

**文件：**

- 创建：`src/lib/project/stage-five-readiness.ts`
- 测试：`tests/stage-five-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/superpowers/plans/2026-06-23-background-queue-mock-translation.md`

- [x] **步骤 1：编写失败测试**

覆盖阶段 5 本地完成项全部 complete，并明确真实队列、真实 AI、真实数据库写入和真实支付仍是外部或后续接入项。

- [x] **步骤 2：实现 readiness 模块**

保持与阶段 2-4 readiness 模块一致的结构。

- [x] **步骤 3：更新文档**

将 ROADMAP 的阶段 5 标记为本地范围完成，并在 DEV_LOG 记录功能、影响范围和验证命令。

- [x] **步骤 4：最终验证**

运行：`pnpm test`、`pnpm lint`、`pnpm build`

预期：全部通过，build 输出继续包含 `Proxy (Middleware)`。
