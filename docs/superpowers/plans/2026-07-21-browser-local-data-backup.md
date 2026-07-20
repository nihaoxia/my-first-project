# 浏览器本地数据加密备份与恢复实现计划

> **面向 AI 代理的工作者：** 必须使用 `executing-plans` 逐任务实现本计划。每个生产行为先写失败测试、确认红灯、再写最小实现。当前会话禁止子代理，因此使用内联执行，不调用 `subagent-driven-development`。任何时候都不得访问或创建 EdgeOne、Blob、KV、Models、COS、第三方备份或其他收费资源。

**目标：** 为当前账号作用域内的六类长期浏览器数据增加一个完全本地、带口令的 `.spbackup` 加密备份文件，并提供零写入检查、同账号预览和可回滚的整体恢复。

**架构：** `local-backup-core.ts` 定义六类数据、严格版本化封装、预算、解析和预览；`local-backup-crypto.ts` 只负责 PBKDF2 与 AES-GCM Web Crypto 边界；`local-backup-restore.ts` 以固定键顺序执行整体替换和反向回滚。客户端面板只负责编排当前作用域读取、文件、口令、下载、预览与确认，不复制核心校验或恢复事务。

**技术栈：** TypeScript 6、React 19、Next.js 16、浏览器 Web Crypto、浏览器 localStorage、现有浏览器下载核心、Node 24 原生测试、ESLint、零费用验证器。

---

## 文件结构

- 创建 `src/lib/backup/local-backup-core.ts`：固定范围、规范化负载、严格封装、Base64、预算、关系验证、预览和稳定错误码。
- 创建 `tests/local-backup-fixture.ts`：核心、加密和恢复测试共用的有效六类数据夹具。
- 创建 `tests/local-backup-core.test.ts`：解析、范围、唯一性、关系、封装、编码和预算测试。
- 创建 `src/lib/backup/local-backup-crypto.ts`、`tests/local-backup-crypto.test.ts`：口令、PBKDF2、AES-GCM、AAD、认证失败与清理。
- 创建 `src/lib/backup/local-backup-restore.ts`、`tests/local-backup-restore.test.ts`：整体替换、空分类删除、快照和反向回滚。
- 创建 `src/components/account/local-data-backup-panel.tsx`、`tests/local-data-backup-ui-contract.test.ts`：创建、检查、预览、确认、恢复和 UI 合同。
- 修改 `src/app/me/page.tsx`：接入客户端面板，服务端页面不接触 localStorage 或口令。
- 修改 `src/lib/product-capabilities.ts`、`tests/product-capabilities.test.ts`：声明浏览器本地加密备份能力。
- 修改 `README.md`、`docs/ROADMAP.md`、`docs/DEV_LOG.md`、`tests/current-production-docs.test.ts`：记录能力、限制与验证证据。

## 固定公共合同

- 六个基础键依次为原书、译本、词汇、句子、笔记、阅读器收藏；不得枚举 localStorage，不读取上传草稿或云端导入标记。
- 文件名为 `stray-pages-backup-YYYY-MM-DD.spbackup`，MIME 为 `application/octet-stream`。
- 外层 `format` 为 `stray-pages-browser-local-backup`，`version` 为 `1`。
- PBKDF2-HMAC-SHA-256 固定 600,000 次，盐 16 字节；AES-GCM 固定 256 位密钥、12 字节 IV、128 位标签。
- AAD 按规格固定属性顺序覆盖格式、版本、时间、来源作用域、KDF 与 cipher 元数据。
- 创建口令为 12 至 128 个有效 Unicode code point，两次输入逐字一致，不裁剪、不归一化。
- 文件最大 `16 * 1024 * 1024` 字节；密文和明文负载各自最大 `12 * 1024 * 1024` 字节。
- 检查阶段零写入；认证成功后才检查来源作用域；只有明确确认后才执行恢复。
- 恢复整体替换六类数据，空分类删除当前键；失败时反向回滚所有已尝试键。
- 不新增依赖，不发起网络请求，不上传文件，不保存口令，不读取真实环境变量。

---

### 任务 1：六类数据规范化、关系验证与预览核心

**文件：**

- 创建：`src/lib/backup/local-backup-core.ts`
- 创建：`tests/local-backup-fixture.ts`
- 创建：`tests/local-backup-core.test.ts`

- [ ] **步骤 1：建立可复用的有效六类夹具**

在 `tests/local-backup-fixture.ts` 创建一本单章节原书和引用它的一份 queued 译本；译本章节使用同一个 `id/sourceChapterId`，任务 `chapterId` 指向该章节，`sourceParagraphs` 与 `secondaryTranslationParagraphs` 都为一项，`translatedParagraphs` 为空。再创建一条词汇、一条句子、一条笔记和各一项阅读器词/句收藏。

夹具公开：

```ts
import type { StoredLocalLibraryBook } from "../src/lib/library/local-library-storage.ts";
import type { StoredLocalTranslation } from "../src/lib/library/local-translation-storage.ts";
import type { SentenceStudyItem, VocabularyStudyItem } from "../src/lib/reader/study-collections.ts";
import type { StudyNote } from "../src/lib/study/study-notes-local.ts";
import type { LocalBackupRawValues } from "../src/lib/backup/local-backup-core.ts";

export const backupBook: StoredLocalLibraryBook = {
  id: "local-book-backup-test",
  title: "Backup Book",
  author: "A. Writer",
  format: "TXT",
  originalFileName: "backup-book.txt",
  chapterCount: 1,
  skippedChapterCount: 0,
  totalCharacters: 18,
  savedAt: "2026-07-21T08:00:00.000Z",
  chapters: [{
    position: 1,
    sourceIndex: 1,
    title: "Chapter 1",
    originalTitle: "Chapter 1",
    characterCount: 18,
    content: "The lantern stayed lit.",
    contentPreview: "The lantern stayed lit.",
    warnings: [],
  }],
  skippedChapters: [],
};

const backupChapterId = `${backupBook.id}-chapter-1`;

export const backupTranslation: StoredLocalTranslation = {
  id: "local-translation-local-book-backup-test-zh-test",
  originalBookId: backupBook.id,
  originalTitle: backupBook.title,
  title: "Backup Book 中文译本",
  sourceLanguage: "英文",
  targetLanguage: "中文",
  status: "queued",
  origin: "mcp",
  style: "自然",
  webLookupEnabled: false,
  createdAt: "2026-07-21T08:05:00.000Z",
  updatedAt: "2026-07-21T08:05:00.000Z",
  tasks: [{
    id: "backup-task-1",
    chapterId: backupChapterId,
    chapterTitle: "Chapter 1",
    status: "queued",
    progressText: "等待翻译",
    balanceText: "演示免费额度",
    updatedAt: "2026-07-21T08:05:00.000Z",
  }],
  chapters: [{
    id: backupChapterId,
    sourceChapterId: backupChapterId,
    title: "Chapter 1",
    wordCount: 18,
    sourceParagraphs: ["The lantern stayed lit."],
    translatedParagraphs: [],
    secondaryTranslationParagraphs: [""],
  }],
};

export const backupVocabulary: VocabularyStudyItem = {
  id: "vocab-backup-1",
  term: "lantern",
  explanation: "灯笼",
  contextualMean: "照明物",
  sourceSentence: "The lantern stayed lit.",
  sourceLabel: "Backup Book · Chapter 1",
  note: "",
  bookId: backupBook.id,
  bookTitle: backupBook.title,
  chapterId: backupChapterId,
  chapterTitle: "Chapter 1",
};

export const backupSentence: SentenceStudyItem = {
  id: "sentence-backup-1",
  originalText: "The lantern stayed lit.",
  translatedText: "灯一直亮着。",
  explanation: "",
  sourceLabel: "Backup Book · Chapter 1",
  note: "",
  bookId: backupBook.id,
  bookTitle: backupBook.title,
  chapterId: backupChapterId,
  chapterTitle: "Chapter 1",
};

export const backupNote: StudyNote = {
  id: "note-local-1",
  title: "阅读笔记",
  source: "Backup Book",
  updatedAt: "2026-07-21T08:10:00.000Z",
  content: "记住灯笼意象。",
};

export function buildBackupRawValues(): LocalBackupRawValues {
  return {
    libraryBooks: JSON.stringify([backupBook]),
    translations: JSON.stringify([backupTranslation]),
    vocabulary: JSON.stringify([backupVocabulary]),
    sentences: JSON.stringify([backupSentence]),
    notes: JSON.stringify([backupNote]),
    readerSelections: JSON.stringify({
      vocabularyTexts: ["lantern"],
      sentenceTexts: ["The lantern stayed lit."],
    }),
  };
}
```

如果权威解析器拒绝夹具，修正夹具而不是放宽现有解析器。

- [ ] **步骤 2：编写固定范围、规范化和预览失败测试**

```ts
test("uses exactly the six approved scoped storage keys in restore order", () => {
  assert.deepEqual(localBackupStorageEntries.map(({ dataKey }) => dataKey), [
    "libraryBooks", "translations", "vocabulary", "sentences", "notes", "readerSelections",
  ]);
  assert.equal(localBackupStorageEntries.length, 6);
  assert.doesNotMatch(
    localBackupStorageEntries.map(({ baseKey }) => baseKey).join("\n"),
    /local-upload-draft|cloud-import-v1/u,
  );
});

test("normalizes all categories and builds a content-free preview", () => {
  const result = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(buildLocalBackupPreview("2026-07-21T09:00:00.000Z", result.payload), {
    createdAt: "2026-07-21T09:00:00.000Z",
    libraryBooks: 1,
    translations: 1,
    vocabulary: 1,
    sentences: 1,
    notes: 1,
    readerSelectionVocabulary: 1,
    readerSelectionSentences: 1,
    readerSelections: 2,
  });
});
```

另测六个 `null` 被规范化为空数组/空收藏对象。

- [ ] **步骤 3：运行任务 1 首轮测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts
```

预期：FAIL，核心模块不存在。

- [ ] **步骤 4：实现固定范围、负载和预览的最小核心**

```ts
export type LocalBackupDataKey =
  | "libraryBooks" | "translations" | "vocabulary"
  | "sentences" | "notes" | "readerSelections";

export type LocalBackupRawValues = Record<LocalBackupDataKey, string | null>;

export type LocalBackupPayloadV1 = {
  schemaVersion: 1;
  data: {
    libraryBooks: StoredLocalLibraryBook[];
    translations: StoredLocalTranslation[];
    vocabulary: VocabularyStudyItem[];
    sentences: SentenceStudyItem[];
    notes: StudyNote[];
    readerSelections: ReaderSelectionCollections;
  };
};

export type LocalBackupPreview = {
  createdAt: string;
  libraryBooks: number;
  translations: number;
  vocabulary: number;
  sentences: number;
  notes: number;
  readerSelectionVocabulary: number;
  readerSelectionSentences: number;
  readerSelections: number;
};

export const localBackupStorageEntries = [
  { dataKey: "libraryBooks", baseKey: localLibraryBooksStorageKey },
  { dataKey: "translations", baseKey: localTranslationsStorageKey },
  { dataKey: "vocabulary", baseKey: localVocabularyStorageKey },
  { dataKey: "sentences", baseKey: localSentencesStorageKey },
  { dataKey: "notes", baseKey: localNotesStorageKey },
  { dataKey: "readerSelections", baseKey: localReaderSelectionsStorageKey },
] as const;
```

`buildLocalBackupPayload()` 必须逐类调用六个现有结果解析器，不得使用会丢弃坏记录的便利解析函数。稳定错误码为六个 `*_MALFORMED` 加 `DUPLICATE_ID`、`MISSING_ORIGINAL_BOOK`、`INVALID_DATA`。

- [ ] **步骤 5：编写损坏、重复 ID 与跨分类关系失败测试**

```ts
test("rejects each malformed category without keeping partial records", () => {
  for (const key of localBackupStorageEntries.map(({ dataKey }) => dataKey)) {
    const raw = buildBackupRawValues();
    raw[key] = "not-json";
    assert.equal(buildLocalBackupPayload(raw).ok, false, key);
  }
});

test("rejects duplicate ids and translations without an original book", () => {
  const duplicate = buildBackupRawValues();
  const books = JSON.parse(duplicate.libraryBooks!) as unknown[];
  duplicate.libraryBooks = JSON.stringify([...books, books[0]]);
  assert.deepEqual(buildLocalBackupPayload(duplicate), { ok: false, code: "DUPLICATE_ID" });

  const orphaned = buildBackupRawValues();
  orphaned.libraryBooks = "[]";
  assert.deepEqual(buildLocalBackupPayload(orphaned), {
    ok: false,
    code: "MISSING_ORIGINAL_BOOK",
  });
});
```

分别让译本、词汇、句子、笔记出现重复 ID。阅读器收藏没有 ID，不自动去重。

- [ ] **步骤 6：实现唯一性和译本原书关系**

```ts
function hasUniqueIds(records: ReadonlyArray<{ id: string }>) {
  return new Set(records.map(({ id }) => id)).size === records.length;
}

function translationsReferenceKnownBooks(
  books: StoredLocalLibraryBook[],
  translations: StoredLocalTranslation[],
) {
  const bookIds = new Set(books.map(({ id }) => id));
  return translations.every(({ originalBookId }) => bookIds.has(originalBookId));
}
```

译本内部任务、章节和段落关系继续由现有权威解析器验证。

- [ ] **步骤 7：任务 1 聚焦绿灯、类型检查和提交**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts
pnpm typecheck
git diff --check
git add src/lib/backup/local-backup-core.ts tests/local-backup-fixture.ts tests/local-backup-core.test.ts
git commit -m "feat: validate browser-local backup data (task 1/6)"
```

---

### 任务 2：严格版本化封装、Base64、AAD 与预算

**文件：**

- 修改：`src/lib/backup/local-backup-core.ts`
- 修改：`tests/local-backup-core.test.ts`

- [ ] **步骤 1：编写文件名、常量和边界预算失败测试**

```ts
test("fixes the local backup filename, algorithms, and budgets", () => {
  assert.equal(
    buildLocalBackupFileName(new Date("2026-07-21T16:00:00+08:00")),
    "stray-pages-backup-2026-07-21.spbackup",
  );
  assert.equal(localBackupMimeType, "application/octet-stream");
  assert.equal(localBackupFileByteLimit, 16 * 1024 * 1024);
  assert.equal(localBackupPayloadByteLimit, 12 * 1024 * 1024);
  assert.equal(validateLocalBackupFileName("backup.spbackup").ok, true);
  assert.equal(validateLocalBackupFileName("backup.json").ok, false);
  assert.equal(validateLocalBackupFileSize(localBackupFileByteLimit).ok, true);
  assert.equal(validateLocalBackupFileSize(localBackupFileByteLimit + 1).ok, false);
  assert.equal(validateLocalBackupPayloadSize(localBackupPayloadByteLimit).ok, true);
  assert.equal(validateLocalBackupPayloadSize(localBackupPayloadByteLimit + 1).ok, false);
});
```

另测负数、非整数和 `NaN` 大小被拒绝。文件日期必须用本地年月日，不用 UTC 截断。

- [ ] **步骤 2：运行新增测试确认红灯**

运行任务 1 聚焦测试。预期：新常量和函数未定义。

- [ ] **步骤 3：实现固定常量和大小守卫**

```ts
export const localBackupFormat = "stray-pages-browser-local-backup" as const;
export const localBackupVersion = 1 as const;
export const localBackupMimeType = "application/octet-stream";
export const localBackupFileByteLimit = 16 * 1024 * 1024;
export const localBackupPayloadByteLimit = 12 * 1024 * 1024;
export const localBackupPbkdf2Iterations = 600_000;
export const localBackupSaltBytes = 16;
export const localBackupIvBytes = 12;
export const localBackupGcmTagBits = 128;
```

- [ ] **步骤 4：编写 AAD 顺序和严格 Base64 失败测试**

```ts
test("serializes authenticated metadata in fixed property order", () => {
  const metadata = buildLocalBackupMetadata({
    createdAt: "2026-07-21T09:00:00.000Z",
    sourceScopeFingerprint: "user-scope-test",
    salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    iv: Uint8Array.from({ length: 12 }, (_, index) => index + 16),
  });
  assert.equal(
    new TextDecoder().decode(serializeLocalBackupAdditionalData(metadata)),
    '{"format":"stray-pages-browser-local-backup","version":1,"createdAt":"2026-07-21T09:00:00.000Z","sourceScopeFingerprint":"user-scope-test","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":600000,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":{"name":"AES-GCM","keyLength":256,"tagLength":128,"iv":"EBESExQVFhcYGRob"}}',
  );
});

test("round-trips only canonical standard Base64", () => {
  const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
  const encoded = encodeLocalBackupBase64(bytes);
  assert.deepEqual(decodeLocalBackupBase64(encoded), { ok: true, bytes });
  for (const malformed of ["AA-_", "AA E=", "AAE", "AAE===", "AAE=\n"]) {
    assert.equal(decodeLocalBackupBase64(malformed).ok, false, malformed);
  }
});
```

- [ ] **步骤 5：实现浏览器可用的标准 Base64 与元数据**

不要使用 Node `Buffer`。编码器按 3 字节分组生成标准字母表和规范 `=`；解码前用格式检查和重新编码相等检查拒绝非规范输入。

```ts
export function buildLocalBackupMetadata(input: {
  createdAt: string;
  sourceScopeFingerprint: string;
  salt: Uint8Array;
  iv: Uint8Array;
}): LocalBackupMetadataV1;

export function serializeLocalBackupAdditionalData(
  metadata: LocalBackupMetadataV1,
): Uint8Array;
```

- [ ] **步骤 6：编写严格外层解析与拒绝顺序失败测试**

覆盖：扩展名错误、文件超 16 MiB、声明大小与实际字节数不一致、非法 UTF-8、截断 JSON、尾随 JSON、非法或非规范 ISO 日期、空作用域、未知外层/kdf/cipher 属性、版本 2、迭代 599,999 或 600,001、盐/IV 错长、密文短于标签、密文超 12 MiB。负载测试另加未知顶层属性、未知 `data` 属性和缺失六类字段。

```ts
assert.deepEqual(parseLocalBackupFile({
  fileName: "backup.json",
  fileSize: 2,
  bytes: new TextEncoder().encode("{}"),
}), { ok: false, code: "INVALID_EXTENSION" });
```

无法可靠分类的格式、JSON、截断错误返回 `AUTHENTICATION_FAILED`；明确版本或算法变化返回 `UNSUPPORTED_VERSION`。

- [ ] **步骤 7：实现外层构建、严格解析与负载序列化**

```ts
export type LocalBackupEnvelopeV1 = {
  format: typeof localBackupFormat;
  version: 1;
  createdAt: string;
  sourceScopeFingerprint: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: 600000; salt: string };
  cipher: { name: "AES-GCM"; keyLength: 256; tagLength: 128; iv: string };
  ciphertext: string;
};

export type LocalBackupMetadataV1 = Omit<LocalBackupEnvelopeV1, "ciphertext">;

export type ParsedLocalBackupEnvelope = {
  metadata: LocalBackupMetadataV1;
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

export type LocalBackupFileResult =
  | { ok: true; fileName: string; mimeType: typeof localBackupMimeType; bytes: Uint8Array }
  | { ok: false; code: "CIPHERTEXT_TOO_LARGE" | "FILE_TOO_LARGE" };

export type LocalBackupFileParseResult =
  | { ok: true; envelope: ParsedLocalBackupEnvelope }
  | { ok: false; code: "INVALID_EXTENSION" | "FILE_TOO_LARGE" | "UNSUPPORTED_VERSION" | "AUTHENTICATION_FAILED" };

export type LocalBackupPayloadParseResult =
  | { ok: true; payload: LocalBackupPayloadV1 }
  | { ok: false; code: "PAYLOAD_TOO_LARGE" | "INVALID_DATA" };

export function buildLocalBackupFile(input: {
  metadata: LocalBackupMetadataV1;
  ciphertext: Uint8Array;
  now: Date;
}): LocalBackupFileResult;

export function parseLocalBackupFile(input: {
  fileName: string;
  fileSize: number;
  bytes: Uint8Array;
}): LocalBackupFileParseResult;

export function serializeLocalBackupPayload(payload: LocalBackupPayloadV1):
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: "PAYLOAD_TOO_LARGE" };

export function parseLocalBackupPayloadBytes(bytes: Uint8Array): LocalBackupPayloadParseResult;
```

使用 `TextDecoder("utf-8", { fatal: true })` 和 `hasExactKeys()`。负载解析后重新调用任务 1 的六类解析和关系验证。先检查密文预算，再检查最终 UTF-8 文件预算。

`validateLocalBackupFileName()` 使用 `fileName.toLowerCase().endsWith(".spbackup")`，只负责扩展名预检；`parseLocalBackupFile()` 仍必须重复校验扩展名、声明大小、实际 `bytes.byteLength`、严格 UTF-8 和全部结构，不能信任 UI 预检。

- [ ] **步骤 8：任务 2 聚焦绿灯、类型检查和提交**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts
pnpm typecheck
git diff --check
git add src/lib/backup/local-backup-core.ts tests/local-backup-core.test.ts
git commit -m "feat: define encrypted backup envelope (task 2/6)"
```

---

### 任务 3：Web Crypto 加密、解密与稳定认证失败

**文件：**

- 创建：`src/lib/backup/local-backup-crypto.ts`
- 创建：`tests/local-backup-crypto.test.ts`
- 修改：`tests/local-backup-fixture.ts`

- [ ] **步骤 1：编写 Unicode 口令验证失败测试**

生产模块先定义创建口令错误类型，后续结果联合统一引用该类型：

```ts
export type LocalBackupCreatePassphraseErrorCode =
  | "PASSPHRASE_TOO_SHORT"
  | "PASSPHRASE_TOO_LONG"
  | "PASSPHRASE_MISMATCH"
  | "PASSPHRASE_INVALID_UNICODE";
```

```ts
test("accepts only exact well-formed 12 to 128 code-point create passphrases", () => {
  assert.deepEqual(validateLocalBackupCreatePassphrase("甲".repeat(12), "甲".repeat(12)), { ok: true });
  assert.deepEqual(validateLocalBackupCreatePassphrase("😀".repeat(128), "😀".repeat(128)), { ok: true });
  assert.equal(validateLocalBackupCreatePassphrase("甲".repeat(11), "甲".repeat(11)).ok, false);
  assert.equal(validateLocalBackupCreatePassphrase("甲".repeat(129), "甲".repeat(129)).ok, false);
  assert.equal(validateLocalBackupCreatePassphrase("e\u0301".repeat(12), "é".repeat(12)).ok, false);
  assert.equal(validateLocalBackupCreatePassphrase("甲".repeat(12), "甲".repeat(11) + "乙").ok, false);
  assert.equal(
    validateLocalBackupCreatePassphrase("甲".repeat(11) + "\ud800", "甲".repeat(11) + "\ud800").ok,
    false,
  );
  assert.deepEqual(validateLocalBackupRestorePassphrase("short"), {
    ok: false,
    code: "AUTHENTICATION_FAILED",
  });
});
```

创建错误分别为 `PASSPHRASE_TOO_SHORT`、`PASSPHRASE_TOO_LONG`、`PASSPHRASE_MISMATCH`、`PASSPHRASE_INVALID_UNICODE`；恢复端非法或错误口令统一认证失败。

- [ ] **步骤 2：运行加密测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-crypto.test.ts
```

预期：FAIL，加密模块不存在。

- [ ] **步骤 3：实现口令验证与可注入运行时**

```ts
export type LocalBackupCryptoRuntime = {
  subtle: SubtleCrypto;
  getRandomValues(bytes: Uint8Array): Uint8Array;
};

export function createBrowserLocalBackupCryptoRuntime(): LocalBackupCryptoRuntime {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto unavailable");
  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues(bytes) { return globalThis.crypto.getRandomValues(bytes); },
  };
}
```

使用显式代理项扫描拒绝未配对代理项；长度使用 `Array.from(passphrase).length`；不调用 `trim()` 或 `normalize()`。

- [ ] **步骤 4：编写确定性真实加密往返失败测试**

使用 Node 的真实 `globalThis.crypto.subtle`，只替换随机数来源：

```ts
const runtime: LocalBackupCryptoRuntime = {
  subtle: globalThis.crypto.subtle,
  getRandomValues(bytes) {
    bytes.forEach((_, index) => { bytes[index] = index + 1; });
    return bytes;
  },
};

test("creates and decrypts an authenticated version-one backup", async () => {
  const payloadResult = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(payloadResult.ok, true);
  if (!payloadResult.ok) return;
  const encrypted = await encryptLocalBackup({
    payload: payloadResult.payload,
    passphrase: "独立备份口令甲乙丙丁戊己",
    confirmation: "独立备份口令甲乙丙丁戊己",
    sourceScopeFingerprint: "user-scope-test",
    now: new Date("2026-07-21T09:00:00.000Z"),
  }, runtime);
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;

  const parsed = parseLocalBackupFile({
    fileName: encrypted.fileName,
    fileSize: encrypted.bytes.byteLength,
    bytes: encrypted.bytes,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(Array.from(parsed.envelope.salt), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.deepEqual(Array.from(parsed.envelope.iv), Array.from({ length: 12 }, (_, index) => index + 1));
  const decrypted = await decryptLocalBackup({
    envelope: parsed.envelope,
    passphrase: "独立备份口令甲乙丙丁戊己",
    currentScopeFingerprint: "user-scope-test",
  }, runtime);
  assert.equal(decrypted.ok, true);
  if (!decrypted.ok) return;
  assert.equal(decrypted.candidate.preview.libraryBooks, 1);
  assert.equal(decrypted.candidate.preview.readerSelections, 2);
});
```

再使用每次递增起始值的随机运行时连续创建两份文件，断言解析后的盐和 IV 都不相同，证明每次创建都会重新请求 16 字节盐与 12 字节 IV。

- [ ] **步骤 5：实现固定 PBKDF2 与 AES-GCM 路径**

公开签名：

```ts
export async function encryptLocalBackup(
  input: {
    payload: LocalBackupPayloadV1;
    passphrase: string;
    confirmation: string;
    sourceScopeFingerprint: string;
    now: Date;
  },
  runtime?: LocalBackupCryptoRuntime,
): Promise<LocalBackupEncryptionResult>;

export async function decryptLocalBackup(
  input: {
    envelope: ParsedLocalBackupEnvelope;
    passphrase: string;
    currentScopeFingerprint: string;
  },
  runtime?: LocalBackupCryptoRuntime,
): Promise<LocalBackupDecryptionResult>;

export type LocalBackupEncryptionResult =
  | { ok: true; fileName: string; mimeType: typeof localBackupMimeType; bytes: Uint8Array }
  | { ok: false; code: LocalBackupCreatePassphraseErrorCode | "PAYLOAD_TOO_LARGE" | "CIPHERTEXT_TOO_LARGE" | "FILE_TOO_LARGE" | "CRYPTO_UNAVAILABLE" };

export type LocalBackupRestoreCandidate = {
  payload: LocalBackupPayloadV1;
  preview: LocalBackupPreview;
  createdAt: string;
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
};

export type LocalBackupDecryptionResult =
  | { ok: true; candidate: LocalBackupRestoreCandidate }
  | { ok: false; code: "AUTHENTICATION_FAILED" | "SCOPE_MISMATCH" | "INVALID_DATA" | "CRYPTO_UNAVAILABLE" };
```

密钥派生逐字使用：

```ts
const material = await subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);
const key = await subtle.deriveKey(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
  material,
  { name: "AES-GCM", length: 256 },
  false,
  [usage],
);
```

加解密参数都为 `{ name: "AES-GCM", iv, additionalData, tagLength: 128 }`。创建时间只从 `now.toISOString()` 派生，文件名使用同一个 `now` 的本地日期。解密认证成功后才比较来源作用域；作用域不同返回 `SCOPE_MISMATCH`，负载无效返回 `INVALID_DATA`。成功结果把当前作用域复制到 `candidate.inspectedScopeFingerprint`。

- [ ] **步骤 6：编写错误口令、篡改、截断、AAD 与作用域测试**

对同一有效文件分别使用错误长口令、翻转密文、删除最后一字节、修改 `createdAt`、修改外层 `sourceScopeFingerprint`。前五项都返回 `{ ok: false, code: "AUTHENTICATION_FAILED" }`。正确文件配另一个当前作用域只在认证成功后返回 `{ ok: false, code: "SCOPE_MISMATCH" }`。

- [ ] **步骤 7：实现统一异常折叠和字节清理**

```ts
let passwordBytes: Uint8Array | undefined;
let payloadBytes: Uint8Array | undefined;
let plaintextBytes: Uint8Array | undefined;
try {
  // validate -> derive -> encrypt/decrypt -> parse
} catch {
  return { ok: false, code: "AUTHENTICATION_FAILED" };
} finally {
  passwordBytes?.fill(0);
  payloadBytes?.fill(0);
  plaintextBytes?.fill(0);
}
```

创建路径的预算或 Web Crypto 不可用使用稳定码，不返回 DOMException。密钥不可导出且不进入结果。最终加密文件字节由 UI 在同步构造 Blob 后清零。

- [ ] **步骤 8：安全合同、聚焦绿灯与提交**

测试读取源代码并断言固定 `600_000`、`SHA-256`、`AES-GCM`、不可导出的 `false` 和 `.fill(0)`；不存在 `Math.random`、`fetch`、XHR、WebSocket、日志或新加密包导入。

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts tests/local-backup-crypto.test.ts
pnpm typecheck
git diff --check
git add src/lib/backup/local-backup-crypto.ts tests/local-backup-crypto.test.ts tests/local-backup-fixture.ts
git commit -m "feat: encrypt browser-local backups (task 3/6)"
```

---

### 任务 4：固定顺序整体恢复与反向回滚

**文件：**

- 创建：`src/lib/backup/local-backup-restore.ts`
- 创建：`tests/local-backup-restore.test.ts`

- [ ] **步骤 1：编写成功替换、空分类删除和固定顺序失败测试**

```ts
test("replaces six scoped categories in fixed order and removes backup-empty data", () => {
  const payloadResult = buildLocalBackupPayload(buildBackupRawValues());
  assert.equal(payloadResult.ok, true);
  if (!payloadResult.ok) return;
  payloadResult.payload.data.notes = [];
  const events: string[] = [];
  const storage = createRecordingStorage(events, currentValues("old"));
  const result = restoreLocalBackup({
    storage,
    payload: payloadResult.payload,
    sourceScopeFingerprint: "user-scope-test",
    inspectedScopeFingerprint: "user-scope-test",
    currentScopeFingerprint: "user-scope-test",
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(primaryMutationKeys(events), localBackupStorageEntries.map(
    ({ baseKey }) => buildScopedLocalStorageKey(baseKey, "user-scope-test"),
  ));
  assert.match(events.find((event) => event.startsWith("remove:")) ?? "", /study-notes/u);
});
```

测试 helper 用 `Map` 保存值，并记录 `get/set/remove`。

- [ ] **步骤 2：运行恢复测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
```

预期：FAIL，恢复模块不存在。

- [ ] **步骤 3：实现作用域门禁、预读快照和成功路径**

```ts
export type LocalBackupRestoreResult =
  | { ok: true }
  | { ok: false; code: "SCOPE_MISMATCH" | "READ_FAILED" }
  | { ok: false; code: "WRITE_FAILED"; rollback: "complete" | "failed" };

export function restoreLocalBackup(input: {
  storage: LocalStorageAdapter;
  payload: LocalBackupPayloadV1;
  sourceScopeFingerprint: string;
  inspectedScopeFingerprint: string;
  currentScopeFingerprint: string;
}): LocalBackupRestoreResult;
```

先比较三个作用域；不相等时不读取、不写入。再对六个固定实际键调用 `safeReadLocalStorage()` 并缓存 `string | null`；任一读取失败时零写入退出。五个数组为空时删除；阅读器收藏两个数组都为空时删除；非空写入规范化 JSON。

- [ ] **步骤 4：编写每个失败位置和反向回滚测试**

```ts
test("rolls back attempted keys in reverse order for every failure position", () => {
  for (let failureIndex = 0; failureIndex < 6; failureIndex += 1) {
    const events: string[] = [];
    const before = currentValues(`before-${failureIndex}`);
    const storage = createFailingStorage({ events, initial: before, failureIndex });
    const result = restoreLocalBackup(validRestoreInput(storage));
    assert.deepEqual(result, { ok: false, code: "WRITE_FAILED", rollback: "complete" });
    assert.deepEqual(snapshotStorage(storage), before);
    assert.equal(countPrimaryMutations(events), failureIndex + 1);
    assert.equal(rollbackKeys(events).length, failureIndex + 1);
  }
});
```

再循环让第 1 至第 6 次读取失败，断言 mutation 始终为 0。

- [ ] **步骤 5：实现失败键纳入回滚并继续全部回滚**

每次主变更前把键加入 `attempted`。失败后：

```ts
let rollbackFailed = false;
for (const key of attempted.slice().reverse()) {
  const original = snapshots.get(key) ?? null;
  const rollback = original === null
    ? safeRemoveLocalStorage(storage, key)
    : safeWriteLocalStorage(storage, key, original);
  if (!rollback.ok) rollbackFailed = true;
}
return {
  ok: false,
  code: "WRITE_FAILED",
  rollback: rollbackFailed ? "failed" : "complete",
};
```

一个回滚动作失败后仍继续恢复更早的键。

- [ ] **步骤 6：编写部分变更后抛错、缺失原值和回滚失败测试**

- 假 `setItem()` 先更新 `Map` 再抛错，证明失败键也恢复。
- 原始 `null` 在回滚时删除，不能写字符串 `"null"`。
- 主写入失败后让一个回滚失败，结果为 `rollback: "failed"` 且继续其他回滚。
- 三个作用域任一不等时，读取和 mutation 都为 0。

- [ ] **步骤 7：任务 4 聚焦绿灯、类型检查和提交**

```powershell
node --experimental-strip-types --test tests/local-backup-restore.test.ts
pnpm typecheck
git diff --check
git add src/lib/backup/local-backup-restore.ts tests/local-backup-restore.test.ts
git commit -m "feat: restore browser-local backups safely (task 4/6)"
```

---

### 任务 5：“我的”页创建、检查、预览和确认交互

**文件：**

- 创建：`src/components/account/local-data-backup-panel.tsx`
- 修改：`src/app/me/page.tsx`
- 创建：`tests/local-data-backup-ui-contract.test.ts`

- [ ] **步骤 1：编写页面接线、客户端边界和固定范围失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync("src/components/account/local-data-backup-panel.tsx", "utf8");
const mePage = readFileSync("src/app/me/page.tsx", "utf8");

test("mounts a client-only backup panel on the authenticated me page", () => {
  assert.match(panel, /^"use client";/u);
  assert.match(mePage, /<LocalDataBackupPanel\s*\/>/u);
  assert.doesNotMatch(mePage, /localStorage|crypto\.subtle|备份口令/u);
});

test("reads only six fixed scoped keys without storage enumeration", () => {
  assert.match(panel, /localBackupStorageEntries/u);
  assert.match(panel, /buildScopedLocalStorageKey/u);
  assert.match(panel, /safeReadLocalStorage/u);
  assert.doesNotMatch(panel, /localStorage\.length|localStorage\.key\s*\(/u);
  assert.doesNotMatch(panel, /localUploadDraftStorageKey|cloudImportMarkerStorageKey/u);
});
```

- [ ] **步骤 2：运行 UI 合同确认红灯**

```powershell
node --experimental-strip-types --test tests/local-data-backup-ui-contract.test.ts
```

预期：FAIL，面板不存在且页面没有接线。

- [ ] **步骤 3：建立面板状态、当前作用域和六键读取**

状态固定为两个口令、创建进行中/提示、文件、恢复口令、检查进行中、候选、确认、恢复进行中/提示。候选类型只包含已验证 payload、创建时间、来源作用域、检查时作用域和计数预览。

```ts
function readCurrentScopeFingerprint() {
  return document
    .querySelector<HTMLElement>(`[${localStorageScopeAttribute}]`)
    ?.getAttribute(localStorageScopeAttribute)
    ?.trim() || null;
}
```

`localStorageScopeAttribute` 的现有值是 `data-local-storage-scope`；只读取该属性。捕获 `window.localStorage` 访问异常，再循环 `localBackupStorageEntries`，对 `buildScopedLocalStorageKey(baseKey, scope)` 调用 `safeReadLocalStorage()`。缺失作用域使用现有“当前登录状态无法确定本地数据归属”语义；不回退到 legacy 或无作用域键。

- [ ] **步骤 4：编写创建、下载和清理合同测试**

```ts
test("creates and downloads an encrypted backup without storage mutation", () => {
  assert.match(panel, /buildLocalBackupPayload/u);
  assert.match(panel, /encryptLocalBackup/u);
  assert.match(panel, /triggerBrowserDownload/u);
  assert.match(panel, /localBackupMimeType/u);
  assert.doesNotMatch(panel, /safeWriteLocalStorage|safeRemoveLocalStorage/u);
});

test("clears create secrets and encrypted bytes on every outcome", () => {
  assert.match(panel, /setCreatePassphrase\(""\)/u);
  assert.match(panel, /setCreateConfirmation\(""\)/u);
  assert.match(panel, /downloadBytes\?\.fill\(0\)/u);
});
```

- [ ] **步骤 5：实现创建流程与浏览器下载运行时**

`handleCreateBackup()` 顺序：禁用重复提交；读取作用域；读六键；构建规范化负载；调用 `encryptLocalBackup()`；同步调用 `triggerBrowserDownload()`；显示“已准备下载”或稳定错误；`finally` 清空两个口令、加密字节和进行中状态。创建路径不得写 localStorage。

```ts
function createBackupDownloadRuntime(): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) { return new Blob([content as BlobPart], { type: mimeType }); },
    createObjectUrl(blob) { return URL.createObjectURL(blob as Blob); },
    revokeObjectUrl(url) { URL.revokeObjectURL(url); },
    createLink() { return document.createElement("a"); },
    appendLink(link) { document.body.append(link as HTMLAnchorElement); },
  };
}
```

对象 URL 仍由 `triggerBrowserDownload()` 的 `finally` 释放。

- [ ] **步骤 6：编写零写入检查、候选失效和确认合同测试**

```ts
test("separates zero-write file inspection from confirmed restore", () => {
  assert.match(panel, /accept="\.spbackup"/u);
  assert.match(panel, /parseLocalBackupFile/u);
  assert.match(panel, /decryptLocalBackup/u);
  assert.match(panel, /检查备份/u);
  assert.match(panel, /我了解恢复会替换当前账号的本地数据/u);
  assert.match(panel, /恢复并替换/u);
  assert.match(panel, /restoreLocalBackup/u);
});

test("invalidates preview and confirmation when the file changes", () => {
  assert.match(panel, /setCandidate\(null\)/u);
  assert.match(panel, /setConfirmed\(false\)/u);
});
```

检查 handler 不得调用 `restoreLocalBackup()`；执行 handler 必须检查 `candidate && confirmed`。

- [ ] **步骤 7：实现文件检查、内存候选与计数预览**

文件变化立即清除旧候选、确认和提示。检查顺序：

```ts
function invalidateRestoreCandidate() {
  setCandidate(null);
  setConfirmed(false);
}
```

1. 文件存在；
2. `validateLocalBackupFileName(file.name)`；
3. `validateLocalBackupFileSize(file.size)`；
4. `new Uint8Array(await file.arrayBuffer())`；
5. `parseLocalBackupFile({ fileName, fileSize, bytes })`；
6. 获取当前作用域；
7. `decryptLocalBackup()`；
8. 保存已验证候选；
9. `finally` 清空恢复口令和文件原始字节。

预览只显示创建时间、原书、译本、词汇、句子、笔记、阅读器收藏总数及两项收藏明细，不显示正文、指纹、盐、IV 或密文。

- [ ] **步骤 8：实现明确确认、恢复结果和稳定提示**

恢复按钮只有 `candidate !== null && confirmed && !restoring` 时可用。点击时重新读取当前作用域，再调用：

```ts
const result = restoreLocalBackup({
  storage: window.localStorage,
  payload: candidate.payload,
  sourceScopeFingerprint: candidate.sourceScopeFingerprint,
  inspectedScopeFingerprint: candidate.inspectedScopeFingerprint,
  currentScopeFingerprint,
});
```

创建与检查错误先固定映射：

- 四个创建口令错误分别为“备份口令至少需要 12 个字符。”、“备份口令不能超过 128 个字符。”、“两次输入的备份口令不一致。”、“备份口令包含无效字符，请重新输入。”；
- 六个 `*_MALFORMED` 分别指出“本地原书/本地译本/词汇本/句子本/笔记/阅读器收藏数据已损坏，无法创建备份。”；
- `INVALID_EXTENSION`：“请选择 Stray Pages 备份文件（.spbackup）。”；
- `FILE_TOO_LARGE`：“备份文件超过 16 MiB，无法检查。”；
- `UNSUPPORTED_VERSION`：“此备份版本当前无法恢复。”；
- `AUTHENTICATION_FAILED`：“无法验证备份：口令错误或文件已损坏。”；
- `INVALID_DATA`：“备份中的本地数据不完整或已损坏，未写入任何内容。”；
- `CRYPTO_UNAVAILABLE`：“当前浏览器无法使用本地加密，请更换受支持的浏览器后重试。”；
- 创建侧三个大小错误统一说明本地数据过大，未生成备份文件；任何文案都不暴露算法、底层键或异常。

结果文案固定为：

- 成功：“本地数据已恢复。请刷新页面，让所有工作区重新读取数据。”
- 写入失败且回滚完成：“恢复失败，原有本地数据已恢复，未完成替换。”
- 回滚失败：“恢复失败，且无法完整还原原有本地数据。请不要继续编辑，并保留备份文件。”
- 作用域不同：“此备份来自另一个账号，当前账号不能恢复。”
- 当前读取失败：“无法读取当前账号的本地数据，未开始恢复。”

成功、取消、文件变化、作用域变化和卸载都丢弃候选；成功后不强制刷新。

- [ ] **步骤 9：实现可访问内联 UI 与页面接线**

- 顶层 `<section aria-labelledby="local-backup-heading">`，创建/恢复为两个自然分区，不用弹窗。
- 三个口令输入均为 `type="password"`，有可见 label 和 `aria-describedby`。
- 文件 input 接受 `.spbackup`；确认框默认未勾选。
- 进行中文案为“正在加密”“正在检查”“正在恢复”，对应按钮禁用。
- 普通成功 `role="status"`；认证、损坏、写入、回滚失败 `role="alert"`。
- 桌面 `lg:grid-cols-2`，窄屏单列；普通用户字符串不显示 Provider、token、API、KDF、PBKDF2、AES、审计或 Secret。

在 `src/app/me/page.tsx` 主账户内容之后加入：

```tsx
<section className="mt-8">
  <LocalDataBackupPanel />
</section>
```

不要放进 380px 的 aside。

- [ ] **步骤 10：任务 5 聚焦验证、构建和提交**

```powershell
node --experimental-strip-types --test tests/local-backup-core.test.ts tests/local-backup-crypto.test.ts tests/local-backup-restore.test.ts tests/local-data-backup-ui-contract.test.ts tests/app-session.test.ts tests/user-facing-copy.test.ts
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git add src/components/account/local-data-backup-panel.tsx src/app/me/page.tsx tests/local-data-backup-ui-contract.test.ts
git commit -m "feat: manage encrypted local backups (task 5/6)"
```

---

### 任务 6：能力文档、全量验证、审查、推送与 CI

**文件：**

- 修改：`src/lib/product-capabilities.ts`
- 修改：`tests/product-capabilities.test.ts`
- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`tests/current-production-docs.test.ts`

- [ ] **步骤 1：编写能力矩阵和文档失败测试**

```ts
assert.equal(localPrototypeCapabilities.browserLocalEncryptedBackup, true);
assert.match(homePrototypeCopy.summary, /浏览器本地加密备份/u);
```

```ts
test("documents encrypted same-account backup without claiming cloud sync", () => {
  const readme = readFileSync("README.md", "utf8");
  const roadmap = readFileSync("docs/ROADMAP.md", "utf8");
  for (const document of [readme, roadmap]) {
    assert.match(document, /浏览器本地加密备份/u);
    assert.match(document, /口令.*无法找回/u);
    assert.match(document, /恢复.*整体替换/u);
    assert.match(document, /不会上传|不上传/u);
    assert.match(document, /云端同步/u);
    assert.match(document, /跨账号迁移/u);
    assert.match(document, /选择性恢复|自动合并/u);
    assert.doesNotMatch(document, /已完成云端自动备份|已支持跨账号恢复/u);
  }
});
```

- [ ] **步骤 2：运行文档测试确认红灯**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
```

预期：FAIL，能力标志和文档描述尚未加入。

- [ ] **步骤 3：更新能力矩阵和用户说明**

增加：

```ts
browserLocalEncryptedBackup: true,
```

首页 summary 只增加“浏览器本地加密备份与同账号恢复”。README 说明六类范围、文件不上传、独立口令无法找回、整体替换和跨账号拒绝。未实现列表保留云端同步、自动备份、跨账号迁移、选择性恢复和自动合并。

- [ ] **步骤 4：更新路线图与开发记录**

`docs/ROADMAP.md` 记录本地能力已完成，云端与跨账号能力后置。`docs/DEV_LOG.md` 新增 `2026-07-21` 小节，记录固定范围、加密参数、AAD、预算、零写入检查、整体替换、回滚、TDD 证据、全量命令及“未创建或调用收费/云端资源”。测试数量只在真实全量运行后填写。

- [ ] **步骤 5：文档聚焦绿灯和任务 6 提交**

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
pnpm typecheck
git diff --check
git add src/lib/product-capabilities.ts tests/product-capabilities.test.ts README.md docs/ROADMAP.md docs/DEV_LOG.md tests/current-production-docs.test.ts
git commit -m "docs: document encrypted local backups (task 6/6)"
```

- [ ] **步骤 6：执行全量本地验证**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
git diff --check
```

测试必须 0 失败，其他命令退出码 0。构建只允许仓库既有警告，不允许新增错误。

- [ ] **步骤 7：执行隐私、网络、依赖和凭据扫描**

```powershell
rg -n "fetch\(|XMLHttpRequest|WebSocket|@edgeone|cos-nodejs|@supabase|tencentcloud|openai|console\.(log|error|warn)" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n "localStorage\.length|localStorage\.key\s*\(|localUploadDraftStorageKey|cloudImportMarkerStorageKey" src/lib/backup src/components/account/local-data-backup-panel.tsx
rg -n "AKID[A-Za-z0-9]{13,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" .
git diff 0a35465 -- package.json pnpm-lock.yaml
```

前三条预期无匹配；最后一条无输出。预期测试假值或禁止规则命中时逐条分类，不输出真实凭据。

- [ ] **步骤 8：对照规格逐项审查**

逐项确认 AAD、严格 UTF-8/Base64/未知字段、固定参数拒绝顺序、统一认证失败、零写入检查、认证后跨账号拒绝、六键顺序、空分类删除、失败键回滚、回滚失败文案、UI 隐私、临时字节/URL 清理，以及所有预算的等于上限和超一单位测试。发现缺口先补失败测试再修复。

- [ ] **步骤 9：补写真实最终证据**

全量验证后把真实测试数量和命令结论写进 `docs/DEV_LOG.md`：

```powershell
git add docs/DEV_LOG.md
git commit -m "docs: record local backup verification"
```

如果任务 6 提交已包含真实结果且工作区无差异，不创建空提交。

- [ ] **步骤 10：推送远端 main 并核对 SHA**

```powershell
git status --short --branch
git log -8 --oneline
git push origin HEAD:main
$local = (git rev-parse HEAD).Trim()
$remote = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
if ($local -ne $remote) { throw "local/remote SHA mismatch" }
```

网络暂断时只重试原 GitHub HTTPS 远端，不把仓库凭据交给第三方镜像。

- [ ] **步骤 11：监控 GitHub Actions 到最终成功**

通过 GitHub REST API 只读查询该 SHA 的 workflow run，直到：

```text
status=completed
conclusion=success
```

失败时读取 job/step，在本地复现并回到对应任务以 TDD 修复；不操作 EdgeOne 控制台，不创建云资源，不放宽零费用门禁。

## 完成定义

- 当前账号六类长期数据可以创建一个版本 1 `.spbackup` 文件；明确排除项没有进入文件。
- 六类数据在创建和恢复前都经过权威解析器、唯一 ID、译本原书关系和预算验证。
- AES-256-GCM、PBKDF2-HMAC-SHA-256、600,000 次、16 字节盐、12 字节 IV、128 位标签和 AAD 有测试证据。
- 口令 12 至 128 个有效 Unicode code point，不裁剪、不归一化、不保存、不上传、不记录。
- 文件 16 MiB、密文/明文 12 MiB 和固定 KDF 参数在正确阶段 fail closed。
- 检查零写入，预览只显示时间和计数；不同账号拒绝恢复。
- 明确确认后整体替换，空分类清空；主写入失败反向回滚，回滚失败绝不显示成功。
- UI 支持键盘、可见标签、状态语义、窄屏换行和重复提交禁用，不暴露内部技术词。
- 口令状态、临时字节、候选引用和对象 URL 按规格清理，不声称物理内存清零。
- 没有新依赖、网络请求、云端写入、收费资源、模型调用或敏感日志。
- 文档准确区分本地加密备份与未实现的云端同步、跨账号迁移和自动合并。
- 全量测试、lint、类型检查、构建、零费用验证、扫描、本地/远端 SHA 与 GitHub CI 全部成功。
