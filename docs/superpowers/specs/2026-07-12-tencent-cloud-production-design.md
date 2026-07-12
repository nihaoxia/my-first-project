# Stray Pages 腾讯云国内生产环境设计

## 1. 决策与适用范围

本设计取代 `2026-07-12-production-deployment-design.md` 中关于 Vercel、Supabase 托管服务、Railway 和 Twilio 的平台选择。旧文档保留为历史记录，但从本设计批准之日起不再指导生产部署。

第 1 阶段的目标是在腾讯云中国大陆地域建立可验收的生产环境，承载现有 Next.js 网站、自托管 Supabase、PostgreSQL、Translation MCP、腾讯云短信、腾讯云 COS 和腾讯混元模型。环境必须支持真实手机 OTP、私有书籍上传、云端译本、真实逐章翻译、退出后数据恢复和双用户隔离。

本阶段仍不实现后台翻译 Worker、支付、EPUB、AI 阅读问答、自动质检和移动端专项优化。这些能力继续严格按照总目标的第 2 至第 10 项推进。

## 2. 方案比较与最终选择

评估过三种国内部署路径：

1. **腾讯云原生重写**：使用 TencentDB、COS、短信和自研认证。平台依赖最纯粹，但会重写已经完成的 Supabase Auth、会话、RLS 和 Storage 边界，安全风险与工作量最高。
2. **腾讯云自托管 Supabase**：在腾讯云服务器运行 Supabase 开源组件，保留 Auth、PostgreSQL、RLS 和现有 SDK；对象文件改用 COS，短信通过 Auth Send SMS Hook 接入腾讯云短信。这是最终选择。
3. **多个国内托管平台组合**：部署更快，但需要多个账户、多个账单和更多跨平台密钥，长期运维边界不清晰。

最终选择第 2 种方案。Supabase 在这里是运行于腾讯云广州服务器的开源软件，不使用 Supabase 国外托管账户，用户数据也不离开所选腾讯云地域。

## 3. 固定平台与资源

- 云厂商：腾讯云。
- 地域：广州。所有支持地域选择的资源保持广州同地域。
- 计算：一台 4 vCPU、8 GiB 内存或更高规格的 Linux 云服务器，Ubuntu 24.04 LTS，挂载独立高性能云硬盘保存 PostgreSQL 数据。
- 网络：独立 VPC；生产安全组仅公开 80、443，SSH 仅允许受控管理员来源并优先使用密钥登录。
- 容器：Docker Engine、Docker Compose v2。
- 镜像：腾讯云容器镜像服务 TCR 私有仓库。生产服务器不在发布时依赖 Docker Hub、GHCR 或 GitHub 拉取。
- 域名：一个由用户控制并完成 ICP 备案的中国大陆域名。
- TLS：Caddy 通过已备案域名签发并自动续期公开可信证书。
- 数据库与认证：自托管 Supabase Auth、PostgreSQL 和所需 API 组件。
- 对象存储：腾讯云 COS 私有 Bucket，禁止公共读写。
- 短信：腾讯云短信 SMS，使用已审核签名与登录验证码模板。
- 翻译模型：腾讯混元的 OpenAI 兼容接口；模型密钥只进入 MCP 容器。
- 源码：GitHub 继续作为现有权威仓库；生产构建产物发布到 TCR。部署不在服务器上执行 `git pull`。

## 4. 域名与服务拓扑

生产域名确定后派生两个主机名：

- `APP_HOST`：用户访问的 Next.js 网站。
- `API_HOST`：浏览器访问自托管 Supabase Auth/API 的入口。

Translation MCP 没有公开域名，只在 Docker 内网监听。腾讯云短信 Hook 同样只允许 Supabase Auth 容器通过内网访问。

```text
中国大陆用户浏览器
  ├── HTTPS APP_HOST ──> Caddy ──> Next.js
  └── HTTPS API_HOST ──> Caddy ──> Supabase API Gateway
                                      ├── Auth
                                      ├── PostgREST
                                      └── PostgreSQL

Next.js
  ├── Docker 内网 ──> PostgreSQL
  ├── Docker 内网 ──> Translation MCP ──> 腾讯混元
  └── HTTPS ──> 腾讯云 COS 私有 Bucket

Supabase Auth
  └── Docker 内网 ──> SMS Hook ──> 腾讯云短信 ──> 用户手机
```

## 5. 容器与进程边界

生产 Compose 项目固定包含以下职责：

- `edge`：Caddy，唯一公开入口，负责 TLS、主机路由、请求大小限制和安全响应头。
- `web`：Next.js 生产服务，只接受 `edge` 和内部健康检查流量。
- `translation-mcp`：现有 Streamable HTTP MCP Server，只接受 `web` 内网调用。
- `sms-hook`：验证 Supabase Auth Hook 签名并调用腾讯云短信。
- `supabase-auth`：手机号 OTP、JWT 和用户身份。
- `supabase-rest`：保留现有浏览器只读/RLS 能力所需的 PostgREST。
- `supabase-gateway`：为 Auth 与 REST 提供统一内部和外部 API 边界。
- `postgres`：权威业务数据库和 Auth 数据库，数据目录位于独立云硬盘。

不把 Supabase Studio、数据库管理端口、SMTP 调试工具或容器运行时接口暴露到公网。Realtime、Analytics、Functions 等当前应用不需要的 Supabase 服务不进入第一版生产 Compose。

## 6. 数据库、迁移与 RLS

`supabase/migrations/202607110001_cloud_foundation.sql` 继续作为权威基础迁移。生产部署只能通过受控迁移容器或 Supabase CLI 对目标数据库执行 migration；禁止使用 `prisma db push`。

迁移完成后必须验证：

- Auth 用户触发器会创建 `UserProfile` 和 `AccountBalance`。
- 所有用户业务表启用并强制 RLS。
- 被封禁用户的读写策略 fail closed。
- 应用层 Prisma 查询继续使用所有者条件，RLS 作为第二层防护。
- Translation receipt、Storage cleanup intent 和余额相关约束完整存在。

PostgreSQL 数据目录每日至少一次云硬盘快照；同时每日生成加密逻辑备份并上传到独立 COS 备份前缀。恢复演练在生产开放前完成一次，恢复目标以验收记录中的实际结果为准。

## 7. COS 对象存储设计

现有业务层的对象存储接口保留，生产 Provider 从 Supabase Storage 切换为腾讯云 COS。Bucket 固定为私有，开启服务端加密、版本控制和生命周期规则。

对象键继续由服务端生成，格式保持用户与书籍绑定：

```text
{userId}/{bookId}/original.txt
```

安全边界：

- 客户端不得提交 Bucket、用户 ID、对象键或持久化状态。
- 上传由 Next.js 服务端执行，单对象保持 2 MiB TXT 上限和 UTF-8/二进制检测。
- 下载使用最短可用时效的 COS 预签名 URL，响应禁止中间缓存。
- 删除继续使用数据库中的持久化 cleanup intent；COS 删除失败时按有界退避重试。
- COS 凭据只进入 `web` 和后续 cleanup Worker，不进入浏览器或 MCP。
- COS 日志和应用日志不得记录预签名 URL 的完整查询字符串。

旧 migration 中 Supabase Storage bucket/policy 可继续用于本地 Supabase 集成测试，但国内生产环境不把它当作权威对象存储。

## 8. 腾讯云短信与 Supabase Auth

手机号认证继续使用 Supabase Auth 的 OTP 和 JWT 语义。自托管 Auth 的 Send SMS Hook 指向内网 `sms-hook` 服务。

`sms-hook` 必须：

- 验证 Auth Hook 的签名和时间窗口。
- 只接受规范化的中国大陆 E.164 手机号。
- 将 OTP 作为临时请求参数发送给腾讯云短信，不落库、不写日志。
- 使用固定且已审核的短信应用、签名和登录验证码模板。
- 将腾讯云错误映射为稳定错误码，不向 Auth 或用户泄露原始响应。
- 对手机号、OTP、腾讯云 SecretId/SecretKey 做结构化日志脱敏。

Auth 配置固定为 6 位 OTP、10 分钟内失效、发送最小间隔不少于 60 秒，并配置验证尝试上限。生产环境设置 `AUTH_MODE=supabase`、`CLOUD_MODE=required`、`MOCK_AUTH_ENABLED=false`，固定验证码只存在于本地 Docker 测试环境。

短信签名和模板审核未通过时，生产注册保持关闭；不得回退到 Mock Auth 并声称生产短信可用。

## 9. 网站、MCP 与模型

Next.js 和 Translation MCP 分别构建为非 root、只读根文件系统的生产镜像。构建流水线固定依赖版本，执行测试、类型检查、Prisma 校验、MCP 构建和 Next.js 构建后才允许推送镜像到 TCR。

MCP 继续保留：

- `GET /health`，只返回 readiness，不返回模型信息或密钥。
- `POST /mcp`，要求受信 Host 和至少 32 字节的 Bearer secret。
- 请求体、响应体、超时和模型输出大小上限。
- 模型超时、限流和无效响应的稳定错误映射。

生产环境中的 MCP URL 使用 Docker 服务名，不经过公网。`MCP_TRUSTED_HOSTS` 只包含内部服务名；腾讯混元的 API 地址、SecretId/SecretKey 或兼容 API Key 只进入 MCP 容器。

## 10. 发布与配置生命周期

生产发布步骤：

1. CI 生成不可变镜像标签，标签包含 Git commit SHA。
2. 镜像通过受控凭据推送到 TCR。
3. 服务器只拉取指定 SHA 标签，不使用 `latest`。
4. 迁移任务在网站切换前执行；失败即停止发布。
5. Compose 更新容器，逐项等待数据库、Auth、MCP 和网站健康检查。
6. Caddy 只在后端健康后切换流量。
7. 执行无密钥输出的生产 smoke 和端到端验收。

真实配置保存在 `/etc/stray-pages/` 下的 root-only 文件或 Docker secrets 中，不进入仓库、镜像层、构建日志和验收截图。轮换顺序遵循先让消费者接受新值、再更新调用方、验证成功后撤销旧值。

## 11. 失败处理与回滚

- migration 失败：停止发布，新增前滚 migration 修复；不改写已应用 migration。
- 网站失败：恢复上一组 TCR SHA 镜像，数据库保持向前兼容。
- MCP 失败：网站继续提供非翻译能力，翻译 capability 明确显示不可用。
- 短信失败：关闭新登录/注册入口，不回退固定验证码。
- COS 失败：拒绝新上传；删除失败保留 cleanup intent；不丢弃数据库审计状态。
- Caddy/TLS 失败：不降级到公网 HTTP，恢复上一份已验证配置。
- 数据库主机故障：从最近云硬盘快照和加密逻辑备份恢复，并执行一致性检查。

回滚镜像不得回滚数据库 migration。每个发布版本必须声明其可接受的最早数据库 schema 版本。

## 12. 合规与上线约束

中国大陆公网生产环境必须满足：

- 腾讯云账户完成实名认证。
- 域名归属可验证并完成 ICP 备案。
- 按实际公开运营情况办理公安联网备案及其他必要手续。
- 腾讯云短信签名、模板和发送场景通过审核。
- 隐私政策说明手机号、用户上传书籍、学习数据、日志和第三方模型处理边界。
- 未取得公开运营条件前，只允许受控测试账号访问，不宣传为公开可用服务。

实名认证、备案材料、短信主体材料、验证码、CAPTCHA 和购买确认必须由账户持有人完成。技术配置、部署和验收由本项目实施流程完成。

## 13. 测试与验收证据

第 1 阶段只有以下证据全部存在才算完成：

1. `APP_HOST` 和 `API_HOST` 使用公开可信 HTTPS 证书，HTTP 自动跳转 HTTPS。
2. 生产服务器只公开 80/443；数据库、MCP、Hook 和 Docker API 均不可从公网访问。
3. 权威 migration 已应用，数据库 lint/约束检查通过。
4. 腾讯云 COS 私有 Bucket 可上传、短时签名下载和删除合法 TXT，跨用户对象访问失败。
5. 两个真实测试手机号可以通过腾讯云短信 OTP 登录，Auth trigger 正确创建资料和余额。
6. 两个账号的数据库数据、学习资料和对象文件彼此隔离，被封禁账号 fail closed。
7. MCP `/health` 就绪，未授权调用失败，合法调用通过腾讯混元完成至少一章真实翻译。
8. 退出并重新登录后，书籍、译本、译文、阅读进度和学习资料能够恢复。
9. 数据库快照、加密逻辑备份和一次恢复演练均有不含密钥的记录。
10. 浏览器、Caddy、容器、腾讯云短信、COS 和模型日志中没有密码、OTP、完整手机号、JWT、数据库连接串、预签名查询串或 API 密钥。
11. 仓库测试、ESLint、TypeScript、Prisma validate、MCP build、Next build、Compose 配置校验和 `git diff --check` 全部通过。
12. 发布记录包含镜像 SHA、Git commit、migration 版本、资源地域和验收时间，但不包含任何 secret。

## 14. 后续顺序

第 1 阶段通过上述验收后，进入总目标第 2 项：本地 Supabase/Docker migration reset、真实双用户 RLS/COS 兼容层集成测试和浏览器 E2E。其后依次实现后台 Worker、服务端限流与监控、真实管理后台、支付、EPUB、AI 阅读能力、质检审核和手机端回归，不提前交换顺序。
