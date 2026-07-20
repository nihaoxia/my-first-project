# 已废弃：Stray Pages 腾讯云付费生产运行手册

> **停止使用。** 本文记录的是历史付费架构，包含云服务器、TCR、COS、短信和付费域名，不再是生产入口。当前唯一允许的零费用生产手册是 [EDGEONE_ZERO_COST_RUNBOOK.md](./EDGEONE_ZERO_COST_RUNBOOK.md)。不得按本文创建、购买、续费、试用或写入任何资源；保留正文只用于历史审计。

# Stray Pages 腾讯云国内生产运行手册（历史）

本历史手册曾经描述以下已停用方案，不再具有部署授权：目标架构位于腾讯云广州，Caddy、Next.js、自托管 Supabase Auth/PostgREST/PostgreSQL、Translation MCP 和腾讯云短信 Hook 在同一台 Linux 云服务器的 Docker Compose 中运行；原文存入广州私有 COS；项目镜像存入 TCR 私有仓库。以下正文只用于审计旧设计。

密码、JWT、OTP、手机号、连接串、SecretId、SecretKey、模型密钥和 Hook secret 均不得进入 Git、聊天、截图、CI 日志或验收记录。

## 1. 账户持有人动作

以下事项涉及身份、资质、验证码或付款，只能由账户持有人完成：

1. 腾讯云实名认证；
2. 确认广州云服务器、数据盘、TCR、COS、短信和域名购买；
3. 完成 CAPTCHA、短信验证码和付款确认；
4. 提交 ICP备案主体、负责人和域名材料；
5. 提交腾讯云短信签名、验证码模板和主体证明材料。

身份证件、备案材料、短信主体材料、验证码和付款信息不得发送到本任务。其余技术配置、部署与验收由执行人员完成。

## 2. 代码门禁

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm test
pnpm verify:deployment
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm mcp:translation:build
pnpm sms-hook:build
pnpm build
docker compose --env-file deploy/tencent-cloud/env.example -f deploy/tencent-cloud/docker-compose.production.yml config --quiet
docker build -f deploy/tencent-cloud/Dockerfile.web .
docker build -f deploy/tencent-cloud/Dockerfile.translation-mcp .
docker build -f deploy/tencent-cloud/Dockerfile.sms-hook .
git diff --check
```

只记录 Git SHA、命令名称、退出码和时间，不记录环境变量值。

## 3. 广州资源与网络

资源统一使用 `stray-pages-production` 前缀并选择广州地域：独立 VPC、最低 4 vCPU/8 GiB 的腾讯云 Linux 云服务器、独立数据盘、TCR 私有命名空间、COS 私有 Bucket、腾讯云短信应用和腾讯混元兼容 API。安全组公网仅开放 80、443；SSH 仅允许受控来源。数据库 5432、MCP 8787、短信 Hook 9000 均不得映射公网，`private-net` 必须保持 `internal: true`。

## 4. 服务器加固与密钥

更新安全补丁；创建非 root 运维用户；只允许 SSH key；关闭密码登录和 root 远程登录；安装固定版本 Docker Engine 与 Compose；挂载数据盘；配置时间同步、磁盘、容器重启和异常登录告警。

从 `deploy/tencent-cloud/secrets.example.env` 复制键名到 `/etc/stray-pages/production.env`，只在服务器本地填写真实值。文件必须 root 所有、权限 `0600`；`/var/lib/stray-pages` 权限为 `0700`。`PRODUCTION_SECRETS_FILE` 必须指向该绝对路径。

## 5. TCR 镜像

把固定上游 Caddy、Supabase Auth、PostgREST、Supabase PostgreSQL 和 Kong 镜像同步到 TCR。三个项目镜像使用完整 40 位 Git SHA 标签：

```bash
docker build -f deploy/tencent-cloud/Dockerfile.web -t <TCR>/stray-pages-web:<SHA> .
docker build -f deploy/tencent-cloud/Dockerfile.translation-mcp -t <TCR>/stray-pages-translation-mcp:<SHA> .
docker build -f deploy/tencent-cloud/Dockerfile.sms-hook -t <TCR>/stray-pages-sms-hook:<SHA> .
docker push <TCR>/stray-pages-web:<SHA>
docker push <TCR>/stray-pages-translation-mcp:<SHA>
docker push <TCR>/stray-pages-sms-hook:<SHA>
```

禁止使用 `latest`。验收只保存镜像 digest，不保存 TCR 登录凭据。

## 6. COS

COS Bucket 必须私有、地域为 `ap-guangzhou`，禁止匿名读写和静态网站托管。应用对象键固定为 `{userId}/{bookId}/original.txt`，签名 URL 最长 300 秒。启用服务端加密、访问日志、异常流量告警和最小权限 CAM 策略。

## 7. 腾讯云短信与自托管 Supabase

短信模板只包含一个 6 位 OTP 参数。短信签名和模板审核通过后，将应用 ID、签名、模板 ID 和最小权限凭据写入 root-only 密钥文件。

生成至少 32 字节随机 Hook secret，并把同一值分别写为 `SMS_HOOK_SECRET=v1,whsec_<base64>` 与 `GOTRUE_HOOK_SEND_SMS_SECRET=v1,whsec_<base64>`。Auth 只通过私网 `http://sms-hook:9000/hooks/send-sms` 发送 OTP。生产禁止固定 OTP、Mock Auth、Studio 和 Analytics。

## 8. 域名、ICP备案与 HTTPS

为网站和 API 准备两个已备案域名，分别填入 `APP_HOST` 与 `API_HOST`。中国大陆公开上线前必须完成 ICP备案。备案通过并完成 DNS 后，由 Caddy 申请 HTTPS 证书。验证 HSTS、`X-Content-Type-Options` 与 Referrer Policy。

## 9. migration 与发布

权威 migration 是 `supabase/migrations/202607110001_cloud_foundation.sql`，禁止 `prisma db push`。发布器先等待 PostgreSQL，在事务中应用未登记 migration，再更新固定 SHA 镜像：

```bash
sudo PRODUCTION_SECRETS_FILE=/etc/stray-pages/production.env \
  sh deploy/tencent-cloud/release.sh <40位Git-SHA>
```

状态文件为 `/var/lib/stray-pages/current-release-sha`。健康门禁失败时只恢复上一个镜像 SHA，不回滚数据库 migration；数据库变更只能新增前滚修复 migration。

## 10. Smoke 与验收

```bash
PRODUCTION_APP_URL=https://<网站域名> \
PRODUCTION_SUPABASE_URL=https://<API域名> \
pnpm smoke:production
```

输出只能包含检查名、HTTP 状态和稳定代码。完整验收包括：

1. 应用健康、首页、Auth、REST、安全头全部 `OK`；
2. 两个真实测试账号分别收到 OTP，记录只使用账号代号；
3. 双用户数据库与 COS 对象互不可见；
4. TXT 上传、签名下载、删除和清理意图成功；
5. 至少一章通过腾讯混元真实翻译；
6. 退出重登后书籍、译本、进度和学习数据恢复；
7. `BANNED` 账号 fail closed；
8. Caddy、容器、短信、COS、模型日志无敏感值；
9. 数据库加密备份与一次恢复演练成功。

## 11. 快照、加密备份与恢复演练

- 数据盘每天创建快照，设置保留周期和失败告警；
- 每天做 PostgreSQL 逻辑备份，本地使用独立备份密钥加密，再上传到独立私有 COS 备份 Bucket；
- 备份 CAM 身份不得拥有生产 Bucket 删除权限；
- 每月至少一次恢复演练：在隔离实例恢复最近备份，验证 migration 版本、表数量、RLS、Auth trigger 和抽样数据；
- 恢复证据只记录备份代号、时间、耗时、校验结果和执行人。

## 12. 监控与告警

监控 CPU、内存、数据盘、PostgreSQL 连接、容器重启、HTTP 5xx、短信失败、COS 错误、模型超时和证书到期。日志不得记录请求原文、手机号、OTP、Authorization、Cookie、JWT、数据库连接串或供应商原始错误响应。

## 13. 密钥泄漏响应

发现密钥泄漏立即停止发布：禁用泄漏凭据；生成新值并更新 root-only 文件；重启服务并验证旧值失效；检查 Git、CI、容器日志与聊天影响范围；记录时间、影响和预防措施，但绝不复制泄漏值。

## 14. 回滚

应用故障使用 `release.sh` 固定 SHA 回滚。migration 不反向回滚，只新增前滚修复。COS 配置错误先撤销受影响 CAM 凭据，再恢复上一份配置。短信故障保持注册 fail closed，禁止切回固定 OTP 或 Mock Auth。

只有全部验收证据通过后，才能把生产部署阶段标记完成。
