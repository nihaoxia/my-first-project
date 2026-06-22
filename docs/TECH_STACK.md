# Stray Pages 技术栈

本文档用于记录 Stray Pages 的技术栈选择、关键技术决策和后续变更原因。

当前阶段：技术选型讨论期  
创建日期：2026-06-22  
项目目录：`D:\项目\Stray Pages`

## 1. 项目定位摘要

Stray Pages 是一个电脑端优先的网页网站，面向小说阅读和语言学习场景。

第一版核心闭环：

1. 用户登录。
2. 上传 TXT/EPUB 小说。
3. 自动拆章并生成原版书。
4. 创建目标语言译本。
5. AI 自动分析术语并可联网查证。
6. 用户选择章节翻译。
7. 系统显示预计费用并冻结余额。
8. 后台按章翻译。
9. 自动质检。
10. 翻译成功后扣费并保存译文。
11. 用户在阅读器中阅读译本。
12. 用户划词、划句、划段问 AI。
13. 用户收藏词汇和句子。
14. 用户导出 TXT/EPUB 译本和学习资料。

第一版路线：折中路线。

含义：

- 第一版要尽快做出可公开体验的网站。
- 页面需要好看、完整、可信，不做粗糙原型。
- 账号、数据库、任务队列、文件存储、AI 调用、余额冻结等关键能力不能做成一次性玩具方案。
- 暂不采用过重的企业级架构，避免第一版开发周期过长。

## 2. 当前推荐技术栈

### 2.1 总体推荐

当前推荐方案：

```text
Next.js + React + TypeScript
Tailwind CSS + shadcn/ui + Radix UI + lucide-react
Supabase PostgreSQL + Supabase Auth + Supabase Storage
Prisma
Trigger.dev 或 Inngest
AI Provider 抽象层
Vercel AI SDK
Vercel + Supabase + 后台任务平台
```

该方案适合第一版公开体验版：开发速度较快，同时能支撑上传、翻译队列、余额、后台管理、阅读器和学习资料等核心功能。

## 3. 前端技术栈

### 3.1 Web 框架

推荐：

- Next.js
- React
- TypeScript

选择原因：

- Stray Pages 是网页端网站，不是 App。
- 项目包含登录后产品界面、书架、上传流程、章节管理、阅读器、后台管理等多个页面，适合用 Next.js 组织。
- Next.js 的 App Router 适合现代 React 项目，可以把页面、服务端逻辑和数据读取放在同一个项目中管理。
- TypeScript 能减少复杂业务中的低级错误，尤其适合余额、任务状态、章节状态、术语库等数据密集场景。

参考文档：

- [Next.js App Router](https://nextjs.org/docs/app)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [React Versions](https://react.dev/versions)

### 3.2 界面和组件

推荐：

- Tailwind CSS
- shadcn/ui
- Radix UI
- lucide-react

选择原因：

- Tailwind CSS 适合快速搭建精细、统一、可定制的产品界面。
- shadcn/ui 提供常用组件代码，组件进入项目后可以继续改造成 Stray Pages 自己的视觉风格。
- Radix UI 提供可靠的无样式交互组件基础，适合弹窗、下拉、Tabs、Popover、菜单等需要可访问性的组件。
- lucide-react 提供统一图标风格，适合按钮、工具栏、阅读器控制、后台管理等场景。

界面设计原则：

- Stray Pages 是产品型工具，不是营销落地页。
- 第一版应偏安静、清晰、可信、精致。
- 阅读器要有沉浸感，但不能牺牲可读性。
- 后台和任务管理界面要信息密度合理，方便扫描和操作。
- 不使用大面积模板感卡片堆叠。
- 不使用过度装饰的渐变、玻璃拟态或营销式大标题。
- 所有交互组件需要有默认、悬停、聚焦、禁用、加载、错误等状态。

参考文档：

- [Tailwind CSS](https://tailwindcss.com/docs/styling-with-utility-classes)
- [shadcn/ui Components](https://ui.shadcn.com/docs/components)
- [Radix UI Primitives](https://www.radix-ui.com/primitives/docs)

## 4. 后端、数据库和文件

### 4.1 数据库与基础服务

推荐：

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage

选择原因：

- Stray Pages 有大量强关系数据：用户、原版书、译本、章节、翻译任务、余额流水、冻结金额、术语库、词汇本、句子本。
- PostgreSQL 适合这种关系明确、状态复杂、需要事务的数据模型。
- Supabase 可以同时提供数据库、用户认证、文件存储和后台可视化能力，能减少第一版基础设施工作量。
- Supabase Storage 适合保存用户上传的原始文件、解析后的中间文件、导出文件等。

注意事项：

- 手机号登录最终需要真实短信验证码服务。
- 开发阶段可以使用模拟验证码。
- 如果第一版主要面向国内用户，短信、部署位置、访问速度和模型服务都需要单独评估。

参考文档：

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Database](https://supabase.com/docs/guides/database/overview)
- [Supabase Auth](https://supabase.com/auth)

### 4.2 数据库访问

推荐：

- Prisma

选择原因：

- Prisma 对 TypeScript 友好。
- 数据模型清晰，适合维护复杂业务关系。
- 迁移、类型提示和数据库访问体验较好。
- 有助于减少余额流水、冻结金额、任务状态更新等关键逻辑中的错误。

参考文档：

- [Prisma ORM](https://www.prisma.io/docs)
- [Prisma PostgreSQL Quickstart](https://www.prisma.io/docs/prisma-orm/quickstart/postgresql)

## 5. 后台任务和翻译队列

### 5.1 背景

翻译任务不能直接放在普通网页请求中执行。

原因：

- 翻译可能耗时很久。
- 单章可能需要拆成多个段落处理。
- AI 调用可能失败，需要自动重试。
- 任务需要更新进度。
- 任务开始前需要冻结余额。
- 成功后需要正式扣费。
- 失败或取消时需要返还冻结金额。
- 每章翻译后还需要自动质检。

### 5.2 推荐方案

推荐在第一版引入专门的后台任务系统：

- Trigger.dev
- 或 Inngest

初步倾向：

- 如果更重视长时间 AI 工作流和任务可观察性，优先评估 Trigger.dev。
- 如果更重视轻量事件驱动、重试、限流和队列，优先评估 Inngest。

不推荐第一版就自建 Redis + BullMQ，除非后续明确需要更强控制力。

参考文档：

- [Trigger.dev](https://trigger.dev/)
- [Trigger.dev Next.js Guide](https://trigger.dev/docs/guides/frameworks/nextjs)
- [Inngest Docs](https://www.inngest.com/docs)
- [Inngest Background Jobs](https://www.inngest.com/docs/guides/background-jobs)

### 5.3 翻译任务初步流程

1. 用户选择章节。
2. 系统计算预计费用。
3. 系统冻结余额。
4. 创建翻译任务。
5. 后台任务开始处理。
6. 提取或更新术语。
7. 必要时联网查证术语。
8. 分段翻译章节。
9. 合并译文。
10. 自动质检。
11. 质检通过后标记完成并正式扣费。
12. 质检失败时免费自动重试一次。
13. 重试仍失败时标记为需检查，并返还该章冻结金额。

## 6. AI 调用层

### 6.1 基本原则

第一版不应把代码写死到某一个模型供应商。

推荐建立自己的 AI Provider 抽象层，用统一接口承接以下能力：

- 翻译章节。
- 分段翻译。
- 术语提取。
- 术语译名生成。
- 联网查证结果总结。
- 翻译质检。
- 划词解释。
- 划句解释。
- 划段解释。
- 阅读助手问答。
- 章节摘要生成。

好处：

- 后续可以更换模型供应商。
- 可以对不同任务使用不同模型。
- 可以做成本优化。
- 可以统一处理限频、日志、错误、重试和安全策略。

### 6.2 前端 AI 交互

如果阅读助手需要流式输出，推荐评估：

- Vercel AI SDK

参考文档：

- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)

## 7. 文件解析与导出

第一版需要支持：

- TXT 上传和解析。
- EPUB 上传和解析。
- 自动拆章。
- 章节预览。
- TXT 导出。
- EPUB 导出。
- 词汇本 CSV 导出。
- 词汇本 Markdown 导出。
- 句子本 CSV 导出。
- 句子本 Markdown 导出。

设计原则：

- 文件解析和导出逻辑应做成独立服务模块。
- 不应散落在页面组件中。
- 章节解析、导出、文件存储路径需要保留清晰的数据来源关系。
- 第一版不支持 PDF、DOCX、OCR。

后续待具体选型：

- EPUB 解析库。
- EPUB 生成库。
- CSV 生成方式。
- Markdown 导出格式。
- 章节拆分规则实现方式。

## 8. 部署方案

第一版推荐：

- Next.js 部署到 Vercel。
- 数据库、认证、存储使用 Supabase。
- 翻译后台任务使用 Trigger.dev 或 Inngest。
- 域名和 DNS 使用 Cloudflare 或其他域名服务。
- 短信服务根据主要用户地区选择。

待确认：

- 第一版主要面向国内用户还是海外/国际用户。
- 是否需要中国大陆访问速度优化。
- 是否需要国内短信服务。
- AI 模型服务使用哪一家。
- 联网查证是否需要专门搜索 API。

## 9. 备选方案记录

### 9.1 方案 A：最快上线型

组合：

```text
Next.js + Supabase + Supabase Edge Functions
```

优点：

- 架构简单。
- 上手快。
- 服务数量少。
- 适合非常早期原型。

缺点：

- 复杂翻译队列、长任务、自动重试、任务监控会比较吃力。
- 后续可能较快遇到架构瓶颈。

结论：

- 不作为当前首选。

### 9.2 方案 B：推荐折中型

组合：

```text
Next.js + Supabase + Prisma + Trigger.dev/Inngest + Tailwind/shadcn
```

优点：

- 开发速度和长期稳定性较平衡。
- 能支撑公开体验版核心闭环。
- 页面体验可以做得比较好。
- 数据库、文件、后台任务边界清楚。
- 后续仍可以迁移到更重的后端架构。

缺点：

- 服务数量比最简方案更多。
- 需要认真管理环境变量、任务状态和错误处理。

结论：

- 当前推荐方案。

### 9.3 方案 C：长期重型架构

组合：

```text
Next.js 前端
NestJS 后端
PostgreSQL
Redis + BullMQ
S3/R2 文件存储
Docker
```

优点：

- 控制力强。
- 适合长期商业化和更高并发场景。
- 后端边界更明确。

缺点：

- 第一版开发量明显更大。
- 运维复杂度更高。
- 会拖慢公开体验版上线速度。

结论：

- 暂不作为第一版首选。
- 可作为后续业务验证后的升级方向。

## 10. 当前待确认问题

以下问题会影响技术栈细节，需要后续继续讨论：

1. 第一版主要面向国内用户，还是海外/国际用户？
2. 手机号登录使用哪家短信服务？
3. AI 模型供应商选择哪一家？
4. 联网查证使用搜索 API、普通网页检索，还是模型自带联网能力？
5. 单本书最大上传大小是多少？
6. 单次最多允许排队多少章节？
7. 同一用户允许同时运行多少个翻译任务？
8. 平台总并发翻译任务上限是多少？
9. 免费 AI 阅读助手限频规则是多少？
10. 后台管理是否需要单独域名或单独管理员入口？
11. 用户删除原版书时，译本和学习资料如何处理？
12. 导出文件保留多久？
