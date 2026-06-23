# Stray Pages 译本创建、费用估算和余额冻结实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 支持用户从原版书创建译本，选择目标语言和章节后看到准确费用估算，并在创建任务前完成余额冻结预检。

**架构：** 阶段 4 继续沿用“纯逻辑先行，页面接入其次，真实数据库保存最后”的方式。费用估算、免费额度抵扣、余额冻结预检、译本创建草稿和任务草稿都先做成可测试模块；页面只负责展示和收集选择状态。真实任务写入数据库需要等待远程 Supabase/Prisma 配置就绪。

**技术栈：** Next.js App Router、React、TypeScript、现有开发期账户余额模块、Node 原生测试。

---

## 范围边界

本计划包含：

- 目标语言选项和默认值。
- 按源语言估算标准章数。
- 按 0.5 元/标准章计算费用。
- 每用户默认免费 5 个标准章，并在创建译本时优先抵扣。
- 选择章节后的总费用、预计余额和余额不足提示。
- 创建译本前的数据形状准备。
- 翻译任务草稿数据形状准备。
- 余额冻结预检和冻结后的账户状态预览。
- 文档、路线图和开发日志更新。

本计划不包含：

- 真实 AI 翻译。
- 真实后台任务队列。
- 真实远程数据库写入。
- 真实支付、充值、退款。
- 多模型选择。
- 复杂翻译风格选择。

## 文件结构

- 创建：`src/lib/translation/translation-pricing.ts`，标准章、费用估算和免费额度抵扣纯逻辑。
- 创建：`src/lib/translation/translation-options.ts`，目标语言和默认翻译风格配置。
- 创建：`src/lib/translation/translation-order-draft.ts`，创建译本前的数据形状、余额冻结预检和任务草稿。
- 创建：`src/components/translation/translation-create-panel.tsx`，译本创建页客户端章节选择和实时费用预览。
- 修改：`src/app/books/[bookId]/translate/page.tsx`，接入阶段 4 译本创建面板。
- 创建：`src/lib/project/stage-four-readiness.ts`，记录阶段 4 本地完成项和外部依赖阻塞项。
- 测试：`tests/translation-pricing.test.ts`。
- 测试：`tests/translation-options.test.ts`。
- 测试：`tests/translation-order-draft.test.ts`。
- 测试：`tests/stage-four-readiness.test.ts`。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：费用估算纯逻辑

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-pricing.ts`
- 测试：`tests/translation-pricing.test.ts`

步骤：

1. 编写失败测试，覆盖中文 3000 字标准章、英文 6000 字标准章、不足一章按一章、免费额度抵扣、无章节选择。已完成。
2. 运行测试，确认因为模块不存在而失败。已完成。
3. 实现最小费用估算逻辑。已完成。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。已完成。

完成标准：

- 费用估算不再依赖页面里的手写字符串。已完成。
- 免费额度和实际应冻结金额可被测试固定。已完成。

## 任务 2：译本创建选项

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-options.ts`
- 测试：`tests/translation-options.test.ts`

步骤：

1. 编写失败测试，覆盖支持语言列表、默认目标语言和默认小说翻译风格。已完成。
2. 实现选项模块。已完成。
3. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。已完成。

完成标准：

- 页面和后续创建草稿共用同一组选项。已完成。

## 任务 3：创建译本草稿和余额冻结预检

状态：已完成

**文件：**

- 创建：`src/lib/translation/translation-order-draft.ts`
- 测试：`tests/translation-order-draft.test.ts`

步骤：

1. 编写失败测试，覆盖无章节、目标语言不支持、余额足够、余额不足、免费额度覆盖全部费用。已完成。
2. 实现创建译本草稿、任务草稿和冻结预检。已完成。
3. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。已完成。

完成标准：

- 后续接 Prisma 保存时有稳定输入形状。已完成。
- 页面能基于同一逻辑显示是否可以创建译本。已完成。

## 任务 4：译本创建页实时估算交互

状态：已完成

**文件：**

- 创建：`src/components/translation/translation-create-panel.tsx`
- 修改：`src/app/books/[bookId]/translate/page.tsx`

步骤：

1. 复用已测试的费用估算、选项和草稿逻辑。已完成。
2. 创建译本页支持选择目标语言和章节。已完成本地交互；术语查证作为后台策略，不暴露给用户选择。
3. 费用卡片随章节选择实时更新，展示预计费用、免费额度抵扣、当前可用余额和预计翻译后余额。已完成。
4. 余额不足或未选择章节时禁用创建按钮并展示明确提示。已完成。
5. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。已完成。

完成标准：

- 创建译本页不再是静态估算。已完成。
- 用户能看到真实选择状态对应的本地费用预览。已完成。
- 页面已切换到统一选项模块和创建草稿模块。已完成。

## 任务 5：阶段 4 本地范围收口

状态：已完成

**文件：**

- 创建：`src/lib/project/stage-four-readiness.ts`
- 测试：`tests/stage-four-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

步骤：

1. 新增阶段 4 readiness 模块，记录本地完成项和外部依赖阻塞项。已完成。
2. 更新路线图状态和阶段 4 详情。已完成。
3. 更新开发日志。已完成。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。已完成。

完成标准：

- 阶段 4 本地可完成范围有测试和文档记录。已完成。
- 真实数据库写入、后台队列和真实支付仍被明确标记为后续接入项。已完成。

本地阶段 4 收口说明：

- 译本创建草稿、翻译任务草稿、费用估算、免费额度抵扣和余额冻结预检已经完成。
- 当前产品规则已调整为 `0.5 元 / 标准章`，开发期默认每个用户免费 5 个标准章。
- 译本创建页已接入本地实时估算和生成译本草稿反馈。
- 当前不会把译本或任务写入真实数据库。
- 后台任务队列和模拟翻译流转进入阶段 5。
- 真实 AI 翻译、术语抽取和质量检查进入阶段 6。
- 真实支付、充值、退款和对账暂不属于当前第一版本地范围。
