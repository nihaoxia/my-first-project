# 本地 EPUB 导入设计

## 背景与范围

Stray Pages 当前只允许 TXT 进入真实章节预览和本地书架。文件策略能识别 `.epub`，但会在读取前返回 `unsupported-format`；页面、存储守卫和测试也明确阻止 EPUB 伪装成已解析。现有章节编辑、跳过、保存到本地书架、创建译本和阅读流程已经能消费统一的章节预览数据，因此本子项目只补齐 EPUB 到该数据边界的安全解析。

首版支持无 DRM、可重排的 EPUB 2/3 文字书。固定布局、漫画、保留图片/字体/CSS、音视频、MathML/SVG 渲染、脚本、远程资源、加密内容和多重 rendition 不在范围内。真实 EPUB 导出是下一个独立子项目，本规格不提前实现。

所有解析都发生在用户浏览器内。EPUB 原文件和解压资源不会上传、不会写 EdgeOne Blob、不会发送到 API，也不会触发模型调用。

## 方案选择

采用两个精确锁定版本的免费开源 MIT 依赖：

- `fflate@0.8.3`：ZIP 中央目录检查、有过滤的异步解压；无运行时依赖。
- `@xmldom/xmldom@0.9.10`：XML/XHTML DOM 解析；无运行时依赖。

没有选择 `jszip`，因为它带有多项运行时依赖，且本项目只需要 ZIP 读取/后续写入的窄能力。没有选择自写 ZIP 或 XML 解析器，因为用户文件、ZIP64、命名空间、实体和路径处理的安全风险远高于减少两个 MIT 依赖的收益。没有选择 `epub.js`，因为它面向完整渲染器，包含本项目首版明确不需要的布局、资源和阅读引擎能力。

依赖只提供字节解压和 XML 语法树，不决定业务所有权、存储、章节顺序或用户文案。

## 处理管线

### 1. 文件入口

本地上传继续使用 2 MiB 单文件上限。`file-policy.ts` 将 EPUB 加入当前真实支持格式，但 MOBI、PDF 继续拒绝。文件选择器接受 `.txt,.epub`，文案明确说明 EPUB 只提取文字和章节结构。

`buildLocalUploadDraftFromFile` 先使用既有文件名、空文件和大小校验。TXT 继续走 UTF-8/GB18030 路径；EPUB 必须使用 `arrayBuffer()` 读取字节并调用独立解析器。读取异常统一为 `file-read-failed`，解析异常映射为稳定 EPUB 错误码，不暴露库堆栈、内部路径或原始 XML。

### 2. ZIP 安全检查与选择性解压

解析器在解压前验证首个本地 ZIP entry 必须是未压缩的 `mimetype`，内容精确为 `application/epub+zip`。随后使用 `fflate` 的异步 `unzip` 和 `filter(file)` 检查中央目录声明，再只解压 EPUB 控制文件与文字候选资源。

硬限制如下：

- 压缩文件：最多 2 MiB；
- ZIP entry：最多 2,048 个；
- 单个 entry 路径：最多 512 个字符；
- 全部 entry 声明的总展开体积：最多 32 MiB；
- 单个 entry 展开体积：最多 8 MiB；
- 单个 entry 压缩比：最多 200:1；
- 全部 entry 总压缩比：最多 100:1；
- 实际解压的 XML、OPF、NCX、HTML、XHTML 总量：最多 8 MiB；
- 单个实际解压文字候选：最多 2 MiB。

entry 名称含 NUL、反斜杠、绝对路径、盘符、中间空段、`.`/`..` 段、超过长度、重复规范路径或不支持的压缩方法时，整个 EPUB 拒绝。以单个 `/` 结尾、展开大小为 0 的安全目录 entry 可以存在，但只计入 entry 预算并被忽略。ZIP64、多卷 ZIP 和加密 ZIP entry 在 2 MiB 产品边界内没有必要，明确拒绝。所有路径按 ZIP 规范使用 `/`，按区分大小写的规范路径查找；不会把 entry 写入文件系统。

图片、字体、CSS、音视频等二进制资源只参与 entry 数、声明展开体积和压缩比预算，不解压到内存。这样既能识别压缩炸弹，也不会为首版不使用的资源浪费内存。

### 3. 容器与 OPF

必须存在 `META-INF/container.xml`，并且只能声明一个有效 `rootfile`；其 `full-path` 必须安全解析到归档内一个 OPF 文件。多个 rendition 明确返回“不支持多版本 EPUB”，不会静默选择其中一个。若 package 声明固定布局 `pre-paginated`，明确返回“不支持固定布局”。

如果 `META-INF/encryption.xml` 含任何 `EncryptedData`，返回“不支持加密或 DRM EPUB”。任何待解析 XML/XHTML 含 `<!DOCTYPE` 或 `<!ENTITY` 时直接拒绝，避免实体扩展和外部实体边界。解析器不会执行或获取外部 DTD。

OPF 以元素 `localName` 处理 EPUB 2/3 命名空间：

- metadata：读取第一个非空 title、creator、language；title/creator 缺失时回退到既有文件名推断；
- manifest：建立 `id → 安全归档路径/media-type/properties` 映射，重复 id 或不安全 href 拒绝；
- spine：按 `itemref` 顺序选择 `linear != no` 的 XHTML/HTML 内容项；未知 idref、重复 spine 项或非文字 media type 拒绝；
- 最多 2,000 个可读 spine 项。

OPF 路径和 manifest href 通过同一个 URI 解析器处理：允许相对路径和 `#fragment`，安全解码百分号；拒绝协议、`//`、查询串、反斜杠、NUL 和越界 `..`。

### 4. 章节标题与正文

spine 顺序是唯一权威章节顺序。EPUB 3 nav 或 EPUB 2 NCX 只用于为同一规范资源路径提供标题，不改变顺序。标题优先级为：

1. nav/NCX 中与 spine 资源匹配的非空文本；
2. 内容文档第一个 `h1`–`h6`；
3. 内容文档 `<title>`；
4. `第 N 章`。

XHTML 使用 XML 模式解析。遍历采用显式栈，不递归执行页面脚本；最大 DOM 深度 128，最大节点数 200,000。`script`、`style`、`noscript`、`svg`、`math`、`nav`、`aside`、`object`、`embed`、`iframe`、`audio`、`video` 内容全部忽略。`p`、标题、`li`、`blockquote`、`pre`、`div`、`section` 和换行元素形成段落边界；连续空白规范化，但不改变可见文字顺序。

空白 spine 文档跳过。最终至少需要一个非空章节；章节标题最多 200 个字符，章节数最多 2,000，总提取正文最多 2 MiB UTF-8，任一章节最多 2 MiB UTF-8。超过边界时不截断，整个导入明确失败，避免用户误以为保存了完整书籍。

解析结果映射到现有章节预览形状：稳定 index、title、characterCount、content、contentPreview、suggestedSkip 和 warnings。之后继续复用章节编辑、跳过、保存本地书架、创建译本和阅读器，不建立 EPUB 专用下游模型。

## 模块边界

- `epub-archive.ts`：ZIP header、entry 路径、大小/压缩比预算和选择性解压；不解析 XML。
- `epub-xml.ts`：拒绝 DTD/ENTITY、构造 XML DOM、命名空间无关查询、深度/节点预算；不解析 ZIP。
- `epub-package.ts`：container、OPF、nav/NCX、固定布局和加密判定；输出有序内容文档描述。
- `epub-text.ts`：单个 XHTML 到标题候选和纯文本段落；不访问网络或 DOM 页面。
- `epub-parser.ts`：编排上述模块，应用最终章节/文本限制并生成上传草稿所需结果。
- `local-upload-draft.ts`：选择 TXT 或 EPUB 解析器并映射稳定错误；不包含 EPUB 细节。

共享章节预览类型从 TXT 专用命名中抽出为格式无关模块，TXT 解析器和 EPUB 解析器共同使用。这个重命名只服务本次边界，不重构无关阅读器或云端 Repository。

## 本地存储与界面

本地上传草稿守卫允许 `format === "TXT"` 或 `format === "EPUB"`，但仍要求 `parseStatus === "parsed"`、非空章节和完整结构校验。旧的待解析 EPUB 草稿不会被误认为新格式，损坏数据仍 fail closed。

上传页在解析期间显示“正在读取并检查 EPUB”，成功后展示从 OPF/文件名得到的书名、作者、EPUB 格式和章节数量。错误文案分为：

- 文件不是有效 EPUB；
- EPUB 使用加密或 DRM；
- 固定布局暂不支持；
- 文件路径或归档结构不安全；
- 文件展开后超过安全限制；
- 没有可读取的文字章节；
- 浏览器读取失败；
- 本地存储空间不足。

用户只能在完整解析且草稿安全写入当前账号作用域后进入章节预览。章节预览文案由“TXT 文件”改为“TXT 或 EPUB 文件”。保存后的本地书籍保留 `format: "EPUB"` 和原始文件名，但只保存提取文字，不保存 ZIP、图片或其他资源。

## 测试策略

严格按 TDD 执行。测试夹具由测试代码使用 `fflate` 生成最小 EPUB 字节，不提交来源不明或受版权保护的电子书。

测试覆盖：

1. 最小 EPUB 3：mimetype、container、OPF、nav、两个 XHTML，验证 metadata、spine 顺序、标题和正文；
2. EPUB 2 NCX 标题；没有 nav/NCX 时的 heading/title/默认标题回退；
3. 文件名 metadata 回退、Unicode、百分号路径和 OPF 子目录解析；
4. `linear="no"`、空白文档和非文字 manifest 项处理；
5. 首 entry/mimetype 错误、损坏 ZIP、缺 container、缺 OPF、重复 id、未知 idref；
6. NUL、反斜杠、绝对路径、盘符、`..`、重复路径、外部 URL；
7. entry 数、单项/总展开体积、压缩比、实际解压文字、DOM 深度、节点数、章节数和最终 UTF-8 正文上限；
8. DTD、ENTITY、encryption.xml、固定布局、脚本/样式/嵌入内容忽略；
9. 本地上传读取、错误映射、草稿保存守卫、旧数据兼容和页面文案；
10. 静态合约确认 EPUB 解析模块不含 `fetch`、Blob SDK、模型调用或文件系统写入。

实现后运行聚焦测试、`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm verify:zero-cost`、依赖许可检查、敏感信息扫描和 `git diff --check`。

## 明确不在范围内

- 云端 EPUB 原文件上传或 Blob 保存；
- EPUB 图片、封面、字体、CSS、脚本、音视频或固定布局渲染；
- DRM/加密绕过；
- MOBI、PDF、DOCX、OCR；
- 真实 EPUB 导出和二进制打包；
- 自动语言翻译、AI 问答或语音；
- 扩大 EdgeOne Blob 或模型额度；
- 修改任何云端费用状态。

真实 EPUB 导出会在本导入子项目完成、验证并推送后进入独立规格与计划。
