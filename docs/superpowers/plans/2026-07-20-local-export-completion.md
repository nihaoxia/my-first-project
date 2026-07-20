# 本地导出闭环实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在不访问外部服务、不新增依赖和不产生费用的前提下，让本地/云端译本可下载完整 TXT，让本地/云端笔记可下载 Markdown，并统一所有文本下载的浏览器副作用与错误处理。

**架构：** 纯导出构建器负责文件名和文本内容；可注入的浏览器下载核心负责校验、对象 URL 生命周期和稳定错误结果；单个客户端按钮组件负责用户交互。页面只把当前账号有权读取且已经保存的数据映射为导出输入，云端全量笔记继续受 10,000 条硬上限保护。

**技术栈：** Next.js 16、React 19、TypeScript 6、Node 原生测试、浏览器 Blob/Object URL、现有 EdgeOne/Supabase 兼容云端服务层。

---

## 文件结构

- 创建 `src/lib/export/browser-download.ts`：通用文本 MIME、文件名校验、可注入下载运行时、稳定结果和用户提示。
- 创建 `src/components/export/text-download-button.tsx`：唯一执行浏览器 Blob/对象 URL/临时链接副作用的客户端组件。
- 修改 `src/components/study/study-export-button.tsx`：保留现有页面 API，改为统一组件的薄适配层。
- 删除 `src/lib/export/study-download.ts`：移除只服务词汇/句子的重复下载元数据。
- 创建 `tests/browser-download.test.ts`：下载核心成功、失败、清理、MIME 和非法文件名测试。
- 删除 `tests/study-download.test.ts`：其行为由通用下载测试覆盖。
- 修改 `src/lib/export/study-export.ts`：新增笔记 Markdown 构建器和稳定文件名回退。
- 修改 `src/lib/cloud/study-core.ts`：允许 `note` 使用现有 10,000 条有界全量扫描。
- 修改 `src/app/study/notes/page.tsx`：服务端准备云端完整笔记导出集合和超限状态。
- 修改 `src/components/study/notes-workspace.tsx`：下载已保存笔记，并在云端编辑后同步完整导出集合。
- 修改 `tests/study-export.test.ts`、`tests/cloud-study.test.ts`、`tests/cloud-study-ui-contract.test.ts`：笔记导出与 UI 合约。
- 修改 `src/lib/export/translation-export.ts`：保证任意 Unicode 标题得到非空安全文件名。
- 修改 `src/lib/cloud/translations-core.ts`：导出云端语言的用户可见标签函数。
- 修改 `src/components/reader/reader-workspace.tsx`：接收并展示完整译本 TXT 下载。
- 修改 `src/components/reader/local-translation-reader.tsx`：从全部可读本地章节构造导出数据。
- 修改 `src/components/cloud/cloud-translation-reader.tsx`：从权威云端译本和原书构造导出数据。
- 创建 `tests/text-export-ui-contract.test.ts`：固定本地/云端译本、笔记和统一组件接线。
- 修改 `tests/translation-export.test.ts`、`tests/cloud-translations.test.ts`、`tests/user-facing-copy.test.ts`：文件名、语言标签和文案回归。
- 修改 `README.md`、`docs/ROADMAP.md`、`docs/DEV_LOG.md`：同步 EdgeOne 零费用架构和真实下载能力。

### 任务 1：统一浏览器文本下载核心

**文件：**
- 创建：`tests/browser-download.test.ts`
- 创建：`src/lib/export/browser-download.ts`
- 创建：`src/components/export/text-download-button.tsx`
- 修改：`src/components/study/study-export-button.tsx`
- 删除：`src/lib/export/study-download.ts`
- 删除：`tests/study-download.test.ts`

- [ ] **步骤 1：编写下载核心失败测试**

创建 `tests/browser-download.test.ts`，使用以下最小可观察运行时，不依赖真实 DOM：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTextDownloadNotice,
  getTextDownloadMimeType,
  triggerTextDownload,
  type TextDownloadRuntime,
} from "../src/lib/export/browser-download.ts";

function runtime(events: string[], failClick = false): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) {
      events.push(`blob:${mimeType}:${content}`);
      return { content, mimeType };
    },
    createObjectUrl() { events.push("url:create"); return "blob:test"; },
    revokeObjectUrl(url) { events.push(`url:revoke:${url}`); },
    createLink() {
      events.push("link:create");
      return {
        href: "",
        download: "",
        click() { events.push("link:click"); if (failClick) throw new Error("blocked"); },
        remove() { events.push("link:remove"); },
      };
    },
    appendLink(link) { events.push(`link:append:${link.download}:${link.href}`); },
  };
}

test("downloads UTF-8 text and always releases the object URL", () => {
  const events: string[] = [];
  const result = triggerTextDownload(
    { fileName: "book.txt", content: "正文", kind: "text" },
    runtime(events),
  );
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, [
    "blob:text/plain;charset=utf-8:正文",
    "url:create",
    "link:create",
    "link:append:book.txt:blob:test",
    "link:click",
    "link:remove",
    "url:revoke:blob:test",
  ]);
});

test("rejects path-like file names before touching the browser runtime", () => {
  const events: string[] = [];
  assert.deepEqual(
    triggerTextDownload({ fileName: "../book.txt", content: "x", kind: "text" }, runtime(events)),
    { ok: false, code: "INVALID_FILE_NAME" },
  );
  assert.deepEqual(events, []);
});

test("reports a blocked download and still removes temporary resources", () => {
  const events: string[] = [];
  assert.deepEqual(
    triggerTextDownload({ fileName: "notes.md", content: "# Notes", kind: "markdown" }, runtime(events, true)),
    { ok: false, code: "DOWNLOAD_FAILED" },
  );
  assert.deepEqual(events.slice(-2), ["link:remove", "url:revoke:blob:test"]);
});

test("cleanup failures never escape as an unhandled download error", () => {
  const events: string[] = [];
  const port = runtime(events);
  port.revokeObjectUrl = () => { throw new Error("cleanup blocked"); };
  assert.deepEqual(
    triggerTextDownload({ fileName: "notes.md", content: "# Notes", kind: "markdown" }, port),
    { ok: true },
  );
});

test("returns fixed MIME types and stable user notices", () => {
  assert.equal(getTextDownloadMimeType("text"), "text/plain;charset=utf-8");
  assert.equal(getTextDownloadMimeType("csv"), "text/csv;charset=utf-8");
  assert.equal(getTextDownloadMimeType("markdown"), "text/markdown;charset=utf-8");
  assert.equal(buildTextDownloadNotice({ ok: true }, "book.txt"), "已准备下载 book.txt");
  assert.equal(buildTextDownloadNotice({ ok: false, code: "DOWNLOAD_FAILED" }, "book.txt"), "无法准备下载，请重试。");
});
```

- [ ] **步骤 2：运行测试并验证红灯**

运行：

```powershell
node --experimental-strip-types --test tests/browser-download.test.ts
```

预期：FAIL，错误为找不到 `src/lib/export/browser-download.ts`，证明通用下载核心尚不存在。

- [ ] **步骤 3：实现最小下载核心**

创建 `src/lib/export/browser-download.ts`：

```ts
export type TextDownloadKind = "text" | "csv" | "markdown";
export type TextDownloadInput = { fileName: string; content: string; kind: TextDownloadKind };
export type TextDownloadResult =
  | { ok: true }
  | { ok: false; code: "INVALID_FILE_NAME" | "DOWNLOAD_FAILED" };

export type TextDownloadLink = {
  href: string;
  download: string;
  click(): void;
  remove(): void;
};

export type TextDownloadRuntime = {
  createBlob(content: string, mimeType: string): unknown;
  createObjectUrl(blob: unknown): string;
  revokeObjectUrl(url: string): void;
  createLink(): TextDownloadLink;
  appendLink(link: TextDownloadLink): void;
};

const mimeTypes: Record<TextDownloadKind, string> = {
  text: "text/plain;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
};

export function getTextDownloadMimeType(kind: TextDownloadKind) { return mimeTypes[kind]; }

export function triggerTextDownload(input: TextDownloadInput, runtime: TextDownloadRuntime): TextDownloadResult {
  if (!isSafeFileName(input.fileName)) return { ok: false, code: "INVALID_FILE_NAME" };
  let url = "";
  let link: TextDownloadLink | undefined;
  try {
    const blob = runtime.createBlob(input.content, getTextDownloadMimeType(input.kind));
    url = runtime.createObjectUrl(blob);
    link = runtime.createLink();
    link.href = url;
    link.download = input.fileName;
    runtime.appendLink(link);
    link.click();
    return { ok: true };
  } catch {
    return { ok: false, code: "DOWNLOAD_FAILED" };
  } finally {
    try { link?.remove(); } catch {}
    if (url) { try { runtime.revokeObjectUrl(url); } catch {} }
  }
}

export function buildTextDownloadNotice(result: TextDownloadResult, fileName: string) {
  if (result.ok) return `已准备下载 ${fileName}`;
  return result.code === "INVALID_FILE_NAME" ? "下载文件名无效。" : "无法准备下载，请重试。";
}

function isSafeFileName(value: string) {
  return value.trim() === value && value.length > 0 && value.length <= 240 && !/[\\/\u0000-\u001f\u007f]/u.test(value);
}
```

- [ ] **步骤 4：实现唯一客户端按钮和学习导出适配层**

创建 `src/components/export/text-download-button.tsx`，使用 `Blob`、`URL.createObjectURL` 和临时 `<a download>` 构造 `TextDownloadRuntime`。成功提示使用 `role="status"`，失败提示使用 `role="alert"`；组件不得出现 `fetch`。

将 `src/components/study/study-export-button.tsx` 改为只把现有 `csv | markdown` 属性传给 `TextDownloadButton`：

```tsx
import { TextDownloadButton } from "@/components/export/text-download-button";
import type { TextDownloadKind } from "@/lib/export/browser-download";

export function StudyExportButton(props: {
  content: string;
  fileName: string;
  kind: Extract<TextDownloadKind, "csv" | "markdown">;
  label: string;
}) {
  return <TextDownloadButton {...props} />;
}
```

删除 `src/lib/export/study-download.ts` 和 `tests/study-download.test.ts`。

- [ ] **步骤 5：运行聚焦测试并验证绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/browser-download.test.ts tests/study-export.test.ts
```

预期：全部通过，0 项失败。

- [ ] **步骤 6：提交任务 1**

```powershell
git add tests/browser-download.test.ts tests/study-download.test.ts src/lib/export/browser-download.ts src/lib/export/study-download.ts src/components/export/text-download-button.tsx src/components/study/study-export-button.tsx
git commit -m "feat: unify browser text downloads"
```

### 任务 2：笔记 Markdown 全量导出

**文件：**
- 修改：`tests/study-export.test.ts`
- 修改：`tests/cloud-study.test.ts`
- 修改：`tests/cloud-study-ui-contract.test.ts`
- 修改：`src/lib/export/study-export.ts`
- 修改：`src/lib/cloud/study-core.ts`
- 修改：`src/app/study/notes/page.tsx`
- 修改：`src/components/study/notes-workspace.tsx`

- [ ] **步骤 1：编写笔记内容和云端分页失败测试**

向 `tests/study-export.test.ts` 添加：

```ts
test("builds one Markdown file from saved notes", () => {
  const exported = buildNotesMarkdownExport({
    notes: [
      { id: "n1", title: "黑桥", source: "迷雾边境 · 第二章", updatedAt: "2026/7/20 20:00", content: "先看动作，再看环境。" },
      { id: "n2", title: "空白记录", source: "自由笔记", updatedAt: "2026/7/20 21:00", content: "" },
    ],
  });
  assert.equal(exported.fileName, "stray-pages-notes.md");
  assert.match(exported.content, /^# Stray Pages · 笔记本/);
  assert.ok(exported.content.indexOf("## 1. 黑桥") < exported.content.indexOf("## 2. 空白记录"));
  assert.match(exported.content, /\*\*来源：\*\* 迷雾边境 · 第二章/);
  assert.match(exported.content, /先看动作，再看环境。/);
});
```

向 `tests/cloud-study.test.ts` 添加 `note` 分页调用，并断言传给服务的每页查询都是 `{ kind: "note", limit: 100 }` 加游标；超限仍抛 `STUDY_EXPORT_LIMIT`。

向 `tests/cloud-study-ui-contract.test.ts` 扩展页面列表，使 `notes/page.tsx` 也必须包含 `listAllStudyItemsForExport`、`STUDY_EXPORT_LIMIT` 和“超过 10000 条”。

- [ ] **步骤 2：运行测试并验证红灯**

运行：

```powershell
node --experimental-strip-types --test tests/study-export.test.ts tests/cloud-study.test.ts tests/cloud-study-ui-contract.test.ts
```

预期：FAIL，原因分别为 `buildNotesMarkdownExport` 不存在、全量扫描不接受 `note`、笔记页没有有界导出接线。

- [ ] **步骤 3：实现笔记 Markdown 和有界全量扫描**

在 `src/lib/export/study-export.ts` 新增：

```ts
import type { StudyNote } from "../study/study-notes-local.ts";

export function buildNotesMarkdownExport(input: { notes: StudyNote[] }): StudyExportResult {
  const sections = input.notes.map((note, index) => [
    `## ${index + 1}. ${note.title.trim()}`,
    `**来源：** ${note.source || "自由笔记"}`,
    `**更新时间：** ${note.updatedAt}`,
    note.content.trim(),
  ].filter(Boolean).join("\n\n"));
  return {
    fileName: "stray-pages-notes.md",
    content: ["# Stray Pages · 笔记本", ...sections].join("\n\n"),
  };
}
```

将 `listAllStudyItemsForExport` 的 `kind` 联合类型从 `"vocabulary" | "sentence"` 扩展为 `"vocabulary" | "sentence" | "note"`，不修改 10,000 条限制和分页算法。

- [ ] **步骤 4：接入本地和云端已保存笔记**

在 `src/app/study/notes/page.tsx`：

1. 云端模式调用 `listAllStudyItemsForExport(..., "note")`；
2. 将全量结果映射为 `StudyNote[]` 并作为 `initialExportNotes` 传给 `NotesWorkspace`；
3. 捕获 `STUDY_EXPORT_LIMIT` 并传 `exportLimitReached`；其他错误继续抛出；
4. 本地模式不在服务端构造导出，交给客户端当前账号作用域数据。

在 `NotesWorkspace` 增加：

```ts
initialExportNotes?: StudyNote[];
exportLimitReached?: boolean;
```

云端模式初始化独立 `cloudExportNotes`，新建、保存、删除时同时更新 `cloudNotes` 与 `cloudExportNotes`；加载更多只更新可见分页集合。导出来源为云端的 `cloudExportNotes` 或本地的 `notes`，通过 `buildNotesMarkdownExport` 和 `TextDownloadButton` 在“新建笔记”同一操作区显示“导出 Markdown”。未保存 `drafts` 不参与构建。服务不可用或超限时不显示按钮，并显示明确原因。

- [ ] **步骤 5：运行聚焦测试并验证绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/study-export.test.ts tests/cloud-study.test.ts tests/cloud-study-ui-contract.test.ts
```

预期：全部通过，0 项失败。

- [ ] **步骤 6：提交任务 2**

```powershell
git add tests/study-export.test.ts tests/cloud-study.test.ts tests/cloud-study-ui-contract.test.ts src/lib/export/study-export.ts src/lib/cloud/study-core.ts src/app/study/notes/page.tsx src/components/study/notes-workspace.tsx
git commit -m "feat: download saved notes as markdown"
```

### 任务 3：本地与云端译本 TXT 下载

**文件：**
- 修改：`tests/translation-export.test.ts`
- 修改：`tests/cloud-translations.test.ts`
- 创建：`tests/text-export-ui-contract.test.ts`
- 修改：`src/lib/export/translation-export.ts`
- 修改：`src/lib/cloud/translations-core.ts`
- 修改：`src/components/reader/reader-workspace.tsx`
- 修改：`src/components/reader/local-translation-reader.tsx`
- 修改：`src/components/cloud/cloud-translation-reader.tsx`

- [ ] **步骤 1：编写文件名、语言标签和 UI 接线失败测试**

向 `tests/translation-export.test.ts` 添加：

```ts
test("uses a safe non-empty fallback for an unmapped Unicode title", () => {
  const exported = buildTranslatedBookTxtExport({
    title: "星河",
    originalTitle: "星河",
    targetLanguage: "英文",
    chapters: [{ id: "c1", title: "第一章", paragraphs: ["Text"] }],
  });
  assert.equal(exported.fileName, "stray-pages-export.txt");
});
```

向 `tests/cloud-translations.test.ts` 添加语言标签断言：

```ts
assert.equal(getCloudBookLanguageLabel("CHINESE"), "中文");
assert.equal(getCloudBookLanguageLabel("FRENCH"), "法语");
assert.equal(getCloudBookLanguageLabel("UNKNOWN"), "未知");
```

创建 `tests/text-export-ui-contract.test.ts`，读取相关源文件并断言：

- `reader-workspace.tsx` 接收 `download` 且渲染 `TextDownloadButton`，标签为“下载完整译本 TXT”；
- `local-translation-reader.tsx` 调用 `getReadableStoredLocalTranslationChapters` 和 `buildTranslatedBookTxtExport`；
- `cloud-translation-reader.tsx` 调用 `getCloudBooksService().get`、`buildTranslatedBookTxtExport` 和 `getCloudBookLanguageLabel`；
- `text-download-button.tsx` 不包含 `fetch(`，包含 `createObjectURL` 与 `revokeObjectURL`；
- `notes-workspace.tsx` 使用 `buildNotesMarkdownExport` 且不把 `drafts` 传给构建器。

- [ ] **步骤 2：运行测试并验证红灯**

运行：

```powershell
node --experimental-strip-types --test tests/translation-export.test.ts tests/cloud-translations.test.ts tests/text-export-ui-contract.test.ts
```

预期：FAIL，原因为 Unicode 文件名为空、语言标签函数未导出、阅读器尚未接入下载。

- [ ] **步骤 3：保证导出文件名非空并导出语言标签**

在 `translation-export.ts` 的文件名函数末尾使用：

```ts
const slug = transliterated
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
return slug || "stray-pages-export";
```

在 `translations-core.ts` 导出：

```ts
export function getCloudBookLanguageLabel(language: CloudBookLanguage) {
  return LANGUAGE_LABEL[language];
}
```

- [ ] **步骤 4：向阅读器传入并展示纯文本导出数据**

给 `ReaderWorkspaceProps` 新增：

```ts
download?: TextExportResult;
```

在阅读器标题操作区有 `download` 时渲染：

```tsx
<TextDownloadButton
  content={download.content}
  fileName={download.fileName}
  kind="text"
  label="下载完整译本 TXT"
/>
```

本地父组件使用 `state.translation` 和 `getReadableStoredLocalTranslationChapters` 构造：

```ts
const download = buildTranslatedBookTxtExport({
  title: state.translation.title,
  originalTitle: state.translation.originalTitle,
  targetLanguage: state.translation.targetLanguage,
  chapters: getReadableStoredLocalTranslationChapters(state.translation).map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    paragraphs: chapter.translatedParagraphs,
  })),
});
```

云端父组件在权威 `getReader` 后读取同一账号的原书：

```ts
const originalBook = await getCloudBooksService().get(userId, translation.originalBookId);
const download = buildTranslatedBookTxtExport({
  title: translation.title,
  originalTitle: originalBook.title,
  targetLanguage: getCloudBookLanguageLabel(translation.targetLanguage),
  chapters: translation.chapters.map((chapter) => ({
    id: chapter.chapterId,
    title: chapter.title,
    paragraphs: chapter.content.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean),
  })),
});
```

把 `download` 传给各自 `ReaderWorkspace`。两条路径只使用已经取得的权威数据，不新增客户端请求、不读取原文对象。

- [ ] **步骤 5：运行聚焦测试并验证绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/translation-export.test.ts tests/cloud-translations.test.ts tests/text-export-ui-contract.test.ts
```

预期：全部通过，0 项失败。

- [ ] **步骤 6：提交任务 3**

```powershell
git add tests/translation-export.test.ts tests/cloud-translations.test.ts tests/text-export-ui-contract.test.ts src/lib/export/translation-export.ts src/lib/cloud/translations-core.ts src/components/reader/reader-workspace.tsx src/components/reader/local-translation-reader.tsx src/components/cloud/cloud-translation-reader.tsx
git commit -m "feat: download complete translations as text"
```

### 任务 4：更新用户文案和当前架构文档

**文件：**
- 修改：`tests/user-facing-copy.test.ts`
- 创建：`tests/current-production-docs.test.ts`
- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`

- [ ] **步骤 1：编写文档与用户文案失败测试**

创建 `tests/current-production-docs.test.ts`，读取 README 和路线图并断言：

```ts
assert.match(readme, /EdgeOne Makers/);
assert.match(readme, /用户名和密码/);
assert.match(readme, /Blob/);
assert.match(readme, /译本 TXT.*笔记 Markdown/s);
assert.doesNotMatch(readme, /生产目标固定为腾讯云广州：Linux 云服务器/);
assert.doesNotMatch(readme, /生产使用仍需部署 Supabase migration、配置短信供应商/);
assert.match(roadmap, /真实浏览器文本下载.*已完成/);
assert.doesNotMatch(roadmap, /真实浏览器文件下载尚未接入/);
```

扩展 `tests/user-facing-copy.test.ts`，断言阅读器和笔记页面包含真实下载文案，且不出现“下载尚未接入”。

- [ ] **步骤 2：运行测试并验证红灯**

运行：

```powershell
node --experimental-strip-types --test tests/current-production-docs.test.ts tests/user-facing-copy.test.ts
```

预期：FAIL，README 仍描述旧生产架构，路线图仍把浏览器下载列为未接入。

- [ ] **步骤 3：更新 README 和路线图**

将 README 的生产概述改为以下事实，不保留双重“当前生产方案”：

- 当前生产目标为 EdgeOne Makers 免费版；
- 生产账号为用户名/密码/恢复码，不依赖短信；
- Blob 是账号、业务数据和原文对象的唯一权威存储；
- 免费状态未精确确认时 Blob 写入和模型调用都 fail closed；
- 本地 TXT 流程、译本 TXT、词汇 CSV、句子 Markdown、笔记 Markdown 可离线使用；
- Supabase/Prisma/COS/短信/MCP 仅为历史兼容开发路径，不是当前生产要求；
- EPUB/MOBI/PDF、AI 问答、语音和真实 EPUB 打包仍未实现。

在路线图阶段 8 将真实浏览器文本下载标为已完成，只保留 EPUB 二进制打包为后续项目；移除末尾重复的“真实浏览器文件下载尚未接入”。

- [ ] **步骤 4：记录开发日志证据**

在 `docs/DEV_LOG.md` 的 2026-07-20 节追加本子项目条目，记录：

- 统一下载组件与错误清理；
- 笔记 Markdown 和译本 TXT 的本地/云端接线；
- 10,000 条云端笔记导出上限；
- TDD 红灯命令和对应缺失原因；
- 聚焦测试、全量测试、Lint、类型检查、构建、零费用验证器和 `git diff --check` 的最终结果。

最终数字必须来自任务 5 的新鲜命令输出，不预填通过数。

- [ ] **步骤 5：运行文档测试并验证绿灯**

运行：

```powershell
node --experimental-strip-types --test tests/current-production-docs.test.ts tests/user-facing-copy.test.ts
```

预期：全部通过，0 项失败。

- [ ] **步骤 6：提交任务 4**

```powershell
git add tests/current-production-docs.test.ts tests/user-facing-copy.test.ts README.md docs/ROADMAP.md docs/DEV_LOG.md
git commit -m "docs: align exports with zero-cost production"
```

### 任务 5：完整验证、最终日志和推送

**文件：**
- 修改：`docs/DEV_LOG.md`（仅当任务 4 中尚未能写入最终数字）

- [ ] **步骤 1：运行完整测试**

```powershell
pnpm test
```

预期：全部测试通过，0 项失败。记录实际测试数。

- [ ] **步骤 2：运行静态与类型验证**

```powershell
pnpm lint
pnpm typecheck
```

预期：两个命令均退出码 0。

- [ ] **步骤 3：运行生产构建和零费用门禁**

```powershell
pnpm build
pnpm verify:zero-cost
```

预期：构建退出码 0；零费用验证器明确通过，且没有网络部署、Blob 写入或模型调用。

- [ ] **步骤 4：运行差异与敏感信息检查**

```powershell
git diff --check
git status --short
rg -n "AKID|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|EDGEONE_SESSION_SECRET=.*[^<]" -g '!node_modules/**' -g '!.next/**' .
```

预期：`git diff --check` 无输出；状态只包含本计划预期文件；敏感扫描不命中真实凭据。

- [ ] **步骤 5：把最终验证数字写入开发日志并重新检查**

用任务 5 的实际输出替换开发日志中的验证结果，再运行：

```powershell
git diff --check
node --experimental-strip-types --test tests/current-production-docs.test.ts
```

预期：通过，0 项失败。

- [ ] **步骤 6：提交最终日志**

```powershell
git add docs/DEV_LOG.md
git commit -m "docs: record local export verification"
```

如果开发日志已包含最终数字且工作区无差异，不创建空提交。

- [ ] **步骤 7：推送并核对远端**

```powershell
git push origin HEAD:main
git ls-remote origin refs/heads/main
git rev-parse HEAD
```

预期：推送成功，远端 `main` SHA 与本地 HEAD 完全一致。若网络暂时无法连接 GitHub，保留干净且已提交的本地状态并在后续轮次重试，不把未推送误报为成功。

---

## 计划自检结果

- 规格中的译本 TXT、笔记 Markdown、统一组件、错误处理、10,000 条上限、文档更新和零费用边界均有对应任务。
- 没有把 EPUB、PDF、MOBI、语音、AI 问答或 EdgeOne 开通混入本计划。
- 每个生产行为变更都先有失败测试和明确红灯命令。
- 本地与云端导出都只使用当前账号已经保存且有权读取的数据；未保存笔记草稿不导出。
- 计划不要求安装依赖、调用外部 API、写 Blob、启用模型或创建任何云资源。
