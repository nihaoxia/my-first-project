# Stray Pages 上传和章节解析实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。当前项目要求：不要执行 `git commit`，不要执行 `git push`。

**目标：** 支持用户上传自己有权处理的 TXT/EPUB 小说，并生成可预览、可调整、可保存到私人书架的章节结构。

**架构：** 阶段 3 先做本地可测试的解析边界，再接页面交互和后续数据库保存。TXT 使用内置纯逻辑拆章；EPUB 第一版先建立格式、元数据和待解析状态，后续如需真实 EPUB 解包再单独评估依赖。

**技术栈：** Next.js App Router、React、TypeScript、Server Actions、现有 Prisma/Supabase 入口、Node 原生测试。

---

## 范围边界

本计划包含：

- TXT/EPUB 文件格式和大小校验。
- 上传文件名元数据预填。
- TXT 文本拆章预览。
- 上传草稿状态：待读取内容、已解析、待 EPUB 解析、不支持、过大、空文件等。
- 章节预览页接入真实解析策略展示。
- 章节重命名、跳过、恢复的纯逻辑边界。
- 保存原版书到私人书架前的数据形状准备。
- 文档和路线图更新。

本计划不包含：

- 真实对象存储上传。
- 真实 EPUB 解包依赖安装。
- OCR、PDF、DOCX、扫描件。
- AI 翻译。
- 生产 Supabase Storage 配置。

## 文件结构

- 创建：`src/lib/upload/upload-draft.ts`，组合文件校验、元数据推断和 TXT 拆章，输出上传草稿。
- 创建：`src/lib/upload/chapter-editing.ts`，章节重命名、跳过、恢复等编辑纯逻辑。
- 创建：`src/lib/upload/original-book-draft.ts`，生成保存原版书前的书籍、章节和跳过章节数据形状。
- 创建：`src/lib/upload/local-upload-draft.ts`，从浏览器本地文件生成上传草稿，TXT 才读取文本内容。
- 创建：`src/components/upload/local-upload-panel.tsx`，上传页客户端文件选择和解析预览面板。
- 创建：`src/components/upload/chapter-editor-panel.tsx`，章节预览页客户端重命名、跳过和恢复面板。
- 创建：`src/lib/project/stage-three-readiness.ts`，记录阶段 3 本地完成项和外部依赖阻塞项。
- 修改：`src/app/upload/page.tsx`，展示上传草稿准备状态和解析结果示例。
- 修改：`src/app/books/[bookId]/chapters/page.tsx`，接入章节编辑状态和异常提示。
- 测试：`tests/upload-draft.test.ts`。
- 测试：`tests/chapter-editing.test.ts`。
- 测试：`tests/original-book-draft.test.ts`。
- 测试：`tests/local-upload-draft.test.ts`。
- 测试：`tests/stage-three-readiness.test.ts`。
- 修改：`docs/ROADMAP.md`。
- 修改：`docs/DEV_LOG.md`。

## 任务 1：上传草稿构建器

状态：已完成

**文件：**

- 创建：`src/lib/upload/upload-draft.ts`
- 测试：`tests/upload-draft.test.ts`
- 修改：`src/app/upload/page.tsx`

步骤：

1. 编写失败测试，覆盖不支持格式、TXT 无内容、TXT 已解析、EPUB 待解析。
2. 运行测试，确认因为模块不存在而失败。
3. 实现最小上传草稿构建器。
4. 上传页展示当前上传草稿准备状态。
5. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。

完成标准：

- 上传草稿输出结构稳定。
- TXT 可基于文本内容生成章节预览。
- EPUB 不假装已解析，明确标记为待后续解析器。

## 任务 2：章节编辑纯逻辑

状态：已完成

**文件：**

- 创建：`src/lib/upload/chapter-editing.ts`
- 测试：`tests/chapter-editing.test.ts`
- 修改：`src/app/books/[bookId]/chapters/page.tsx`

步骤：

1. 编写失败测试，覆盖重命名、跳过、恢复、空标题回退。
2. 实现章节编辑纯逻辑。
3. 章节预览页展示编辑后状态示例。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。

完成标准：

- 用户后续在页面上调整章节前，数据变化规则已被测试固定。

## 任务 3：原版书保存数据形状准备

状态：已完成

**文件：**

- 创建：`src/lib/upload/original-book-draft.ts`
- 测试：`tests/original-book-draft.test.ts`

步骤：

1. 编写失败测试，覆盖从上传草稿生成待保存原版书、章节列表和跳过章节。
2. 实现最小数据转换函数。
3. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。

完成标准：

- 后续接 Prisma 保存时有稳定输入形状。

## 任务 4：上传页本地文件选择交互

状态：已完成

**文件：**

- 创建：`src/lib/upload/local-upload-draft.ts`
- 创建：`src/components/upload/local-upload-panel.tsx`
- 测试：`tests/local-upload-draft.test.ts`
- 修改：`src/app/upload/page.tsx`

步骤：

1. 编写失败测试，覆盖 TXT 读取、EPUB 不读取、非法格式不读取和 TXT 读取失败。
2. 实现本地文件到上传草稿的异步转换函数。
3. 上传页接入客户端文件选择面板，展示本地解析结果、EPUB 待解析状态和错误提示。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。

完成标准：

- 用户可以在上传页选择本地 TXT 文件并看到章节预览。
- EPUB 明确停留在待解析器状态。
- 不支持格式、空文件、超大小和读取失败有明确提示。

## 任务 5：章节预览页编辑交互

状态：已完成

**文件：**

- 创建：`src/components/upload/chapter-editor-panel.tsx`
- 修改：`src/app/books/[bookId]/chapters/page.tsx`

步骤：

1. 复用 `chapter-editing.ts` 中已经测试固定的重命名、跳过和恢复规则。
2. 章节预览页接入客户端编辑面板，支持标题失焦后重命名、跳过章节、恢复章节。
3. 保存草稿摘要根据当前编辑状态实时更新。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm build`。

完成标准：

- 用户可以在章节预览页实际调整章节标题和跳过状态。
- 页面展示的待保存章节数、跳过章节数和字符统计随编辑状态更新。

## 任务 6：文档和阶段收口

状态：已完成

**文件：**

- 创建：`src/lib/project/stage-three-readiness.ts`
- 测试：`tests/stage-three-readiness.test.ts`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

步骤：

1. 记录阶段 3 进入进行中。已完成。
2. 每完成一个功能增量，更新开发日志。已完成。
3. 新增阶段 3 readiness 模块和测试，固定本地完成项与外部阻塞项。已完成。
4. 阶段 3 收口时更新路线图状态和外部依赖说明。已完成。

完成标准：

- 文档状态与实现状态一致。已完成。
- 所有验证命令通过。已完成。

本地阶段 3 收口说明：

- TXT 本地解析、章节编辑和保存原版书前的数据形状已经完成。
- EPUB 当前只完成格式、元数据和待解析器状态，不包含真实解包。
- 真实对象存储上传、Supabase Storage 生产配置和远程数据库保存仍是后续接入项。
- 后续如要支持真实 EPUB 解包，需要先评估依赖方案；安装依赖前需单独请求用户权限。
