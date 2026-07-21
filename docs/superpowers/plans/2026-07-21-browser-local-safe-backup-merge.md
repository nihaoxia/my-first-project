# 浏览器本地备份安全合并实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在版本 1 加密备份、同账号限制和零上传边界不变的前提下，增加以当前数据优先、只补回缺失记录的安全合并，并以数量预览、快照一致性和可回滚事务防止静默覆盖。

**架构：** 新增纯逻辑 `local-backup-merge.ts`，集中维护五组到六键映射、严格当前数据解析、稳定内容比较、笔记重分配、收藏并集、预览统计和大小预算；恢复编排模块复用该计划器实现只读预览和最终事务，页面只保存内存中的候选、选择和合并检查对象。替换模式继续沿用现有事务，备份核心、加密核心、文件格式和依赖完全不改。

**技术栈：** TypeScript、React 19、Next.js 16、Node.js 内置测试运行器、Web Storage 适配层、现有 Tailwind/CSS 变量、pnpm。

---

## 规格与固定约束

- 权威规格：`docs/superpowers/specs/2026-07-21-browser-local-safe-backup-merge-design.md`
- 依赖规格：`docs/superpowers/specs/2026-07-21-browser-local-selective-restore-design.md`
- 权威 worktree：`D:\项目\Stray Pages\.worktrees\production-deployment`
- 当前规格基线提交：`df9d592`（包含初始规格 `f9cbc5e` 与检查生命周期澄清）。
- 当前分支：`codex/production-deployment`
- 推送目标：`origin main`
- 当前数据永远优先；安全合并不覆盖或删除当前记录。
- 默认恢复方式为安全合并；替换模式继续可用。
- 原书与译本始终属于同一个 `library` 组。
- 未选中键必须零读取、零解析、零预算、零写入和零回滚。
- 选中但未变化的键允许读取和解析，不写入或回滚。
- 预览后的选中快照发生变化时必须零写入拒绝。
- 不修改 `src/lib/backup/local-backup-core.ts`、`src/lib/backup/local-backup-crypto.ts`、备份格式或加密参数。
- 不修改 `package.json`、`pnpm-lock.yaml`，不新增依赖。
- 不发送网络请求，不创建或调用 EdgeOne、Blob、KV、Models、COS、TTS 或其他云/收费资源。

## 文件结构与职责

### 创建

- `src/lib/backup/local-backup-merge.ts`
  - 导出恢复组、恢复方式和五组到六键的权威解析；
  - 严格解析选中当前数据；
  - 生成安全合并目标、预览统计和变化键；
  - 实现稳定内容比较、笔记 ID 重分配、阅读器收藏并集和大小预算；
  - 保持纯逻辑，不接触浏览器 API。
- `tests/local-backup-merge.test.ts`
  - 固定所有分类规则、顺序、冲突、错误和预算边界。

### 修改

- `src/lib/backup/local-backup-restore.ts`
  - 从合并模块重导出恢复组类型；
  - 新增恢复方式验证；
  - 新增只读合并预览；
  - 合并执行时校验检查对象和当前快照；
  - 只写实际变化键，并复用反向回滚。
- `tests/local-backup-restore.test.ts`
  - 固定预览零写入、快照变化、变化键写入和回滚矩阵；
  - 迁移既有替换调用为显式 `mode: "replace"`。
- `src/components/account/local-data-backup-panel.tsx`
  - 保存内存恢复方式、合并检查对象和预览中状态；
  - 渲染恢复方式、数量预览、双确认文案和双按钮文案；
  - 区分前置零写入错误与写入尝试后的清理。
- `tests/local-data-backup-ui-contract.test.ts`
  - 固定默认方式、预览、清理、门禁、文案、可访问性和无网络合同。
- `src/lib/product-capabilities.ts`
  - 增加安全合并能力标志并更新首页摘要。
- `tests/product-capabilities.test.ts`
  - 固定能力标志和首页文案。
- `README.md`、`docs/ROADMAP.md`、`docs/DEV_LOG.md`
  - 说明安全合并、当前优先、冲突边界和仍未实现范围。
- `tests/current-production-docs.test.ts`
  - 固定正式文档不再把安全自动合并写成未实现，也不声称云同步或跨账号。

---

### 任务 1：固定恢复方式、选择解析和 ID 记录合并

**文件：**

- 创建：`tests/local-backup-merge.test.ts`
- 创建：`src/lib/backup/local-backup-merge.ts`
- 修改：`src/lib/backup/local-backup-restore.ts`（只迁移并重导出共享类型）

- [ ] **步骤 1：编写固定方式和五组到六键失败测试**

创建 `tests/local-backup-merge.test.ts`，先写：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  allLocalBackupRestoreGroups,
  buildLocalBackupMergePlan,
  resolveLocalBackupRestoreSelection,
  type LocalBackupRestoreMode,
} from "../src/lib/backup/local-backup-merge.ts";
import {
  buildLocalBackupPayload,
  localBackupPayloadByteLimit,
} from "../src/lib/backup/local-backup-core.ts";
import { buildBackupRawValues } from "./local-backup-fixture.ts";

const defaultRestoreMode: LocalBackupRestoreMode = "merge";

test("fixes merge as the default-capable mode and maps groups to authoritative data keys", () => {
  assert.equal(defaultRestoreMode, "merge");
  assert.deepEqual(allLocalBackupRestoreGroups, [
    "library",
    "vocabulary",
    "sentences",
    "notes",
    "readerSelections",
  ]);
  assert.deepEqual(resolveLocalBackupRestoreSelection(["notes", "library"]), {
    ok: true,
    groups: ["library", "notes"],
    dataKeys: ["libraryBooks", "translations", "notes"],
  });
});

test("rejects empty duplicate unknown and non-array selections", () => {
  for (const value of [[], ["notes", "notes"], ["unknown"], "notes", null]) {
    assert.deepEqual(resolveLocalBackupRestoreSelection(value), {
      ok: false,
      code: "INVALID_SELECTION",
    });
  }
});
```

- [ ] **步骤 2：编写当前优先和稳定顺序失败测试**

在同一测试文件加入实际计划断言：

```ts
function backupPayload() {
  const built = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture must build");
  return structuredClone(built.payload);
}

test("keeps current records first and appends backup-only ids in backup order", () => {
  const payload = backupPayload();
  payload.data.vocabulary.push({
    ...payload.data.vocabulary[0],
    id: "vocab-backup-only",
    term: "glow",
  });
  const backupVocabulary = payload.data.vocabulary;
  const currentConflict = { ...backupVocabulary[0], explanation: "当前解释" };
  const currentOnly = { ...backupVocabulary[0], id: "vocab-current-only", term: "current" };
  const currentRawValues = {
    vocabulary: JSON.stringify([currentOnly, currentConflict]),
  };

  const result = buildLocalBackupMergePlan({
    currentRawValues,
    payload,
    selectedGroups: ["vocabulary"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, ["vocabulary"]);
  assert.deepEqual(JSON.parse(result.targetRawValues.vocabulary!), [
    currentOnly,
    currentConflict,
    ...backupVocabulary.slice(1),
  ]);
  assert.deepEqual(result.preview.vocabulary, {
    current: 2,
    backup: backupVocabulary.length,
    added: backupVocabulary.length - 1,
    existing: 0,
    conflictsKeptCurrent: 1,
    rekeyed: 0,
  });
});

test("does not create a target when every selected id is already present", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { sentences: JSON.stringify(payload.data.sentences) },
    payload,
    selectedGroups: ["sentences"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, []);
  assert.deepEqual(result.targetRawValues, {});
  assert.equal(result.preview.sentences?.existing, payload.data.sentences.length);
});
```

- [ ] **步骤 3：编写 library 关联组和异常数据失败测试**

加入：

```ts
test("merges books before translations and preserves every final original-book reference", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { libraryBooks: "[]", translations: "[]" },
    payload,
    selectedGroups: ["library"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys.slice(0, 2), ["libraryBooks", "translations"]);
  const books = JSON.parse(result.targetRawValues.libraryBooks!);
  const translations = JSON.parse(result.targetRawValues.translations!);
  const bookIds = new Set(books.map((book: { id: string }) => book.id));
  assert.equal(
    translations.every((translation: { originalBookId: string }) =>
      bookIds.has(translation.originalBookId),
    ),
    true,
  );
});

test("rejects malformed selected current data duplicate ids and missing books", () => {
  const payload = backupPayload();
  const duplicate = [payload.data.vocabulary[0], payload.data.vocabulary[0]];
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { vocabulary: JSON.stringify(duplicate) },
      payload,
      selectedGroups: ["vocabulary"],
    }),
    { ok: false, code: "CURRENT_DATA_MALFORMED" },
  );
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { libraryBooks: "[]", translations: JSON.stringify(payload.data.translations) },
      payload: { ...payload, data: { ...payload.data, libraryBooks: [], translations: [] } },
      selectedGroups: ["library"],
    }),
    { ok: false, code: "MISSING_ORIGINAL_BOOK" },
  );
  const duplicateBackup = structuredClone(payload);
  duplicateBackup.data.vocabulary.push(duplicateBackup.data.vocabulary[0]);
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { vocabulary: "[]" },
      payload: duplicateBackup,
      selectedGroups: ["vocabulary"],
    }),
    { ok: false, code: "BACKUP_DATA_MALFORMED" },
  );
});
```

- [ ] **步骤 4：运行聚焦测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-merge.test.ts
```

预期：FAIL，`local-backup-merge.ts` 不存在。

- [ ] **步骤 5：实现共享类型、选择解析和 ID 合并骨架**

创建 `src/lib/backup/local-backup-merge.ts`，先固定公共接口：

```ts
import {
  localBackupPayloadByteLimit,
  localBackupStorageEntries,
  type LocalBackupDataKey,
  type LocalBackupPayloadV1,
} from "./local-backup-core.ts";

export type LocalBackupRestoreMode = "merge" | "replace";
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

export type LocalBackupMergeGroupPreview = {
  current: number;
  backup: number;
  added: number;
  existing: number;
  conflictsKeptCurrent: number;
  rekeyed: number;
};

export type LocalBackupMergePlan = {
  preview: Readonly<Partial<Record<LocalBackupRestoreGroup, LocalBackupMergeGroupPreview>>>;
  changedDataKeys: readonly LocalBackupDataKey[];
  targetRawValues: Partial<Record<LocalBackupDataKey, string>>;
};

export type LocalBackupMergeErrorCode =
  | "INVALID_SELECTION"
  | "CURRENT_DATA_MALFORMED"
  | "BACKUP_DATA_MALFORMED"
  | "MISSING_ORIGINAL_BOOK"
  | "MERGED_DATA_TOO_LARGE";

export type LocalBackupMergePlanResult =
  | ({ ok: true } & LocalBackupMergePlan)
  | { ok: false; code: LocalBackupMergeErrorCode };

const restoreGroupByDataKey: Record<LocalBackupDataKey, LocalBackupRestoreGroup> = {
  libraryBooks: "library",
  translations: "library",
  vocabulary: "vocabulary",
  sentences: "sentences",
  notes: "notes",
  readerSelections: "readerSelections",
};

export function resolveLocalBackupRestoreSelection(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: "INVALID_SELECTION" } as const;
  }
  const allowed = new Set<string>(allLocalBackupRestoreGroups);
  const selected = new Set<LocalBackupRestoreGroup>();
  for (const candidate of value) {
    const group = candidate as LocalBackupRestoreGroup;
    if (typeof candidate !== "string" || !allowed.has(candidate) || selected.has(group)) {
      return { ok: false, code: "INVALID_SELECTION" } as const;
    }
    selected.add(group);
  }
  const groups = allLocalBackupRestoreGroups.filter((group) => selected.has(group));
  const dataKeys = localBackupStorageEntries
    .filter((entry) => selected.has(restoreGroupByDataKey[entry.dataKey]))
    .map((entry) => entry.dataKey);
  return { ok: true, groups, dataKeys } as const;
}
```

同一文件实现 `buildLocalBackupMergePlan()`：

- 只解析 `resolveLocalBackupRestoreSelection()` 返回的 `dataKeys`；
- 使用现有各分类 `parse...Result()`；
- 当前原始值必须恰好包含选中数据键；
- 原书、译本、词汇、句子用 `mergeIdRecords()`；
- 当前记录先入结果，备份独有 ID 后入结果；
- 同 ID 用递归排序对象键后的稳定 JSON 比较，分别累加 `existing` 或 `conflictsKeptCurrent`；
- 有新增才写 `targetRawValues`；
- `changedDataKeys` 从 `localBackupStorageEntries` 过滤，不能依赖对象键或选择输入顺序；
- 合并 library 后检查所有译本引用；
- 任务 1 对 notes 和 readerSelections 暂时返回 `CURRENT_DATA_MALFORMED`，任务 2 红灯后补齐。

稳定比较 helper 使用浏览器标准 API：

```ts
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
  });
}
```

- [ ] **步骤 6：从恢复模块重导出共享类型**

在 `src/lib/backup/local-backup-restore.ts` 删除本地组类型、全组常量和映射，改为：

```ts
import {
  allLocalBackupRestoreGroups,
  resolveLocalBackupRestoreSelection,
  type LocalBackupRestoreGroup,
} from "./local-backup-merge.ts";

export {
  allLocalBackupRestoreGroups,
  type LocalBackupRestoreGroup,
} from "./local-backup-merge.ts";
```

把现有 `validateSelectedRestoreGroups()` 替换为 `resolveLocalBackupRestoreSelection()`，`targets` 使用返回的 `dataKeys` 过滤。保持现有导入方 API 不变。

- [ ] **步骤 7：运行绿灯和回归**

```powershell
node --experimental-strip-types --test tests/local-backup-merge.test.ts tests/local-backup-restore.test.ts
pnpm typecheck
git diff --check
```

预期：新合并聚焦测试和全部既有恢复测试通过，TypeScript 退出 0，差异检查无输出。

- [ ] **步骤 8：提交任务 1**

```powershell
git add src/lib/backup/local-backup-merge.ts src/lib/backup/local-backup-restore.ts tests/local-backup-merge.test.ts
git commit -m "feat: plan current-first local backup merges (task 1/5)"
```

---

### 任务 2：笔记重分配、收藏并集和大小预算

**文件：**

- 修改：`tests/local-backup-merge.test.ts`
- 修改：`src/lib/backup/local-backup-merge.ts`

- [ ] **步骤 1：编写笔记冲突重分配失败测试**

```ts
test("rekeys different notes with colliding ids and keeps both records", () => {
  const payload = backupPayload();
  payload.data.notes = [
    { id: "note-local-2", title: "备份冲突", source: "个人笔记", updatedAt: "昨天", content: "备份正文" },
    { id: "note-local-9", title: "备份独有", source: "个人笔记", updatedAt: "昨天", content: "独有正文" },
  ];
  const current = [
    { id: "note-local-2", title: "当前冲突", source: "个人笔记", updatedAt: "刚刚", content: "当前正文" },
    { id: "note-local-10", title: "当前独有", source: "个人笔记", updatedAt: "刚刚", content: "当前内容" },
  ];

  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify(current) },
    payload,
    selectedGroups: ["notes"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(JSON.parse(result.targetRawValues.notes!), [
    ...current,
    { ...payload.data.notes[0], id: "note-local-11" },
    payload.data.notes[1],
  ]);
  assert.deepEqual(result.preview.notes, {
    current: 2,
    backup: 2,
    added: 1,
    existing: 0,
    conflictsKeptCurrent: 0,
    rekeyed: 1,
  });
});

test("deduplicates an identical note without writing", () => {
  const payload = backupPayload();
  const note = payload.data.notes[0];
  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: JSON.stringify([note]) },
    payload: { ...payload, data: { ...payload.data, notes: [note] } },
    selectedGroups: ["notes"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changedDataKeys, []);
  assert.equal(result.preview.notes?.existing, 1);
});
```

- [ ] **步骤 2：编写阅读器收藏稳定并集失败测试**

```ts
test("appends backup-only reader texts without deleting current duplicates", () => {
  const payload = backupPayload();
  payload.data.readerSelections = {
    vocabularyTexts: ["  Alpha  ", "Beta"],
    sentenceTexts: ["Sentence B"],
  };
  const current = {
    vocabularyTexts: ["alpha", "ALPHA", "Current"],
    sentenceTexts: ["Sentence A"],
  };
  const result = buildLocalBackupMergePlan({
    currentRawValues: { readerSelections: JSON.stringify(current) },
    payload,
    selectedGroups: ["readerSelections"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(JSON.parse(result.targetRawValues.readerSelections!), {
    vocabularyTexts: ["alpha", "ALPHA", "Current", "Beta"],
    sentenceTexts: ["Sentence A", "Sentence B"],
  });
  assert.equal(result.preview.readerSelections?.added, 2);
  assert.equal(result.preview.readerSelections?.existing, 1);
});

test("rejects blank current or backup reader text", () => {
  const payload = backupPayload();
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: {
        readerSelections: JSON.stringify({ vocabularyTexts: ["   "], sentenceTexts: [] }),
      },
      payload,
      selectedGroups: ["readerSelections"],
    }),
    { ok: false, code: "CURRENT_DATA_MALFORMED" },
  );
});
```

- [ ] **步骤 3：编写预算和未选中零解析失败测试**

```ts
test("accepts the exact merge budget and rejects one extra byte", () => {
  const payload = backupPayload();
  const note = {
    id: "note-local-2",
    title: "backup",
    source: "local",
    updatedAt: "now",
    content: "",
  };
  const fixedBytes = new TextEncoder().encode(JSON.stringify([note])).byteLength;
  note.content = "x".repeat(localBackupPayloadByteLimit - fixedBytes);
  payload.data.notes = [note];
  const exact = buildLocalBackupMergePlan({
    currentRawValues: { notes: "[]" },
    payload,
    selectedGroups: ["notes"],
  });
  assert.equal(exact.ok, true);

  note.content += "x";
  assert.deepEqual(
    buildLocalBackupMergePlan({
      currentRawValues: { notes: "[]" },
      payload,
      selectedGroups: ["notes"],
    }),
    { ok: false, code: "MERGED_DATA_TOO_LARGE" },
  );
});

test("does not require or inspect raw values for unselected malformed categories", () => {
  const payload = backupPayload();
  const result = buildLocalBackupMergePlan({
    currentRawValues: { notes: "[]" },
    payload,
    selectedGroups: ["notes"],
  });
  assert.equal(result.ok, true);
});
```

- [ ] **步骤 4：运行聚焦测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-merge.test.ts
```

预期：FAIL，任务 1 尚未实现笔记、阅读器收藏和完整预算规则。

- [ ] **步骤 5：实现笔记合并**

在 `local-backup-merge.ts` 增加 `mergeNotes()`：

```ts
function mergeNotes(current: StudyNote[], backup: StudyNote[]) {
  const usedIds = new Set([...current, ...backup].map((note) => note.id));
  let nextNumber = [...usedIds].reduce((highest, id) => {
    const match = /^note-local-(\d+)$/u.exec(id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  const byId = new Map(current.map((note) => [note.id, note]));
  const records = [...current];
  let added = 0;
  let existing = 0;
  let rekeyed = 0;

  for (const incoming of backup) {
    const present = byId.get(incoming.id);
    if (!present) {
      records.push(incoming);
      byId.set(incoming.id, incoming);
      added += 1;
      continue;
    }
    if (stableJson(present) === stableJson(incoming)) {
      existing += 1;
      continue;
    }
    while (usedIds.has(`note-local-${nextNumber}`)) nextNumber += 1;
    const rekeyedNote = { ...incoming, id: `note-local-${nextNumber}` };
    usedIds.add(rekeyedNote.id);
    nextNumber += 1;
    records.push(rekeyedNote);
    rekeyed += 1;
  }
  return { records, added, existing, conflictsKeptCurrent: 0, rekeyed };
}
```

先验证当前和备份 ID 各自唯一；同 ID 冲突重分配后也必须保持最终唯一。

- [ ] **步骤 6：实现阅读器收藏并集**

加入 `mergeReaderSelections()`：

- 拒绝任一 `trim()` 为空的当前或备份文本；
- 当前数组原样复制，不删除内部重复；
- 当前每个规范化文本都加入 `seen`；
- 备份按顺序处理，已见计入 `existing`，未见使用 `trim()` 后文本追加并计入 `added`；
- 词汇文本与句子文本分别使用独立 `seen`；
- 预览 `current`、`backup`、`added`、`existing` 为两类数组数量之和。

- [ ] **步骤 7：实现变化值预算**

计划全部分类后：

```ts
const changedDataKeys = localBackupStorageEntries
  .map(({ dataKey }) => dataKey)
  .filter((dataKey) => targetRawValues[dataKey] !== undefined);
const changedBytes = changedDataKeys.reduce(
  (total, dataKey) => total + new TextEncoder().encode(targetRawValues[dataKey]!).byteLength,
  0,
);
if (changedBytes > localBackupPayloadByteLimit) {
  return { ok: false, code: "MERGED_DATA_TOO_LARGE" };
}
```

无变化时允许 `changedBytes === 0`，返回空目标；合并目标永远是字符串，不产生删除用 `null`。

- [ ] **步骤 8：运行绿灯、类型检查和差异检查**

```powershell
node --experimental-strip-types --test tests/local-backup-merge.test.ts tests/local-backup-core.test.ts
pnpm typecheck
git diff --check
```

预期：合并与备份核心测试全部通过，其余命令退出 0。

- [ ] **步骤 9：提交任务 2**

```powershell
git add src/lib/backup/local-backup-merge.ts tests/local-backup-merge.test.ts
git commit -m "feat: merge notes and reader selections safely (task 2/5)"
```

---

### 任务 3：只读合并预览、快照一致性和可回滚执行

**文件：**

- 修改：`tests/local-backup-restore.test.ts`
- 修改：`src/lib/backup/local-backup-restore.ts`

- [ ] **步骤 1：迁移既有恢复测试为显式替换模式**

修改测试夹具：

```ts
function restoreInput(storage: LocalStorageAdapter, payload = buildPayload()) {
  return {
    mode: "replace" as const,
    storage,
    payload,
    selectedGroups: allLocalBackupRestoreGroups,
    sourceScopeFingerprint: scope,
    inspectedScopeFingerprint: scope,
    currentScopeFingerprint: scope,
  };
}

function buildMergeCurrentValues() {
  const rawValues = {
    libraryBooks: "[]",
    translations: "[]",
    vocabulary: "[]",
    sentences: "[]",
    notes: "[]",
    readerSelections: JSON.stringify({ vocabularyTexts: [], sentenceTexts: [] }),
  } as const;
  return new Map(
    localBackupStorageEntries.map(
      ({ dataKey }) => [actualKey(dataKey), rawValues[dataKey]] as const,
    ),
  );
}
```

现有成功、读取失败、写入失败、回滚和选择子集断言保持不变，证明替换行为未改变。

- [ ] **步骤 2：编写合并预览零写入失败测试**

在恢复测试 import `inspectLocalBackupMerge`，加入：

```ts
test("inspects only selected merge keys without writing", () => {
  const before = buildMergeCurrentValues();
  const harness = createStorageHarness(before);
  const result = inspectLocalBackupMerge({
    storage: harness.storage,
    payload: buildPayload(),
    selectedGroups: ["notes", "library"],
    sourceScopeFingerprint: scope,
    inspectedScopeFingerprint: scope,
    currentScopeFingerprint: scope,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(harness.events, [
    `read:${actualKey("libraryBooks")}`,
    `read:${actualKey("translations")}`,
    `read:${actualKey("notes")}`,
  ]);
  assert.deepEqual(Object.keys(result.inspection.currentRawValues), [
    "libraryBooks",
    "translations",
    "notes",
  ]);
  assert.equal(harness.events.some((event) => /^(?:primary|rollback):/u.test(event)), false);
});
```

- [ ] **步骤 3：编写非法预览和作用域优先级失败测试**

```ts
test("validates merge scope and selection before storage access", () => {
  for (const input of [
    { selectedGroups: [], currentScopeFingerprint: scope },
    { selectedGroups: ["unknown"], currentScopeFingerprint: scope },
    { selectedGroups: [], currentScopeFingerprint: "changed" },
  ] as const) {
    const harness = createStorageHarness(buildMergeCurrentValues());
    const result = inspectLocalBackupMerge({
      storage: harness.storage,
      payload: buildPayload(),
      sourceScopeFingerprint: scope,
      inspectedScopeFingerprint: scope,
      ...input,
    });
    assert.deepEqual(
      result,
      input.currentScopeFingerprint === "changed"
        ? { ok: false, code: "SCOPE_MISMATCH" }
        : { ok: false, code: "INVALID_SELECTION" },
    );
    assert.deepEqual(harness.events, []);
  }
});

test("rejects invalid restore modes and merge inspections before storage access", () => {
  for (const overrides of [
    { mode: "unknown", mergeInspection: undefined },
    { mode: "merge", mergeInspection: null },
    {
      mode: "merge",
      mergeInspection: {
        selectedGroups: ["notes"],
        inspectedScopeFingerprint: scope,
        currentRawValues: {},
        preview: {},
        changedDataKeys: [],
        targetRawValues: {},
      },
    },
  ] as const) {
    const harness = createStorageHarness(buildMergeCurrentValues());
    const result = restoreLocalBackup({
      ...restoreInput(harness.storage),
      selectedGroups: ["notes"],
      ...overrides,
    } as Parameters<typeof restoreLocalBackup>[0]);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.match(result.code, /INVALID_MODE|INVALID_MERGE_INSPECTION/u);
    assert.deepEqual(harness.events, []);
  }
});
```

- [ ] **步骤 4：编写快照变化和只写变化键失败测试**

```ts
test("rejects a changed selected snapshot before writes", () => {
  const payload = buildPayload();
  const harness = createStorageHarness(buildMergeCurrentValues());
  const inspected = inspectLocalBackupMerge({
    ...restoreInput(harness.storage, payload),
    selectedGroups: ["notes"],
  });
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  harness.values.set(actualKey("notes"), JSON.stringify(payload.data.notes));
  harness.events.length = 0;

  assert.deepEqual(
    restoreLocalBackup({
      ...restoreInput(harness.storage),
      mode: "merge",
      selectedGroups: ["notes"],
      mergeInspection: inspected.inspection,
    }),
    { ok: false, code: "CURRENT_DATA_CHANGED" },
  );
  assert.equal(harness.events.some((event) => /^(?:primary|rollback):/u.test(event)), false);
});

test("writes only changed merge keys in authoritative order", () => {
  const payload = buildPayload();
  const before = buildMergeCurrentValues();
  before.set(actualKey("libraryBooks"), JSON.stringify(payload.data.libraryBooks));
  before.set(actualKey("translations"), JSON.stringify(payload.data.translations));
  before.set(actualKey("notes"), "[]");
  const harness = createStorageHarness(before);
  const inspected = inspectLocalBackupMerge({
    ...restoreInput(harness.storage, payload),
    selectedGroups: ["notes", "library"],
  });
  assert.equal(inspected.ok, true);
  if (!inspected.ok) return;
  harness.events.length = 0;

  assert.deepEqual(
    restoreLocalBackup({
      ...restoreInput(harness.storage, payload),
      mode: "merge",
      selectedGroups: ["notes", "library"],
      mergeInspection: inspected.inspection,
    }),
    { ok: true },
  );
  assert.deepEqual(harness.events.filter((event) => event.startsWith("primary:")), [
    `primary:write:${actualKey("notes")}`,
  ]);
});
```

- [ ] **步骤 5：编写合并变化键回滚矩阵失败测试**

构造 library 和 notes 均有新增的检查结果，对每个变化键主写入失败位置循环，断言：

```ts
assert.deepEqual(result, {
  ok: false,
  code: "WRITE_FAILED",
  rollback: "complete",
});
assert.deepEqual(harness.values, before);
assert.deepEqual(
  harness.events.filter((event) => event.startsWith("rollback:")).map(eventKey),
  changedDataKeys.slice(0, failureIndex + 1).reverse().map(actualKey),
);
assert.equal(harness.events.some((event) => event.includes(actualKey("vocabulary"))), false);
```

另加一个 `failRollbackKey` 组合，证明回滚失败后仍继续其余变化键。

- [ ] **步骤 6：运行恢复测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
```

预期：FAIL，恢复模块尚无 `mode`、`inspectLocalBackupMerge()`、检查对象和快照一致性。

- [ ] **步骤 7：定义只读检查对象和结果类型**

在恢复模块增加：

```ts
export type LocalBackupMergeInspection = {
  selectedGroups: readonly LocalBackupRestoreGroup[];
  inspectedScopeFingerprint: string;
  currentRawValues: Partial<Record<LocalBackupDataKey, string | null>>;
  preview: LocalBackupMergePlan["preview"];
  changedDataKeys: readonly LocalBackupDataKey[];
  targetRawValues: Partial<Record<LocalBackupDataKey, string>>;
};

export type LocalBackupMergeInspectionResult =
  | { ok: true; inspection: LocalBackupMergeInspection }
  | {
      ok: false;
      code:
        | "SCOPE_MISMATCH"
        | "INVALID_SELECTION"
        | "READ_FAILED"
        | "CURRENT_DATA_MALFORMED"
        | "BACKUP_DATA_MALFORMED"
        | "MISSING_ORIGINAL_BOOK"
        | "MERGED_DATA_TOO_LARGE";
    };

type RestoreScopeInput = {
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
  currentScopeFingerprint: string;
};

type MergeInspectionInput = RestoreScopeInput & {
  storage: LocalStorageAdapter;
  payload: LocalBackupPayloadV1;
  selectedGroups: readonly LocalBackupRestoreGroup[];
};

type CommonRestoreInput = MergeInspectionInput;

function validateRestoreScope(input: RestoreScopeInput) {
  return !input.currentScopeFingerprint ||
    input.sourceScopeFingerprint !== input.currentScopeFingerprint ||
    input.inspectedScopeFingerprint !== input.currentScopeFingerprint
    ? ({ ok: false, code: "SCOPE_MISMATCH" } as const)
    : ({ ok: true } as const);
}
```

- [ ] **步骤 8：实现只读 `inspectLocalBackupMerge()`**

实现顺序必须是：作用域 → 选择 → 目标键 → 逐键安全读取 → 纯计划。返回检查对象时复制数组和普通对象，不能暴露可变内部集合。

```ts
export function inspectLocalBackupMerge(input: MergeInspectionInput): LocalBackupMergeInspectionResult {
  const scope = validateRestoreScope(input);
  if (!scope.ok) return scope;
  const selected = resolveLocalBackupRestoreSelection(input.selectedGroups);
  if (!selected.ok) return selected;
  const currentRawValues: Partial<Record<LocalBackupDataKey, string | null>> = {};
  for (const dataKey of selected.dataKeys) {
    const entry = localBackupStorageEntries.find((candidate) => candidate.dataKey === dataKey)!;
    const key = buildScopedLocalStorageKey(entry.baseKey, input.currentScopeFingerprint);
    const read = safeReadLocalStorage(input.storage, key);
    if (!read.ok) return { ok: false, code: "READ_FAILED" };
    currentRawValues[dataKey] = read.value;
  }
  const plan = buildLocalBackupMergePlan({
    currentRawValues,
    payload: input.payload,
    selectedGroups: selected.groups,
  });
  if (!plan.ok) return plan;
  return {
    ok: true,
    inspection: {
      selectedGroups: [...selected.groups],
      inspectedScopeFingerprint: input.currentScopeFingerprint,
      currentRawValues,
      preview: plan.preview,
      changedDataKeys: [...plan.changedDataKeys],
      targetRawValues: { ...plan.targetRawValues },
    },
  };
}
```

- [ ] **步骤 9：扩展最终恢复事务**

把输入定义为公共字段加判别联合：

```ts
type LocalBackupRestoreInput = CommonRestoreInput &
  (
    | { mode: "replace"; mergeInspection?: never }
    | { mode: "merge"; mergeInspection: LocalBackupMergeInspection }
  );
```

运行时仍把 `mode` 当作 `unknown` 验证。顺序固定：

1. 作用域；
2. `mode` 必须为 `merge` 或 `replace`；
3. 选择；
4. merge 模式检查对象结构与选择/作用域一致；
5. 读取选中快照；
6. merge 模式逐键比较 `currentRawValues`；
7. 重新生成计划并比较 `preview`、`changedDataKeys`、`targetRawValues`；
8. replace 模式生成现有整体替换目标；
9. merge 模式只从 `changedDataKeys` 生成字符串写入目标；
10. 继续复用现有 `attempted` 和反向回滚。

结果类型增加：

```ts
| { ok: false; code: "INVALID_MODE" | "INVALID_MERGE_INSPECTION" | "CURRENT_DATA_CHANGED" }
| { ok: false; code: LocalBackupMergeErrorCode }
```

非法方式、选择或检查对象都必须在任何存储读取之前返回。

- [ ] **步骤 10：运行备份事务回归**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts tests/local-backup-crypto.test.ts tests/local-backup-merge.test.ts tests/local-backup-restore.test.ts
pnpm typecheck
git diff --check
```

预期：全部通过，类型检查退出 0，差异检查无输出。

- [ ] **步骤 11：提交任务 3**

```powershell
git add src/lib/backup/local-backup-restore.ts tests/local-backup-restore.test.ts
git commit -m "feat: preview and execute safe local merges (task 3/5)"
```

---

### 任务 4：恢复页面方式、预览、门禁与清理

**文件：**

- 修改：`tests/local-data-backup-ui-contract.test.ts`
- 修改：`src/components/account/local-data-backup-panel.tsx`

- [ ] **步骤 1：编写默认方式与预览状态失败合同**

在 UI 合同测试增加：

```ts
test("defaults inspected backups to safe merge and stores only an in-memory inspection", () => {
  assert.match(panel, /restoreMode/u);
  assert.match(panel, /useState<LocalBackupRestoreMode>\("merge"\)/u);
  assert.match(panel, /mergeInspection/u);
  assert.match(panel, /useState<LocalBackupMergeInspection \| null>\(null\)/u);
  assert.match(panel, /previewingMerge/u);
  assert.match(panel, /inspectLocalBackupMerge/u);
  assert.doesNotMatch(panel, /localStorage\.setItem[^\n]*(?:restoreMode|mergeInspection)/u);
});

test("invalidates merge preview and confirmation when mode groups or candidate change", () => {
  assert.match(panel, /clearMergeInspection/u);
  assert.match(panel, /setMergeInspection\(null\)/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /handleRestoreModeChange/u);
  assert.match(panel, /handleRestoreGroupChange/u);
});
```

- [ ] **步骤 2：编写可访问方式选择和内容无关预览失败合同**

```ts
test("renders accessible restore modes and count-only merge previews", () => {
  assert.match(panel, /<legend[^>]*>恢复方式<\/legend>/u);
  assert.match(panel, /type="radio"/u);
  assert.match(panel, /安全合并（推荐）/u);
  assert.match(panel, /替换所选分类/u);
  assert.match(panel, /预览合并结果/u);
  assert.match(panel, /合并所选数据/u);
  assert.match(panel, /当前记录/u);
  assert.match(panel, /将补回/u);
  assert.match(panel, /冲突保留当前/u);
  assert.match(panel, /重新编号/u);
  assert.doesNotMatch(panel, /targetRawValues\[[^\]]+\]/u);
});
```

- [ ] **步骤 3：编写双确认和前置错误清理失败合同**

```ts
test("uses mode-specific confirmation and preserves the candidate after prewrite merge errors", () => {
  assert.match(panel, /安全合并会保留当前记录/u);
  assert.match(panel, /恢复会替换所选分类/u);
  assert.match(panel, /CURRENT_DATA_CHANGED/u);
  assert.match(panel, /请重新预览/u);
  assert.match(panel, /preserveCandidate/u);
  assert.match(panel, /invalidateRestoreCandidate/u);
  assert.match(panel, /clearMergeInspection/u);
});
```

继续保留无 `fetch(`、`XMLHttpRequest`、`WebSocket`、`localStorage.length`、`localStorage.key(`、上传草稿键和云导入标记的既有合同。

- [ ] **步骤 4：运行 UI 合同确认红灯**

```powershell
node --experimental-strip-types --test tests/local-data-backup-ui-contract.test.ts
```

预期：FAIL，页面没有恢复方式、合并检查状态和预览控件。

- [ ] **步骤 5：增加内存状态和统一失效函数**

import 增加：

```ts
import {
  allLocalBackupRestoreGroups,
  inspectLocalBackupMerge,
  restoreLocalBackup,
  type LocalBackupMergeInspection,
  type LocalBackupRestoreGroup,
  type LocalBackupRestoreMode,
} from "@/lib/backup/local-backup-restore";
```

state 增加：

```ts
const [restoreMode, setRestoreMode] = useState<LocalBackupRestoreMode>("merge");
const [mergeInspection, setMergeInspection] = useState<LocalBackupMergeInspection | null>(null);
const [previewingMerge, setPreviewingMerge] = useState(false);
```

实现：

```ts
function clearMergeInspection(clearNotice = true) {
  setMergeInspection(null);
  setConfirmed(false);
  if (clearNotice) setRestoreNotice(null);
}

function invalidateRestoreCandidate() {
  setCandidate(null);
  setRestoreMode("merge");
  setSelectedRestoreGroups([]);
  setMergeInspection(null);
  setConfirmed(false);
}
```

检查成功时显式 `setRestoreMode("merge")`、全选五组并清空旧检查对象。

- [ ] **步骤 6：实现方式和范围变化**

```ts
function handleRestoreModeChange(mode: LocalBackupRestoreMode) {
  setRestoreMode(mode);
  clearMergeInspection();
}

function handleRestoreGroupChange(group: LocalBackupRestoreGroup, checked: boolean) {
  setSelectedRestoreGroups((current) =>
    checked
      ? allLocalBackupRestoreGroups.filter(
          (candidateGroup) => candidateGroup === group || current.includes(candidateGroup),
        )
      : current.filter((candidateGroup) => candidateGroup !== group),
  );
  clearMergeInspection();
}
```

- [ ] **步骤 7：实现只读预览 handler**

`handlePreviewMerge()` 必须：

- 只在 candidate、merge 模式、非空选择且未 busy 时执行；
- 读取当前 scope 和 `window.localStorage` 适配器；
- 调用 `inspectLocalBackupMerge()`；
- 成功后保存检查对象；
- `changedDataKeys` 为空时提示无需写入；
- 错误映射为规格中的稳定普通用户文案；
- `finally` 只关闭 previewing 状态，不清除候选。

核心调用：

```ts
const inspected = inspectLocalBackupMerge({
  storage: storage.storage,
  payload: candidate.payload,
  selectedGroups: selectedRestoreGroups,
  sourceScopeFingerprint: candidate.sourceScopeFingerprint,
  inspectedScopeFingerprint: candidate.inspectedScopeFingerprint,
  currentScopeFingerprint: scope,
});
```

- [ ] **步骤 8：渲染恢复方式和数量预览**

在选择恢复内容前加入：

```tsx
<fieldset className="mt-5 border-t border-[var(--border)] pt-5">
  <legend className="font-semibold">恢复方式</legend>
  <div className="mt-3 grid gap-3 sm:grid-cols-2">
    <label className="flex items-start gap-3 text-sm leading-6">
      <input
        type="radio"
        name="local-backup-restore-mode"
        value="merge"
        checked={restoreMode === "merge"}
        disabled={restoring || previewingMerge}
        onChange={() => handleRestoreModeChange("merge")}
      />
      <span><span>安全合并（推荐）</span><span className="block text-xs text-[var(--muted-foreground)]">保留当前记录，只补回备份中缺失的记录。</span></span>
    </label>
    <label className="flex items-start gap-3 text-sm leading-6">
      <input
        type="radio"
        name="local-backup-restore-mode"
        value="replace"
        checked={restoreMode === "replace"}
        disabled={restoring || previewingMerge}
        onChange={() => handleRestoreModeChange("replace")}
      />
      <span><span>替换所选分类</span><span className="block text-xs text-[var(--muted-foreground)]">所选分类会完整恢复为备份内容。</span></span>
    </label>
  </div>
</fieldset>
```

merge 模式在分类选择后显示“预览合并结果”。检查成功后使用 `restoreGroupOptions` 和 `mergeInspection.preview` 渲染每组数量；不渲染 `currentRawValues`、`targetRawValues`、ID、标题或正文。每组文案固定为：

```text
当前 N 项；备份 N 项；将补回 N 项；已存在 N 项；冲突保留当前 N 项；重新编号 N 项
```

零值仍显示，避免用户误解某类统计缺失。

- [ ] **步骤 9：实现确认与执行门禁**

```ts
const mergeHasChanges = (mergeInspection?.changedDataKeys.length ?? 0) > 0;
const canConfirm =
  selectedRestoreGroups.length > 0 &&
  (restoreMode === "replace" || (restoreMode === "merge" && mergeHasChanges));
```

确认文案根据 mode 切换。执行 handler 的 merge 分支必须传入 `mergeInspection`；replace 分支传 `mode: "replace"` 且不传检查对象。

对 merge 的 `CURRENT_DATA_CHANGED`、`READ_FAILED`、`CURRENT_DATA_MALFORMED`、`MISSING_ORIGINAL_BOOK` 和 `MERGED_DATA_TOO_LARGE` 设置 `preserveCandidate = true`；结果提示后只执行 `clearMergeInspection(false)`。`SCOPE_MISMATCH`、成功、`WRITE_FAILED` 和所有 replace 结果继续完整清除候选和文件。

- [ ] **步骤 10：运行 UI、恢复和文案回归**

```powershell
node --experimental-strip-types --test tests/local-backup-merge.test.ts tests/local-backup-restore.test.ts tests/local-data-backup-ui-contract.test.ts tests/user-facing-copy.test.ts tests/app-session.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

预期：全部通过；普通用户文案不出现内部技术词；其余命令退出 0。

- [ ] **步骤 11：生产构建与本地浏览器验收**

```powershell
pnpm build
```

使用开发期 mock auth，只绑定 `127.0.0.1` 启动本地服务器。用本地生成的测试备份验证：

1. 检查成功后默认安全合并和五组全选；
2. 预览只显示数量；
3. 当前已有记录不会计入“将补回”；
4. 改变方式或范围会清除预览并撤销确认；
5. 无新增记录时执行禁用；
6. merge 与 replace 确认文案和按钮文案准确切换；
7. 制造预览后当前数据变化，执行零写入并保留候选供重新预览；
8. 成功合并后新增记录出现、当前冲突记录不被覆盖；
9. 390×844 下单列无横向溢出；
10. 控制台无错误。

测试只使用本地 mock 账号和临时浏览器数据；验收结束删除测试文件、恢复临时数据并停止当前 worktree 的开发服务器。

- [ ] **步骤 12：提交任务 4**

```powershell
git add src/components/account/local-data-backup-panel.tsx tests/local-data-backup-ui-contract.test.ts
git commit -m "feat: merge browser-local backups from account settings (task 4/5)"
```

---

### 任务 5：能力文档、最终验证、审查、推送与 CI

**文件：**

- 修改：`src/lib/product-capabilities.ts`
- 修改：`tests/product-capabilities.test.ts`
- 修改：`tests/current-production-docs.test.ts`
- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

- [ ] **步骤 1：编写能力矩阵和正式文档失败测试**

能力测试增加：

```ts
assert.equal(localPrototypeCapabilities.browserLocalSafeBackupMerge, true);
assert.match(homePrototypeCopy.summary, /浏览器本地加密备份、安全合并与按分类同账号恢复/u);
```

正式文档测试对 README 和路线图增加：

```ts
assert.match(document, /安全合并/u);
assert.match(document, /当前记录.*优先|保留当前记录/u);
assert.match(document, /笔记.*重新.*ID|笔记.*重新编号/u);
assert.match(document, /冲突.*保留当前/u);
assert.doesNotMatch(document, /备份记录的自动合并仍未实现/u);
assert.match(document, /云端同步.*未实现|仍未实现.*云端同步/u);
assert.match(document, /跨账号迁移.*未实现|仍未实现.*跨账号迁移/u);
```

- [ ] **步骤 2：运行文档聚焦测试确认红灯**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
```

预期：FAIL，能力标志和正式文档仍描述安全合并未实现。

- [ ] **步骤 3：更新能力和正式文档**

- `localPrototypeCapabilities` 增加 `browserLocalSafeBackupMerge: true`；
- 首页摘要改为“浏览器本地加密备份、安全合并与按分类同账号恢复”；
- README 说明默认安全合并、当前优先、笔记重分配和替换仍可用；
- README “尚未实现”移除自动合并，保留手工逐记录冲突选择、云同步和跨账号；
- ROADMAP 阶段 14 改为安全合并和选择性替换均完成；
- DEV_LOG 记录规则、TDD 红灯、浏览器验收、零依赖和零云资源；
- 不声称时间戳覆盖、删除同步、双向同步、云同步或跨账号已实现。

- [ ] **步骤 4：运行文档绿灯并提交功能文档**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
pnpm typecheck
git diff --check
git add src/lib/product-capabilities.ts tests/product-capabilities.test.ts tests/current-production-docs.test.ts README.md docs/ROADMAP.md docs/DEV_LOG.md
git commit -m "docs: document safe local backup merges (task 5/5)"
```

- [ ] **步骤 5：运行最终全量本地门禁**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
git diff --check
```

必须从真实 TAP summary 记录测试总数和 0 失败；构建只允许仓库既有的多 lockfile 根目录推断和 Edge Runtime 静态生成提示。

- [ ] **步骤 6：运行隐私、网络、依赖和凭据扫描**

```powershell
rg -n "fetch\(|XMLHttpRequest|WebSocket|@edgeone|cos-nodejs|@supabase|tencentcloud|openai|console\.(log|error|warn)" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n "localStorage\.length|localStorage\.key\s*\(|localUploadDraftStorageKey|cloudImportMarkerStorageKey" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n --hidden -g "!node_modules/**" -g "!.next/**" -g "!.git/**" "AKID[A-Za-z0-9]{13,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" .
git diff df9d592 -- package.json pnpm-lock.yaml
git diff df9d592 -- src/lib/backup/local-backup-core.ts src/lib/backup/local-backup-crypto.ts
```

前三类扫描预期无匹配；依赖和受保护核心差异预期无输出。

- [ ] **步骤 7：对照规格进行代码审查**

使用 `requesting-code-review` 和中文审查沟通规范，逐项检查：

- 当前优先且不删除当前记录；
- library 映射原书与译本并保持引用；
- 词汇/句子只按 ID；
- 笔记冲突稳定重新编号；
- 收藏不删除当前重复，只阻止新增重复；
- 预览仅显示数量；
- 作用域、方式、选择、检查对象验证均先于存储访问；
- 预览零写入；
- 快照变化零写入；
- 未选中键所有路径零接触；
- 选中未变化键不写入；
- 失败键反向回滚且回滚失败继续；
- 前置零写入错误保留候选，作用域变化/成功/写入尝试完整清理；
- 替换模式回归未改变；
- 备份核心、加密核心、格式和依赖未改。

发现缺口时先补准确失败测试，再做最小修复，并重新执行步骤 5–7。

- [ ] **步骤 8：记录真实最终证据**

把实际测试总数、lint/typecheck/build/zero-cost/diff 结论、18 页面构建、既有警告、扫描、独立审查和浏览器验收写入 `docs/DEV_LOG.md`：

```powershell
git add docs/DEV_LOG.md
git commit -m "docs: record safe backup merge verification"
```

- [ ] **步骤 9：核对提交范围和干净工作区**

```powershell
git status --short --branch
git log -10 --oneline
git diff df9d592 --stat
git diff df9d592 -- package.json pnpm-lock.yaml
git diff df9d592 -- src/lib/backup/local-backup-core.ts src/lib/backup/local-backup-crypto.ts
```

预期：工作区干净，只有规格允许文件变化，依赖和受保护核心无差异。

- [ ] **步骤 10：推送 GitHub main 并核对 SHA**

```powershell
git push origin HEAD:main
$local = (git rev-parse HEAD).Trim()
$remote = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
if ($local -ne $remote) { throw "local/remote SHA mismatch" }
```

若 GitHub 亚洲 DNS 暂时不可达，只允许命令级解析到 GitHub 官方 IP，并保持 TLS 主机名为 `github.com`；不修改 hosts，不使用第三方镜像，不把凭据交给代理站。

- [ ] **步骤 11：监控最终 GitHub Actions**

只读查询最终 SHA 的 workflow run，必须达到：

```text
status=completed
conclusion=success
```

若失败，读取失败 job/step，在本地复现并按 TDD 修复；不得删除门禁、跳过测试或放宽零费用验证器。

## 规格覆盖自检映射

- 规格第 5 节页面流程：任务 4 步骤 5–11。
- 规格第 6.1–6.3 节通用 ID、library、词汇和句子：任务 1 步骤 1–7。
- 规格第 6.4–6.5 节笔记和收藏：任务 2 步骤 1–8。
- 规格第 7 节计划与预览模型：任务 1 公共接口、任务 2 完整计划、任务 3 检查对象。
- 规格第 8 节读取、预算和事务：任务 2 预算、任务 3 全部步骤。
- 规格第 9–10 节文案和可访问性：任务 4 步骤 1–10。
- 规格第 11 节安全与费用：每个任务的文件边界，任务 5 扫描。
- 规格第 12 节测试：任务 1–4 红绿循环、任务 5 全量门禁和审查。
- 规格第 13 节文件边界：本计划文件结构和任务提交范围。
- 规格第 14 节完成定义：任务 5 步骤 5–11。

## 完成定义

- 安全合并默认保留当前记录，只补回备份缺失记录；
- 同 ID 冲突不覆盖当前内容，笔记冲突两份都保留；
- 阅读器收藏稳定并集不删除当前重复项；
- 原书和译本作为一个关联组并保持引用完整；
- 合并预览只读、只显示数量且只接触选中键；
- 预览后选中快照变化会零写入拒绝；
- 只写实际变化键，失败时完整尝试反向回滚；
- 前置零写入错误可重新预览，成功或写入尝试后安全清理；
- 替换模式完整保留；
- 无时间戳覆盖、删除同步、逐记录手工冲突、跨账号、云同步、新依赖、网络或收费资源；
- 纯逻辑、事务、UI 合同、浏览器验收、全量门禁和扫描全部通过；
- 本地与远端 SHA 一致，GitHub Actions `completed/success`。
