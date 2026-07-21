# 浏览器本地备份选择性恢复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在保持版本 1 加密备份、同账号限制和零上传边界不变的前提下，让用户按五个固定恢复组选择需要整体替换的数据，并只对选中键执行可回滚事务。

**架构：** 恢复核心新增固定组类型、权威组顺序和运行时选择验证，把合法组展开为现有六键顺序后复用快照、写入与反向回滚事务。客户端面板只保存内存中的已选组，检查成功时默认全选，选择变化会撤销确认；备份文件、加密模块和六类解析器完全不改。

**技术栈：** TypeScript、React 19、Next.js 16、Node.js 内置测试运行器、Web Storage 适配层、现有 Tailwind/CSS 变量、pnpm。

---

## 规格与固定约束

- 权威规格：`docs/superpowers/specs/2026-07-21-browser-local-selective-restore-design.md`
- 依赖规格：`docs/superpowers/specs/2026-07-21-browser-local-data-backup-design.md`
- 权威 worktree：`D:\项目\Stray Pages\.worktrees\production-deployment`
- 当前基线提交：`04d3292b80471894abd79f7debce253e8bf98f09`
- 当前分支：`codex/production-deployment`
- 推送目标：`origin main`
- 不修改 `src/lib/backup/local-backup-core.ts`、`src/lib/backup/local-backup-crypto.ts`、备份格式或加密参数。
- 不修改 `package.json`、`pnpm-lock.yaml`，不新增依赖。
- 不发送网络请求，不创建或调用 EdgeOne、Blob、KV、Models、COS、TTS 或其他云/收费资源。
- 选择性恢复只按分类整体替换，不按记录合并。
- 原书和译本始终属于同一个 `library` 恢复组。
- 未选中键必须零读取、零写入、零删除和零回滚。

## 文件结构与职责

### 修改

- `src/lib/backup/local-backup-restore.ts`
  - 定义五个固定恢复组；
  - 对运行时选择输入进行 fail-closed 验证；
  - 按现有六键权威顺序展开选中组；
  - 只对选中键执行快照、整体替换和反向回滚。
- `tests/local-backup-restore.test.ts`
  - 固定组映射、输入顺序、非法选择、零接触、空分类删除和回滚矩阵。
- `src/components/account/local-data-backup-panel.tsx`
  - 保存内存选择；
  - 检查成功后默认全选；
  - 渲染五组可访问复选框；
  - 选择变化撤销确认；
  - 显式把选中组传给恢复核心；
  - 更新成功和失败文案。
- `tests/local-data-backup-ui-contract.test.ts`
  - 固定客户端选择状态、控件、清理、确认门禁和无网络/无持久化合同。
- `src/lib/product-capabilities.ts`
  - 增加 `browserLocalSelectiveRestore: true`；
  - 首页摘要改为“浏览器本地加密备份与按分类同账号恢复”。
- `tests/product-capabilities.test.ts`
  - 固定能力标志和首页文案。
- `README.md`
  - 说明完整或按分类整体替换；
  - 从未实现列表移除选择性恢复，保留自动合并未实现。
- `docs/ROADMAP.md`
  - 更新阶段 14 完成范围。
- `docs/DEV_LOG.md`
  - 记录选择模型、事务边界、TDD 与最终验证证据。
- `tests/current-production-docs.test.ts`
  - 固定按分类整体替换、无自动合并、无云同步的正式文档边界。

### 不创建新的生产模块

现有恢复模块足够专注，选择验证和选中事务属于同一职责。不要拆出新的模块，也不要重构备份核心、加密核心或安全存储适配层。

---

### 任务 1：固定恢复组和 fail-closed 选择验证

**文件：**

- 修改：`tests/local-backup-restore.test.ts`
- 修改：`src/lib/backup/local-backup-restore.ts`

- [ ] **步骤 1：让既有恢复夹具显式传入全组选项**

在恢复模块 import 中加入 `allLocalBackupRestoreGroups`，并把测试夹具改为：

```ts
function restoreInput(storage: LocalStorageAdapter, payload = buildPayload()) {
  return {
    storage,
    payload,
    selectedGroups: allLocalBackupRestoreGroups,
    sourceScopeFingerprint: scope,
    inspectedScopeFingerprint: scope,
    currentScopeFingerprint: scope,
  };
}
```

- [ ] **步骤 2：编写非法选择零存储访问失败测试**

```ts
test("rejects empty, duplicate, unknown, and non-array restore selections without storage access", () => {
  const invalidSelections: unknown[] = [[], ["notes", "notes"], ["unknown"], "notes", null];

  for (const selectedGroups of invalidSelections) {
    const harness = createStorageHarness(buildCurrentValues("invalid-selection"));
    const result = restoreLocalBackup({
      ...restoreInput(harness.storage),
      selectedGroups: selectedGroups as typeof allLocalBackupRestoreGroups,
    });

    assert.deepEqual(result, { ok: false, code: "INVALID_SELECTION" });
    assert.deepEqual(harness.events, []);
  }
});
```

- [ ] **步骤 3：固定作用域验证优先级失败测试**

扩展现有作用域测试，让每次调用同时传入 `selectedGroups: []`。期望仍为：

```ts
{ ok: false, code: "SCOPE_MISMATCH" }
```

并且 `harness.events` 为空，证明作用域校验先于选择校验。

- [ ] **步骤 4：运行聚焦测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
```

预期：FAIL，`allLocalBackupRestoreGroups` 尚未导出，恢复核心也没有 `INVALID_SELECTION` 结果。

- [ ] **步骤 5：实现固定组类型、全组常量和运行时验证**

在 `src/lib/backup/local-backup-restore.ts` 增加：

```ts
export type LocalBackupRestoreGroup =
  | "library"
  | "vocabulary"
  | "sentences"
  | "notes"
  | "readerSelections";

export const allLocalBackupRestoreGroups = [
  "library",
  "vocabulary",
  "sentences",
  "notes",
  "readerSelections",
] as const satisfies readonly LocalBackupRestoreGroup[];
```

结果类型增加 `INVALID_SELECTION`，恢复输入增加：

```ts
selectedGroups: readonly LocalBackupRestoreGroup[];
```

作用域校验之后、构造目标之前执行：

```ts
const selected = validateSelectedRestoreGroups(input.selectedGroups);
if (!selected.ok) return selected;
```

实现运行时验证：

```ts
function validateSelectedRestoreGroups(
  value: unknown,
):
  | { ok: true; groups: ReadonlySet<LocalBackupRestoreGroup> }
  | { ok: false; code: "INVALID_SELECTION" } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: "INVALID_SELECTION" };
  }

  const allowed = new Set<string>(allLocalBackupRestoreGroups);
  const groups = new Set<LocalBackupRestoreGroup>();
  for (const candidate of value) {
    const group = candidate as LocalBackupRestoreGroup;
    if (typeof candidate !== "string" || !allowed.has(candidate) || groups.has(group)) {
      return { ok: false, code: "INVALID_SELECTION" };
    }
    groups.add(group);
  }
  return { ok: true, groups };
}
```

任务 1 暂时保留现有六键全量 `targets`；`selected.groups` 的过滤在任务 2 测试红灯后接入。不要把选择持久化。

- [ ] **步骤 6：运行聚焦测试确认绿灯**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
pnpm typecheck
git diff --check
```

预期：恢复测试全部通过；类型检查退出码 0；差异检查无输出。

- [ ] **步骤 7：提交任务 1**

```powershell
git add src/lib/backup/local-backup-restore.ts tests/local-backup-restore.test.ts
git commit -m "feat: validate selective restore groups (task 1/4)"
```

---

### 任务 2：选中键替换、删除与回滚矩阵

**文件：**

- 修改：`tests/local-backup-restore.test.ts`
- 修改：`src/lib/backup/local-backup-restore.ts`

- [ ] **步骤 1：编写固定映射和权威顺序失败测试**

```ts
test("touches only selected restore groups in authoritative key order", () => {
  const before = buildCurrentValues("selected");
  const harness = createStorageHarness(before);

  assert.deepEqual(
    restoreLocalBackup({
      ...restoreInput(harness.storage),
      selectedGroups: ["notes", "library"],
    }),
    { ok: true },
  );
  assert.deepEqual(harness.events, [
    `read:${actualKey("libraryBooks")}`,
    `read:${actualKey("translations")}`,
    `read:${actualKey("notes")}`,
    `primary:write:${actualKey("libraryBooks")}`,
    `primary:write:${actualKey("translations")}`,
    `primary:write:${actualKey("notes")}`,
  ]);
  for (const dataKey of ["vocabulary", "sentences", "readerSelections"] as const) {
    assert.equal(harness.values.get(actualKey(dataKey)), before.get(actualKey(dataKey)));
    assert.equal(harness.events.some((event) => event.includes(actualKey(dataKey))), false);
  }
});
```

输入顺序故意为笔记、书库，断言仍按原书、译本、笔记执行。

- [ ] **步骤 2：编写单组空分类删除失败测试**

```ts
test("removes an empty selected category without touching unselected categories", () => {
  const payload = buildPayload();
  payload.data.notes = [];
  const before = buildCurrentValues("empty-selected");
  const harness = createStorageHarness(before);

  assert.deepEqual(
    restoreLocalBackup({
      ...restoreInput(harness.storage, payload),
      selectedGroups: ["notes"],
    }),
    { ok: true },
  );
  assert.deepEqual(harness.events, [
    `read:${actualKey("notes")}`,
    `primary:remove:${actualKey("notes")}`,
  ]);
  assert.equal(harness.values.has(actualKey("notes")), false);
});
```

- [ ] **步骤 3：编写选中子集各失败位置回滚测试**

```ts
test("rolls back only attempted selected keys for every selected failure position", () => {
  const selectedDataKeys = ["libraryBooks", "translations", "notes"] as const;

  for (let failureIndex = 0; failureIndex < selectedDataKeys.length; failureIndex += 1) {
    const before = buildCurrentValues(`selected-write-${failureIndex}`);
    const harness = createStorageHarness(before, {
      failPrimaryMutationAt: failureIndex,
      mutateBeforePrimaryFailure: true,
    });

    assert.deepEqual(
      restoreLocalBackup({
        ...restoreInput(harness.storage),
        selectedGroups: ["notes", "library"],
      }),
      { ok: false, code: "WRITE_FAILED", rollback: "complete" },
    );
    assert.deepEqual(harness.values, before);
    assert.deepEqual(
      harness.events.filter((event) => event.startsWith("rollback:")).map(eventKey),
      selectedDataKeys.slice(0, failureIndex + 1).reverse().map(actualKey),
    );
    assert.equal(harness.events.some((event) => event.includes(actualKey("vocabulary"))), false);
  }
});
```

- [ ] **步骤 4：编写选中子集读取失败零写入测试**

```ts
test("stops a selected restore before writes when one selected snapshot read fails", () => {
  for (let failureIndex = 0; failureIndex < 3; failureIndex += 1) {
    const before = buildCurrentValues(`selected-read-${failureIndex}`);
    const harness = createStorageHarness(before, { failReadAt: failureIndex });

    assert.deepEqual(
      restoreLocalBackup({
        ...restoreInput(harness.storage),
        selectedGroups: ["library", "notes"],
      }),
      { ok: false, code: "READ_FAILED" },
    );
    assert.deepEqual(harness.values, before);
    assert.equal(
      harness.events.some((event) => /^(?:primary|rollback):/u.test(event)),
      false,
    );
  }
});
```

- [ ] **步骤 5：运行恢复测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
```

预期：FAIL，合法子集仍会读取和写入全部六个键，空笔记测试也会接触未选中键。

- [ ] **步骤 6：接入五组到六键的固定过滤**

在恢复模块增加：

```ts
const restoreGroupByDataKey: Record<LocalBackupDataKey, LocalBackupRestoreGroup> = {
  libraryBooks: "library",
  translations: "library",
  vocabulary: "vocabulary",
  sentences: "sentences",
  notes: "notes",
  readerSelections: "readerSelections",
};
```

把 `targets` 改为：

```ts
const targets = localBackupStorageEntries
  .filter((entry) => selected.groups.has(restoreGroupByDataKey[entry.dataKey]))
  .map((entry) => ({
    ...entry,
    key: buildScopedLocalStorageKey(entry.baseKey, input.currentScopeFingerprint),
    value: serializeBackupCategory(entry.dataKey, input.payload),
  }));
```

快照、主写入和回滚继续只循环 `targets`/`attempted`。不能按输入组顺序执行，不能读取未选中键做额外验证。

- [ ] **步骤 7：运行备份恢复回归确认绿灯**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts tests/local-backup-crypto.test.ts tests/local-backup-restore.test.ts
pnpm typecheck
git diff --check
```

预期：所有备份核心、加密和恢复测试通过；类型检查退出码 0。

- [ ] **步骤 8：提交任务 2**

```powershell
git add src/lib/backup/local-backup-restore.ts tests/local-backup-restore.test.ts
git commit -m "feat: restore selected local data groups (task 2/4)"
```

---

### 任务 3：“我的”页选择状态、确认门禁与可访问控件

**文件：**

- 修改：`tests/local-data-backup-ui-contract.test.ts`
- 修改：`src/components/account/local-data-backup-panel.tsx`

- [ ] **步骤 1：编写选择状态与显式恢复调用失败合同**

在 `tests/local-data-backup-ui-contract.test.ts` 增加：

```ts
test("defaults every restore group after inspection and passes the explicit selection", () => {
  assert.match(panel, /allLocalBackupRestoreGroups/u);
  assert.match(panel, /selectedRestoreGroups/u);
  assert.match(panel, /setSelectedRestoreGroups\(\[\.\.\.allLocalBackupRestoreGroups\]\)/u);
  assert.match(panel, /selectedGroups:\s*selectedRestoreGroups/u);
});

test("resets confirmation when restore groups change or the candidate is invalidated", () => {
  assert.match(panel, /handleRestoreGroupChange/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /setSelectedRestoreGroups\(\[\]\)/u);
});
```

- [ ] **步骤 2：编写可访问五组 UI 和空选择失败合同**

增加：

```ts
test("renders five accessible restore groups and blocks an empty selection", () => {
  assert.match(panel, /<fieldset/u);
  assert.match(panel, /<legend[^>]*>选择恢复内容<\/legend>/u);
  assert.match(panel, /原书与译本/u);
  assert.match(panel, /词汇/u);
  assert.match(panel, /句子/u);
  assert.match(panel, /笔记/u);
  assert.match(panel, /阅读器收藏/u);
  assert.match(panel, /aria-describedby=/u);
  assert.match(panel, /请至少选择一类要恢复的数据/u);
  assert.match(panel, /selectedRestoreGroups\.length === 0/u);
  assert.match(panel, /我了解恢复会替换所选分类的当前本地数据/u);
  assert.match(panel, /恢复所选数据/u);
  assert.match(panel, /getRestoreGroupCountLabel/u);
  assert.match(panel, /preview\.libraryBooks/u);
  assert.match(panel, /preview\.translations/u);
});
```

扩展既有安全合同，继续拒绝 `fetch(`、`XMLHttpRequest`、`WebSocket`、`localStorage.length`、`localStorage.key(`、上传草稿和云导入标记。

- [ ] **步骤 3：运行 UI 合同确认红灯**

```powershell
node --experimental-strip-types --test tests/local-data-backup-ui-contract.test.ts
```

预期：FAIL，面板没有 `selectedRestoreGroups`、五组 fieldset 和显式 `selectedGroups` 调用。

- [ ] **步骤 4：引入固定组类型与内存状态**

把恢复 import 改为：

```ts
import {
  allLocalBackupRestoreGroups,
  restoreLocalBackup,
  type LocalBackupRestoreGroup,
} from "@/lib/backup/local-backup-restore";
```

在候选状态附近加入：

```ts
const [selectedRestoreGroups, setSelectedRestoreGroups] = useState<LocalBackupRestoreGroup[]>([]);
```

扩展候选失效函数：

```ts
function invalidateRestoreCandidate() {
  setCandidate(null);
  setSelectedRestoreGroups([]);
  setConfirmed(false);
}
```

解密成功时按顺序建立候选和默认全选：

```ts
setCandidate(decrypted.candidate);
setSelectedRestoreGroups([...allLocalBackupRestoreGroups]);
```

不要把选择写入 localStorage、URL、Cookie 或文件。

- [ ] **步骤 5：实现选择变化和确认撤销**

在组件内加入：

```ts
function handleRestoreGroupChange(group: LocalBackupRestoreGroup, checked: boolean) {
  setSelectedRestoreGroups((current) =>
    checked
      ? allLocalBackupRestoreGroups.filter(
          (candidate) => candidate === group || current.includes(candidate),
        )
      : current.filter((candidate) => candidate !== group),
  );
  setConfirmed(false);
  setRestoreNotice(null);
}
```

这里始终按 `allLocalBackupRestoreGroups` 排序，不能依赖用户点击顺序。

- [ ] **步骤 6：渲染五组可访问控件**

在候选预览计数与确认框之间加入：

```tsx
<fieldset className="mt-5 border-t border-[var(--border)] pt-5">
  <legend className="font-semibold">选择恢复内容</legend>
  <p id="local-restore-library-help" className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
    原书和译本存在关联，会作为一组同时恢复。
  </p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {restoreGroupOptions.map((option) => (
      <label key={option.group} className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--primary)]"
          checked={selectedRestoreGroups.includes(option.group)}
          disabled={restoring}
          aria-describedby={option.group === "library" ? "local-restore-library-help" : undefined}
          onChange={(event) => handleRestoreGroupChange(option.group, event.target.checked)}
        />
        <span>
          <span>{option.label}</span>
          <span className="block text-xs text-[var(--muted-foreground)]">
            {getRestoreGroupCountLabel(option.group, candidate.preview)}
          </span>
        </span>
      </label>
    ))}
  </div>
</fieldset>
```

在组件外定义不可变选项：

```ts
const restoreGroupOptions = [
  { group: "library", label: "原书与译本" },
  { group: "vocabulary", label: "词汇" },
  { group: "sentences", label: "句子" },
  { group: "notes", label: "笔记" },
  { group: "readerSelections", label: "阅读器收藏" },
] as const satisfies ReadonlyArray<{ group: LocalBackupRestoreGroup; label: string }>;
```

增加纯展示 helper，确保原书与译本关联组同时显示两项计数：

```ts
function getRestoreGroupCountLabel(
  group: LocalBackupRestoreGroup,
  preview: LocalBackupPreview,
) {
  switch (group) {
    case "library":
      return `${preview.libraryBooks} 本原书，${preview.translations} 本译本`;
    case "vocabulary":
      return `${preview.vocabulary} 项`;
    case "sentences":
      return `${preview.sentences} 项`;
    case "notes":
      return `${preview.notes} 项`;
    case "readerSelections":
      return `${preview.readerSelections} 项`;
  }
}
```

从备份核心 import `type LocalBackupPreview`。六类独立计数继续保留；不要把正文或指纹复制到选择区域。

- [ ] **步骤 7：实现空选择与确认/执行门禁**

在候选渲染内定义表达式时不要创建新的持久化状态。用：

```tsx
{selectedRestoreGroups.length === 0 ? (
  <p className="mt-4 text-sm text-[var(--muted-foreground)]" role="status">
    请至少选择一类要恢复的数据。
  </p>
) : null}
```

确认框：

```tsx
<input
  type="checkbox"
  checked={confirmed}
  disabled={selectedRestoreGroups.length === 0 || restoring}
  onChange={(event) => setConfirmed(event.target.checked)}
/>
<span>我了解恢复会替换所选分类的当前本地数据</span>
```

恢复 handler 门禁：

```ts
if (!(candidate && confirmed) || selectedRestoreGroups.length === 0 || restoring) return;
```

核心调用增加：

```ts
selectedGroups: selectedRestoreGroups,
```

按钮禁用条件增加 `selectedRestoreGroups.length === 0`，按钮文案改为“恢复所选数据”。

- [ ] **步骤 8：更新稳定结果文案和非法选择映射**

成功：

```text
所选本地数据已恢复。请刷新页面，让相关工作区重新读取数据。
```

完整回滚：

```text
恢复失败，所选分类的原有本地数据已恢复，未完成替换。
```

回滚失败：

```text
恢复失败，且无法完整还原所选分类的原有本地数据。请不要继续编辑，并保留备份文件。
```

在结果判断中为 `INVALID_SELECTION` 增加：

```ts
setRestoreNotice({ message: "恢复范围无效，未写入任何内容。", error: true });
```

恢复结束现有 `finally` 必须继续调用 `invalidateRestoreCandidate()` 和 `clearSelectedFile()`。

- [ ] **步骤 9：运行 UI、恢复与用户文案回归**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts tests/local-data-backup-ui-contract.test.ts tests/user-facing-copy.test.ts tests/app-session.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

预期：全部通过；ESLint 和 TypeScript 退出码 0；普通用户文案不出现内部技术词。

- [ ] **步骤 10：生产构建与本地浏览器验收**

```powershell
pnpm build
```

然后使用开发期 mock auth，只绑定 `127.0.0.1` 启动本地服务器。通过浏览器验证：

1. 桌面视口检查五组默认全选；
2. 取消一个组后确认框自动取消；
3. 取消全部组后确认与恢复按钮禁用，并显示空选择提示；
4. 重新选择组后可以确认；
5. 原书与译本只有一个复选框并显示关联说明；
6. 窄屏为单列且无横向溢出；
7. 控制台无错误；
8. 测试结束后关闭开发服务器并恢复临时环境。

不上传真实备份，不使用真实账号或云端服务；可使用本地 mock 账号和本地生成的测试文件。

- [ ] **步骤 11：提交任务 3**

```powershell
git add src/components/account/local-data-backup-panel.tsx tests/local-data-backup-ui-contract.test.ts
git commit -m "feat: select browser-local restore groups (task 3/4)"
```

---

### 任务 4：能力文档、全量验证、审查、推送与 CI

**文件：**

- 修改：`src/lib/product-capabilities.ts`
- 修改：`tests/product-capabilities.test.ts`
- 修改：`tests/current-production-docs.test.ts`
- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

- [ ] **步骤 1：编写能力矩阵和正式文档失败测试**

在 `tests/product-capabilities.test.ts` 增加：

```ts
assert.equal(localPrototypeCapabilities.browserLocalSelectiveRestore, true);
assert.match(homePrototypeCopy.summary, /浏览器本地加密备份与按分类同账号恢复/u);
```

把旧的 `/浏览器本地加密备份与同账号恢复/` 断言更新为新文案，不同时保留两个互相冲突的摘要断言。

在 `tests/current-production-docs.test.ts` 的备份文档测试中，对 README 和路线图增加：

```ts
assert.match(document, /按分类.*整体替换|选择.*分类.*整体替换/u);
assert.match(document, /原书.*译本.*一组|原书与译本.*关联组/u);
assert.match(document, /自动合并.*未实现|仍未实现.*自动合并/u);
assert.doesNotMatch(document, /选择性恢复.*仍未实现/u);
```

- [ ] **步骤 2：运行文档聚焦测试确认红灯**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
```

预期：FAIL，能力标志和按分类恢复文档尚未更新。

- [ ] **步骤 3：更新能力矩阵和首页摘要**

在 `localPrototypeCapabilities` 增加：

```ts
browserLocalSelectiveRestore: true,
```

首页摘要把：

```text
浏览器本地加密备份与同账号恢复
```

改为：

```text
浏览器本地加密备份与按分类同账号恢复
```

不把自动合并、云端同步或跨账号恢复写成已实现。

- [ ] **步骤 4：更新 README、路线图和开发日志**

README 当前功能说明必须包含：

- 检查成功后可按五个固定恢复组选择；
- 原书与译本是一组；
- 选中分类整体替换，未选中分类不变；
- 文件和口令不上传；
- 自动合并、云端同步和跨账号迁移仍未实现。

README “尚未实现”把：

```text
备份的选择性恢复或自动合并
```

改为只保留：

```text
备份记录的自动合并
```

路线图阶段 14 把“当前只支持六类数据的整体替换”更新为“支持完整或按五组选择后的分类整体替换”，仍保留自动合并未实现。

DEV_LOG 记录：

- 五组映射六键；
- 默认全选；
- 原书与译本不可拆分；
- 未选中键零接触；
- 选中键读取/写入/回滚矩阵；
- UI 空选择和确认撤销；
- 未新增依赖、未调用云资源。

最终测试数量只能在真实全量测试后填写，不能估算。

- [ ] **步骤 5：运行文档绿灯并提交任务 4 功能文档**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
pnpm typecheck
git diff --check
git add src/lib/product-capabilities.ts tests/product-capabilities.test.ts tests/current-production-docs.test.ts README.md docs/ROADMAP.md docs/DEV_LOG.md
git commit -m "docs: document selective local restore (task 4/4)"
```

- [ ] **步骤 6：运行最终全量本地门禁**

必须在最终功能提交后重新运行：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
git diff --check
```

预期：测试 0 失败；其余命令退出码 0。构建只允许仓库既有的多 lockfile 根目录推断和 Edge Runtime 静态生成提示。

- [ ] **步骤 7：运行隐私、网络、依赖和凭据扫描**

```powershell
rg -n "fetch\(|XMLHttpRequest|WebSocket|@edgeone|cos-nodejs|@supabase|tencentcloud|openai|console\.(log|error|warn)" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n "localStorage\.length|localStorage\.key\s*\(|localUploadDraftStorageKey|cloudImportMarkerStorageKey" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n --hidden -g "!node_modules/**" -g "!.next/**" -g "!.git/**" "AKID[A-Za-z0-9]{13,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" .
git diff 04d3292 -- package.json pnpm-lock.yaml
```

前三类扫描预期无匹配；依赖差异预期无输出。若凭据扫描命中测试中的禁止模式或占位符，逐项分类，但不得输出任何真实凭据。

- [ ] **步骤 8：对照规格进行代码审查**

逐项检查：

- 作用域校验先于选择校验；
- 非法选择零存储访问；
- `library` 映射为原书和译本两个连续键；
- 输入组顺序不影响六键权威顺序；
- 未选中键零读取/写入/删除/回滚；
- 空选中分类删除当前键；
- 失败键进入反向回滚；
- 回滚失败继续其余键；
- 候选建立默认全选；
- 选择变化取消确认；
- 空选择禁用确认和恢复；
- 文件变化、取消和恢复结束清除选择；
- UI 不声称合并、跨账号或云同步；
- 备份核心、加密核心、格式和依赖未改。

发现任何缺口时，先补失败测试，再做最小修复，并重新执行步骤 6–8。

- [ ] **步骤 9：记录真实最终证据**

把步骤 6 的真实测试总数、0 失败、其他命令结论、浏览器验收和扫描结果写入 `docs/DEV_LOG.md`：

```powershell
git add docs/DEV_LOG.md
git commit -m "docs: record selective restore verification"
```

如果任务 4 的文档提交已经包含真实最终结果且工作区无差异，不创建空提交。

- [ ] **步骤 10：核对提交范围和干净工作区**

```powershell
git status --short --branch
git log -8 --oneline
git diff 04d3292 --stat
git diff 04d3292 -- package.json pnpm-lock.yaml
```

预期：工作区干净；只有规格允许的恢复、UI、测试和文档文件变化；依赖文件无差异。

- [ ] **步骤 11：推送 GitHub main 并核对 SHA**

```powershell
git push origin HEAD:main
$local = (git rev-parse HEAD).Trim()
$remote = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
if ($local -ne $remote) { throw "local/remote SHA mismatch" }
```

若 GitHub 亚洲 DNS 入口暂时不可达，只允许对 `github.com` 使用命令级 GitHub 官方 IP 解析，并保持 TLS 主机名为 `github.com`；不修改系统 hosts，不使用第三方镜像，不传递凭据给代理站。

- [ ] **步骤 12：监控 GitHub Actions 到最终成功**

通过 GitHub REST API 只读查询最终 SHA 的 workflow run，必须达到：

```text
status=completed
conclusion=success
```

若 CI 失败，读取失败 job/step，在本地复现，回到对应任务按 TDD 修复，重新执行最终门禁后再推送。不得通过删除门禁、跳过测试或放宽零费用验证器让 CI 变绿。

## 完成定义

- 五个固定恢复组可以选择，默认全选；
- `library` 不可拆分地覆盖原书和译本；
- 选中组按六键权威顺序整体替换；
- 未选中键在所有成功和失败路径均零接触；
- 空选择和非法选择在存储访问前拒绝；
- 选择变化撤销确认，候选失效清除选择；
- 成功、读取失败、完整回滚和回滚失败文案准确指向所选分类；
- 无记录合并、跨账号、云同步、新依赖、网络或收费资源；
- 纯逻辑、UI 合同、浏览器验收、全量门禁和扫描全部通过；
- 本地与远端 SHA 一致，GitHub Actions `completed/success`。
