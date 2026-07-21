# 同账号本地学习数据安全导入云端实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `executing-plans` 在当前专用 worktree 中逐任务实现本计划。每个行为变更严格遵循 `test-driven-development`；UI 实现遵循 `impeccable`；提交前使用 `verification-before-completion`、`requesting-code-review` 和 `finishing-a-development-branch`。

**目标：** 把已有本地学习数据导入整理为位于“我的”页的检查、选择、数量预览、确认与安全执行流程，同时修复重复旧作用域读取和完成标记永久阻断。

**架构：** 纯逻辑核心负责固定选择校验、分类过滤、当前来源优先、只含数量的预览和既有清单分块；React 面板只负责两个白名单来源的读取、内存快照、状态失效、执行前复核和可访问交互。服务端导入协议、Session 注入、幂等回执、Blob 写门禁和额度门禁保持不变。

**技术栈：** Next.js 16 App Router、React 19、TypeScript、Node 原生测试、Tailwind CSS、现有安全本地存储与 EdgeOne 服务抽象；不新增依赖。

---

## 文件结构

- 修改 `src/lib/cloud/import-client-core.ts`：新增固定来源/分类选择类型、选择验证、按选择构建清单和只含数量的预览；保留既有稳定 ID、预算、分块和响应校验。
- 修改 `src/components/cloud/cloud-local-import-panel.tsx`：改为检查、选择、预览、确认、执行状态机；只读取当前作用域和历史未分区固定键；执行前比较内存快照。
- 修改 `src/app/me/page.tsx`：解析权威持久化模式，只在云端模式挂载迁移面板。
- 修改 `src/app/study/notes/page.tsx`：移除隐藏的重复迁移入口及不再需要的导入。
- 修改 `tests/cloud-import-client.test.ts`：覆盖选择、分类过滤、来源优先、数量预览和非法选择。
- 修改 `tests/cloud-study-ui-contract.test.ts`：覆盖入口位置、固定来源、固定键、无枚举、无原生弹窗、状态失效、快照复核顺序和本地副本保留。
- 修改 `README.md`：把安全手动学习数据迁移加入当前功能，并明确完整本地同步仍未实现。
- 修改 `docs/ROADMAP.md`：新增阶段 15 及状态，保持原书/译本、自动同步、自动备份和跨账号迁移为未实现。
- 修改 `docs/DEV_LOG.md`：记录设计、TDD、浏览器和最终验证证据；修正最终上线待办中的时态歧义。
- 修改 `src/lib/product-capabilities.ts`：把同账号手动学习数据导入加入当前能力摘要，不扩大为完整同步。
- 创建 `tests/cloud-import-documentation-contract.test.ts`：固定 README、路线图、开发日志和能力摘要的完成/未完成边界。

### 任务 1：固定选择和只含数量的导入预览

**文件：**

- 修改：`src/lib/cloud/import-client-core.ts`
- 测试：`tests/cloud-import-client.test.ts`

- [ ] **步骤 1：编写来源与分类选择的失败测试**

在 `tests/cloud-import-client.test.ts` 增加测试，固定两个允许来源和三个允许分类，并验证空、重复、未知选择在任何哈希工作前拒绝：

```ts
test("rejects empty duplicate and unknown local import selections", async () => {
  const source = localSource("current-supabase-scope", {
    notes: [note("note-1", "current")],
  });

  for (const selection of [
    { sourceOrigins: [], kinds: ["note"] },
    { sourceOrigins: ["current-supabase-scope", "current-supabase-scope"], kinds: ["note"] },
    { sourceOrigins: ["unknown"], kinds: ["note"] },
    { sourceOrigins: ["current-supabase-scope"], kinds: [] },
    { sourceOrigins: ["current-supabase-scope"], kinds: ["note", "note"] },
    { sourceOrigins: ["current-supabase-scope"], kinds: ["reading"] },
  ] as unknown[]) {
    await assert.rejects(
      buildLocalStudyImportManifest({ sources: [source], selection }, manifestId),
      /INVALID_IMPORT_SELECTION/,
    );
  }
});
```

- [ ] **步骤 2：运行聚焦测试并确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-client.test.ts
```

预期：FAIL；`buildLocalStudyImportManifest` 尚不接受 `selection`，也没有 `INVALID_IMPORT_SELECTION`。

- [ ] **步骤 3：实现固定选择类型与前置校验**

在 `src/lib/cloud/import-client-core.ts` 增加：

```ts
export const localStudyImportSourceOrigins = [
  "current-supabase-scope",
  "legacy-unscoped",
] as const;
export const localStudyImportKinds = ["vocabulary", "sentence", "note"] as const;

export type LocalStudyImportSourceOrigin = typeof localStudyImportSourceOrigins[number];
export type LocalStudyImportKind = typeof localStudyImportKinds[number];
export type LocalStudyImportSelection = {
  sourceOrigins: LocalStudyImportSourceOrigin[];
  kinds: LocalStudyImportKind[];
};
```

实现 `parseLocalStudyImportSelection`：输入必须是非空数组、无重复值、只含固定常量；校验在 `buildLocalStudyImportManifest` 的首次 `await` 前完成。保留兼容调用：未提供 `selection` 时选择传入的全部来源与三类数据，让既有调用和测试语义不漂移。

- [ ] **步骤 4：编写分类过滤、来源优先和预览的失败测试**

增加两个测试：

```ts
test("filters selected sources and kinds with current-account precedence", async () => {
  const prepared = await buildLocalStudyImportManifest({
    sources: [
      localSource("current-supabase-scope", {
        vocabulary: [vocabulary("same", "current")],
        notes: [note("current-note", "current")],
      }),
      localSource("legacy-unscoped", {
        vocabulary: [vocabulary("same", "legacy"), vocabulary("legacy-only", "legacy")],
        notes: [note("legacy-note", "legacy")],
      }),
    ],
    selection: {
      sourceOrigins: ["legacy-unscoped", "current-supabase-scope"],
      kinds: ["vocabulary"],
    },
  }, manifestId);

  assert.deepEqual(prepared.items.map((item) => item.payload.explanation), ["current", "legacy"]);
  assert.deepEqual(prepared.items.map((item) => item.kind), ["vocabulary", "vocabulary"]);
});

test("returns a content-free preview for the selected import", async () => {
  const prepared = await buildLocalStudyImportManifest({
    sources: [localSource("current-supabase-scope", {
      vocabulary: [vocabulary("v-1", "secret explanation")],
      notes: [note("n-1", "secret body")],
      readerSelections: { vocabularyTexts: ["orphan"], sentenceTexts: [] },
    })],
    selection: {
      sourceOrigins: ["current-supabase-scope"],
      kinds: ["vocabulary", "note"],
    },
  }, manifestId);

  assert.deepEqual(prepared.preview.totals, { vocabulary: 1, sentence: 0, note: 1 });
  assert.equal(prepared.preview.unresolved, 1);
  assert.equal(JSON.stringify(prepared.preview).includes("secret"), false);
});
```

- [ ] **步骤 5：运行聚焦测试并确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-client.test.ts
```

预期：FAIL；尚未过滤选择、固定当前来源顺序或返回 `preview`。

- [ ] **步骤 6：实现最小过滤和预览**

实现规则：

```ts
const sourceOrder = new Map(localStudyImportSourceOrigins.map((origin, index) => [origin, index]));
const selectedSources = input.sources
  .filter((source) => selection.sourceOrigins.includes(source.origin as LocalStudyImportSourceOrigin))
  .sort((left, right) => sourceOrder.get(left.origin)! - sourceOrder.get(right.origin)!);
```

只进入选中分类循环。把 `sourceCounts` 扩展为三类数量而不是单一总数，并构造只含数字与固定来源 ID 的 `preview`；预览不得引用 `payload`、正文、标题、原始 ID 或原始存储值。阅读器收藏只在其来源被选中时计入 `unresolved`。

- [ ] **步骤 7：运行聚焦测试并确认绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-client.test.ts
```

预期：所有 `cloud-import-client` 测试 PASS。

- [ ] **步骤 8：提交任务 1**

```powershell
git add -- src/lib/cloud/import-client-core.ts tests/cloud-import-client.test.ts
git commit -m "feat: preview selected local study imports (task 1/4)"
```

### 任务 2：实现检查、选择、预览和执行前快照复核

**文件：**

- 修改：`src/components/cloud/cloud-local-import-panel.tsx`
- 修改：`tests/cloud-study-ui-contract.test.ts`

- [ ] **步骤 1：编写安全来源与状态机合同红灯**

把现有“local import”合同拆成独立测试，要求：

```ts
test("local import inspects only current and unscoped fixed sources", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /current-supabase-scope/);
  assert.match(text, /legacy-unscoped/);
  assert.doesNotMatch(text, /legacy-mock-scope/);
  assert.doesNotMatch(text, /deriveLocalStorageScope/);
  assert.match(text, /readScopedLocalStorage/);
  assert.match(text, /readLegacyLocalStorage\(storage, key, null\)/);
  assert.doesNotMatch(text, /localStorage\.length|localStorage\.key\s*\(/);
});

test("local import separates inspection preview confirmation and execution", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /检查本地学习数据/);
  assert.match(text, /生成导入预览/);
  assert.match(text, /我了解本地副本不会删除/);
  assert.match(text, /导入所选数据/);
  assert.doesNotMatch(text, /window\.confirm/);
  assert.match(text, /setPreview\(null\)/);
  assert.match(text, /setConfirmed\(false\)/);
});
```

- [ ] **步骤 2：编写快照复核和标记行为合同红灯**

增加：

```ts
test("local import rechecks snapshots before the first network request", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  const recheck = text.indexOf("recheckSelectedSourceSnapshots");
  const fetchCall = text.indexOf('fetch("/api/cloud/import"');
  assert.ok(recheck >= 0 && fetchCall > recheck);
  assert.match(text, /SOURCE_DATA_CHANGED/);
  assert.match(text, /setPreview\(null\)/);
});

test("completion markers do not permanently block future inspections", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /writeScopedLocalStorage\(cloudImportMarkerStorageKey/);
  assert.doesNotMatch(text, /existingMarker[\s\S]{0,500}return;/);
  assert.doesNotMatch(text, /removeScopedLocalStorage|localStorage\.removeItem/);
});
```

- [ ] **步骤 3：运行 UI 合同并确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-study-ui-contract.test.ts
```

预期：FAIL；旧面板仍读取重复 Mock 来源、使用 `window.confirm`、没有内存快照复核和显式状态机。

- [ ] **步骤 4：拆分固定读取与解析助手**

在面板文件中定义固定描述，不接受调用方动态键：

```ts
const sourceDefinitions = [
  { origin: "current-supabase-scope", label: "当前账号本地数据", historical: false },
  { origin: "legacy-unscoped", label: "历史未分区数据", historical: true },
] as const;

type SourceSnapshot = {
  origin: LocalStudyImportSourceOrigin;
  rawValues: readonly [string | null, string | null, string | null, string | null];
};
```

`readImportSources()` 只对 `keys` 做 `map`；当前来源使用 `readScopedLocalStorage`，历史来源使用 `readLegacyLocalStorage(storage, key, null)`。任一读失败或解析失败时返回稳定错误码，不构造部分候选。

- [ ] **步骤 5：实现检查与选择状态**

使用专注状态而不是把所有流程塞进一个 `busy`：

```ts
const [inspection, setInspection] = useState<ImportInspection | null>(null);
const [selectedOrigins, setSelectedOrigins] = useState<LocalStudyImportSourceOrigin[]>([]);
const [selectedKinds, setSelectedKinds] = useState<LocalStudyImportKind[]>(["vocabulary", "sentence", "note"]);
const [preview, setPreview] = useState<PreparedPreview | null>(null);
const [confirmed, setConfirmed] = useState(false);
const [phase, setPhase] = useState<"idle" | "inspecting" | "previewing" | "importing">("idle");
```

检查成功默认只选择有合法或无法映射记录的当前来源；历史来源无论是否有数据都不自动选择。任何来源或分类切换都调用统一 `invalidatePreview()` 清除预览、确认和旧执行结果。

- [ ] **步骤 6：实现数量预览和可访问控件**

使用两个 `fieldset` 展示来源与分类，复用现有边框、背景、间距和按钮 token。预览区只渲染 `prepared.preview` 中的数字。控件要求：

- 每个 `fieldset` 有 `legend`；
- 历史来源旁明确标注“默认不选”；
- `role="status"` 用于普通结果，`role="alert"` 用于失败；
- `aria-describedby` 关联选择说明与确认说明；
- `phase !== "idle"` 时锁定会改变候选的控件；
- 不使用弹窗、表格正文样例或会泄露内容的调试输出。

- [ ] **步骤 7：实现执行前快照复核**

实现纯比较助手：

```ts
function snapshotsMatch(
  expected: SourceSnapshot[],
  actual: SourceSnapshot[],
  selectedOrigins: LocalStudyImportSourceOrigin[],
) {
  return selectedOrigins.every((origin) => {
    const left = expected.find((source) => source.origin === origin)?.rawValues;
    const right = actual.find((source) => source.origin === origin)?.rawValues;
    return left !== undefined && right !== undefined && left.every((value, index) => value === right[index]);
  });
}
```

`recheckSelectedSourceSnapshots()` 重新调用同一个固定读取函数。读取失败或比较失败时抛出/返回 `SOURCE_DATA_CHANGED`，在 `fetch` 之前清除预览与确认。不要比较解析后的 JSON，因为规范化可能隐藏原始存储变化。

- [ ] **步骤 8：接回既有分块执行和非阻断标记**

复用 `runImportChunks(preview.items, ...)`。删除标记前置 `return`，只在完整结果且 `preview.unresolved === 0`、`preview.localErrors === 0` 时写入当前账号作用域标记。标记仅含版本、最近批次 ID、批次数、完成时间和数字统计，不含来源选择、预览、快照或正文。

网络/服务端前置失败保留预览供重试；成功或源变化清除预览。所有路径保持源数据不变。

- [ ] **步骤 9：运行聚焦测试并确认绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-client.test.ts tests/cloud-study-ui-contract.test.ts
```

预期：两组测试全部 PASS。

- [ ] **步骤 10：运行静态隐私扫描**

运行：

```powershell
rg -n "legacy-mock-scope|deriveLocalStorageScope|window\.confirm|localStorage\.(length|key)|console\.(log|debug|info|warn|error)|removeScopedLocalStorage|localStorage\.removeItem" src/components/cloud/cloud-local-import-panel.tsx
```

预期：无匹配。

- [ ] **步骤 11：提交任务 2**

```powershell
git add -- src/components/cloud/cloud-local-import-panel.tsx tests/cloud-study-ui-contract.test.ts
git commit -m "feat: inspect local study imports safely (task 2/4)"
```

### 任务 3：把迁移入口集中到“我的”页

**文件：**

- 修改：`src/app/me/page.tsx`
- 修改：`src/app/study/notes/page.tsx`
- 修改：`tests/cloud-study-ui-contract.test.ts`

- [ ] **步骤 1：编写入口位置与云端门禁红灯**

增加：

```ts
test("mounts local-to-cloud migration only from the authenticated cloud account page", () => {
  const mePage = source("src/app/me/page.tsx");
  const notesPage = source("src/app/study/notes/page.tsx");

  assert.match(mePage, /resolveCloudPersistenceMode\(getCloudServerConfig\(\)\)/);
  assert.match(mePage, /persistence === "cloud"/);
  assert.match(mePage, /<CloudLocalImportPanel\s*\/>/);
  assert.match(mePage, /<AppShell requireAuth>/);
  assert.doesNotMatch(notesPage, /CloudLocalImportPanel/);
});
```

- [ ] **步骤 2：运行合同并确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-study-ui-contract.test.ts
```

预期：FAIL；入口仍位于笔记页，“我的”页没有权威持久化模式判断。

- [ ] **步骤 3：移动入口并保持服务端边界**

在 `MePage` 顶部解析：

```ts
const persistence = resolveCloudPersistenceMode(getCloudServerConfig());
```

在本地备份区之前或之后增加：

```tsx
{persistence === "cloud" ? (
  <section className="mt-8">
    <CloudLocalImportPanel />
  </section>
) : null}
```

不向客户端传 `userId`。删除笔记页中的面板导入与挂载；笔记页保留原有云端数据读取逻辑。

- [ ] **步骤 4：运行聚焦与页面合同测试**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-study-ui-contract.test.ts tests/local-data-backup-ui-contract.test.ts
```

预期：全部 PASS；本地备份仍挂载在受保护“我的”页，迁移入口只在云端模式出现。

- [ ] **步骤 5：运行 lint 与类型检查**

运行：

```powershell
pnpm lint
pnpm typecheck
```

预期：退出码 0。

- [ ] **步骤 6：提交任务 3**

```powershell
git add -- src/app/me/page.tsx src/app/study/notes/page.tsx tests/cloud-study-ui-contract.test.ts
git commit -m "feat: centralize account data migration (task 3/4)"
```

### 任务 4：同步能力文档、浏览器验收和完整门禁

**文件：**

- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 视合同需要修改：`src/lib/product-capabilities.ts`
- 视合同需要修改：相应能力矩阵测试

- [ ] **步骤 1：编写文档合同红灯**

在最贴近现有能力矩阵的测试中增加断言，要求 README/路线图明确：

- 当前功能包含“同账号手动导入本地词汇、句子和笔记”；
- 历史未分区数据默认不选；
- 检查和预览零网络，执行前复核源快照；
- 原书、译本、自动同步、云端自动备份和跨账号迁移仍未实现；
- 未完成真实 EdgeOne 免费环境验收。

- [ ] **步骤 2：运行文档合同并确认红灯**

运行对应测试文件；如果现有合同没有合适位置，创建 `tests/cloud-import-documentation-contract.test.ts` 并运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-documentation-contract.test.ts
```

预期：FAIL；正式文档尚未描述新的安全流程和剩余边界。

- [ ] **步骤 3：更新 README 与路线图**

README 的“当前可用功能”新增一项同账号手动学习数据导入，强调：

- 只在云端模式可见；
- 当前账号范围默认选中，历史未分区范围需主动选择；
- 本地副本不删除，重复执行由服务端回执去重；
- 这不是原书/译本迁移，也不是自动同步。

路线图新增“阶段 15：同账号本地学习数据安全导入云端”，状态写“代码完成；真实免费环境执行受零费用门禁阻断”。阶段 14 的未实现范围改为更精确的“完整本地书架迁移、自动同步和云端自动备份仍未实现”，不得把手动三类学习数据导入描述成完整同步。

- [ ] **步骤 4：修正文档歧义并记录开发证据**

把 `docs/DEV_LOG.md` 的：

```text
部署已验证 Git SHA，运行真实免费域名 Smoke……
```

改为：

```text
待零费用门禁通过后，部署已验证的 Git SHA，并完成真实免费域名 Smoke……
```

在 2026-07-21 增加本里程碑小节，记录规格、来源修正、TDD 红绿灯、零费用边界、浏览器验收和最终命令的真实结果。最终验证数字只能在命令完成后填写。

- [ ] **步骤 5：运行文档合同并确认绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/cloud-import-documentation-contract.test.ts
```

若合同位于其他既有测试，运行真实文件名。预期：PASS。

- [ ] **步骤 6：启动本地生产等价开发服务并做浏览器验收**

使用不接触真实云资源的本地环境。云端模式所需服务通过仓库既有测试/本地替身配置，不录入真实 Secret，不把 `EDGEONE_FREE_BLOB_CONFIRMED` 改为 `true`。验收：

1. “我的”页入口可发现，笔记页没有重复入口。
2. 默认只选择当前账号来源；历史未分区来源明确默认不选。
3. 检查与预览不产生 `/api/cloud/import` 请求。
4. 选择变化清除预览和确认，空选择不能执行。
5. 预览后修改一个固定测试键，执行前报告源数据变化且没有网络请求。
6. 使用依赖注入/本地可控响应验证完整、部分和网络失败文案，本地源值不变。
7. 桌面和工具实际支持的窄屏视口无水平溢出；若视口能力未真正生效，记录限制，不虚假声称手机验收完成。
8. 控制台没有产品错误或警告。

- [ ] **步骤 7：运行完整验证门禁**

依次运行并保存退出码与测试计数：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
git diff --check
```

预期：全部退出码 0；生产构建完成全部静态页面；只有仓库已有且已记录的非阻断提示。

- [ ] **步骤 8：运行安全与依赖扫描**

运行：

```powershell
rg -n "legacy-mock-scope|deriveLocalStorageScope|window\.confirm|localStorage\.(length|key)|console\.(log|debug|info|warn|error)|removeScopedLocalStorage|localStorage\.removeItem" src/components/cloud/cloud-local-import-panel.tsx
rg -n "AKID[A-Za-z0-9]|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" . -g '!node_modules' -g '!.next' -g '!pnpm-lock.yaml'
git diff HEAD^ -- package.json pnpm-lock.yaml
```

预期：面板禁用模式与凭据模式无匹配；依赖文件无差异。

- [ ] **步骤 9：更新开发日志中的最终证据**

只写入本次实际观察到的测试数、构建页数、浏览器视口结果、扫描结果和已知警告。不得声称执行了真实 EdgeOne、Blob 或费用验收。

- [ ] **步骤 10：提交任务 4**

```powershell
git add -- README.md docs/ROADMAP.md docs/DEV_LOG.md tests/cloud-import-documentation-contract.test.ts src/lib/product-capabilities.ts
git commit -m "docs: document safe study data migration (task 4/4)"
```

只暂存实际存在且已修改的文件；若能力摘要无需变化，不把它加入提交。

- [ ] **步骤 11：独立代码审查与修复循环**

使用 `requesting-code-review` 审查从规格提交到当前 `HEAD` 的全部差异，按 Critical、Important、Minor 分类。任何发现先编写或补充失败测试，再修复并重新运行聚焦测试与完整门禁；最终审查必须没有 Critical 或 Important。

- [ ] **步骤 12：推送 GitHub main 并监控 CI**

确认工作树干净后：

```powershell
git -c http.curloptResolve=github.com:443:140.82.112.4 -c http.version=HTTP/1.1 push origin HEAD:main
```

通过 GitHub 官方 API 或 `gh` 核对远端 `main` SHA 与本地 `HEAD` 精确一致，监控对应 Actions Run 到 `completed/success`。连接瞬时重置时只重试官方 `github.com` / `api.github.com`，不使用第三方镜像。CI 未成功前不得宣称提交完成。
