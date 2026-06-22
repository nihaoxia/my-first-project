# Stray Pages 静态产品原型实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用静态数据搭出 Stray Pages 第一版主要页面和核心用户流程，让书架、上传、章节预览、译本创建、翻译队列、阅读器、学习资料和后台的产品轮廓完整可见。

**架构：** 第二阶段仍然保持纯前端静态原型，不接数据库、不接真实上传、不接 AI。将静态数据集中放在 `src/lib/mock-data.ts`，将重复 UI 抽到小组件中，页面通过 App Router 路由呈现。

**技术栈：** Next.js App Router、React、TypeScript、Tailwind CSS、lucide-react。

---

## 范围边界

本计划包含：

- 完善产品导航。
- 创建静态数据模型。
- 重做书架页为可扫描的产品页。
- 创建上传和章节预览静态流程页。
- 创建译本创建和翻译队列静态流程页。
- 丰富阅读器静态体验。
- 创建词汇本和句子本页面。
- 丰富后台静态页。
- 更新路线图和开发日志。
- 运行 `pnpm lint`、`pnpm build` 和本地路由检查。

本计划不包含：

- 真实登录。
- Supabase 和 Prisma。
- 真实文件上传。
- EPUB/TXT 解析。
- 真实翻译任务。
- AI 调用。
- 余额数据库事务。

## 文件结构

将创建或修改：

- 修改：`src/lib/routes.ts`，增加页面路由。
- 创建：`src/lib/mock-data.ts`，集中维护静态演示数据。
- 修改：`src/components/app-shell.tsx`，扩展导航。
- 创建：`src/components/ui/status-pill.tsx`，统一状态标签。
- 创建：`src/components/ui/metric-card.tsx`，统一后台和数据概览卡片。
- 修改：`src/app/library/page.tsx`，完善书架页。
- 创建：`src/app/upload/page.tsx`，上传流程静态页。
- 创建：`src/app/books/[bookId]/chapters/page.tsx`，章节预览静态页。
- 创建：`src/app/books/[bookId]/translate/page.tsx`，译本创建静态页。
- 创建：`src/app/translations/[translationId]/tasks/page.tsx`，翻译队列静态页。
- 修改：`src/app/reader/page.tsx`，完善阅读器静态版。
- 创建：`src/app/study/vocabulary/page.tsx`，词汇本静态页。
- 创建：`src/app/study/sentences/page.tsx`，句子本静态页。
- 修改：`src/app/admin/page.tsx`，完善后台静态页。
- 修改：`src/app/page.tsx`，调整首页入口指向主要流程。
- 修改：`docs/DEV_LOG.md`，记录第二阶段计划创建。
- 修改：`docs/ROADMAP.md`，保持阶段状态。

---

## 任务 1：静态数据和通用组件

**文件：**

- 修改：`src/lib/routes.ts`
- 创建：`src/lib/mock-data.ts`
- 创建：`src/components/ui/status-pill.tsx`
- 创建：`src/components/ui/metric-card.tsx`

步骤：

1. 扩展路由常量，加入上传、章节预览、译本创建、任务队列、词汇本、句子本。
2. 创建 `mock-data.ts`，包含：
   - 示例原版书。
   - 示例译本。
   - 示例章节。
   - 示例任务状态。
   - 示例词汇。
   - 示例句子。
   - 示例后台指标。
3. 创建 `StatusPill`，统一显示 `已完成`、`翻译中`、`需检查`、`失败` 等状态。
4. 创建 `MetricCard`，统一显示后台和书架统计数据。
5. 运行 `pnpm lint`。

完成标准：

- 静态数据类型清晰。
- 页面可复用状态和指标组件。
- `pnpm lint` 通过。

## 任务 2：书架页和首页入口

**文件：**

- 修改：`src/app/page.tsx`
- 修改：`src/app/library/page.tsx`

步骤：

1. 首页保留产品定位，但入口更明确地指向书架和上传。
2. 书架页展示：
   - 余额摘要。
   - 原版书列表。
   - 译本书列表。
   - 上传小说入口。
   - 最近任务摘要。
3. 用静态数据模拟有内容状态。
4. 保留空状态文案结构，便于后续真实数据接入。
5. 运行 `pnpm lint` 和 `pnpm build`。

完成标准：

- 首页能明确进入核心流程。
- 书架页能看出原版书和译本书的区别。
- `pnpm build` 通过。

## 任务 3：上传和章节预览静态流程

**文件：**

- 创建：`src/app/upload/page.tsx`
- 创建：`src/app/books/[bookId]/chapters/page.tsx`

步骤：

1. 上传页展示：
   - 文件选择区域。
   - TXT/EPUB 支持说明。
   - 版权提示。
   - 上传后处理流程。
2. 章节预览页展示：
   - 章节解析摘要。
   - 拆章规则选择。
   - 异常章节提示。
   - 章节列表。
   - 跳过章节标记。
   - 重命名入口的静态形态。
3. 运行 `pnpm lint` 和 `pnpm build`。

完成标准：

- 用户能理解上传后如何进入章节确认。
- 章节预览页包含异常提示和跳过状态。
- `pnpm build` 通过。

## 任务 4：译本创建和翻译队列静态流程

**文件：**

- 创建：`src/app/books/[bookId]/translate/page.tsx`
- 创建：`src/app/translations/[translationId]/tasks/page.tsx`

步骤：

1. 译本创建页展示：
   - 目标语言选择。
   - 联网查证开关。
   - 风格说明。
   - 章节选择。
   - 预计费用。
   - 当前余额和预计余额。
2. 翻译队列页展示：
   - 任务状态列表。
   - 进度摘要。
   - 失败和需检查状态。
   - 冻结金额和扣费说明。
3. 运行 `pnpm lint` 和 `pnpm build`。

完成标准：

- 译本创建和任务状态流转在静态页面中清楚可见。
- 费用和余额的展示方式符合规格。
- `pnpm build` 通过。

## 任务 5：阅读器和学习资料页面

**文件：**

- 修改：`src/app/reader/page.tsx`
- 创建：`src/app/study/vocabulary/page.tsx`
- 创建：`src/app/study/sentences/page.tsx`

步骤：

1. 阅读器展示：
   - 目录侧栏。
   - 阅读模式切换。
   - 阅读设置入口。
   - 正文区域。
   - AI 阅读助手面板。
2. 词汇本展示：
   - 搜索。
   - 按书筛选。
   - 词条列表。
   - 备注和导出入口。
3. 句子本展示：
   - 搜索。
   - 按书筛选。
   - 句子列表。
   - 解释、备注和导出入口。
4. 运行 `pnpm lint` 和 `pnpm build`。

完成标准：

- 阅读和学习主流程可见。
- 词汇本和句子本的第一版功能边界清楚。
- `pnpm build` 通过。

## 任务 6：后台静态页完善

**文件：**

- 修改：`src/app/admin/page.tsx`

步骤：

1. 后台展示：
   - 用户数量。
   - 上传书籍数量。
   - 翻译任务数量。
   - 成功/失败任务。
   - 余额变化。
   - 冻结金额。
   - 每日模型使用量。
2. 增加静态表格：
   - 最近失败任务。
   - 最近余额记录。
3. 运行 `pnpm lint` 和 `pnpm build`。

完成标准：

- 后台不只是几个数字，而是能看出公开体验版运营所需信息。
- `pnpm build` 通过。

## 任务 7：最终验证和文档更新

**文件：**

- 修改：`docs/DEV_LOG.md`
- 修改：`docs/ROADMAP.md`

步骤：

1. 更新 `DEV_LOG.md`，记录第二阶段完成内容和验证结果。
2. 如果静态原型全部完成，将 `ROADMAP.md` 的阶段 1 状态改为 `已完成`。
3. 运行：

```powershell
pnpm lint
pnpm build
```

4. 启动开发服务器，检查以下路由：

```text
/
/library
/upload
/books/demo-book/chapters
/books/demo-book/translate
/translations/demo-translation/tasks
/reader
/study/vocabulary
/study/sentences
/admin
```

完成标准：

- 所有路由返回 200。
- `pnpm lint` 通过。
- `pnpm build` 通过。
- 文档状态和实际进度一致。

## 当前执行约束

- 不执行 `git commit`。
- 不执行 `git push`。
- 需要安装新依赖时，先说明原因并单独请求授权。
- 本阶段原则上不新增依赖。
