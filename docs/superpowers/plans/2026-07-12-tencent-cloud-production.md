# 腾讯云国内生产部署实施计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实施本计划。每个代码任务必须遵循测试驱动开发的红—绿循环；每个提交前使用 verification-before-completion。

**目标：** 将 Stray Pages 从未落地的国外托管部署契约迁移为腾讯云广州生产架构，交付自托管 Supabase、腾讯云 COS、腾讯云短信 Hook、Translation MCP、Next.js、TCR 镜像、Caddy HTTPS 和可审计的生产验收流程。

**架构：** Docker Compose 在腾讯云广州服务器运行 Caddy、Next.js、Supabase Auth/REST/PostgreSQL、短信 Hook 和 Translation MCP。浏览器只访问网站与 Supabase API；MCP、短信 Hook 和数据库保持内网。书籍对象通过现有存储服务接口写入私有 COS，腾讯混元只由 MCP 调用。

**技术栈：** Next.js 16、Node.js 24、TypeScript 6、Supabase Auth/PostgREST/PostgreSQL、Prisma 7、Docker Compose、Caddy、腾讯云 COS SDK `cos-nodejs-sdk-v5@3.0.0`、腾讯云短信 SDK `tencentcloud-sdk-nodejs-sms@4.1.240`、腾讯混元 OpenAI 兼容接口、Node Test。

---

## 文件结构

### 部署与容器

- 创建 `deploy/tencent-cloud/docker-compose.production.yml`：国内生产容器、网络、卷、健康检查和最小权限。
- 创建 `deploy/tencent-cloud/Caddyfile`：`APP_HOST`、`API_HOST`、HTTPS、安全头和请求大小边界。
- 创建 `deploy/tencent-cloud/Dockerfile.web`：Next.js 非 root 多阶段镜像。
- 创建 `deploy/tencent-cloud/Dockerfile.translation-mcp`：MCP 非 root多阶段镜像。
- 创建 `deploy/tencent-cloud/Dockerfile.sms-hook`：短信 Hook 非 root 多阶段镜像。
- 创建 `deploy/tencent-cloud/env.example`：仅包含键名与非敏感安全默认值。
- 创建 `deploy/tencent-cloud/kong.yml`：只公开 Auth 与 REST 的 Supabase API Gateway 路由。
- 创建 `deploy/tencent-cloud/release.sh`：固定 SHA 镜像、迁移、健康检查和有界回滚入口。
- 创建 `.dockerignore`：排除 Git、worktree、环境文件、测试产物和本地缓存。
- 删除 `railway.toml`、`vercel.json`：防止旧国外平台被误当作权威部署入口。

### COS

- 修改 `src/lib/cloud/server-config-core.ts`：增加 `supabase`/`cos` Storage Provider 判别联合与 COS 服务端配置。
- 修改 `src/lib/cloud/storage.ts`：按 Provider 构造 Supabase 或 COS 适配器。
- 创建 `src/lib/cloud/cos-storage-provider.ts`：封装 PutObject、DeleteObject、HeadObject 和签名 URL。
- 修改 `src/lib/cloud/storage-core.ts`：将 provider-not-found 判定泛化，保持现有对象键和稳定错误。
- 修改 `tests/cloud-server-config.test.ts`、`tests/cloud-storage.test.ts`。
- 创建 `tests/cos-storage-provider.test.ts`。

### 腾讯云短信 Hook

- 创建 `src/server/sms-hook/config.ts`：Hook、腾讯云短信和监听配置解析。
- 创建 `src/server/sms-hook/hook-core.ts`：Standard Webhooks 验签、时间窗、载荷校验与稳定结果。
- 创建 `src/server/sms-hook/tencent-sms-provider.ts`：腾讯云短信 SDK 最小适配器。
- 创建 `src/server/sms-hook/server.ts`：`/health` 与 `/hooks/send-sms` HTTP 边界。
- 创建 `src/server/sms-hook/index.ts`：生产入口和关闭逻辑。
- 创建 `tests/sms-hook-config.test.ts`、`tests/sms-hook-core.test.ts`、`tests/sms-hook-server.test.ts`。
- 修改 `package.json`、`pnpm-lock.yaml`、`tsconfig.json`。

### Supabase 自托管与生产 Smoke

- 修改 `src/lib/deployment/production-smoke-core.ts`：改为国内拓扑的公开检查。
- 修改 `scripts/production-smoke.mjs`、`tests/production-smoke.test.ts`。
- 创建 `src/app/api/health/route.ts`：仅返回稳定 readiness，不返回密钥和上游地址。
- 创建 `tests/app-health-route.test.ts`。
- 修改 `supabase/config.toml`：明确本地固定 OTP 与生产 Hook 的边界，不嵌入生产 secret。

### 文档与 CI

- 修改 `tests/production-deployment-contract.test.ts`：国内 Compose/Caddy/TCR 契约和国外 manifest 禁止规则。
- 修改 `.github/workflows/ci.yml`：Compose 校验、三个镜像构建和无 secret 扫描。
- 修改 `.env.example`：增加 Provider、COS、短信、自托管 Host 键名，删除国外平台语义。
- 重写 `docs/PRODUCTION_RUNBOOK.md`：腾讯云实名认证、广州资源、TCR、COS、短信、备案、发布、备份、恢复和回滚。
- 修改 `README.md`、`tests/project-maintainability.test.ts`。

---

### 任务 1：替换国外部署契约与入口

**文件：**
- 修改：`tests/production-deployment-contract.test.ts`
- 修改：`src/server/translation-mcp/config.ts`
- 修改：`src/server/translation-mcp/index.ts`
- 创建：`deploy/tencent-cloud/docker-compose.production.yml`
- 创建：`deploy/tencent-cloud/Caddyfile`
- 创建：`deploy/tencent-cloud/Dockerfile.web`
- 创建：`deploy/tencent-cloud/Dockerfile.translation-mcp`
- 创建：`deploy/tencent-cloud/Dockerfile.sms-hook`
- 创建：`deploy/tencent-cloud/env.example`
- 创建：`deploy/tencent-cloud/kong.yml`
- 创建：`.dockerignore`
- 删除：`railway.toml`
- 删除：`vercel.json`

- [ ] **步骤 1：把契约测试改为国内部署预期**

在 `tests/production-deployment-contract.test.ts` 保留端口解析测试，将 manifest 测试替换为：

```ts
test("Tencent production manifests expose only the HTTPS edge", () => {
  const compose = readFileSync("deploy/tencent-cloud/docker-compose.production.yml", "utf8");
  const caddy = readFileSync("deploy/tencent-cloud/Caddyfile", "utf8");

  assert.match(compose, /edge:/);
  assert.match(compose, /web:/);
  assert.match(compose, /translation-mcp:/);
  assert.match(compose, /sms-hook:/);
  assert.match(compose, /supabase-auth:/);
  assert.match(compose, /postgres:/);
  assert.doesNotMatch(compose, /5432:5432|8787:8787|9000:9000/);
  assert.match(caddy, /APP_HOST/);
  assert.match(caddy, /API_HOST/);
  assert.equal(existsSync("railway.toml"), false);
  assert.equal(existsSync("vercel.json"), false);
});
```

再增加 secret 禁止测试：Compose、Caddy、Dockerfile、env 示例不得包含 JWT、数据库密码、腾讯云密钥或可用 token 值。

同时增加 MCP 监听地址测试：未配置时保持 `127.0.0.1`，`MCP_TRANSLATION_HOST=0.0.0.0` 时允许容器内网访问，其他地址返回稳定配置错误。

- [ ] **步骤 2：运行红灯测试**

运行：

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts
```

预期：FAIL，国内部署文件不存在，旧 manifest 仍存在。

- [ ] **步骤 3：实现最小生产容器骨架**

`src/server/translation-mcp/config.ts` 解析 `MCP_TRANSLATION_HOST` 为 `127.0.0.1` 或 `0.0.0.0`，默认回环地址；`index.ts` 使用解析后的 `listenHost`。Compose 显式设置 `0.0.0.0`。

Compose 使用两个网络：`edge-net` 与 `private-net`。只有 `edge` 映射 `80:80`、`443:443`；数据库、MCP 和 Hook 仅使用 `expose`。每个应用容器设置：

```yaml
read_only: true
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
restart: unless-stopped
```

需要写临时文件的容器使用明确的 `tmpfs`。PostgreSQL 使用独立命名卷并保持可写。镜像引用使用 `${TCR_NAMESPACE}`、`${RELEASE_SHA}`，不使用 `latest`。

Caddy 仅路由 `APP_HOST` 到 `web:3000`，`API_HOST` 到 `supabase-gateway:8000`；设置 HSTS、`X-Content-Type-Options`、`Referrer-Policy` 和合理请求体上限。

- [ ] **步骤 4：删除旧平台入口并验证绿灯**

删除 `railway.toml`、`vercel.json`，运行：

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts
docker compose --env-file deploy/tencent-cloud/env.example -f deploy/tencent-cloud/docker-compose.production.yml config --quiet
git diff --check
```

预期：测试 PASS；Compose 解析成功；无空白错误。

- [ ] **步骤 5：提交**

```bash
git add tests/production-deployment-contract.test.ts src/server/translation-mcp/config.ts src/server/translation-mcp/index.ts deploy/tencent-cloud .dockerignore railway.toml vercel.json
git commit -m "feat: add Tencent Cloud production manifests"
```

### 任务 2：增加 COS 配置判别联合

**文件：**
- 修改：`src/lib/cloud/server-config-core.ts`
- 修改：`tests/cloud-server-config.test.ts`
- 修改：`.env.example`

- [ ] **步骤 1：编写失败配置测试**

新增测试，要求生产 COS 配置只在 `CLOUD_STORAGE_PROVIDER=cos` 时读取：

```ts
test("COS storage requires a complete server-only configuration", () => {
  const result = resolveCloudServerConfig({
    ...publicEnvironment,
    CLOUD_STORAGE_PROVIDER: "cos",
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/postgres",
    COS_SECRET_ID: "secret-id",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.missingKeys, [
      "COS_SECRET_KEY",
      "COS_BUCKET",
      "COS_REGION",
    ]);
  }
  assert.equal(JSON.stringify(result).includes("secret-id"), false);
});
```

再覆盖完整 COS 配置、未知 Provider、Supabase Provider 兼容和 COS Bucket/Region 格式错误。

- [ ] **步骤 2：验证红灯**

运行：

```bash
node --experimental-strip-types --test tests/cloud-server-config.test.ts
```

预期：FAIL，当前配置始终要求 `SUPABASE_SERVICE_ROLE_KEY`。

- [ ] **步骤 3：实现配置联合**

定义：

```ts
type CloudStorageProviderKind = "supabase" | "cos";

type SupabaseStorageConfig = {
  storageProvider: "supabase";
  supabaseServiceRoleKey: string;
};

type CosStorageConfig = {
  storageProvider: "cos";
  cosSecretId: string;
  cosSecretKey: string;
  cosBucket: string;
  cosRegion: string;
};
```

`CloudServerConfig` 为公共配置、数据库配置和上述 Provider 联合的交叉类型。错误只返回键名，不返回值。默认 Provider 保持 `supabase`，避免破坏本地 Docker。

- [ ] **步骤 4：验证**

```bash
node --experimental-strip-types --test tests/cloud-server-config.test.ts tests/cloud-config.test.ts
pnpm typecheck
```

预期：全部 PASS。

- [ ] **步骤 5：提交**

```bash
git add src/lib/cloud/server-config-core.ts tests/cloud-server-config.test.ts .env.example
git commit -m "feat: add COS server configuration"
```

### 任务 3：实现腾讯云 COS Storage Provider

**文件：**
- 创建：`src/lib/cloud/cos-storage-provider.ts`
- 创建：`tests/cos-storage-provider.test.ts`
- 修改：`src/lib/cloud/storage.ts`
- 修改：`src/lib/cloud/storage-core.ts`
- 修改：`tests/cloud-storage.test.ts`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：安装固定版本依赖**

```bash
pnpm add cos-nodejs-sdk-v5@3.0.0 --save-exact
```

确认 `package.json` 中版本没有 `^` 或 `~`。

- [ ] **步骤 2：编写失败测试**

通过注入的最小 COS client 测试真实适配行为：

```ts
test("COS provider uploads private TXT and creates a bounded attachment URL", async () => {
  const objectPath = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/original.txt";
  const calls: unknown[] = [];
  const client = {
    putObject(
      params: { Key: string; ContentType: string },
      callback: (error: Error | null, data?: object) => void,
    ) {
      calls.push({
        operation: "putObject",
        key: params.Key,
        contentType: params.ContentType,
      });
      callback(null, {});
    },
    deleteObject(
      _params: { Key: string },
      callback: (error: Error | null, data?: object) => void,
    ) {
      callback(null, {});
    },
    getObjectUrl(
      _params: { Key: string; Expires: number },
      callback: (error: Error | null, url?: string) => void,
    ) {
      callback(
        null,
        "https://original-books.cos.ap-guangzhou.myqcloud.com/signed?response-content-disposition=attachment",
      );
    },
  };
  const provider = createCosStorageProvider({
    bucket: "original-books-1250000000",
    region: "ap-guangzhou",
    client,
  });

  await provider.upload(objectPath, new TextEncoder().encode("text"));
  const url = await provider.createSignedUrl(objectPath, 60);

  assert.deepEqual(calls[0], {
    operation: "putObject",
    key: objectPath,
    contentType: "text/plain; charset=utf-8",
  });
  assert.match(url, /^https:\/\//);
  assert.equal(url.includes("response-content-disposition=attachment"), true);
});
```

覆盖 DeleteObject 的 `NoSuchKey` 幂等、其他错误抛出、签名时效 1–300 秒、URL 不含用户提供 Host。

- [ ] **步骤 3：验证红灯**

```bash
node --experimental-strip-types --test tests/cos-storage-provider.test.ts tests/cloud-storage.test.ts
```

预期：FAIL，COS provider 模块不存在。

- [ ] **步骤 4：实现 Provider 与工厂选择**

`createCosStorageProvider` 只接受已验证配置和注入 client；生产包装器负责创建 SDK。`storage.ts` 按 `storageProvider` 选择：

```ts
if (config.storageProvider === "cos") {
  return createCloudStorageService({
    bucket: config.cosBucket,
    provider: createCosStorageProviderFromConfig(config),
  });
}

return createSupabaseStorageService(config);
```

保留 `{userId}/{bookId}/original.txt` 权威对象键，不改 migration 或 cleanup intent。

- [ ] **步骤 5：验证**

```bash
node --experimental-strip-types --test tests/cos-storage-provider.test.ts tests/cloud-storage.test.ts tests/cloud-storage-cleanup.test.ts tests/cloud-books.test.ts
pnpm lint
pnpm typecheck
```

预期：全部 PASS，错误中不含 SDK 原始响应和密钥。

- [ ] **步骤 6：提交**

```bash
git add package.json pnpm-lock.yaml src/lib/cloud/storage.ts src/lib/cloud/storage-core.ts src/lib/cloud/cos-storage-provider.ts tests/cloud-storage.test.ts tests/cos-storage-provider.test.ts
git commit -m "feat: add Tencent COS object storage"
```

### 任务 4：实现腾讯云短信 Hook 核心

**文件：**
- 创建：`src/server/sms-hook/config.ts`
- 创建：`src/server/sms-hook/hook-core.ts`
- 创建：`tests/sms-hook-config.test.ts`
- 创建：`tests/sms-hook-core.test.ts`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：安装短信 SDK**

```bash
pnpm add tencentcloud-sdk-nodejs-sms@4.1.240 --save-exact
```

- [ ] **步骤 2：编写配置失败测试**

要求完整读取以下键：

```text
SMS_HOOK_SECRET
TENCENTCLOUD_SECRET_ID
TENCENTCLOUD_SECRET_KEY
TENCENT_SMS_SDK_APP_ID
TENCENT_SMS_SIGN_NAME
TENCENT_SMS_TEMPLATE_ID
TENCENT_SMS_REGION
SMS_HOOK_PORT
```

测试生产 secret 长度、端口、广州 region、模板/应用 ID 数字格式，并断言任何错误不包含真实值。

- [ ] **步骤 3：编写 Hook 红灯测试**

按 Standard Webhooks 规则使用 `${webhookId}.${timestamp}.${rawBody}` 做 HMAC-SHA256。覆盖：

- 正确签名与 5 分钟时间窗。
- 旧时间戳、缺失 header、错误签名、重复 JSON key。
- 仅接受 `+86` E.164 手机号和 6 位 OTP。
- provider 只收到手机号与 OTP；结果不包含它们。

测试文件先从 `node:crypto` 导入 `createHmac`。示例：

```ts
function signedHeaders(
  rawBody: string,
  secret: string,
  timestamp: number,
) {
  const webhookId = "msg_test";
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest("base64");
  return new Headers({
    "webhook-id": webhookId,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  });
}

const secret = Buffer.alloc(32, 3).toString("base64");
const now = 1_788_000_000;
const rawBody = JSON.stringify({
  user: { phone: "+8613800000000" },
  sms: { otp: "123456" },
});
const sent: Array<{ phone: string; token: string }> = [];
const result = await handleSendSmsHook({
  rawBody,
  headers: signedHeaders(rawBody, secret, now),
  nowUnixSeconds: now,
  send: async ({ phone, token }) => sent.push({ phone, token }),
});
assert.deepEqual(result, { status: 204, code: "OK" });
```

- [ ] **步骤 4：运行红灯**

```bash
node --experimental-strip-types --test tests/sms-hook-config.test.ts tests/sms-hook-core.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 5：实现纯核心**

配置解析返回判别联合；Hook 核心使用 `timingSafeEqual`，先验签再解析，限制请求体不超过 8 KiB，返回固定 `OK`、`UNAUTHORIZED`、`STALE_REQUEST`、`INVALID_REQUEST`、`PROVIDER_UNAVAILABLE`。

- [ ] **步骤 6：验证并提交**

```bash
node --experimental-strip-types --test tests/sms-hook-config.test.ts tests/sms-hook-core.test.ts
pnpm typecheck
git add package.json pnpm-lock.yaml src/server/sms-hook/config.ts src/server/sms-hook/hook-core.ts tests/sms-hook-config.test.ts tests/sms-hook-core.test.ts
git commit -m "feat: add secure SMS hook core"
```

### 任务 5：实现腾讯云短信 Provider 与 HTTP Server

**文件：**
- 创建：`src/server/sms-hook/tencent-sms-provider.ts`
- 创建：`src/server/sms-hook/server.ts`
- 创建：`src/server/sms-hook/index.ts`
- 创建：`tests/sms-hook-server.test.ts`
- 修改：`package.json`
- 修改：`tsconfig.json`

- [ ] **步骤 1：编写失败的 HTTP 契约测试**

测试文件从 `node:net` 导入 `AddressInfo` 类型。覆盖：

```ts
test("SMS hook authenticates before buffering and never echoes provider details", async () => {
  let providerCalls = 0;
  const dependencies = {
    configured: true,
    hookSecret: Buffer.alloc(32, 7).toString("base64"),
    nowUnixSeconds: () => 1_788_000_000,
    send: async () => {
      providerCalls += 1;
    },
  };
  const largeBody = JSON.stringify({
    phone: "+8613800000000",
    token: "123456",
    padding: "x".repeat(9_000),
  });
  const server = createSmsHookServer(dependencies);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;
  try {
    const unauthorized = await fetch(`${origin}/hooks/send-sms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: largeBody,
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(providerCalls, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
```

同时验证 `/health` 只返回 `{status:"ok", configured:true}`、错误方法 405、未知路径 404、合法 Hook 204、SDK 失败 503、日志脱敏。

- [ ] **步骤 2：运行红灯**

```bash
node --experimental-strip-types --test tests/sms-hook-server.test.ts
```

预期：FAIL，server/provider 不存在。

- [ ] **步骤 3：实现腾讯云 SDK 适配**

固定调用 `SendSms`，参数只包含配置中的 `SmsSdkAppId`、`SignName`、`TemplateId`、`PhoneNumberSet` 和单个 OTP 模板参数。只接受腾讯云成功码；其他响应转为内部 `SMS_PROVIDER_FAILED`，不保留原始消息。

- [ ] **步骤 4：实现 Server 与构建命令**

新增脚本：

```json
"sms-hook:dev": "tsx watch src/server/sms-hook/index.ts",
"sms-hook:build": "tsup src/server/sms-hook/index.ts --format esm --platform node --target node22 --out-dir dist/sms-hook --clean",
"sms-hook:start": "node dist/sms-hook/index.js"
```

Server 绑定 `0.0.0.0`，但 Compose 不映射公网端口；支持 SIGTERM 有界关闭。

- [ ] **步骤 5：验证并提交**

```bash
node --experimental-strip-types --test tests/sms-hook-server.test.ts tests/sms-hook-core.test.ts
pnpm sms-hook:build
pnpm lint
pnpm typecheck
git add package.json tsconfig.json src/server/sms-hook tests/sms-hook-server.test.ts
git commit -m "feat: add Tencent SMS hook service"
```

### 任务 6：完成自托管 Supabase 与 Compose 接线

**文件：**
- 修改：`deploy/tencent-cloud/docker-compose.production.yml`
- 修改：`deploy/tencent-cloud/env.example`
- 修改：`deploy/tencent-cloud/kong.yml`
- 修改：`supabase/config.toml`
- 修改：`tests/production-deployment-contract.test.ts`

- [ ] **步骤 1：扩展失败契约测试**

验证 Compose：

- Auth 读取 `GOTRUE_HOOK_SEND_SMS_URI` 和 Hook secret 文件。
- Site URL 与 API external URL 来自 `APP_HOST`、`API_HOST`。
- 生产没有测试 OTP、Studio、Analytics、数据库端口映射。
- Web 使用 `CLOUD_STORAGE_PROVIDER=cos`。
- MCP 与 Hook 只在 `private-net`。
- PostgreSQL 有健康检查、独立卷和停止宽限期。

- [ ] **步骤 2：运行红灯**

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts
```

预期：FAIL，任务 1 的骨架尚未包含完整接线。

- [ ] **步骤 3：补齐生产 Compose**

使用固定 Supabase 镜像标签；实际发布前把所需镜像镜像到 TCR。Auth 与 PostgreSQL 的 secret 通过 Compose secrets 文件挂载。Kong 只路由 `/auth/v1/` 与 `/rest/v1/`，不暴露管理接口。

在 `supabase/config.toml` 注释中明确本地测试 OTP 不参与生产 Compose；不要把生产 Hook secret 写入该文件。

- [ ] **步骤 4：验证**

```bash
node --experimental-strip-types --test tests/production-deployment-contract.test.ts tests/cloud-migration-contract.test.ts
docker compose --env-file deploy/tencent-cloud/env.example -f deploy/tencent-cloud/docker-compose.production.yml config --quiet
git diff --check
```

- [ ] **步骤 5：提交**

```bash
git add deploy/tencent-cloud supabase/config.toml tests/production-deployment-contract.test.ts
git commit -m "feat: wire self-hosted Supabase production stack"
```

### 任务 7：改造公开健康检查与生产 Smoke

**文件：**
- 创建：`src/app/api/health/route.ts`
- 创建：`tests/app-health-route.test.ts`
- 修改：`src/lib/deployment/production-smoke-core.ts`
- 修改：`scripts/production-smoke.mjs`
- 修改：`tests/production-smoke.test.ts`
- 修改：`.env.example`

- [ ] **步骤 1：编写失败测试**

健康接口要求：

```ts
assert.deepEqual(await response.json(), {
  status: "ok",
  configured: true,
  capabilities: { auth: true, storage: true, translation: true },
});
```

不得包含 URL、Bucket、Provider、模型或 secret。生产 Smoke 改为检查：

1. `app-health`
2. `app-home`
3. `supabase-auth`
4. `supabase-rest`
5. `security-headers`

MCP 不再公开，因此不再对公网 `/mcp` 做检查；真实 MCP 和 COS 在受控端到端验收中验证。

- [ ] **步骤 2：运行红灯**

```bash
node --experimental-strip-types --test tests/app-health-route.test.ts tests/production-smoke.test.ts
```

- [ ] **步骤 3：实现接口与 Smoke**

健康接口只解析配置和 provider readiness，不执行昂贵操作。Smoke 仅接受 HTTPS `PRODUCTION_APP_URL`、`PRODUCTION_SUPABASE_URL` 和 100–60000 ms 超时；输出继续只有检查名、HTTP 状态和稳定代码。

- [ ] **步骤 4：验证并提交**

```bash
node --experimental-strip-types --test tests/app-health-route.test.ts tests/production-smoke.test.ts tests/production-deployment-contract.test.ts
pnpm verify:deployment
pnpm lint
pnpm typecheck
git add src/app/api/health/route.ts src/lib/deployment/production-smoke-core.ts scripts/production-smoke.mjs tests/app-health-route.test.ts tests/production-smoke.test.ts .env.example
git commit -m "feat: add domestic production health checks"
```

### 任务 8：TCR 发布与安全回滚脚本

**文件：**
- 创建：`deploy/tencent-cloud/release.sh`
- 创建：`tests/tencent-release-contract.test.ts`
- 修改：`package.json`

- [ ] **步骤 1：编写失败脚本契约**

要求脚本：

- 必须传入 40 位 Git SHA。
- 拒绝 `latest`。
- 先 `docker compose config`。
- 先执行 migration，再更新服务。
- 使用 `docker compose up -d --wait --wait-timeout`。
- 失败时恢复上一份镜像 SHA，但不回滚 migration。
- 不打印环境变量或 secrets。

- [ ] **步骤 2：运行红灯**

```bash
node --experimental-strip-types --test tests/tencent-release-contract.test.ts
```

- [ ] **步骤 3：实现 POSIX shell 发布器**

脚本使用 `set -eu`，不使用 `set -x`。当前与上一 SHA 存放在 root-only 状态文件；写入使用临时文件加原子 rename。所有健康轮询有总超时。

- [ ] **步骤 4：验证并提交**

```bash
node --experimental-strip-types --test tests/tencent-release-contract.test.ts
sh -n deploy/tencent-cloud/release.sh
git diff --check
git add deploy/tencent-cloud/release.sh tests/tencent-release-contract.test.ts package.json
git commit -m "feat: add immutable Tencent release workflow"
```

### 任务 9：更新 CI、运行手册和维护性契约

**文件：**
- 修改：`.github/workflows/ci.yml`
- 修改：`docs/PRODUCTION_RUNBOOK.md`
- 修改：`README.md`
- 修改：`tests/project-maintainability.test.ts`
- 修改：`package.json`

- [ ] **步骤 1：编写失败维护性测试**

要求 CI 包含：

```text
pnpm db:generate
pnpm test
pnpm verify:deployment
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm mcp:translation:build
pnpm sms-hook:build
pnpm build
docker compose ... config --quiet
docker build ... Dockerfile.web
docker build ... Dockerfile.translation-mcp
docker build ... Dockerfile.sms-hook
```

要求运行手册包含腾讯云实名认证、广州、TCR、COS、短信签名/模板、ICP 备案、迁移、快照、加密备份、恢复演练、密钥泄漏和回滚。

- [ ] **步骤 2：运行红灯**

```bash
node --experimental-strip-types --test tests/project-maintainability.test.ts
```

- [ ] **步骤 3：更新 CI 与文档**

CI 只构建镜像，不接触真实腾讯云凭据、不推 TCR。运行手册把需要账户持有人操作的实名认证、备案、短信资质和购买确认单独标识，其余步骤提供精确命令和不含 secret 的验收记录格式。

- [ ] **步骤 4：运行完整本地门禁**

```bash
pnpm db:generate
pnpm test
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm verify:deployment
pnpm mcp:translation:build
pnpm sms-hook:build
pnpm build
docker compose --env-file deploy/tencent-cloud/env.example -f deploy/tencent-cloud/docker-compose.production.yml config --quiet
docker build -f deploy/tencent-cloud/Dockerfile.web .
docker build -f deploy/tencent-cloud/Dockerfile.translation-mcp .
docker build -f deploy/tencent-cloud/Dockerfile.sms-hook .
git diff --check
```

预期：全部退出码 0；仓库无真实 secret。

- [ ] **步骤 5：提交**

```bash
git add .github/workflows/ci.yml docs/PRODUCTION_RUNBOOK.md README.md tests/project-maintainability.test.ts package.json
git commit -m "docs: add Tencent Cloud production runbook"
```

### 任务 10：腾讯云外部资源、真实部署与验收

**外部资源：** 腾讯云账户、广州云服务器、云硬盘、VPC/安全组、TCR、COS、短信、混元、域名、ICP 备案。

- [ ] **步骤 1：账户持有人完成不可代办动作**

完成腾讯云登录与实名认证；确认服务器/域名购买；提交 ICP 备案；提交短信签名与模板材料；完成验证码、CAPTCHA 和付款确认。任何密码、验证码、身份证件、备案材料、短信主体材料和支付信息都不进入聊天、Git 或日志。

- [ ] **步骤 2：创建广州资源**

创建独立 VPC、安全组、4 vCPU/8 GiB 或更高服务器、独立数据盘、TCR 私有命名空间、COS 私有 Bucket、短信应用和混元 API 凭据。资源名称统一使用 `stray-pages-production` 前缀。

- [ ] **步骤 3：加固服务器**

更新系统；创建非 root 运维用户；只启用 SSH key；限制 SSH 来源；安装 Docker/Compose；挂载数据盘；创建 `/etc/stray-pages/` root-only secrets；配置云硬盘快照、COS 加密备份和告警。

- [ ] **步骤 4：镜像与部署**

把固定上游 Supabase/Caddy 镜像镜像到 TCR；构建并推送三个项目镜像的 Git SHA 标签；配置 DNS；备案通过后启用 Caddy HTTPS；执行 `release.sh`。

- [ ] **步骤 5：应用 migration 与平台配置**

应用权威 migration；配置 Auth Site URL、API external URL、Send SMS Hook、JWT 和数据库角色；配置 COS、短信和混元 secrets。禁止 `prisma db push`。

- [ ] **步骤 6：真实验收**

执行：

- 公开生产 smoke。
- 两个真实手机号 OTP。
- 双用户数据库与 COS 隔离。
- TXT 上传、签名下载、删除与 cleanup intent。
- 一章腾讯混元真实翻译。
- 退出/重登数据恢复。
- 被封禁账号 fail closed。
- 容器、Caddy、短信、COS、模型日志 secret 扫描。
- 数据库加密备份和一次恢复演练。

- [ ] **步骤 7：记录证据并推进总计划**

记录 Git SHA、TCR image digest、migration、资源地域、HTTPS 主机名、检查状态和时间；不记录手机号、OTP、JWT、连接串或密钥。只有设计中的 12 项验收证据全部通过，才把总目标第 1 项标为完成并进入第 2 项本地 Supabase/Docker 集成测试与真实浏览器 E2E。

---

## 计划自检映射

- 固定平台、广州地域、TCR、域名和 TLS：任务 1、6、8、10。
- 容器最小权限、网络隔离和公开入口：任务 1、6。
- PostgreSQL、migration、RLS、备份与恢复：任务 6、10。
- COS 私有对象、签名 URL 和 cleanup intent：任务 2、3、10。
- 腾讯云短信与 Supabase Auth Hook：任务 4、5、6、10。
- Next.js、MCP 和腾讯混元：任务 1、6、10。
- 发布、配置、回滚与日志脱敏：任务 7、8、9、10。
- 合规、ICP备案和短信审核：任务 9、10。
- 完整验收证据：任务 9、10。

本计划不实现总目标第 2 至第 10 项的业务能力，只在任务 10 完成后按原顺序进入下一份规格和计划。
