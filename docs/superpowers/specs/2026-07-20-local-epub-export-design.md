# 浏览器本地 EPUB 3 导出设计

## 背景与目标

Stray Pages 已经能够从本地和云端权威译本章节生成完整 TXT，并且已经具备安全的浏览器下载生命周期；`translation-export.ts` 仍只有 `packaged: false` 的 EPUB 草稿，阶段 8 readiness 和文档也仍把真实 EPUB 打包列为阻塞项。本子项目把该草稿升级为真正可下载、可被通用阅读器打开、也可被本项目安全导入器重新解析的 EPUB 3 文件。

所有打包与下载都发生在浏览器中。用户点击后，组件从页面已经取得且有权读取的译本数据构造 ZIP 字节，再通过 Blob/Object URL 下载；不发送新的网络请求、不上传二进制、不写 EdgeOne Blob、不调用模型，也不创建任何云资源。

首版只导出文字译本：书名、原书名、目标语言、章节标题、段落和一份内置基础 CSS。明确不包含封面、图片、音视频、外部字体、脚本、DRM、固定布局、复杂分页、脚注语义、媒体叠加或云端导出记录。

## 方案选择

采用已经批准的方案 A：标准的最小 EPUB 3，每章一个 XHTML 文档。

- 相比“整本书一个 XHTML”，逐章文档能提供稳定 spine、目录跳转和大书阅读体验。
- 相比首版同时加入封面/图片/字体，纯文字包的 manifest、MIME、路径、体积和安全边界可被完整测试。
- 继续复用已精确锁定且审计为 MIT、无运行时依赖的 `fflate@0.8.3`，不增加任何依赖。
- 不手写压缩算法；业务代码只负责 EPUB 文件树、XML/XHTML 转义、顺序、限额与下载。

## 输出文件树

每个导出固定生成以下结构：

```text
mimetype
META-INF/container.xml
OEBPS/content.opf
OEBPS/nav.xhtml
OEBPS/styles/book.css
OEBPS/text/chapter-0001.xhtml
OEBPS/text/chapter-0002.xhtml
...
```

ZIP 的第一个 local entry 必须是 `mimetype`，使用 store 方法、不压缩、无 extra field，内容精确为 `application/epub+zip`。其余文字文件使用 Deflate。路径完全由代码生成，不使用章节 ID 或标题拼接路径，因此不接受路径穿越、斜杠、控制字符或重复路径输入。

生成完成后立即用现有安全 EPUB 归档检查器验证输出：首 entry、中央目录、local header、方法、路径和展开预算必须全部通过。内部自检失败时不触发浏览器下载。

## EPUB 元数据与顺序

`OEBPS/content.opf` 使用 EPUB 3.0 package：

- `dc:identifier`：`urn:stray-pages:<确定性摘要>`。摘要根据规范化书名、原书名、目标语言、章节 ID/标题/正文生成，只用于本地出版物标识，不承担密码学或权限用途。
- `dc:title`：译本标题；空白时使用“未命名译本”。
- `dc:language`：把中文、英文、日文、韩文、俄语、德语、西班牙语和法语映射为 `zh-CN`、`en`、`ja`、`ko`、`ru`、`de`、`es`、`fr`；未知标签使用 `und`。
- `dc:source`：原书名；空白时省略。
- `dcterms:modified`：由打包运行时提供的 UTC 时间，格式固定为 `YYYY-MM-DDTHH:mm:ssZ`。测试注入固定时间，真实点击使用当前时间。
- 不虚构作者、出版社、ISBN 或版权声明。

章节顺序先应用现有 `chapterOrder`，再追加没有列入顺序的剩余章节。EPUB 打包额外执行严格完整性检查：章节 ID 必须非空且唯一，`chapterOrder` 不得重复或引用未知 ID；至少有一章，最多 2,000 章。章节路径按最终位置生成，manifest、spine 和 nav 使用同一有序集合。

## XHTML、导航与样式

每章生成完整 XML 模式 XHTML 5：XML 声明、`html` 的 XHTML namespace、`lang/xml:lang`、`head/title/link` 和 `body/article/h1/p`。不加入 `DOCTYPE`，以便满足本项目“拒绝任何 DTD/ENTITY”的导入边界。

所有用户文本统一经过 XML 1.0 校验和实体转义：`& < > " '` 被安全编码；NUL、非法控制字符、孤立代理项或无法可靠编码的文本会让整个导出失败，不删除、不截断，也不产生半本书。换行保留在段落文字中，CSS 使用 `white-space: pre-wrap`。

`nav.xhtml` 生成 `epub:type="toc"` 的有序目录，每项链接到对应章节。OPF manifest 包含 nav、CSS 和所有章节；spine 只包含章节，顺序与目录一致。基础 CSS 只设置可读字体回退、行高、页边距、标题和段落间距，不引用远程资源、数据 URL 或字体文件。

## 限额与失败模式

导出在分配大 ZIP 前执行输入预算：

- 最多 2,000 章；
- 单章标题最多 200 个 Unicode code point；
- 译本/原书标题最多 500 个 code point；
- 单章段落最多 20,000 个；
- 单章全部可见文字最大 2 MiB UTF-8；
- 全书可见文字最大 16 MiB UTF-8；
- 最终 EPUB 最大 32 MiB；
- 文件名最大 240 字符，继续使用现有安全 slug 与 `stray-pages-export.epub` 回退。

超限时整体失败，不截断章节、不省略段落。稳定错误码为：

- `EPUB_EXPORT_EMPTY_BOOK`；
- `EPUB_EXPORT_INVALID_ORDER`；
- `EPUB_EXPORT_INVALID_TEXT`；
- `EPUB_EXPORT_TOO_LARGE`；
- `EPUB_EXPORT_PACKAGING_FAILED`；
- `INVALID_FILE_NAME`；
- `DOWNLOAD_FAILED`。

UI 只显示稳定中文提示，不暴露 XML、ZIP、原始章节正文、库堆栈或内部路径。

## 模块边界

- `src/lib/export/epub-export.ts`：输入校验、语言映射、XML/XHTML/OPF/nav/CSS 文件树、确定性标识、异步 fflate 打包、最终字节和内部归档自检。
- `src/lib/export/translation-export.ts`：保留 TXT 构建器与共享译本输入/顺序逻辑；删除“尚未生成真实 EPUB”的草稿合同，改为从新模块导出真实结果类型或兼容入口。
- `src/lib/export/browser-download.ts`：把对象 URL、临时链接和安全文件名生命周期抽象为文本/二进制共用核心；现有文本 API 保持兼容。
- `src/components/export/epub-download-button.tsx`：用户点击后异步构建字节，显示“正在生成 EPUB”，防止重复触发，成功后下载，失败显示稳定提示。
- `src/components/reader/reader-workspace.tsx`：接收可序列化的 `TranslatedBookExportInput`，在 TXT 按钮旁显示“下载完整译本 EPUB”。
- 本地与云端阅读器：从各自已经取得的全部可读权威章节构造同一个导出输入；点击 EPUB 不发起额外网络请求。

云端 Server Component 只把普通 JSON 输入传给客户端 ReaderWorkspace，不在服务端预先生成或跨 React 边界传递 Uint8Array。这样只在用户明确点击时消耗 CPU/内存，也避免页面加载时生成未使用的大文件。

## 兼容与文档迁移

移除 `packaged: false`、`EPUB 草稿` 和“尚未生成真实 EPUB”的当前能力描述。阶段 8 readiness 改为“真实 EPUB 3 打包与浏览器下载已完成”，外部阻塞项只保留远程数据库查询和真实后台审计。历史开发日志保留原记录，并追加新完成状态，不改写历史事实。

README 和 ROADMAP 明确区分：EPUB 导入与 EPUB 导出均已在浏览器本地实现；封面/图片/字体/固定布局/DRM 和云端导出文件保存仍未实现。

## 测试策略

严格执行 TDD，不提交版权电子书。测试全部用代码构造译本输入并检查生成字节：

1. ZIP 首 entry 是未压缩精确 `mimetype`；输出能通过 `inspectEpubArchive`。
2. container 指向 `OEBPS/content.opf`；OPF manifest/spine/nav 与章节顺序完全一致。
3. EPUB 能被 `parseEpubBook` 回读，标题、语言、章节标题和正文保持一致。
4. `chapterOrder` 排序、剩余章节追加、重复/未知顺序和重复 ID。
5. XML 特殊字符、Unicode、换行、非法控制字符、孤立代理项。
6. 空书、章节/段落/单章/全书/最终二进制体积上限。
7. 八种支持语言与未知语言的 BCP 47 映射。
8. 异步打包错误映射，不返回半成品。
9. 二进制下载的 MIME、Blob 字节、对象 URL 和临时链接在成功/失败路径均清理。
10. 本地与云端阅读器都从权威可读章节构造 EPUB 输入，客户端点击路径不含 `fetch`、Blob SDK、模型或文件系统写入。
11. 阶段 8 readiness、README、ROADMAP、DEV_LOG 和用户文案不再声称 EPUB 只存在草稿。

最终运行聚焦测试、`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm verify:zero-cost`、许可证检查、敏感信息扫描和 `git diff --check`；推送 `main` 后监控对应 GitHub Actions 到 `completed/success`。

## 明确不在范围内

- 从原始导入 EPUB 复制封面、图片、CSS、字体或其他资源；
- 用户上传自定义封面或样式；
- EPUB 2 导出、固定布局、漫画、媒体叠加、脚注/索引专用语义；
- DRM、加密、签名或规避保护；
- 服务端打包、队列、对象存储、导出历史、分享链接或跨设备同步；
- PDF、MOBI、DOCX 导出；
- 任何 EdgeOne、COS、数据库或模型调用。
