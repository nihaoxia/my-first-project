# Stray Pages

Stray Pages 是一个面向小说导入、译本创建、双语阅读和学习收藏的 Next.js 应用。项目既提供不依赖外部服务的本地 TXT 阅读流程，也实现了基于 EdgeOne Makers 的生产账号、云端业务数据和 Blob 对象存储代码。

当前生产原则只有一条：不产生任何费用。免费状态、计费方式或超额行为无法明确确认时，应用和部署流程都会 fail closed，不创建资源、不写 Blob、不调用模型，也不会自动切换到历史收费架构。

## 当前生产架构

当前生产目标是 EdgeOne Makers 免费版：

- 用户使用用户名和密码注册、登录，并通过恢复码重置密码；生产不依赖手机号、验证码或短信服务。
- EdgeOne Blob 是账号、Session、书籍、章节、学习资料、翻译记录、原文对象和额度事件的唯一权威存储。
- 生产读取使用强一致模式，创建使用条件写入，不可变 Revision 和索引事件负责并发冲突与历史追踪。
- Blob 免费状态未精确确认为 `true` 时，读取与列表仍可用，所有创建和删除会在访问 SDK 前拒绝。
- Makers Models 默认关闭；免费状态未精确确认时保持空 Key，并产生零次模型网络调用。
- KV 当前不创建，也不能用于认证、授权、所有权、额度或当前 Revision 判断。
- 应用 Blob 硬上限为项目全局 999 MiB，单次上传最大 2 MiB；模型硬停止线为项目全局每月 450,000 Token。

平台配置、免费政策复核、部署、Smoke 和费用验收见 [EdgeOne 零费用生产运行手册](docs/EDGEONE_ZERO_COST_RUNBOOK.md)。平台读取的部署配置位于仓库根目录 [edgeone.json](edgeone.json)。

目前尚未执行真实 EdgeOne 生产开通；本地代码和 GitHub CI 已完成，真实平台操作按用户要求暂停。暂停期间 `EDGEONE_FREE_BLOB_CONFIRMED=false`、`EDGEONE_FREE_MODEL_CONFIRMED=false`，不会产生云端写入或模型费用。

## 当前可用功能

- 用户名/密码注册、登录、退出、恢复码重置、强 Session、登录限频和封禁；
- 按账号隔离的书籍、章节、译本、翻译进度、阅读进度、词汇、句子和笔记；
- TXT 导入，支持 UTF-8/GB18030 解码、自动拆章、章节重命名、跳过和恢复；
- 本地书架与本地译本流程，浏览器数据按当前账号作用域隔离；
- EdgeOne Blob 上的书籍、学习数据、导入回执、译本、任务、租约、Checkpoint 和对象存储 Repository；
- 原文对象上传、短时签名下载、删除、冲突报告和项目级额度门禁；
- 阅读器章节导航、阅读设置、划词收藏、句子收藏和笔记本；
- 真实浏览器文本下载：完整译本 TXT、词汇 CSV、句子 Markdown、笔记 Markdown；
- 免费模型状态明确确认后才可启用的 Makers Models 翻译 Provider；
- 只读 EdgeOne Smoke、零费用依赖扫描、部署配置合约和 GitHub CI 门禁。

TXT 单文件上限为 2 MiB。本地模式数据保存在浏览器当前账号作用域中，清理浏览器数据、使用无痕模式或设备损坏都可能导致本地数据丢失。

## 尚未实现

- EPUB、MOBI、PDF 解析；
- 真正的 EPUB 二进制打包与下载；
- AI 阅读问答；
- 语音朗读；
- 联网术语查证；
- 真实 EdgeOne 免费项目、Blob Store、免费域名部署和双账号生产验收。

这些入口不会伪装成可用功能。模型、外部供应商或云端资源涉及费用时，必须先重新核费并获得明确操作确认。

## 环境要求

- Node.js 22.6 或更高版本；
- pnpm 11.5.3。

安装依赖：

```powershell
pnpm install --frozen-lockfile
```

复制环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

## 本地开发

无需云服务的开发模式至少需要：

```dotenv
AUTH_MODE=mock
MOCK_AUTH_ENABLED=true
CLOUD_MODE=optional
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

启动网站：

```powershell
pnpm dev
```

访问 `http://localhost:3000`。Mock 账号只允许在开发环境显式启用；生产环境无条件拒绝 Mock 登录。

## EdgeOne 配置

生产变量以 [deploy/edgeone/env.example](deploy/edgeone/env.example) 为准：

```dotenv
AUTH_MODE=edgeone
CLOUD_DATA_PROVIDER=edgeone
CLOUD_STORAGE_PROVIDER=edgeone
EDGEONE_BLOB_STORE=
EDGEONE_SESSION_SECRET=
EDGEONE_FREE_BLOB_CONFIRMED=false
EDGEONE_FREE_MODEL_CONFIRMED=false
MAKERS_MODELS_KEY=
```

`EDGEONE_SESSION_SECRET` 至少 64 个高熵字符，只能写入平台 Secret 设置，不能进入仓库、聊天、截图或日志。首次部署仍保持两个免费确认变量为 `false`。任何价格、支付方式、试用、自动续费、升级或提额提示都会终止操作。

## 验证命令

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
git diff --check
```

历史 Prisma schema 校验需要格式正确的 `DATABASE_URL`，只做本地 schema 检查时可在当前进程使用占位 URL；该命令不应连接或写入远程数据库。

## 数据与安全边界

- 生产账号和业务数据以 EdgeOne Blob 中的强一致记录为权威，不信任客户端声明的用户或角色。
- 所有业务读取、更新、对象下载和删除同时限定当前用户与资源所有权。
- Session 使用世代、到期时间和封禁状态校验；恢复码只存储不可逆摘要。
- Blob 或额度账本不可读、不一致或超过硬上限时拒绝写入，不采用“先写后记账”。
- 浏览器文本导出只使用当前页面已经取得并有权读取的数据；它不上传文件、不额外访问网络、不写 Blob。
- 未保存的笔记草稿不会进入 Markdown 导出。
- 模型免费状态未确认、Key 为空、额度账本不可用或达到 450,000 Token 时，模型调用在发起网络请求前停止。
- 不向历史 COS Bucket 写入任何生产对象。

## 历史兼容开发路径

仓库仍保留 Supabase/Prisma、COS、短信 Hook、Translation MCP 和 OpenAI 兼容 Provider 的历史代码与测试，用于兼容性审计和本地开发。这些组件不是当前生产要求，也不授权创建 Supabase 收费套餐、CVM、轻量服务器、COS、短信、TCR、收费模型或其他付费资源。

历史架构说明见 [生产运行手册](docs/PRODUCTION_RUNBOOK.md) 和既有设计文档；它们不能覆盖当前唯一允许的 [EdgeOne 零费用生产运行手册](docs/EDGEONE_ZERO_COST_RUNBOOK.md)。

## 项目文档

- [EdgeOne 零费用生产运行手册](docs/EDGEONE_ZERO_COST_RUNBOOK.md)
- [开发路线图](docs/ROADMAP.md)
- [技术栈](docs/TECH_STACK.md)
- [开发日志](docs/DEV_LOG.md)
- [本地导出闭环设计](docs/superpowers/specs/2026-07-20-local-export-completion-design.md)
- [本地导出闭环实现计划](docs/superpowers/plans/2026-07-20-local-export-completion.md)
