# Stray Pages 真实 AI 翻译本地准备实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 在不接入真实 AI、不联网、不安装新依赖的前提下，建立阶段 6 需要的翻译分段、提示词、Provider 抽象、术语候选和质检本地准备层。

**架构：** 阶段 6 先把真实 AI 接入前的边界做成纯逻辑模块。页面和队列后续只调用 Provider 接口；当前使用 Fake Provider 生成确定性结果，保证测试可以固定行为。真实模型、联网查证和远程数据库写入留到外部配置就绪后替换 Provider 和持久化层。

**技术栈：** Next.js App Router、React、TypeScript、Node 原生测试、现有本地模拟翻译队列。

---

## 范围边界

本计划包含：

- 长章节按段落和字符上限进行稳定分段。
- 翻译提示词输入结构和系统提示文本。
- AI 翻译 Provider 接口和本地 Fake Provider。
- 本地术语候选抽取数据形状。
- 每本书内部术语本、本地术语匹配和译后术语一致性检查。
- 本地质量检查数据形状和基础规则。
- 后台内部成本账本和毛利监控，用于验证简单定价是否健康。
- 阶段 6 readiness 清单。
- 少量页面/mock 数据接入，用于展示阶段 6 本地准备状态。
- 文档、路线图和开发日志更新。

本计划不包含：

- 真实 AI API 调用。
- 真实 API key 或 `.env` 配置。
- 真实联网查证。
- 新依赖安装。
- 真实后台队列接入。
- 远程数据库写入。
- 真实模型成本统计（当前只做本地估算形状和后台展示）。

## 文件结构

- 创建：`src/lib/translation/translation-segments.ts`，章节分段纯逻辑。
- 创建：`src/lib/translation/translation-prompt.ts`，提示词输入结构和 prompt 构建。
- 创建：`src/lib/translation/translation-provider.ts`，Provider 接口和 Fake Provider。
- 创建：`src/lib/translation/terminology.ts`，术语候选抽取和 glossary 输入形状。
- 创建：`src/lib/translation/terminology-glossary.ts`，每本书内部术语本、确认术语、本地匹配和一致性检查。
- 创建：`src/lib/translation/translation-quality.ts`，质检结果和基础规则。
- 创建：`src/lib/translation/translation-cost-ledger.ts`，后台内部成本账本、模型成本估算和毛利汇总。
- 创建：`src/lib/project/stage-six-readiness.ts`，阶段 6 本地完成项和阻塞项。
- 测试：`tests/translation-segments.test.ts`。
- 测试：`tests/translation-prompt.test.ts`。
- 测试：`tests/translation-provider.test.ts`。
- 测试：`tests/terminology.test.ts`。
- 测试：`tests/terminology-glossary.test.ts`。
- 测试：`tests/translation-quality.test.ts`。
- 测试：`tests/translation-cost-ledger.test.ts`。
- 测试：`tests/stage-six-readiness.test.ts`。
- 修改：`src/lib/mock-data.ts`。
- 修改：`src/app/translations/[translationId]/tasks/page.tsx`。
- 修改：`src/app/admin/page.tsx`。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：章节分段纯逻辑

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-segments.ts`
- 测试：`tests/translation-segments.test.ts`

步骤：

1. 编写失败测试，覆盖空正文、段落清理、按字符上限分段、超长单段硬切分和 segment id 稳定性。已完成。
2. 运行测试，确认因为模块不存在而失败。已完成。
3. 实现最小分段逻辑。已完成。
4. 运行相关测试确认通过。已完成。

完成标准：

- 长章节可以拆成稳定 segment 列表。已完成。
- 分段逻辑不依赖页面或真实模型。已完成。

## 任务 2：提示词和 Provider 抽象

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-prompt.ts`
- 创建：`src/lib/translation/translation-provider.ts`
- 测试：`tests/translation-prompt.test.ts`
- 测试：`tests/translation-provider.test.ts`

步骤：

1. 编写失败测试，覆盖 prompt 包含目标语言、风格、术语表、联网查证标记和原文 segment。已完成。
2. 编写失败测试，覆盖 Fake Provider 返回和输入 segment 一一对应的译文结果。已完成。
3. 实现 prompt 构建和 Provider 接口。已完成。
4. 实现本地 Fake Provider。已完成。
5. 运行相关测试确认通过。已完成。

完成标准：

- 后续真实 AI 接入只需要实现同一 Provider 接口。已完成。
- 当前测试不访问网络、不需要 API key。已完成。

## 任务 3：术语候选和质检基础规则

状态：已完成

**文件：**

- 创建：`src/lib/translation/terminology.ts`
- 创建：`src/lib/translation/translation-quality.ts`
- 测试：`tests/terminology.test.ts`
- 测试：`tests/translation-quality.test.ts`

步骤：

1. 编写失败测试，覆盖英文专名、中文书名号术语、重复候选去重和候选频次。已完成。
2. 编写失败测试，覆盖空译文、segment 数量不一致、明显残留原文和通过状态。已完成。
3. 实现术语候选抽取。已完成。
4. 实现质检规则。已完成。
5. 运行相关测试确认通过。已完成。

完成标准：

- 阶段 6 有稳定术语数据形状，后续可替换为模型抽取或联网查证结果。已完成。
- 质检结果可用于任务页和后台展示。已完成。
- 每本书内部术语本可以保存新术语、确认译法，并在后续章节翻译前本地复用。已完成。

## 任务 4：阶段 6 页面展示和 readiness 收口

状态：已完成

**文件：**

- 创建：`src/lib/project/stage-six-readiness.ts`
- 测试：`tests/stage-six-readiness.test.ts`
- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/translations/[translationId]/tasks/page.tsx`
- 修改：`src/app/admin/page.tsx`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

步骤：

1. 新增阶段 6 readiness 模块，记录本地完成项和外部依赖阻塞项。已完成。
2. 将 mock 数据接入阶段 6 本地准备结果，展示分段数、术语候选和质检状态。已完成。
3. 任务页展示阶段 6 本地准备摘要。已完成。
4. 后台展示阶段 6 AI 准备状态。已完成。
5. 更新路线图和开发日志。已完成。
6. 运行 `pnpm test`、`pnpm lint`、`pnpm build`，确认构建输出包含 `Proxy (Middleware)`。已完成。

完成标准：

- 阶段 6 本地可完成范围有测试和文档记录。已完成。
- 真实 AI、真实联网查证、真实队列和远程数据库写入仍被明确标记为后续接入项。已完成。

## 任务 5：后台内部成本监控

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-cost-ledger.ts`
- 测试：`tests/translation-cost-ledger.test.ts`
- 修改：`src/lib/mock-data.ts`
- 修改：`src/app/admin/page.tsx`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

步骤：

1. 编写失败测试，覆盖单任务收入、免费履约成本、失败任务收入归零和后台汇总。已完成。
2. 实现内部成本账本纯逻辑，按任务记录确认收入、免费履约金额、模型成本估算、重试次数、质检问题、毛利和亏损标记。已完成。
3. 将阶段 5 本地队列接入成本账本 mock 汇总。已完成。
4. 新增成本健康判断，按毛利率、亏损任务占比、平均重试次数和质检问题占比标记“健康 / 需关注 / 亏损”。已完成。
5. 后台新增成本监控卡片，普通用户页面不展示模型、token、API 或成本细节。已完成。
6. 运行 `pnpm test`、`pnpm lint`、`pnpm build`，确认新增测试和既有测试通过，且构建输出包含 `Proxy (Middleware)`。已完成。

完成标准：

- 简单收费规则不变：用户侧仍是 `0.5 元 / 标准章`，每个用户免费 5 个标准章。已完成。
- 后台能看到确认收入、免费履约、内部成本、毛利率、健康状态和需关注任务。已完成。
- 后续真实 AI Provider 接入时，可以把真实 token 用量写入同一成本账本。已完成。
