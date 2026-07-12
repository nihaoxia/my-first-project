# EdgeOne 永久零费用生产架构实施计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `executing-plans` 在当前会话逐任务执行本计划。每个步骤使用复选框跟踪进度；严格执行 TDD、频繁提交，并在每个任务的验证命令未通过时停止进入下一任务。

**目标：** 将 Stray Pages 从腾讯云付费服务器/Supabase/PostgreSQL/COS/短信生产路径迁移到 EdgeOne Makers 永久免费版，实现用户名密码账号、Blob 强一致权威数据、KV 非权威缓存、免费额度硬停止、免费域名部署，并保证不创建或调用任何收费资源。

**架构：** Next.js 运行在 EdgeOne Makers；Makers Functions 通过 `@edgeone/pages-blob` 强一致读取、强一致列举和 `onlyIfNew` 条件创建保存账号、Session、不可变业务 Revision、索引事件、用量事件及 TXT 对象。EdgeOne KV 只允许缓存可重建列表，不参与认证、授权、所有权、配额或当前版本裁决。现有领域 Service Core 和 Route Core 保持稳定，通过 Provider 组合层选择 EdgeOne Repository；旧 Prisma/Supabase/COS/短信代码保留为本地/历史路径并从生产配置中硬禁用。

**技术栈：** Next.js 16、React 19、TypeScript 6、Node Test、EdgeOne Makers Functions、`@edgeone/pages-blob@0.0.14`、`@noble/hashes@2.2.0`、Web Crypto、不可变 Revision/事件日志、GitHub Actions。

**权威规格：** `docs/superpowers/specs/2026-07-12-edgeone-zero-cost-production-design.md`

---

## 文件结构决策

### 新建的共享 EdgeOne 基础文件

- `src/lib/edgeone/blob-types.ts`：最小 Blob SDK 抽象、强一致选项和可注入测试接口；不导入平台 SDK。
- `src/lib/edgeone/blob-store-core.ts`：键校验、JSON 编解码、强一致读取/列举、条件创建和稳定错误映射。
- `src/lib/edgeone/blob-store.ts`：唯一允许导入 `@edgeone/pages-blob` 的生产包装器。
- `src/lib/edgeone/revisions-core.ts`：不可变 Revision 创建、强一致求叶节点、分支冲突和合并规则。
- `src/lib/edgeone/index-events-core.ts`：不可变增删事件、分页投影和可重建索引。
- `src/lib/edgeone/quota-core.ts`：上传预留、结算、释放、Token 预留和硬停止纯逻辑。
- `src/lib/edgeone/quota.ts`：基于 Blob 事件的生产用量账本。
- `src/lib/edgeone/runtime-config-core.ts`：零费用生产配置解析和收费键拒绝规则。
- `src/lib/edgeone/runtime-config.ts`：服务端配置入口。

### 新建的账号文件

- `src/lib/auth/edgeone-password-core.ts`：用户名规范化、Scrypt 参数、密码与恢复码哈希纯逻辑。
- `src/lib/auth/edgeone-account-core.ts`：账号 Claim、账号 Revision、Session 世代和稳定错误码。
- `src/lib/auth/edgeone-account.ts`：Blob 账号、Session、注册、登录、恢复、退出生产服务。
- `src/lib/auth/edgeone-cookie.ts`：HttpOnly Cookie 的读取、设置和清除。
- `src/lib/auth/auth-service.ts`：按 `AUTH_MODE` 组合 EdgeOne、Supabase 或本地 Mock；生产只允许 EdgeOne。

### 新建的业务 Repository 文件

- `src/lib/cloud/edgeone-books-repository.ts`：实现 `CloudBooksRepository`，使用不可变 Book Revision 和索引事件。
- `src/lib/cloud/edgeone-study-repository.ts`：实现 `CloudStudyRepository`。
- `src/lib/cloud/edgeone-import-repository.ts`：实现 `CloudImportRepository` 和幂等 Receipt。
- `src/lib/cloud/edgeone-translations-repository.ts`：实现 `CloudTranslationRepository`、任务租约 Revision 和幂等 Checkpoint。
- `src/lib/cloud/edgeone-storage-provider.ts`：实现现有 `CloudStorageProvider`，对象统一放入 EdgeOne Blob。
- `src/lib/cloud/service-factory.ts`：唯一的生产 Provider 组合入口；替代各模块自行创建 Prisma 单例。

### 新建的部署文件

- `deploy/edgeone/edgeone.json`：Makers 构建、Functions 和安全响应头配置。
- `deploy/edgeone/env.example`：仅列键名和安全占位值，不含凭据。
- `scripts/verify-zero-cost-production.mjs`：扫描生产配置和构建产物，禁止付费 Provider。
- `scripts/edgeone-smoke.mjs`：真实免费域名 Smoke，不输出敏感信息。
- `docs/EDGEONE_ZERO_COST_RUNBOOK.md`：唯一零费用生产运行手册。

### 主要修改文件

- `package.json`、`pnpm-lock.yaml`：固定 EdgeOne Blob 和密码哈希依赖，增加零费用验证命令。
- `.env.example`：增加 EdgeOne 生产键，明确旧 Tencent/Supabase 键不得用于零费用生产。
- `src/lib/cloud/config.ts`、`src/lib/cloud/server-config-core.ts`：增加 `edgeone` 判别联合和收费键硬拒绝。
- `src/lib/auth/app-session.ts`、`src/lib/auth/app-session-core.ts`：接入 EdgeOne Session。
- `src/app/login/actions.ts`、`src/app/login/page.tsx`：用户名密码注册/登录/恢复码流程，保留本地 Mock 开发入口。
- `src/lib/cloud/books.ts`、`study.ts`、`import.ts`、`translations.ts`、`storage.ts`：改为通过 `service-factory.ts` 组合，不在 EdgeOne 生产路径初始化 Prisma、Supabase 或 COS。
- `src/app/api/health/route.ts`、`scripts/production-smoke.mjs`：改为 EdgeOne Web/Auth/Blob/配额健康边界。
- `docs/PRODUCTION_RUNBOOK.md`：顶部明确旧付费架构已废弃并链接新手册。
- `.github/workflows/ci.yml`：增加零费用门禁和 EdgeOne 构建契约验证。

---

### 任务 1：锁定零费用生产配置与依赖边界

**文件：**

- 创建：`tests/edgeone-runtime-config.test.ts`
- 创建：`tests/zero-cost-production-contract.test.ts`
- 创建：`src/lib/edgeone/runtime-config-core.ts`
- 创建：`src/lib/edgeone/runtime-config.ts`
- 修改：`.env.example`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：安装并固定免费平台依赖**

运行：

```powershell
pnpm add @edgeone/pages-blob@0.0.14 @noble/hashes@2.2.0 --save-exact
```

预期：`package.json` 和 `pnpm-lock.yaml` 只增加上述固定版本，不执行任何云端初始化。

- [ ] **步骤 2：编写失败的生产配置测试**

在 `tests/edgeone-runtime-config.test.ts` 定义以下核心断言：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveEdgeOneRuntimeConfig } from "../src/lib/edgeone/runtime-config-core.ts";

test("zero-cost production accepts only EdgeOne auth, data and Blob", () => {
  assert.deepEqual(resolveEdgeOneRuntimeConfig({
    NODE_ENV: "production",
    AUTH_MODE: "edgeone",
    CLOUD_DATA_PROVIDER: "edgeone",
    CLOUD_STORAGE_PROVIDER: "edgeone",
    EDGEONE_BLOB_STORE: "stray-pages-production",
    EDGEONE_SESSION_SECRET: "x".repeat(64),
  }), {
    ok: true,
    config: {
      authMode: "edgeone",
      dataProvider: "edgeone",
      storageProvider: "edgeone",
      blobStore: "stray-pages-production",
      sessionSecret: "x".repeat(64),
    },
  });
});

test("zero-cost production rejects every paid provider key", () => {
  const result = resolveEdgeOneRuntimeConfig({
    NODE_ENV: "production",
    AUTH_MODE: "edgeone",
    CLOUD_DATA_PROVIDER: "edgeone",
    CLOUD_STORAGE_PROVIDER: "edgeone",
    EDGEONE_BLOB_STORE: "stray-pages-production",
    EDGEONE_SESSION_SECRET: "x".repeat(64),
    COS_BUCKET: "paid-123456",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error.invalidKeys, ["COS_BUCKET"]);
});
```

`tests/zero-cost-production-contract.test.ts` 在本任务先扫描 `.env.example`、`runtime-config-core.ts` 和现有生产脚本中的 Provider 选择，禁止出现 EdgeOne 零费用模式调用创建/购买/发送命令；任务 11 创建 `deploy/edgeone` 后再把该目录加入同一契约：

```ts
assert.doesNotMatch(source, /RunInstances|CreateInstances|SendSms|PutObject.*COS|buy\.cloud\.tencent/i);
assert.doesNotMatch(source, /CLOUD_STORAGE_PROVIDER=(?:cos|supabase)/i);
```

- [ ] **步骤 3：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-runtime-config.test.ts tests/zero-cost-production-contract.test.ts
```

预期：FAIL，`runtime-config-core.ts` 尚不存在且现有配置不认识 EdgeOne Provider。

- [ ] **步骤 4：实现最小判别联合和收费键拒绝**

`runtime-config-core.ts` 的公共类型固定为：

```ts
export type EdgeOneRuntimeConfig = {
  authMode: "edgeone";
  dataProvider: "edgeone";
  storageProvider: "edgeone";
  blobStore: string;
  sessionSecret: string;
};

const FORBIDDEN_PRODUCTION_KEYS = [
  "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "COS_SECRET_ID", "COS_SECRET_KEY",
  "COS_BUCKET", "TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY",
  "TENCENT_SMS_APP_ID", "TENCENT_SMS_SIGN_NAME",
] as const;
```

生产环境必须同时满足三个 Provider 为 `edgeone`、Blob Store 名称合法、Session Secret 至少 64 个字符，并拒绝任何非空收费键。开发环境继续允许既有 Mock 和本地 Supabase 测试配置。

- [ ] **步骤 5：运行配置和既有配置测试**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-runtime-config.test.ts tests/zero-cost-production-contract.test.ts tests/cloud-config.test.ts tests/cloud-server-config.test.ts
```

预期：PASS。

- [ ] **步骤 6：提交配置边界**

```powershell
git add package.json pnpm-lock.yaml .env.example src/lib/edgeone/runtime-config-core.ts src/lib/edgeone/runtime-config.ts src/lib/cloud/config.ts src/lib/cloud/server-config-core.ts tests/edgeone-runtime-config.test.ts tests/zero-cost-production-contract.test.ts
git commit -m "feat: enforce zero-cost EdgeOne production config"
```

---

### 任务 2：实现 Blob 强一致存储与不可变 Revision 内核

**文件：**

- 创建：`tests/edgeone-blob-store.test.ts`
- 创建：`tests/edgeone-revisions.test.ts`
- 创建：`tests/edgeone-index-events.test.ts`
- 创建：`tests/edgeone-kv-cache.test.ts`
- 创建：`src/lib/edgeone/blob-types.ts`
- 创建：`src/lib/edgeone/blob-store-core.ts`
- 创建：`src/lib/edgeone/blob-store.ts`
- 创建：`src/lib/edgeone/revisions-core.ts`
- 创建：`src/lib/edgeone/index-events-core.ts`
- 创建：`src/lib/edgeone/kv-cache-core.ts`
- 创建：`src/lib/edgeone/kv-cache.ts`

- [ ] **步骤 1：编写 Blob 强一致和条件创建失败测试**

测试使用内存 Fake，不调用 EdgeOne：

```ts
test("authoritative reads always request strong consistency", async () => {
  const calls: unknown[] = [];
  const store = createAuthoritativeBlobStore({
    async get(key, options) { calls.push([key, options]); return JSON.stringify({ id: "1" }); },
    async setJSON() {}, async delete() {}, async list() { return { blobs: [] }; },
  });
  assert.deepEqual(await store.getJSON("auth/accounts/a/claim.json"), { id: "1" });
  assert.deepEqual(calls, [["auth/accounts/a/claim.json", { type: "json", consistency: "strong" }]]);
});

test("createJSON maps an existing key to BLOB_ALREADY_EXISTS", async () => {
  const store = createAuthoritativeBlobStore(fakeThatRejectsOnlyIfNew());
  await assert.rejects(() => store.createJSON("x.json", {}), { code: "BLOB_ALREADY_EXISTS" });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-blob-store.test.ts tests/edgeone-revisions.test.ts tests/edgeone-index-events.test.ts tests/edgeone-kv-cache.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现最小 Blob 抽象**

`blob-types.ts` 固定平台边界：

```ts
export type BlobSdkStore = {
  set(key: string, value: string | Uint8Array, options?: { onlyIfNew?: boolean }): Promise<void>;
  setJSON(key: string, value: unknown, options?: { onlyIfNew?: boolean }): Promise<void>;
  get(key: string, options: { type: "json" | "text" | "arrayBuffer"; consistency: "strong" }): Promise<unknown | null>;
  getWithHeaders(key: string, options: { consistency: "strong" }): Promise<{ body: unknown; headers: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix?: string; cursor?: string; paginate?: false; consistency: "strong" }): Promise<{ blobs: Array<{ key: string; etag: string }>; cursor?: string }>;
};
```

`blob-store-core.ts` 只允许 `[a-zA-Z0-9/_\-.]` 键、限制 JSON 尺寸、所有读取/列举强一致、所有权威创建传 `{ onlyIfNew: true }`，并把 SDK 原始错误映射为不含原消息的稳定错误码。

- [ ] **步骤 4：实现不可变 Revision 和索引事件**

`revisions-core.ts` 的核心接口：

```ts
export type Revision<T> = {
  id: string;
  parentIds: string[];
  operationId: string;
  createdAt: string;
  deleted: boolean;
  value: T;
};

export type RevisionState<T> =
  | { kind: "missing" }
  | { kind: "current"; revision: Revision<T> }
  | { kind: "conflict"; leaves: Revision<T>[] };
```

算法必须验证 UUID/时间、拒绝重复 ID、拒绝缺失父节点、只从强一致列举结果构图；多个叶节点返回 `conflict`，不能按时间选最后一条。合并 Revision 的 `parentIds` 必须精确等于当前所有冲突叶节点。

`index-events-core.ts` 使用 `{ id, resourceId, action: "upsert" | "delete", revisionId, createdAt }`，按资源聚合并以强一致 Revision 状态过滤已删除项；缓存只是同一投影的可丢弃副本。

- [ ] **步骤 5：实现并约束 KV 非权威缓存**

`kv-cache-core.ts` 只接受完整列表投影和其 `sourceRevisionSetHash`，缓存值包含生成时间；读取缺失、解析失败或版本集合不匹配时返回 cache miss。公共接口不提供认证、授权、用量或单资源当前版本方法：

```ts
export type EdgeOneListCache = {
  getList<T>(key: string, sourceRevisionSetHash: string): Promise<T[] | null>;
  putList<T>(key: string, sourceRevisionSetHash: string, items: T[]): Promise<void>;
  remove(key: string): Promise<void>;
};
```

`tests/edgeone-kv-cache.test.ts` 必须验证 60 秒陈旧值、坏 JSON 和旧 Hash 都不会参与权威结果；本任务把 `revisions-core.ts` 加入 `tests/zero-cost-production-contract.test.ts` 的禁止导入列表。任务 3 和任务 4 创建 Quota、账号模块时，分别把新模块加入同一禁止导入列表。

- [ ] **步骤 6：实现生产 SDK 包装器**

`blob-store.ts` 是唯一平台导入点：

```ts
import { getStore } from "@edgeone/pages-blob";
import { createAuthoritativeBlobStore } from "./blob-store-core";

export function getAuthoritativeBlobStore(name: string) {
  return createAuthoritativeBlobStore(getStore(name));
}
```

- [ ] **步骤 7：运行 Blob/Revision/KV 缓存测试**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-blob-store.test.ts tests/edgeone-revisions.test.ts tests/edgeone-index-events.test.ts tests/edgeone-kv-cache.test.ts tests/zero-cost-production-contract.test.ts
```

预期：PASS，覆盖单叶、并发双叶、显式合并、删除 Revision、分页列举和错误脱敏。

- [ ] **步骤 8：提交存储内核**

```powershell
git add src/lib/edgeone/blob-types.ts src/lib/edgeone/blob-store-core.ts src/lib/edgeone/blob-store.ts src/lib/edgeone/revisions-core.ts src/lib/edgeone/index-events-core.ts src/lib/edgeone/kv-cache-core.ts src/lib/edgeone/kv-cache.ts tests/edgeone-blob-store.test.ts tests/edgeone-revisions.test.ts tests/edgeone-index-events.test.ts tests/edgeone-kv-cache.test.ts tests/zero-cost-production-contract.test.ts
git commit -m "feat: add strong EdgeOne Blob revision core"
```

---

### 任务 3：实现上传预留和永久免费额度硬停止

**文件：**

- 创建：`tests/edgeone-quota.test.ts`
- 创建：`src/lib/edgeone/quota-core.ts`
- 创建：`src/lib/edgeone/quota.ts`
- 修改：`tests/zero-cost-production-contract.test.ts`

- [ ] **步骤 1：编写失败的配额测试**

```ts
const MIB = 1024 * 1024;

test("each upload reserves the full application upload ceiling", () => {
  assert.deepEqual(reserveUpload({ committed: 700 * MIB, reserved: 0 }, {
    reservationId: "10000000-0000-4000-8000-000000000001",
    maxUploadBytes: 2 * MIB,
  }).reserved, 2 * MIB);
});

test("unknown or inconsistent usage fails closed", () => {
  assert.throws(() => assertFreeCapacity({ state: "unavailable" }, 1), { code: "USAGE_LEDGER_UNAVAILABLE" });
});

test("quota never consumes the final platform-object headroom", () => {
  assert.throws(() => assertFreeCapacity({ state: "ready", committed: 974 * MIB, reserved: 0 }, 2 * MIB), { code: "FREE_QUOTA_EXHAUSTED" });
});
```

应用常量固定为：Blob 官方 1 GiB、平台最大对象余量 25 MiB、应用 TXT 单文件 2 MiB、安全上限不高于 `1 GiB - 25 MiB`。所有预留按 2 MiB 计入，结算后释放差额。

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-quota.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现不可变用量事件**

事件联合固定为：

```ts
export type UsageEvent =
  | { type: "UPLOAD_RESERVED"; id: string; userId: string; bytes: number; at: string }
  | { type: "UPLOAD_COMMITTED"; id: string; reservationId: string; actualBytes: number; at: string }
  | { type: "UPLOAD_RELEASED"; id: string; reservationId: string; at: string }
  | { type: "OBJECT_DELETED"; id: string; objectId: string; bytes: number; at: string }
  | { type: "TOKENS_RESERVED"; id: string; tokens: number; month: string; at: string }
  | { type: "TOKENS_COMMITTED"; id: string; reservationId: string; actualTokens: number; at: string }
  | { type: "TOKENS_RELEASED"; id: string; reservationId: string; at: string };
```

折叠器拒绝未知事件、重复 ID、无预留结算、重复结算、负数和超安全上限；生产服务从 Blob 强一致列举事件，KV 结果不得传入授权方法。扩展 `zero-cost-production-contract`，禁止 `quota-core.ts` 和 `quota.ts` 导入 `kv-cache`。

- [ ] **步骤 4：运行配额测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-quota.test.ts tests/edgeone-blob-store.test.ts
```

预期：PASS。

```powershell
git add src/lib/edgeone/quota-core.ts src/lib/edgeone/quota.ts tests/edgeone-quota.test.ts tests/zero-cost-production-contract.test.ts
git commit -m "feat: add fail-closed free quota ledger"
```

---

### 任务 4：实现用户名密码、恢复码和强一致 Session

**文件：**

- 创建：`tests/edgeone-password.test.ts`
- 创建：`tests/edgeone-account.test.ts`
- 创建：`tests/edgeone-auth-rate-limit.test.ts`
- 创建：`src/lib/auth/edgeone-password-core.ts`
- 创建：`src/lib/auth/edgeone-account-core.ts`
- 创建：`src/lib/auth/edgeone-account.ts`
- 创建：`src/lib/auth/edgeone-cookie.ts`
- 修改：`tests/zero-cost-production-contract.test.ts`

- [ ] **步骤 1：编写失败的密码和账号状态测试**

```ts
test("usernames normalize without exposing the value in Blob keys", () => {
  assert.equal(normalizeUsername("  Reader_01 "), "reader_01");
  assert.match(hashUsername("reader_01", "pepper"), /^[a-f0-9]{64}$/);
});

test("password hashes use fixed scrypt parameters and unique salts", async () => {
  const first = await hashPassword("correct horse battery staple", fixedRandom("a"));
  const second = await hashPassword("correct horse battery staple", fixedRandom("b"));
  assert.notEqual(first.salt, second.salt);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
});

test("concurrent account revisions disable login instead of choosing a winner", () => {
  const state = resolveAccountRevisions([root, passwordResetA, passwordResetB]);
  assert.deepEqual(state.kind, "conflict");
  assert.throws(() => requireLoginableAccount(state), { code: "ACCOUNT_CONFLICT" });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-password.test.ts tests/edgeone-account.test.ts tests/edgeone-auth-rate-limit.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：实现密码与恢复码内核**

使用 `@noble/hashes/scrypt.js`，参数写入记录且设置保守上限防止恶意参数耗尽函数资源：

```ts
export type PasswordHash = {
  algorithm: "scrypt";
  n: 32768;
  r: 8;
  p: 1;
  dkLen: 32;
  salt: string;
  digest: string;
};
```

用户名只允许 3–32 位小写字母、数字和下划线；密码 12–128 个 Unicode 字符；恢复码使用 256 bit 随机值，只展示一次，Blob 只保存 SHA-256 哈希。

- [ ] **步骤 4：实现 Blob 账号服务**

账号流程：根账号 Revision 条件创建 → 用户名 Claim 条件创建 → Session 条件创建。登录错误统一为 `INVALID_CREDENTIALS`；注册冲突为 `USERNAME_UNAVAILABLE`；所有原始 Blob 错误被稳定错误替代。

Session 记录：

```ts
export type EdgeOneSessionRecord = {
  userId: string;
  usernameHash: string;
  generation: number;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
};
```

每次验证强一致读取 Session、Claim 和账号 Revision；世代不匹配、账号冲突、空闲过期或绝对过期都拒绝。退出删除 Session；重置密码创建 `generation + 1` Revision，旧 Session 自动失效。扩展 `zero-cost-production-contract`，禁止全部 EdgeOne 账号模块导入 `kv-cache`。

- [ ] **步骤 5：实现服务端 Cookie 和速率限制**

Cookie 名固定为 `stray_pages_session`，属性固定为 `HttpOnly; Secure; SameSite=Lax; Path=/`，生产禁止通过查询参数或 Local Storage 传 Session。速率事件写入不可变 Blob；登录错误不能区分用户名不存在和密码错误。

- [ ] **步骤 6：运行账号测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-password.test.ts tests/edgeone-account.test.ts tests/edgeone-auth-rate-limit.test.ts
```

预期：PASS。

```powershell
git add src/lib/auth/edgeone-password-core.ts src/lib/auth/edgeone-account-core.ts src/lib/auth/edgeone-account.ts src/lib/auth/edgeone-cookie.ts tests/edgeone-password.test.ts tests/edgeone-account.test.ts tests/edgeone-auth-rate-limit.test.ts tests/zero-cost-production-contract.test.ts
git commit -m "feat: add strong Blob account authentication"
```

---

### 任务 5：接入登录页面、Server Actions 和 App Session

**文件：**

- 创建：`src/lib/auth/auth-service.ts`
- 修改：`src/lib/auth/app-session-core.ts`
- 修改：`src/lib/auth/app-session.ts`
- 修改：`src/lib/auth/mock-user-profile.ts`
- 修改：`src/app/login/actions.ts`
- 修改：`src/app/login/page.tsx`
- 修改：`src/components/app-shell.tsx`
- 修改：`src/app/study/notes/page.tsx`
- 修改：`tests/app-session.test.ts`
- 修改：`tests/login-actions.test.ts`
- 修改：`tests/user-facing-copy.test.ts`
- 修改：`tests/auth-access-policy.test.ts`

- [ ] **步骤 1：把既有登录测试改为用户名密码契约并确认失败**

新 Server Actions 固定为：

```ts
export async function registerAccount(formData: FormData): Promise<void>;
export async function loginAccount(formData: FormData): Promise<void>;
export async function recoverAccount(formData: FormData): Promise<void>;
export async function logoutSession(): Promise<void>;
```

测试必须断言：安全 `next` 跳转、统一凭据错误、恢复成功撤销旧 Session、错误不回显密码/恢复码、生产不调用 `getSupabaseAuthService`、本地 Mock 仍仅在显式开发配置可用。

运行：

```powershell
node --experimental-strip-types --test tests/login-actions.test.ts tests/app-session.test.ts tests/user-facing-copy.test.ts tests/auth-access-policy.test.ts
```

预期：FAIL，页面和 Actions 仍为短信 OTP。

- [ ] **步骤 2：实现统一 Auth Service 和 App Session 组合**

`auth-service.ts` 根据已验证配置返回 EdgeOne 服务；生产遇到 `supabase` 或 `mock` 直接抛稳定配置错误。`app-session.ts` 的 EdgeOne 分支读取 Cookie 并调用强一致 Session 服务。把面向 UI 的 `AppSession.user.phone` 明确迁移为 `AppSession.user.accountLabel`，避免用伪手机号承载用户名：

```ts
type AppSession = { user: { id: string; accountLabel: string }; role: "USER" | "ADMIN" };
```

`mock-session.ts` 可以继续在本地 Mock 内部使用测试手机号，但映射到 AppSession 时只输出脱敏 `accountLabel`。同步修改 `app-shell.tsx`、学习笔记页面、Mock 用户资料和对应测试；生产账号不得填入真实或伪造手机号。

- [ ] **步骤 3：重写登录 UI**

页面提供三个清晰区块：登录、首次注册、恢复账号。注册成功页面只显示一次恢复码，提供复制和“我已保存”确认；恢复码不写入 URL、日志或浏览器持久存储。删除生产短信验证码文案和手机号输入；本地 Mock 提示仅在开发配置显示。

- [ ] **步骤 4：运行登录相关测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/login-actions.test.ts tests/app-session.test.ts tests/user-facing-copy.test.ts tests/auth-access-policy.test.ts tests/mock-user-profile.test.ts
```

预期：PASS。

```powershell
git add src/lib/auth/auth-service.ts src/lib/auth/app-session-core.ts src/lib/auth/app-session.ts src/lib/auth/mock-user-profile.ts src/app/login/actions.ts src/app/login/page.tsx src/components/app-shell.tsx src/app/study/notes/page.tsx tests/login-actions.test.ts tests/app-session.test.ts tests/user-facing-copy.test.ts tests/auth-access-policy.test.ts tests/mock-user-profile.test.ts
git commit -m "feat: replace production SMS login with free accounts"
```

---

### 任务 6：实现 EdgeOne Blob 对象 Provider 与安全上传账本

**文件：**

- 创建：`tests/edgeone-storage-provider.test.ts`
- 创建：`src/lib/cloud/edgeone-storage-provider.ts`
- 创建：`src/lib/cloud/edgeone-download-token-core.ts`
- 创建：`src/app/api/cloud/blob-download/route.ts`
- 修改：`src/lib/cloud/storage-core.ts`
- 修改：`src/lib/cloud/storage.ts`
- 修改：`tests/cloud-storage.test.ts`
- 修改：`tests/cloud-storage-cleanup.test.ts`

- [ ] **步骤 1：编写失败的 Provider 测试**

```ts
test("EdgeOne upload reserves full capacity, creates once, then commits actual bytes", async () => {
  const events: string[] = [];
  const provider = createEdgeOneStorageProvider({
    blob: fakeBlob(events), quota: fakeQuota(events), userId: USER_ID,
  });
  await provider.upload(`${USER_ID}/${BOOK_ID}/original.txt`, new TextEncoder().encode("hello"));
  assert.deepEqual(events, ["reserve:2097152", "create", "commit:5"]);
});

test("EdgeOne download URL never signs another owner's object", async () => {
  await assert.rejects(() => provider.createSignedUrl(`${OTHER_USER}/${BOOK_ID}/original.txt`, 60), { code: "INVALID_OBJECT_PATH" });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-storage-provider.test.ts tests/cloud-storage.test.ts tests/cloud-storage-cleanup.test.ts
```

预期：FAIL，Provider 不存在。

- [ ] **步骤 3：实现对象 Provider**

保持现有 `CloudStorageProvider` 接口，EdgeOne Provider 在服务端小文件路径直接 `set(..., { onlyIfNew: true })`；已有同键对象必须按内容摘要确认幂等，否则返回冲突。EdgeOne Blob 官方 SDK 只提供上传预签名 URL，因此下载固定走 `src/app/api/cloud/blob-download/route.ts`：`createSignedUrl` 返回应用内 HMAC 短期令牌 URL，令牌签名覆盖对象键、到期时间和随机 nonce。Route 校验 HMAC、60 秒有效期、当前强一致 Session 和对象键用户前缀后，使用 Blob 强一致流式读取返回附件；不得生成公开永久 URL。

- [ ] **步骤 4：运行存储测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-storage-provider.test.ts tests/cloud-storage.test.ts tests/cloud-storage-cleanup.test.ts tests/upload-file-policy.test.ts
```

预期：PASS。

```powershell
git add src/lib/cloud/edgeone-storage-provider.ts src/lib/cloud/edgeone-download-token-core.ts src/app/api/cloud/blob-download/route.ts src/lib/cloud/storage-core.ts src/lib/cloud/storage.ts tests/edgeone-storage-provider.test.ts tests/cloud-storage.test.ts tests/cloud-storage-cleanup.test.ts
git commit -m "feat: add quota-safe EdgeOne object storage"
```

---

### 任务 7：实现书籍 Revision Repository

**文件：**

- 创建：`tests/edgeone-books-repository.test.ts`
- 创建：`src/lib/cloud/edgeone-books-repository.ts`
- 修改：`src/lib/cloud/books-core.ts`
- 修改：`src/lib/cloud/books.ts`
- 修改：`tests/cloud-books.test.ts`
- 修改：`tests/cloud-books-route.test.ts`
- 修改：`tests/cloud-reading-concurrency.test.ts`

- [ ] **步骤 1：编写失败的书籍 Repository 契约**

覆盖：创建根 Revision 和索引事件、强一致列表、所有权隔离、元数据更新父 Revision、双分支返回冲突、删除 Revision、重复 `operationId` 幂等、对象上传后元数据失败可恢复。

```ts
test("concurrent metadata updates preserve both branches and surface conflict", async () => {
  await repo.create(rootBook);
  await Promise.all([
    repo.update(USER_ID, BOOK_ID, { title: "A" }),
    repo.update(USER_ID, BOOK_ID, { title: "B" }),
  ]);
  await assert.rejects(() => repo.find(USER_ID, BOOK_ID), { code: "VERSION_CONFLICT" });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-books-repository.test.ts tests/cloud-books.test.ts tests/cloud-books-route.test.ts tests/cloud-reading-concurrency.test.ts
```

预期：FAIL，Repository 不存在。

- [ ] **步骤 3：实现 `CloudBooksRepository`**

`transaction` 和 `withObjectLock` 不伪造数据库事务；它们创建显式 Operation 上下文，所有步骤以同一 `operationId` 写不可变对象。`CloudBooksTransaction` 的 create/delete/cleanup intent 转换为 Revision 与操作步骤。并发冲突映射为现有稳定 `BOOK_UPDATE_FAILED` 或新增可由 Route 映射为 HTTP 409 的 `BOOK_CONFLICT`，不能返回 Blob 原错误。

- [ ] **步骤 4：通过书籍测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-books-repository.test.ts tests/cloud-books.test.ts tests/cloud-books-route.test.ts tests/cloud-reading-concurrency.test.ts tests/cloud-storage-cleanup.test.ts
```

预期：PASS。

```powershell
git add src/lib/cloud/edgeone-books-repository.ts src/lib/cloud/books.ts src/lib/cloud/books-core.ts tests/edgeone-books-repository.test.ts tests/cloud-books.test.ts tests/cloud-books-route.test.ts tests/cloud-reading-concurrency.test.ts
git commit -m "feat: persist cloud books as Blob revisions"
```

---

### 任务 8：实现学习数据和本地导入 Repository

**文件：**

- 创建：`tests/edgeone-study-repository.test.ts`
- 创建：`tests/edgeone-import-repository.test.ts`
- 创建：`src/lib/cloud/edgeone-study-repository.ts`
- 创建：`src/lib/cloud/edgeone-import-repository.ts`
- 修改：`src/lib/cloud/study.ts`
- 修改：`src/lib/cloud/import.ts`
- 修改：`tests/cloud-study.test.ts`
- 修改：`tests/cloud-study-route.test.ts`
- 修改：`tests/cloud-import.test.ts`
- 修改：`tests/cloud-import-route.test.ts`

- [ ] **步骤 1：编写失败的学习数据契约**

覆盖 vocabulary、sentence、note、reading 四类数据的创建、分页、更新、删除、来源所有权验证、阅读进度幂等 Upsert、强一致冲突、用户隔离。

- [ ] **步骤 2：编写失败的导入幂等契约**

```ts
test("same source id and payload hash is skipped without a duplicate write", async () => {
  const first = await repo.importOne(item);
  const second = await repo.importOne(item);
  assert.equal(first.outcome, "created");
  assert.equal(second.outcome, "skipped");
});

test("same source id with another hash reports conflict", async () => {
  await repo.importOne(item);
  assert.equal((await repo.importOne({ ...item, payloadHash: OTHER_HASH })).outcome, "conflict");
});
```

- [ ] **步骤 3：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-study-repository.test.ts tests/edgeone-import-repository.test.ts tests/cloud-study.test.ts tests/cloud-import.test.ts
```

预期：FAIL，Repository 不存在。

- [ ] **步骤 4：实现两个 Repository**

学习记录使用资源 Revision；列表由不可变索引事件重建。Reading Upsert 以 `userId + source object + chapterId` 的哈希作为稳定资源 ID。Import Receipt 使用 `onlyIfNew` 条件创建；相同哈希返回 skipped，不同哈希返回 conflict。批次摘要使用 Revision，失败项保留稳定错误码。

- [ ] **步骤 5：运行相关测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-study-repository.test.ts tests/edgeone-import-repository.test.ts tests/cloud-study.test.ts tests/cloud-study-route.test.ts tests/cloud-import.test.ts tests/cloud-import-route.test.ts tests/cloud-import-normalization.test.ts
```

预期：PASS。

```powershell
git add src/lib/cloud/edgeone-study-repository.ts src/lib/cloud/edgeone-import-repository.ts src/lib/cloud/study.ts src/lib/cloud/import.ts tests/edgeone-study-repository.test.ts tests/edgeone-import-repository.test.ts tests/cloud-study.test.ts tests/cloud-study-route.test.ts tests/cloud-import.test.ts tests/cloud-import-route.test.ts
git commit -m "feat: persist study and imports on EdgeOne"
```

---

### 任务 9：实现翻译任务 Revision、租约和免费 Token 门禁

**文件：**

- 创建：`tests/edgeone-translations-repository.test.ts`
- 创建：`tests/edgeone-translation-quota.test.ts`
- 创建：`src/lib/cloud/edgeone-translations-repository.ts`
- 修改：`src/lib/cloud/translations.ts`
- 修改：`src/lib/cloud/translations-core.ts`
- 修改：`tests/cloud-translations.test.ts`
- 修改：`tests/cloud-translations-route.test.ts`
- 修改：`tests/translation-cost-ledger.test.ts`

- [ ] **步骤 1：编写失败的翻译 Repository 测试**

覆盖 `CloudTranslationRepository` 的全部 11 个方法：列表、查书、创建译本、列任务、claim、批次租约、checkpoint、fail、retry、cancel、reader。每个状态转换创建父 Revision；expected segment index、attempt ID 和 execution ID 不匹配都返回 null/STALE，不覆盖当前状态。

```ts
test("a stale checkpoint cannot overwrite the current task revision", async () => {
  const claimed = await repo.claimTask(claimInput);
  await repo.checkpointTask({ ...checkpoint, attemptId: claimed!.attemptId!, expectedNextSegmentIndex: 0 });
  assert.equal(await repo.checkpointTask({ ...checkpoint, attemptId: claimed!.attemptId!, expectedNextSegmentIndex: 0 }), null);
});
```

- [ ] **步骤 2：编写免费 Token 硬停止测试**

每月官方额度 500,000 Token；应用安全上限固定为 450,000 Token。任务运行前按最坏输入+输出预留；额度未知或不足返回 `FREE_QUOTA_EXHAUSTED`，不得调用 MCP、混元或任何付费 Provider。

- [ ] **步骤 3：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-translations-repository.test.ts tests/edgeone-translation-quota.test.ts tests/cloud-translations.test.ts tests/translation-cost-ledger.test.ts
```

预期：FAIL，Repository 和 Token 门禁不存在。

- [ ] **步骤 4：实现翻译 Repository 和门禁**

把 Prisma Serializable 事务语义转换为条件创建的状态 Revision 和租约 Revision。旧余额/冻结金额逻辑在 `edgeone` 模式中完全禁用；零费用模式只维护 Token 预留、结算和释放。免费模型未明确配置或官方免费状态未确认时，云端翻译能力返回“本地翻译或手动导入可用”，不调用外部 Provider。

- [ ] **步骤 5：运行翻译测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-translations-repository.test.ts tests/edgeone-translation-quota.test.ts tests/cloud-translations.test.ts tests/cloud-translations-route.test.ts tests/translation-cost-ledger.test.ts tests/translation-provider.test.ts
```

预期：PASS。

```powershell
git add src/lib/cloud/edgeone-translations-repository.ts src/lib/cloud/translations.ts src/lib/cloud/translations-core.ts tests/edgeone-translations-repository.test.ts tests/edgeone-translation-quota.test.ts tests/cloud-translations.test.ts tests/cloud-translations-route.test.ts tests/translation-cost-ledger.test.ts
git commit -m "feat: add free-quota EdgeOne translations"
```

---

### 任务 10：统一 Service Factory，确保生产不初始化付费客户端

**文件：**

- 创建：`tests/edgeone-service-factory.test.ts`
- 创建：`src/lib/cloud/service-factory.ts`
- 修改：`src/lib/cloud/config.ts`
- 修改：`src/lib/cloud/server-config-core.ts`
- 修改：`src/lib/cloud/books.ts`
- 修改：`src/lib/cloud/study.ts`
- 修改：`src/lib/cloud/import.ts`
- 修改：`src/lib/cloud/translations.ts`
- 修改：`src/lib/cloud/storage.ts`
- 修改：`src/lib/auth/app-session.ts`
- 修改：`src/app/api/health/route.ts`
- 修改：`tests/app-health-route.test.ts`

- [ ] **步骤 1：编写失败的组合测试**

测试以模块依赖注入证明 `edgeone` 生产分支只创建 Blob、Quota 和 EdgeOne Repository；Prisma、Supabase、COS、短信和 MCP 构造器全部是“调用即失败”的 spy，最终调用数必须为 0。

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-service-factory.test.ts tests/app-health-route.test.ts
```

预期：FAIL，各模块仍自行初始化旧单例。

- [ ] **步骤 3：实现唯一组合入口**

```ts
export type CloudServices = {
  books: ReturnType<typeof createCloudBooksService>;
  study: ReturnType<typeof createCloudStudyService>;
  imports: ReturnType<typeof createCloudImportService>;
  translations: ReturnType<typeof createCloudTranslationsService>;
  auth: EdgeOneAccountService;
  quota: EdgeOneQuotaService;
};
```

`getCloudServices()` 先解析零费用生产配置，再创建一个共享 Blob Store 和 Repository；任何配置错误 fail closed。旧模块改为薄委托，避免循环依赖和重复实例。

健康接口只返回布尔能力和稳定状态：`web`、`auth`、`blob`、`quota`；不得读写测试对象，不得输出 Store 名、Token、账号或供应商原错误。

- [ ] **步骤 4：运行组合和路由测试并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-service-factory.test.ts tests/app-health-route.test.ts tests/cloud-books-route.test.ts tests/cloud-study-route.test.ts tests/cloud-import-route.test.ts tests/cloud-translations-route.test.ts
```

预期：PASS。

```powershell
git add src/lib/cloud/service-factory.ts src/lib/cloud/books.ts src/lib/cloud/study.ts src/lib/cloud/import.ts src/lib/cloud/translations.ts src/lib/cloud/storage.ts src/lib/auth/app-session.ts src/app/api/health/route.ts tests/edgeone-service-factory.test.ts tests/app-health-route.test.ts
git commit -m "refactor: compose free EdgeOne cloud services"
```

---

### 任务 11：增加 EdgeOne 部署契约、零费用运行手册和 Smoke

**文件：**

- 创建：`deploy/edgeone/edgeone.json`
- 创建：`deploy/edgeone/env.example`
- 创建：`scripts/verify-zero-cost-production.mjs`
- 创建：`scripts/edgeone-smoke.mjs`
- 创建：`docs/EDGEONE_ZERO_COST_RUNBOOK.md`
- 创建：`tests/edgeone-deployment-contract.test.ts`
- 创建：`tests/edgeone-smoke.test.ts`
- 修改：`docs/PRODUCTION_RUNBOOK.md`
- 修改：`package.json`
- 修改：`.github/workflows/ci.yml`

- [ ] **步骤 1：编写失败的部署契约**

契约必须验证：Next.js 构建；免费平台域名；安全响应头；无 Docker/TCR/COS/SMS/CVM 发布命令；环境样例只有 EdgeOne 键；Smoke 只访问 `/`、`/api/health`、未认证保护和配额状态；不要求收费域名。

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-deployment-contract.test.ts tests/edgeone-smoke.test.ts tests/zero-cost-production-contract.test.ts
```

预期：FAIL，部署文件不存在。

- [ ] **步骤 3：创建部署配置和验证脚本**

`package.json` 增加：

```json
{
  "scripts": {
    "verify:zero-cost": "node scripts/verify-zero-cost-production.mjs",
    "smoke:edgeone": "node scripts/edgeone-smoke.mjs"
  }
}
```

验证脚本扫描 `deploy/edgeone`、生产环境样例和构建入口，发现任何收费 Provider 键或购买命令即退出 1。Smoke 接受 `EDGEONE_PRODUCTION_ORIGIN`，仅允许 `https:`，限制重定向和响应大小，不输出响应正文。

- [ ] **步骤 4：编写运行手册**

手册必须包含：官方免费政策复核链接；无需信用卡确认；CLI/直接上传；免费域名；Blob/KV 开通；Secret 录入；禁止收费键；首次部署；注册/隔离/上传/冲突/配额验收；回滚；导出；政策变化时立即停止写入；COS 空桶后续删除需单独确认。

旧 `PRODUCTION_RUNBOOK.md` 顶部增加醒目废弃说明，不删除历史内容。

- [ ] **步骤 5：运行部署契约并提交**

运行：

```powershell
node --experimental-strip-types --test tests/edgeone-deployment-contract.test.ts tests/edgeone-smoke.test.ts tests/zero-cost-production-contract.test.ts
pnpm verify:zero-cost
```

预期：全部 PASS。

```powershell
git add deploy/edgeone scripts/verify-zero-cost-production.mjs scripts/edgeone-smoke.mjs docs/EDGEONE_ZERO_COST_RUNBOOK.md docs/PRODUCTION_RUNBOOK.md package.json .github/workflows/ci.yml tests/edgeone-deployment-contract.test.ts tests/edgeone-smoke.test.ts tests/zero-cost-production-contract.test.ts
git commit -m "docs: add free EdgeOne production workflow"
```

---

### 任务 12：完整回归、真实免费环境部署与推送

**文件：**

- 修改：`docs/DEV_LOG.md`
- 修改：`docs/ROADMAP.md`
- 按失败结果修复：仅限本计划涉及的文件

- [ ] **步骤 1：运行全部本地验证**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm db:format
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/postgres'; pnpm db:validate
pnpm build
pnpm mcp:translation:build
pnpm sms-hook:build
pnpm verify:zero-cost
```

预期：所有测试、Lint、TypeScript、Prisma 历史 schema 验证、Next.js 构建和零费用门禁通过。SMS Hook 构建只验证历史代码可编译，不发送短信、不进入 EdgeOne 部署产物。

- [ ] **步骤 2：运行敏感信息和收费路径扫描**

```powershell
rg -n "AKID|SecretId|SecretKey|SMS_SDK_APP_ID|COS_SECRET|DATABASE_URL=.*@|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" . -g '!pnpm-lock.yaml' -g '!.git/**'
pnpm verify:zero-cost
```

预期：没有真实凭据；示例只包含键名和明显占位值；EdgeOne 生产路径不包含收费 Provider。

- [ ] **步骤 3：提交最终文档状态**

```powershell
git add docs/DEV_LOG.md docs/ROADMAP.md
git commit -m "docs: record zero-cost production verification"
```

- [ ] **步骤 4：在 EdgeOne 控制台执行动作前重新核费**

只读打开并核对：

- `https://edgeone.ai/zh/products/pages`
- `https://pages.edgeone.ai/zh/document/limits-and-quotas`
- `https://pages.edgeone.ai/zh/document/pricing-and-plans`

必须确认“免费版本永久提供”“无需信用卡”“商业版定价尚未发布/不自动超额计费”。任一条件不成立则停止，不开通服务。

- [ ] **步骤 5：初始化仅免费的 Makers、Blob 和可选 KV**

在动作发生前确认页面显示 0 元且不要求支付方式；只创建一个 Makers 免费项目和一个 Blob Store。KV 只有在实现的非权威缓存确实启用时才开通。不得创建 COS、CVM、轻量服务器、短信、收费域名或 TCR 企业实例。

- [ ] **步骤 6：部署固定 Git SHA 并执行真实 Smoke**

使用本地 CLI 或直接上传，部署当前 commit SHA。将平台免费域名仅放入当前 PowerShell 环境变量，不写入包含用户信息的日志：

```powershell
$env:EDGEONE_PRODUCTION_ORIGIN = Read-Host '输入刚由 EdgeOne 返回的完整免费 HTTPS 域名'
pnpm smoke:edgeone
```

预期：主页 200；健康接口只显示 `web/auth/blob/quota` 健康；未认证私有 API 返回 401；两个测试账号的数据和对象互相不可见；达到测试安全阈值时写入返回 `FREE_QUOTA_EXHAUSTED`，读取仍可用。

- [ ] **步骤 7：核对云端费用状态**

只读确认：没有付费订单；没有 CVM/轻量/TCR 企业实例；没有短信发送；COS 没有生产对象；EdgeOne 项目仍标记免费。不要通过上传 COS 测试文件来验证。

- [ ] **步骤 8：推送 GitHub 并检查 CI**

```powershell
git status --short --branch
git push origin codex/production-deployment:main
```

预期：推送成功；GitHub Actions 全部通过；远端 `main` 指向本地已验证 SHA。

- [ ] **步骤 9：最终完成检查**

只有以下全部成立才宣布完成：

```text
本地完整验证 PASS
EdgeOne 真实 Smoke PASS
双账号隔离 PASS
Blob 上传/下载/删除 PASS
免费额度硬停止 PASS
费用状态为 0
GitHub CI PASS
远端 main SHA 与已部署 SHA 一致
```

任何一项失败都保持任务未完成，修复必须回到对应任务的失败测试，不得通过启用收费资源绕过。
