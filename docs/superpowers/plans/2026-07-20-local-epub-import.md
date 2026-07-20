# 本地 EPUB 导入实现计划

> **面向 AI 代理的工作者：** 必须使用 `executing-plans` 逐任务执行本计划；每个生产行为先写失败测试、确认红灯、再写最小实现。所有云服务保持停用，不访问 EdgeOne、Blob、KV、模型或对象存储。

**目标：** 在浏览器本地、安全地解析无 DRM、可重排 EPUB 2/3 文字书，把结果映射为现有章节预览与本地书架数据；不上传 EPUB 原文件，不调用网络，不产生云费用。

**架构：** 用精确锁定的 `fflate@0.8.3` 读取 ZIP、`@xmldom/xmldom@0.9.10` 解析 XML。归档层先检查 ZIP local header、central directory、路径和解压预算，再选择性解压控制文件与文字文档；XML/package/text 各层分别负责安全 DOM、OPF/spine/nav/NCX 和纯文本提取；编排器只输出格式无关章节预览。现有上传入口只负责选择 TXT/EPUB 解析器和稳定错误映射。

**技术栈：** Next.js 16、React 19、TypeScript 6、Node 原生测试、fflate 0.8.3、xmldom 0.9.10。

---

## 文件结构

- 创建 `src/lib/upload/chapter-preview.ts`：共享章节预览、警告类型和构造辅助函数。
- 修改 `src/lib/upload/txt-chapter-parser.ts`：复用共享章节类型，保持 TXT 行为不变。
- 创建 `src/lib/upload/epub-archive.ts`：ZIP local header、central directory、路径、预算与选择性解压。
- 创建 `src/lib/upload/epub-xml.ts`：编码、DTD/ENTITY 拒绝、安全 XML DOM 与节点预算。
- 创建 `src/lib/upload/epub-package.ts`：container、OPF、manifest、spine、nav/NCX、固定布局与 DRM 检查。
- 创建 `src/lib/upload/epub-text.ts`：XHTML 标题候选与纯文本段落提取。
- 创建 `src/lib/upload/epub-parser.ts`：编排解析并生成 EPUB 上传草稿数据。
- 创建 `tests/epub-fixtures.ts`：只用代码生成合成 EPUB，不提交版权书籍。
- 创建 `tests/epub-archive.test.ts`、`tests/epub-xml.test.ts`、`tests/epub-package.test.ts`、`tests/epub-text.test.ts`、`tests/epub-parser.test.ts`。
- 修改 `package.json`、`pnpm-lock.yaml`、上传策略/草稿/存储/组件测试与实现、README 和产品状态文档。

## 不可变安全合同

- 输入文件最大 2 MiB；最多 2,048 个 entry；entry 路径最大 512 字符。
- 总声明展开体积最大 32 MiB；单 entry 最大 8 MiB；单 entry 压缩比最大 200:1；总压缩比最大 100:1。
- 实际解压 XML/OPF/NCX/HTML/XHTML 总量最大 8 MiB；单文字候选最大 2 MiB。
- 最终正文最大 2 MiB UTF-8；最多 2,000 章；DOM 深度最大 128；节点最大 200,000。
- 拒绝 NUL、反斜杠、绝对路径、Windows 盘符、中间空段、`.`/`..`、重复规范路径、未知压缩方法、ZIP64、多卷、加密 entry 与路径穿越。
- 首个 local entry 必须是未压缩的 `mimetype`，内容精确为 `application/epub+zip`。
- 拒绝 `DOCTYPE`、`ENTITY`、`EncryptedData`、多 rendition、固定布局和不安全 manifest/spine。
- spine 是章节顺序唯一权威；nav/NCX 只补标题；脚本、样式、SVG、MathML、嵌入和媒体内容全部忽略。

---

### 任务 1：精确依赖与许可合同

**文件：**

- 创建：`tests/epub-dependencies.test.ts`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：写依赖失败测试**

测试读取 `package.json`，断言 `dependencies.fflate === "0.8.3"`、`dependencies["@xmldom/xmldom"] === "0.9.10"`，并断言值中没有 `^`、`~`、`workspace:` 或 URL。再读取 lockfile，断言两个包均解析到精确版本。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-dependencies.test.ts
```

预期：FAIL；`fflate` 和 `@xmldom/xmldom` 尚未声明。

- [ ] **步骤 3：安装精确版本**

```powershell
pnpm add --save-exact fflate@0.8.3 @xmldom/xmldom@0.9.10
```

只允许修改 `package.json`、`pnpm-lock.yaml`。运行：

```powershell
pnpm licenses list --prod
```

确认两者许可证均为 MIT，且都没有运行时依赖；若命令不可用，则使用 `pnpm why --prod` 与包内 `package.json` 做只读核对。

- [ ] **步骤 4：确认绿灯并提交**

```powershell
node --experimental-strip-types --test tests/epub-dependencies.test.ts
git add package.json pnpm-lock.yaml tests/epub-dependencies.test.ts
git commit -m "build: add safe EPUB parsing dependencies"
```

预期：测试通过，提交只包含依赖合同。

---

### 任务 2：通用章节预览与文件策略

**文件：**

- 创建：`src/lib/upload/chapter-preview.ts`
- 修改：`src/lib/upload/txt-chapter-parser.ts`
- 修改：`src/lib/upload/upload-draft.ts`
- 修改：`src/lib/upload/file-policy.ts`
- 修改：`tests/txt-chapter-parser.test.ts`
- 修改：`tests/upload-file-policy.test.ts`
- 修改：`tests/upload-draft.test.ts`

- [ ] **步骤 1：先写失败测试**

在 `upload-file-policy.test.ts` 增加 EPUB 接受断言：

```ts
assert.deepEqual(validateUploadFileCandidate({ name: "story.epub", size: 4096 }), {
  ok: true,
  format: "EPUB",
});
assert.deepEqual(uploadFilePolicy.supportedFormats, [
  { label: "TXT", extension: ".txt" },
  { label: "EPUB", extension: ".epub" },
]);
```

保留 MOBI/PDF 拒绝断言。给 TXT 解析测试增加类型/形状断言，要求从 `chapter-preview.ts` 导出的 `ChapterPreview`、`ChapterWarning` 被复用；给 `upload-draft.test.ts` 增加 EPUB 在没有二进制内容时返回 `needs-epub-parser`，而不是伪装成 parsed。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/upload-file-policy.test.ts tests/upload-draft.test.ts tests/txt-chapter-parser.test.ts
```

预期：EPUB 仍被策略拒绝，通用章节模块不存在。

- [ ] **步骤 3：最小实现**

把 `TxtChapterWarning`/`TxtChapterPreview` 的格式无关部分迁到 `chapter-preview.ts`：

```ts
export type ChapterWarning = "leading-content" | "single-chapter" | "likely-toc" | "short-chapter";
export type ChapterPreview = {
  index: number;
  title: string;
  characterCount: number;
  content: string;
  contentPreview: string;
  suggestedSkip: boolean;
  warnings: ChapterWarning[];
};
```

TXT 模块以类型别名兼容旧导入。`file-policy.ts` 把 EPUB 加入 `supportedFormats`，校验只接受 TXT/EPUB；MOBI/PDF 继续返回 `unsupported-format`。不要在此任务写 EPUB 解析逻辑。

- [ ] **步骤 4：绿灯、回归与提交**

```powershell
node --experimental-strip-types --test tests/upload-file-policy.test.ts tests/upload-draft.test.ts tests/txt-chapter-parser.test.ts
git diff --check
git add src/lib/upload/chapter-preview.ts src/lib/upload/txt-chapter-parser.ts src/lib/upload/upload-draft.ts src/lib/upload/file-policy.ts tests/txt-chapter-parser.test.ts tests/upload-file-policy.test.ts tests/upload-draft.test.ts
git commit -m "refactor: share upload chapter previews"
```

---

### 任务 3：ZIP 元数据、路径与解压预算

**文件：**

- 创建：`tests/epub-fixtures.ts`
- 创建：`tests/epub-archive.test.ts`
- 创建：`src/lib/upload/epub-archive.ts`

- [ ] **步骤 1：创建合成 fixture 和公开合同测试**

`epub-fixtures.ts` 用 `fflate.zipSync`/`strToU8` 生成内存字节；对 `mimetype` 使用 level 0 并保证它是首 entry。helper 支持覆盖 entry 顺序、压缩方式、extra field、flags、声明尺寸和 central directory，以便构造恶意边界；不写磁盘。

`epub-archive.test.ts` 先覆盖：

1. 合法 EPUB 返回规范路径 map，并只解压调用方选择的控制/文字 entry；
2. 首 local entry 不是 `mimetype`、被压缩或内容不精确时返回 `EPUB_INVALID_ARCHIVE`；
3. 损坏 EOCD/central directory、local/central 名称不一致、重复规范路径时失败；
4. NUL、`\\`、`/root`、`C:/`、空段、`.`、`..`、过长路径失败；
5. 加密 flag、多卷字段、ZIP64 extra/哨兵尺寸、未知压缩方法失败；
6. entry 数、单项/总展开体积、单项/总压缩比达到上限可过，超过一字节/一项即失败；
7. 安全的零大小目录可存在但不进入解压结果；
8. 选择性解压后实际总量和单文字候选超限返回 `EPUB_EXPANDED_TOO_LARGE`。

错误必须是稳定码联合类型，不暴露原始文件路径或库堆栈。

- [ ] **步骤 2：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-archive.test.ts
```

预期：FAIL；找不到 `epub-archive.ts`。

- [ ] **步骤 3：实现归档扫描**

在 `epub-archive.ts` 定义所有限制常量、`EpubParseError`（或等价稳定错误类）、中央目录记录和：

```ts
export function inspectEpubArchive(bytes: Uint8Array): EpubArchive;
export async function readEpubEntries(
  archive: EpubArchive,
  paths: ReadonlySet<string>,
): Promise<ReadonlyMap<string, Uint8Array>>;
export function resolveEpubPath(basePath: string, href: string): string;
```

用 `DataView` 小端读取 ZIP 签名和字段；从尾部有限窗口查找唯一有效 EOCD；拒绝注释后垃圾、multi-disk 和 ZIP64。逐 central record 校验 flags、method、尺寸、offset、UTF-8 名称、local header 对应关系与预算。路径采用 `/`、区分大小写，不写文件系统。

解压时使用 `fflate.unzip` 的 `filter` 只接收明确请求的路径；完成后重新核对实际长度、CRC/库错误、单项与总实际预算。二进制资源只参与声明预算，不进入内存结果。

- [ ] **步骤 4：边界绿灯与提交**

```powershell
node --experimental-strip-types --test tests/epub-archive.test.ts
git diff --check
git add tests/epub-fixtures.ts tests/epub-archive.test.ts src/lib/upload/epub-archive.ts
git commit -m "feat: validate EPUB archives safely"
```

---

### 任务 4：安全 XML、package、导航与正文

**文件：**

- 创建：`tests/epub-xml.test.ts`
- 创建：`tests/epub-package.test.ts`
- 创建：`tests/epub-text.test.ts`
- 创建：`src/lib/upload/epub-xml.ts`
- 创建：`src/lib/upload/epub-package.ts`
- 创建：`src/lib/upload/epub-text.ts`

- [ ] **步骤 1：写 XML 安全失败测试**

覆盖 UTF-8 BOM/无 BOM；明确拒绝 UTF-16、非法 UTF-8、`DOCTYPE`、`ENTITY`、parsererror；命名空间前缀变化仍可按 `localName` 查询；深度 128 和节点 200,000 恰好可过，超过即失败。遍历必须迭代实现，不依赖递归调用栈。

- [ ] **步骤 2：写 package 失败测试**

覆盖：唯一 container rootfile；OPF 子目录相对解析；metadata title/creator/language；manifest 重复 id、不安全/外部/query href；spine 未知/重复 idref、`linear="no"`、非文字 media type；2,000 章边界；EPUB 3 nav 与 EPUB 2 NCX 标题；spine 顺序不受 nav 顺序影响；多 rootfile、`pre-paginated`、`encryption.xml` 的 `EncryptedData` 分别映射稳定错误。

- [ ] **步骤 3：写正文失败测试**

覆盖标题优先候选、段落与换行空白规范化、可见文字顺序；`script/style/noscript/svg/math/nav/aside/object/embed/iframe/audio/video` 完全忽略；空白正文返回空；单文档字节、DOM 深度与节点预算失败。

- [ ] **步骤 4：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-xml.test.ts tests/epub-package.test.ts tests/epub-text.test.ts
```

预期：三个生产模块均不存在。

- [ ] **步骤 5：实现安全 XML**

`epub-xml.ts` 使用 fatal UTF-8 `TextDecoder`，解析前按 ASCII 大小写无关扫描 `<!DOCTYPE`/`<!ENTITY`，再用 xmldom 的 `DOMParser` 和自定义 `errorHandler` 收集 warning/error/fatalError；任何解析诊断均失败。解析后用显式栈计算深度/节点数。提供 `childrenByLocalName`、`firstTextByLocalName` 等最小 helper，不执行 XPath、不加载外部资源。

- [ ] **步骤 6：实现 package 与导航**

`epub-package.ts` 分阶段暴露 `parseContainer`、`parsePackageDocument`、`parseNavigationTitles`。container 必须只有一个有效 rootfile；OPF 以 `localName` 读取 metadata/manifest/spine，spine 仅允许 XHTML/HTML 文字项并保持顺序；manifest href 经 `resolveEpubPath` 处理。nav/NCX 输出 `Map<规范资源路径, 标题>`，fragment 仅用于匹配前剥离，不改变 spine。

- [ ] **步骤 7：实现正文提取**

`epub-text.ts` 用显式栈深度优先遍历 DOM；忽略黑名单节点的整个子树；块级元素和 `br` 形成段落边界；连续空白折叠但保留段落。返回 `{ heading, documentTitle, content }`，不执行脚本、不 fetch、不创建浏览器 DOM。

- [ ] **步骤 8：绿灯、静态无网络合同与提交**

```powershell
node --experimental-strip-types --test tests/epub-xml.test.ts tests/epub-package.test.ts tests/epub-text.test.ts
rg -n "fetch\(|XMLHttpRequest|WebSocket|node:fs|writeFile|edgeone|blob" src/lib/upload/epub-*.ts
git diff --check
git add tests/epub-xml.test.ts tests/epub-package.test.ts tests/epub-text.test.ts src/lib/upload/epub-xml.ts src/lib/upload/epub-package.ts src/lib/upload/epub-text.ts
git commit -m "feat: parse EPUB packages and text safely"
```

预期：聚焦测试通过；`rg` 没有生产网络、云 SDK 或文件系统写入命中。

---

### 任务 5：解析编排与本地上传接线

**文件：**

- 创建：`tests/epub-parser.test.ts`
- 创建：`src/lib/upload/epub-parser.ts`
- 修改：`tests/local-upload-draft.test.ts`
- 修改：`tests/local-upload-storage.test.ts`
- 修改：`tests/user-facing-copy.test.ts`
- 修改：`src/lib/upload/local-upload-draft.ts`
- 修改：`src/lib/upload/local-upload-storage.ts`
- 修改：`src/components/upload/local-upload-panel.tsx`
- 修改：`src/components/upload/local-chapter-preview.tsx`

- [ ] **步骤 1：写端到端解析失败测试**

用 fixture 构造最小 EPUB 3（mimetype、container、OPF、nav、两章）和 EPUB 2（NCX）。断言：

- metadata 与文件名回退；spine 顺序；nav/NCX、heading、title、`第 N 章` 四级标题回退；
- 空白 spine 项跳过；全部空白返回 `EPUB_NO_READABLE_TEXT`；
- 输出章节 index 连续，content/preview/characterCount 稳定，且总 UTF-8 正文超过 2 MiB 时整体失败不截断；
- 归档/XML/package 错误只映射到公开稳定码。

- [ ] **步骤 2：写上传、存储和 UI 失败测试**

`local-upload-draft.test.ts` 断言 EPUB 只调用 `arrayBuffer()`、不调用 `text()`，成功后返回 `format: "EPUB"` 和 parsed chapters；缺 `arrayBuffer`/读取异常为 `file-read-failed`；损坏、DRM、固定布局、不安全、超限、无正文分别为稳定公开 reason。

`local-upload-storage.test.ts` 断言完整 parsed EPUB 可保存；`needs-epub-parser`、空章节、格式/metadata 不一致和未知 warning 必须 fail closed。`user-facing-copy.test.ts`/静态合同断言 input accept 为 `.txt,.epub`，页面说明 EPUB 只提取文字和章节，解析状态与各错误码有中文文案，章节空状态说“TXT 或 EPUB”。

- [ ] **步骤 3：确认红灯**

```powershell
node --experimental-strip-types --test tests/epub-parser.test.ts tests/local-upload-draft.test.ts tests/local-upload-storage.test.ts tests/user-facing-copy.test.ts
```

预期：解析编排器不存在，EPUB 仍无法读取/保存，UI 合同不满足。

- [ ] **步骤 4：实现编排器**

`parseEpubBook(bytes, fallbackMetadata)` 按以下固定顺序：归档检查 → container/encryption → OPF → nav/NCX → 逐 spine 选择性读取与正文提取 → 空章跳过 → 总章节/UTF-8 正文预算 → 标题优先级 → 共享章节预览。返回完整 metadata 和 chapters；任何阶段失败都抛稳定 `EpubParseError`，不返回半成品。

- [ ] **步骤 5：接入上传与存储**

`local-upload-draft.ts` 在策略成功且格式为 EPUB 时要求 `arrayBuffer()`，调用编排器，再映射为现有 `UploadDraftResult` 成功形状；catch 只映射已知 EPUB 错误，未知读取/运行异常统一 `file-read-failed`。TXT 分支保持原行为。

`local-upload-storage.ts` 允许 `value.format` 与 `metadata.format` 同为 TXT 或同为 EPUB，但仍必须 `parseStatus === "parsed"`、非空章节、连续有效 index、合法 warning；格式不一致或旧的 `needs-epub-parser` 一律清除。

- [ ] **步骤 6：接入界面**

文件 input 使用 `accept=".txt,.epub,text/plain,application/epub+zip"`；文案明确“EPUB 完全在浏览器本地提取文字与章节，不上传原文件，不保留图片/排版”；读取中按格式显示状态；稳定错误码映射为设计中的中文提示。不要新增网络请求、云配置或付费入口。

- [ ] **步骤 7：聚焦绿灯与提交**

```powershell
node --experimental-strip-types --test tests/epub-parser.test.ts tests/local-upload-draft.test.ts tests/local-upload-storage.test.ts tests/upload-file-policy.test.ts tests/upload-draft.test.ts tests/original-book-draft.test.ts tests/user-facing-copy.test.ts
git diff --check
git add tests/epub-parser.test.ts tests/local-upload-draft.test.ts tests/local-upload-storage.test.ts tests/user-facing-copy.test.ts src/lib/upload/epub-parser.ts src/lib/upload/local-upload-draft.ts src/lib/upload/local-upload-storage.ts src/components/upload/local-upload-panel.tsx src/components/upload/local-chapter-preview.tsx
git commit -m "feat: import EPUB books locally"
```

---

### 任务 6：文档、全量验证、推送与 CI

**文件：**

- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`tests/product-capabilities.test.ts`
- 修改：适用的 readiness/production contract 测试（仅当现有合同确实枚举上传格式）

- [ ] **步骤 1：先更新能力合同测试并确认红灯**

产品能力合同必须断言：本地 TXT/EPUB 已实现；EPUB 导入为浏览器本地文字提取；MOBI/PDF、真实 EPUB 导出、云端原文件保存仍未实现；EdgeOne 暂停不改变本地能力。运行对应测试，预期文档或能力枚举尚未同步而失败。

- [ ] **步骤 2：更新文档**

README 写明支持范围、安全限制和不上传；ROADMAP 把“本地 EPUB 导入”标为完成，把“真实 EPUB 导出”保留为下一项；DEV_LOG 记录依赖版本、MIT 许可证、解析边界、验证证据。不得宣称支持图片、排版、DRM、固定布局或云同步。

- [ ] **步骤 3：运行聚焦和全量验证**

```powershell
node --experimental-strip-types --test tests/epub-*.test.ts tests/upload-file-policy.test.ts tests/upload-draft.test.ts tests/local-upload-draft.test.ts tests/local-upload-storage.test.ts tests/original-book-draft.test.ts tests/product-capabilities.test.ts tests/user-facing-copy.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
pnpm licenses list --prod
rg -n "AKID|SECRET_KEY|PRIVATE_KEY|BEGIN (RSA |EC )?PRIVATE KEY|password\s*=|token\s*=" . --glob '!node_modules/**' --glob '!.next/**' --glob '!pnpm-lock.yaml'
git diff --check
git status --short
```

预期：所有测试、lint、typecheck、build、零费用合同通过；许可证确认新增包为 MIT；敏感扫描没有真实凭据；diff 无空白错误。若敏感扫描命中测试假值/文档示例，逐项人工确认并记录，禁止简单忽略。

- [ ] **步骤 4：提交文档与验证记录**

```powershell
git add README.md docs/ROADMAP.md docs/DEV_LOG.md tests/product-capabilities.test.ts
git add <仅本任务实际修改的 readiness/contract 测试>
git commit -m "docs: document safe local EPUB import"
```

再次运行 `git status --short --branch`，必须干净。

- [ ] **步骤 5：推送 GitHub main 并核对 SHA**

```powershell
git push origin HEAD:main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

预期：push 成功，本地 HEAD 与远端 main SHA 完全一致。网络临时失败时保留干净、已提交的本地状态并重试；未成功推送时绝不报告“已提交到仓库”。

- [ ] **步骤 6：监控 GitHub Actions**

通过 GitHub REST API 或 `gh run list --branch main --limit 1` 只读获取对应 head SHA 的 workflow run；轮询到 `status=completed`。只有 `conclusion=success` 才能宣称 CI 通过；失败则读取失败 job/log，在本地复现、TDD 修复、重新验证、提交与推送，直至成功。

---

## 完成定义

- 用户可以选择 2 MiB 以内的合法无 DRM、可重排 EPUB 2/3，并在完全本地解析后进入现有章节预览、编辑、跳过、保存书架、创建译本和阅读流程。
- 恶意 ZIP、XML 实体、路径穿越、压缩炸弹、固定布局、DRM、多 rendition、无正文和预算超限都稳定失败，且不会留下半成品草稿。
- 没有 EPUB 原文件上传、网络读取、云 SDK 写入、模型调用或新增收费资源。
- 精确依赖、许可证、聚焦测试、全量测试、lint、typecheck、build、零费用合同、敏感扫描和 CI 均有最新成功证据。
- 所有实现和文档提交到 GitHub `main`，远端 SHA 与本地 HEAD 一致。
