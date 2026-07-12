# Supabase 账号、云端数据与对象存储设计

## 目标

把 Stray Pages 从依赖 Mock Cookie 与浏览器 `localStorage` 的单机原型，升级为以 Supabase Auth、PostgreSQL 和私有 Storage 为生产事实源的多用户应用。完整覆盖账号会话、原书与章节、译本与译文、学习收藏、阅读进度和原文件生命周期；未配置云服务时只允许显式的开发降级。

## 范围与成功标准

- 手机号 OTP 通过 Supabase Auth 发送和验证，服务端使用 `auth.getUser()` 验证会话。
- `UserProfile` 与 `AccountBalance` 在用户首次注册时自动创建；角色以数据库资料为准。
- 生产路由、翻译 API 与服务端操作统一读取 `AppSession`，不再信任 Mock Cookie。
- 原 TXT 文件保存到私有 `original-books` bucket，路径固定为 `<userId>/<bookId>/original.txt`。
- 原书、章节、译本、翻译任务、译文章节、阅读进度、词汇、句子和笔记保存到 PostgreSQL，并且所有查询都按 `userId` 限定。
- localStorage 旧数据提供一次性导入云端的入口；云端配置完成后不再作为主事实源。
- Supabase SQL migration 同时创建业务表约束、Auth trigger、RLS、Storage bucket 与策略。
- 本地 Supabase + Docker 能验证 OTP 会话、数据库隔离、文件上传/读取/删除和核心业务闭环。

## 架构选择

采用“Supabase 统一平台 + Prisma 服务端访问”的方案：

1. Supabase Auth 管理 OTP、JWT 与 Cookie；Next.js Server Actions 完成发送和验证。
2. Supabase PostgreSQL 保存业务数据；Prisma 只在服务端 API、Server Components 与服务层中使用。
3. Supabase Storage 保存原文件；bucket 为私有，服务端使用 service-role 上传，浏览器读取使用短时 signed URL。
4. Supabase SQL migration 是部署权威源，因为 Auth trigger、RLS 与 Storage policy 无法只靠 Prisma schema 完整表达；Prisma schema保持同构并用于生成客户端。
5. Next.js API 不接受调用者提交的 `userId`，一律从已验证会话派生。

没有选择“浏览器直接写所有 Supabase 表”，因为复杂事务、费用与任务状态需要服务端约束；也没有选择自建 Auth/MinIO/PostgreSQL 三套服务，因为会显著增加第一版部署和运维成本。

## 运行模式

- `CLOUD_MODE=required`：生产默认。Supabase、数据库或 Storage 配置缺失即明确失败，禁止退回 Mock。
- `CLOUD_MODE=optional`：本地开发。配置完整时使用云端；未配置时允许现有本地工作流。
- `AUTH_MODE=supabase`：生产默认，真实 Supabase OTP。
- `AUTH_MODE=mock`：只允许非生产环境且 `MOCK_AUTH_ENABLED=true`。

配置解析集中在纯函数中，任何错误结果只返回变量名与稳定错误码，不输出连接串、anon key、service-role key 或 JWT。

## 账号与会话

统一会话类型：

```ts
type AppSession = {
  userId: string;
  phone: string;
  role: "USER" | "ADMIN" | "BANNED";
  authMode: "supabase" | "mock";
};
```

`getAppSession()` 在 Supabase 模式调用 `supabase.auth.getUser()`，再按 Auth UUID 查询 `UserProfile`。`BANNED` 用户视为无权访问私人页面。Mock 会话只在显式开发模式返回稳定的开发用户 ID。

`BANNED` 不只由 Next.js 页面拦截：所有浏览器可读业务表和私有对象 Storage policy 还必须调用非暴露 `private` schema 中的无参数 active-user helper。该函数只检查当前 `auth.uid()`，使用 `SECURITY DEFINER`、空 `search_path`、postgres owner 和最小 `authenticated` 执行授权，避免任意用户枚举及 `UserProfile` RLS 递归。动态的 BANNED REST/Storage 验证属于本地 Supabase 集成门禁，不得用静态契约代替。

登录流程分两步：发送 OTP 与验证 OTP。Server Actions 对手机号、验证码、重定向路径进行校验；Supabase 错误映射为用户可读的稳定代码。退出登录调用 `supabase.auth.signOut()` 并清理 Cookie。

## 数据模型与隔离

现有 Prisma 模型继续使用，补充：

- `StudyNote`：用户笔记。
- `ReadingState`：原书或译本的章节与段落进度、阅读设置。
- 原书 `storagePath` 保持私有对象路径。
- 所有用户资源必须能通过直接或关联关系追溯到 `UserProfile.id`。

数据库 trigger 在 `auth.users` 插入后幂等创建 `UserProfile` 和 `AccountBalance`。RLS 对客户端访问实施 `auth.uid()` 所有权约束；管理员只通过服务端受审计操作访问其他用户数据。Prisma 服务端查询仍必须显式包含 `userId`，不依赖绕过 RLS 的数据库角色兜底。

## 原文件与书籍导入

云端导入采用服务端 multipart API：

1. 客户端提交原 TXT、书名、作者和章节编辑结果。
2. 服务端重新验证文件类型、2 MB 上限与文本内容，并重新拆章。
3. 服务端将客户端编辑映射到可信的 `sourceIndex`，拒绝未知或重复章节。
4. 先生成 `bookId`，上传私有对象，再在数据库事务内创建 `OriginalBook` 与 `Chapter`。
5. 数据库失败时删除已上传对象；对象上传失败时不写数据库。
6. 删除书籍时先在事务中校验所有权并删除业务记录，再删除对象；对象删除失败写入可重试清理记录，不能恢复已删除书籍。

文件下载只返回短时 signed URL，不返回 service-role key，也不开放公共 bucket。

## 译本、翻译任务和阅读

云端译本创建在数据库事务中写入 `TranslatedBook` 与逐章 `TranslationTask`。浏览器执行器仍可逐章调用 MCP，但每次开始、完成、失败和重试都通过服务端 API 原子更新任务，并使用 attempt ID 防止过期结果覆盖。完成时同时写入 `TranslatedChapter` 与译本汇总。

阅读器从云端读取已完成章节；阅读进度写入 `ReadingState`。后台持久化队列不属于本设计，但当前页面关闭后任务状态可从数据库恢复，不再依赖单个浏览器的 localStorage。

## 学习数据与本地迁移

词汇、句子和笔记通过云端 API 增删改查。一次性导入端点接收旧 localStorage 数据，使用客户端生成的稳定 source key 做幂等 upsert；成功后浏览器标记导入版本，但不自动删除本地副本，用户确认后再清理。

## 错误处理与安全

- 未登录统一返回 `AUTH_REQUIRED`。
- 配置缺失统一返回 `CLOUD_NOT_CONFIGURED`，生产不降级。
- 所有资源查询使用“按用户和资源 ID 同时查找”，避免先判断资源存在造成越权枚举。
- 上传拒绝路径穿越、伪造 MIME、空文件、超限文件与章节关系损坏。
- service-role key 只在服务端模块读取，禁止 `NEXT_PUBLIC_` 前缀。
- OTP 发送、验证和上传端点预留速率限制边界；日志不记录手机号全文、OTP、JWT、密钥和原文正文。

## 测试与验证

1. 纯单元测试：配置、会话映射、OTP 错误、资源所有权、路径生成、上传补偿、云端 DTO 与本地导入幂等。
2. 服务测试：使用注入式 Auth/Repository/Storage 适配器验证成功和失败路径。
3. 本地 Supabase 集成测试：migration、trigger、RLS、私有 bucket、跨用户隔离和对象生命周期。
4. 浏览器回归：登录、上传 TXT、云端书架、创建译本、翻译一章、阅读、收藏、退出与重新登录恢复数据。
5. 全量门禁：Node 测试、ESLint、TypeScript、Prisma validate/generate、Next build 与 Supabase migration reset。

## 交付边界

代码与本地 Supabase 环境可以完整交付；远程 Supabase 项目的创建、短信供应商余额和生产密钥必须由实际账号提供。生产配置缺失时系统会明确报告，不会伪装云端能力可用。
