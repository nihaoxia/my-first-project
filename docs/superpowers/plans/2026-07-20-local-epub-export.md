# 浏览器本地 EPUB 3 导出实现计划

> **面向 AI 代理的工作者：** 必须使用 `executing-plans` 逐任务实现；每个生产行为先写失败测试、确认红灯、再写最小实现。不得访问 EdgeOne、Blob、KV、模型或任何收费资源。

**目标：** 从本地和云端阅读器已经取得的完整译本章节，在浏览器中生成标准 EPUB 3 二进制并下载。

**架构：** `epub-export.ts` 负责严格输入校验、EPUB 文件树、异步 fflate 打包和归档自检；通用浏览器下载核心同时接收文本与 Uint8Array；专用客户端按钮只在点击时生成 EPUB。ReaderWorkspace 接收普通 JSON 导出输入，本地/云端阅读器继续从各自权威可读章节构造它。

**技术栈：** TypeScript 6、React 19、Next.js 16、fflate 0.8.3、现有 EPUB 归档/XML/package/parser、自带 Node 测试。

---

## 文件结构

- 创建 `src/lib/export/epub-export.ts`：输入预算、XML 生成、文件树、异步 ZIP、结果和稳定错误。
- 修改 `src/lib/export/translation-export.ts`：导出共享顺序/文件名 helper，移除假 EPUB 草稿合同。
- 创建 `tests/epub-export.test.ts`：ZIP、OPF/nav/spine、回读、转义、语言、限额和错误。
- 修改 `src/lib/export/browser-download.ts`、`tests/browser-download.test.ts`：文本/二进制共用生命周期。
- 创建 `src/components/export/epub-download-button.tsx`：按需异步打包和稳定 UI 状态。
- 修改本地/云端阅读器、ReaderWorkspace 和 `tests/text-export-ui-contract.test.ts`。
- 修改 stage 8 mock/readiness、README、ROADMAP、DEV_LOG 和对应合同测试。

## 固定输出合同

```text
mimetype                              # 首 entry，store，精确 MIME
META-INF/container.xml
OEBPS/content.opf
OEBPS/nav.xhtml
OEBPS/styles/book.css
OEBPS/text/chapter-0001.xhtml
...
```

每章路径只用最终序号；OPF manifest、spine 和 nav 使用同一顺序。生成后必须通过 `inspectEpubArchive`，并能由 `parseEpubBook` 回读。

---

### 任务 1：EPUB 输入、XML 与文件树合同

**文件：**

- 创建：`tests/epub-export.test.ts`
- 创建：`src/lib/export/epub-export.ts`
- 修改：`src/lib/export/translation-export.ts`
- 修改：`tests/translation-export.test.ts`

- [ ] **步骤 1：写失败测试**

测试公开 API：

```ts
const result = await buildTranslatedBookEpubExport(input, {
  now: () => new Date("2026-07-20T12:34:56Z"),
});
assert.equal(result.fileName, "the-border-of-mist.epub");
assert.equal(result.mimeType, "application/epub+zip");
assert.ok(result.bytes instanceof Uint8Array);
```

同时覆盖：八种语言到 BCP 47、未知到 `und`；XML 特殊字符；Unicode；标题/原书名回退；章节顺序和剩余章节追加；空书、重复 ID、重复/未知 order、非法 XML 字符、超过章节/段落/单章/全书预算分别抛稳定 `EpubExportError.code`。删除旧 `buildEpubExportDraft`、`packaged: false` 和“尚未生成”断言，改为真实结果断言。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-export.test.ts tests/translation-export.test.ts
```

预期：FAIL，`epub-export.ts` 和 `buildTranslatedBookEpubExport` 不存在，旧草稿测试与新合同冲突。

- [ ] **步骤 3：实现输入准备和 XML 文件树**

在 `epub-export.ts` 定义：

```ts
export type EpubExportErrorCode =
  | "EPUB_EXPORT_EMPTY_BOOK"
  | "EPUB_EXPORT_INVALID_ORDER"
  | "EPUB_EXPORT_INVALID_TEXT"
  | "EPUB_EXPORT_TOO_LARGE"
  | "EPUB_EXPORT_PACKAGING_FAILED";
export class EpubExportError extends Error { readonly code: EpubExportErrorCode; }
export type EpubExportResult = { fileName: string; mimeType: "application/epub+zip"; bytes: Uint8Array };
export async function buildTranslatedBookEpubExport(
  input: TranslatedBookExportInput,
  runtime?: { now(): Date },
): Promise<EpubExportResult>;
```

先完成纯 helper：严格验证/排序、Unicode code point 长度、UTF-8 预算、XML 1.0 字符校验与五字符转义、语言映射、确定性 FNV-1a 标识、UTC 秒级 modified、完整 container/OPF/nav/CSS/章节 XHTML 字符串。章节路径固定为四位补零序号；超过 9,999 不可能，因为章节上限 2,000。

`translation-export.ts` 导出 `orderTranslatedBookChapters` 和 `buildExportFileSlug`，TXT 与 EPUB 共用；移除 `EpubExportDraft`/`buildEpubExportDraft`。

- [ ] **步骤 4：运行测试确认仍只因打包缺失而失败**

运行同一命令。预期 XML/验证 helper 测试通过，真实 bytes 测试因打包尚未完成而失败；不得改测试绕过。

---

### 任务 2：异步 ZIP、归档自检与回读

**文件：**

- 修改：`src/lib/export/epub-export.ts`
- 修改：`tests/epub-export.test.ts`

- [ ] **步骤 1：补 ZIP 和回读失败测试**

断言首 local entry 名称/方法/extra/content；用 `inspectEpubArchive` 读取 container、OPF、nav、CSS、章节；断言 manifest/spine/nav 顺序；用 `parseEpubBook` 回读并比较标题、章节标题和正文。注入打包失败 runtime 时断言 `EPUB_EXPORT_PACKAGING_FAILED`，不得返回部分字节。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-export.test.ts
```

预期：FAIL，输出还不是有效 ZIP 或不能回读。

- [ ] **步骤 3：实现异步打包与最终预算**

用 `fflate.zip` Promise 包装；插入顺序固定以 `mimetype` 开始，其 per-file option 为 `{ level: 0 }`，其余 `{ level: 6 }`。回调 error 映射 packaging failed。完成后检查 32 MiB 最终上限，调用 `inspectEpubArchive(bytes)`；内部自检任何失败统一包装为 packaging failed（输入超限仍保留 too large）。

- [ ] **步骤 4：绿灯与提交任务 1-2**

```powershell
node --experimental-strip-types --test tests/epub-export.test.ts tests/translation-export.test.ts tests/epub-archive.test.ts tests/epub-parser.test.ts
pnpm typecheck
git diff --check
git add src/lib/export/epub-export.ts src/lib/export/translation-export.ts tests/epub-export.test.ts tests/translation-export.test.ts
git commit -m "feat: package translated books as EPUB 3 (tasks 1-2/5)"
```

---

### 任务 3：通用二进制浏览器下载与 EPUB 按钮

**文件：**

- 修改：`src/lib/export/browser-download.ts`
- 修改：`tests/browser-download.test.ts`
- 创建：`src/components/export/epub-download-button.tsx`
- 创建：`tests/epub-download-ui-contract.test.ts`

- [ ] **步骤 1：写二进制生命周期与 UI 合同失败测试**

给浏览器核心增加 `triggerBrowserDownload({ fileName, data, mimeType }, runtime)` 测试，data 使用 `Uint8Array([80,75])`；断言 Blob 收到原字节和 `application/epub+zip`，文件名校验发生在 runtime 前，click 失败仍 remove/revoke，清理错误不逃逸。现有 `triggerTextDownload` 事件顺序必须不变。

静态 UI 合同断言 EPUB 按钮导入真实 builder，点击时才调用，包含“正在生成 EPUB”与“下载完整译本 EPUB”，不含 `fetch`、云 SDK、模型或 fs。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/browser-download.test.ts tests/epub-download-ui-contract.test.ts
```

预期：FAIL，通用 API/组件不存在。

- [ ] **步骤 3：实现共用核心与组件**

把 runtime `createBlob` 参数扩展为 `string | Uint8Array`；`triggerBrowserDownload` 负责安全文件名和副作用，`triggerTextDownload` 只映射 MIME 并委托。创建客户端 `EpubDownloadButton`，props 为 `TranslatedBookExportInput`；维护 idle/building/result，building 时禁用；await builder 后调用二进制核心。builder 错误映射为“无法生成 EPUB，请检查译本内容后重试”，下载错误复用统一提示。

- [ ] **步骤 4：绿灯与提交**

```powershell
node --experimental-strip-types --test tests/browser-download.test.ts tests/epub-download-ui-contract.test.ts
pnpm typecheck
git diff --check
git add src/lib/export/browser-download.ts src/components/export/epub-download-button.tsx tests/browser-download.test.ts tests/epub-download-ui-contract.test.ts
git commit -m "feat: download binary EPUB files (task 3/5)"
```

---

### 任务 4：本地/云端阅读器与阶段 8 迁移

**文件：**

- 修改：`src/components/reader/reader-workspace.tsx`
- 修改：`src/components/reader/local-translation-reader.tsx`
- 修改：`src/components/cloud/cloud-translation-reader.tsx`
- 修改：`tests/text-export-ui-contract.test.ts`
- 修改：`src/lib/mock-data.ts`
- 修改：`src/lib/project/stage-eight-readiness.ts`
- 修改：`tests/stage-eight-readiness.test.ts`

- [ ] **步骤 1：写失败合同**

要求 ReaderWorkspace 有 `epubDownloadInput?: TranslatedBookExportInput` 并渲染 `EpubDownloadButton`；本地阅读器用 `getReadableStoredLocalTranslationChapters` 同时构造 TXT/EPUB 输入；云端用已经取得的 `translation.chapters` 和 originalBook，不新增服务调用。阶段 8 local items 包含“真实 EPUB 3 打包和浏览器下载”，blockers 不再含真实 EPUB/浏览器下载；mock export 格式从“EPUB 草稿”改为“EPUB”。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/text-export-ui-contract.test.ts tests/stage-eight-readiness.test.ts
```

预期：FAIL，阅读器和 readiness 仍只有 TXT/草稿。

- [ ] **步骤 3：实现接线**

本地/云端各先构造一次 `TranslatedBookExportInput`，TXT builder 与 `epubDownloadInput` 共用，避免章节映射漂移。ReaderWorkspace 在 TXT 按钮旁渲染 EPUB 按钮。mock data 不在模块加载时打包字节，只展示真实 EPUB 文件名并标记格式 `EPUB`；可用 `buildEpubExportFileName(input.title)` 纯 helper。

- [ ] **步骤 4：绿灯与提交**

```powershell
node --experimental-strip-types --test tests/text-export-ui-contract.test.ts tests/stage-eight-readiness.test.ts tests/translation-export.test.ts
pnpm typecheck
git diff --check
git add src/components/reader/reader-workspace.tsx src/components/reader/local-translation-reader.tsx src/components/cloud/cloud-translation-reader.tsx tests/text-export-ui-contract.test.ts src/lib/mock-data.ts src/lib/project/stage-eight-readiness.ts tests/stage-eight-readiness.test.ts
git commit -m "feat: expose EPUB downloads in readers (task 4/5)"
```

---

### 任务 5：文档、全量验证、推送与 CI

**文件：**

- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`tests/current-production-docs.test.ts`
- 修改：`src/lib/product-capabilities.ts`
- 修改：`tests/product-capabilities.test.ts`

- [ ] **步骤 1：先更新文档合同并确认红灯**

合同要求 README/ROADMAP 同时声明本地 EPUB 导入和真实 EPUB 3 导出已完成；`localPrototypeCapabilities.browserLocalEpubExport` 必须为 `true`，而代表云端生产导出管线的 `productionExport` 继续为 `false`。不得出现“EPUB 草稿”“真实 EPUB 打包尚未接入”“真实浏览器下载尚未接入”。仍须声明封面/图片/字体/固定布局/DRM、云端文件保存、MOBI/PDF 未实现。

- [ ] **步骤 2：更新文档和开发日志**

同步功能清单、阶段 8、后续待办、依赖复用、TDD 红/绿灯和安全边界；不改写历史记录，只追加当前完成状态。

- [ ] **步骤 3：最终验证**

```powershell
node --experimental-strip-types --test tests/epub-export.test.ts tests/browser-download.test.ts tests/epub-download-ui-contract.test.ts tests/text-export-ui-contract.test.ts tests/stage-eight-readiness.test.ts tests/current-production-docs.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
node -e "for (const p of ['fflate','@xmldom/xmldom']) { const j=require('./node_modules/'+p+'/package.json'); console.log(p,j.version,j.license,Object.keys(j.dependencies||{}).length) }"
rg -n "AKID[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----" . --glob '!node_modules/**' --glob '!.next/**' --glob '!pnpm-lock.yaml'
git diff --check
```

预期：全部测试、lint、typecheck、build、零费用合同通过；两个依赖仍为 MIT/0 运行时依赖；敏感扫描无真实命中；diff 干净。

- [ ] **步骤 4：提交、推送与 CI**

```powershell
git add README.md docs/ROADMAP.md docs/DEV_LOG.md src/lib/product-capabilities.ts tests/current-production-docs.test.ts tests/product-capabilities.test.ts
git commit -m "docs: document real local EPUB export (task 5/5)"
git push origin HEAD:main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

本地与远端 SHA 必须一致。只读监控对应 GitHub Actions 到 `status=completed`、`conclusion=success`；失败时读取 job、在本地复现、TDD 修复并重新推送。

## 完成定义

- 本地和云端完整译本都有 TXT 与真实 EPUB 3 两种下载。
- EPUB 是有效二进制、首 entry/mimetype 正确、OPF/nav/spine/章节一致，并能被本项目安全导入器回读。
- 用户文本被严格验证/转义，顺序、限额和错误都 fail closed，不生成半本书。
- 点击打包与下载不发起网络请求、不写云端、不调用模型。
- 旧草稿能力描述全部迁移，未实现范围仍准确。
- 全量验证、远端 SHA 和 GitHub CI 均成功。
