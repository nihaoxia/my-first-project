# 浏览器本地语音朗读设计

## 背景

Stray Pages 的阅读器已经能显示本地译本、云端译本和固定示例书的当前章节，也已经具备稳定的段落索引、章节切换、阅读进度、TXT/EPUB 下载和划词学习交互。目前阅读器中的读音图标仍明确禁用，README 也把“语音朗读”列为未实现能力。

本阶段继续遵守零费用边界：暂停 EdgeOne、Blob、KV、Models、COS 和其他云资源，不调用收费模型，不接入任何国内或国外云端 TTS，不上传正文，不生成或保存音频文件。允许使用浏览器和操作系统已经提供的本地语音能力。

## 目标

为本地和云端译本阅读器增加当前章节的浏览器本地语音朗读：用户可以播放、暂停、继续和停止，选择有限的语速，看到当前朗读段落高亮；章节切换、离开页面或组件卸载时旧播放必须停止。

成功标准：

- 朗读内容来自 `ReaderWorkspace` 当前实际显示的段落，不重新查询章节或对象。
- 只选择浏览器明确标记 `localService === true` 的系统本地语音。
- 不存在本地语音或浏览器不支持时 fail closed，不回退到远程语音。
- 支持 0.75×、1×、1.25× 和 1.5× 四档语速。
- 特别长的段落被拆成有界 utterance，但整章仍能按原段落顺序连续朗读。
- 当前段落有稳定高亮并进入可视区域。
- 停止、切章和卸载之后，旧的异步回调不能推进新会话或污染 UI。
- 本阶段不产生网络请求、云端写入、模型调用、音频文件或新付费依赖。

## 非目标

第一版明确不实现：

- 云端或第三方 TTS；
- 远程 `SpeechSynthesisVoice`；
- 音频文件生成、缓存、上传或下载；
- 跨章节后台连续播放；
- 手动浏览或选择全部系统声音；
- 云端保存朗读位置、语速或播放历史；
- 单词词典发音、联网音标或 AI 语音；
- 后台标签页、锁屏或设备休眠下的可靠连续播放承诺；
- 浏览器原生语音之外的 WASM 模型和大体积语音资源。

## 方案比较与决定

### 方案 A：Web Speech API 和本地系统语音

使用 `window.speechSynthesis` 与 `SpeechSynthesisUtterance`，只接受 `SpeechSynthesisVoice.localService === true` 的声音。优点是零依赖、零费用、正文不离开设备；缺点是声音质量、语种和 API 行为受浏览器与操作系统影响。

### 方案 B：浏览器内 WASM 语音模型

可完全离线并统一声音，但需要下载大体积模型，增加内存、启动时间、资源许可证和构建复杂度，不适合作为当前第一版。

### 方案 C：国内云端 TTS

声音和兼容性更稳定，但需要上传正文、账号、密钥、额度、隐私处理和费用确认，违反当前阶段的绝对约束。

采用方案 A。浏览器提供的 `localService` 是本阶段的信任边界：只有精确为 `true` 才允许选择；缺失、`false` 或没有任何本地声音时拒绝播放。

## 架构与文件边界

### `src/lib/reader/local-speech-core.ts`

纯 TypeScript 核心，不直接访问 `window`、`document` 或 React。职责：

- 产品语言到 BCP 47 的映射；
- 本地声音过滤与确定性选择；
- 长段落到有界语音片段的转换；
- 播放状态机与会话世代隔离；
- 播放、暂停、继续、停止和销毁；
- 将底层错误折叠为稳定状态，不泄漏原始异常。

核心只依赖注入的 `LocalSpeechRuntime`：

```ts
export type LocalSpeechVoice = {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  native: unknown;
};

export type LocalSpeechUtterance = {
  text: string;
  lang: string;
  rate: number;
  voice?: LocalSpeechVoice;
  onEnd?: () => void;
  onError?: () => void;
};

export type LocalSpeechRuntime = {
  cancel(): void;
  pause(): void;
  resume(): void;
  speak(utterance: LocalSpeechUtterance): void;
};
```

公开控制器接口固定为：

```ts
export type LocalSpeechController = {
  setVoices(voices: LocalSpeechVoice[], options?: { final?: boolean }): void;
  start(request: LocalSpeechRequest): void;
  pause(): void;
  resume(): void;
  stop(): void;
  destroy(): void;
  getSnapshot(): LocalSpeechSnapshot;
};

export function createLocalSpeechController(input: {
  runtime: LocalSpeechRuntime;
  onSnapshot(snapshot: LocalSpeechSnapshot): void;
}): LocalSpeechController;
```

`setVoices([], { final: false })` 保持 `checking`；取得非空本地声音后进入 `idle`；浏览器完成一次声音刷新或用户主动播放时仍为空，则用 `{ final: true }` 进入 `unavailable`。`start()` 只读取控制器已经接收的声音集合，不在核心中访问浏览器全局对象。

浏览器原生对象只存在于适配器中；Node 测试使用假的运行时验证真实状态转换。

### `src/components/reader/local-speech-controls.tsx`

客户端组件，职责：

- 检测 `speechSynthesis`、`SpeechSynthesisUtterance` 和本地声音；
- 监听并清理 `voiceschanged`；
- 把浏览器原生声音和 utterance 适配为核心端口；
- 展示朗读、暂停/继续、停止、语速与状态提示；
- 将当前朗读段落索引回传给阅读器；
- 属性变化和卸载时销毁控制器并取消语音。

### `src/components/reader/reader-workspace.tsx`

继续负责章节 UI。新增可选的 `speechLanguage?: string`，并把 `readerView.paragraphRows` 中的 `displayText` 与原始 `index` 交给朗读组件。阅读器保存 `activeSpeechParagraphIndex`，为对应段落增加高亮类，并在索引变化时调用已有段落 DOM id 做无动画、居中的 `scrollIntoView`。

### 本地和云端阅读器

`local-translation-reader.tsx` 使用本地译本的 `targetLanguage`；`cloud-translation-reader.tsx` 使用现有 `getCloudBookLanguageLabel()` 结果。二者只传语言标签，不增加数据库、API、Blob 或原文对象读取。

固定示例阅读器可以传当前示例译本语言；没有语言元数据的调用方允许省略，核心会选择系统默认本地语音，但仍不得选择远程声音。

## 数据模型

朗读输入保留阅读器段落索引，避免过滤空段后高亮错位：

```ts
export type LocalSpeechParagraph = {
  index: number;
  text: string;
};

export type LocalSpeechRequest = {
  chapterId: string;
  language?: string;
  rate: 0.75 | 1 | 1.25 | 1.5;
  paragraphs: LocalSpeechParagraph[];
};
```

核心快照为可穷举联合状态，至少包含：

```ts
type LocalSpeechStatus =
  | "checking"
  | "idle"
  | "playing"
  | "paused"
  | "unavailable"
  | "error";

type LocalSpeechSnapshot = {
  status: LocalSpeechStatus;
  activeParagraphIndex: number | null;
  notice: string;
};
```

`checking` 只表示浏览器支持 API、但初次 `getVoices()` 仍为空，正在等待浏览器发出 `voiceschanged`。用户主动点击时会再次刷新；仍没有本地声音则进入 `unavailable`，不会无限假装可以播放。

## 语言与本地声音选择

产品语言映射固定为：

| 产品语言 | BCP 47 |
| --- | --- |
| 中文 | `zh-CN` |
| 英文 | `en` |
| 日文 | `ja` |
| 韩文 | `ko` |
| 俄语 | `ru` |
| 德语 | `de` |
| 西班牙语 | `es` |
| 法语 | `fr` |

选择顺序：

1. 过滤掉所有 `localService !== true` 的声音。
2. 在本地声音中优先匹配完整语言标签，比较时忽略大小写并把下划线归一化为连字符。
3. 再匹配主语言子标签，例如 `en-US` 可以匹配 `en`。
4. 再选择 `default === true` 的本地声音。
5. 最后选择排序后的第一个本地声音，保证结果稳定。

如果使用第 4 或第 5 步且没有语言匹配，播放仍是本地的，但 UI 显示：“未找到与译本语言匹配的本地语音，已使用系统默认本地语音。”

如果没有任何本地声音，显示：“当前设备没有可用的本地系统语音。”

## 长段落切分

每个 utterance 最多包含 1,200 个 Unicode code point。切分规则：

1. 清理首尾空白，完全空白的段落不进入队列。
2. 1,200 code point 以内保持原样。
3. 超限时优先在当前窗口后半段的中文或西文句末标点处分割，其次选择空白，最后按 code point 硬切。
4. 不按 UTF-16 code unit 截断，不能拆开代理对。
5. 同一原始段落的多个片段携带相同 `paragraphIndex`，高亮直到最后一个片段结束。

不增加比现有章节输入更窄的总正文上限。现有导入、译本和阅读器边界仍是权威边界；分片只控制单次浏览器 utterance 的大小。

## 播放状态机

### 开始

- 拒绝空章节并显示“当前章节没有可朗读的正文。”
- 重新读取声音，只选择本地声音。
- 先递增会话世代并调用 `cancel()`，清除当前窗口残留的旧语音。
- 固定本次会话的声音、语言和语速，构建有序片段队列。
- 创建并播放第一个 utterance，状态进入 `playing`，公布对应段落索引。

### 正常推进

- `onEnd` 先检查控制器未销毁且回调世代等于当前世代。
- 仍有片段时播放下一个；段落索引变化时更新高亮。
- 最后一个片段结束后回到 `idle`，清除高亮，提示“本章朗读完成。”

### 暂停与继续

- 只有 `playing` 可以暂停；调用运行时 `pause()` 后进入 `paused`。
- 只有 `paused` 可以继续；调用 `resume()` 后回到 `playing`。
- 四档语速在播放会话期间锁定；要更换语速，用户先停止，再重新播放，避免不同浏览器对运行中修改 `rate` 的不一致行为。

### 停止、切章与卸载

- `stop()` 先递增世代，再调用 `cancel()`，回到 `idle` 并清除高亮。
- `chapterId`、段落集合或语言发生变化时，组件销毁旧控制器并创建新控制器。
- 卸载时调用 `destroy()`；销毁会递增世代、取消语音、清理订阅，并禁止所有后续通知。
- `cancel()` 触发的迟到 `onEnd`/`onError` 因世代不匹配被忽略。

### 错误

底层 `speak()` 同步异常或有效会话的 `onError` 进入 `error`，取消剩余队列、清除高亮，显示：“无法使用本地语音朗读，请检查系统语音设置后重试。”原始错误对象、声音 URI 和平台细节不得显示。

## UI 与可访问性

控制入口位于当前章节标题工具区，与 TXT/EPUB 下载同级，但作为独立的紧凑控制组：

- 空闲：主按钮“朗读本章”，语速选择可用，停止按钮禁用或隐藏。
- 播放：主按钮“暂停朗读”，停止按钮可用，语速选择禁用。
- 暂停：主按钮“继续朗读”，停止按钮可用，语速选择禁用。
- 检查声音：按钮文案“正在读取系统语音”，避免声称可用。
- 不可用或错误：主按钮保持可重试，稳定说明使用 `role="alert"`。
- 普通状态使用 `aria-live="polite"`；主按钮使用 `aria-pressed` 表达播放或暂停状态。

当前段落使用现有主题变量添加不依赖固定颜色的背景和边框高亮。高亮不改变正文顺序、不注入 HTML、不修改选择文本。滚动使用 `{ block: "center" }`，不强制平滑动画，避免运动不适和与用户手动滚动竞争。

## 隐私、费用与安全边界

- 正文只作为字符串传给本机浏览器提供的本地 utterance。
- 只有 `localService === true` 的声音可以进入运行时；远程声音即使语言更匹配也不能使用。
- 新模块不得包含 `fetch`、XHR、WebSocket、云 SDK、模型 SDK、文件系统写入、音频编码或 Blob 上传。
- 不保存正文、声音名称、朗读位置或语速到 localStorage、Cookie、数据库、Blob 或日志。
- 不新增 npm 依赖，不读取或修改真实 `.env`，不需要账号、密钥、付款方式或平台控制台。
- 运行时能力或本地属性不明确时 fail closed。

## 测试策略

严格执行 TDD，每一类生产行为先有失败测试。

### 核心单元测试

- 八种产品语言与未知语言映射；
- 远程声音全部被拒绝；
- 完整标签、主语言、本地默认和稳定首项选择顺序；
- 没有本地声音；
- Unicode code point 边界、句末优先、空白回退和硬切；
- 空段过滤且原段落索引不漂移；
- 播放片段顺序和段落索引推进；
- 同一段落多片段保持同一高亮；
- 暂停、继续、停止和完成；
- 空章节、运行时同步异常和有效 `onError`；
- 停止、重启、切章和销毁后的迟到回调被忽略；
- 销毁后不再通知 UI。

### 组件和阅读器合同

- 组件只在客户端访问 Web Speech API；
- 监听和移除 `voiceschanged`；
- 控件文案、禁用状态和无障碍属性；
- ReaderWorkspace 传入当前 `displayText` 与稳定索引；
- 本地和云端阅读器传入目标语言；
- 当前段落高亮与 DOM id 一致；
- 新模块不包含网络、云 SDK、模型、文件系统或音频持久化代码。

### 回归和最终验证

- 现有阅读器、阅读进度、TXT/EPUB 下载和划词学习合同继续通过；
- `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`；
- `pnpm verify:zero-cost`；
- 凭据模式扫描和 `git diff --check`；
- 推送 `origin main`，核对本地/远端 SHA，等待 GitHub Actions `completed/success`。

## 文档迁移

实现完成后：

- README 把“浏览器本地语音朗读”移入当前可用功能，并说明只使用系统本地声音；
- README 未实现列表继续保留云端 TTS、音频导出和跨章节后台连续播放；
- ROADMAP 和 DEV_LOG 记录本地能力、隐私边界、TDD 证据与验证结果；
- `localPrototypeCapabilities` 增加明确的浏览器本地语音能力标志，任何生产云端语音能力继续为 `false` 或不存在；
- 普通用户页面不使用“模型”“Provider”“TTS 服务”等内部口吻。

## 验收清单

- [ ] 本地与云端译本阅读器都能朗读当前显示章节。
- [ ] 只使用 `localService === true` 的声音。
- [ ] 播放、暂停、继续、停止和四档语速可用。
- [ ] 长段落安全分片且原段落高亮不漂移。
- [ ] 当前段落高亮并进入可视区域。
- [ ] 切章、停止和卸载后没有旧回调污染。
- [ ] 不支持、无本地声音、空正文和播放失败都有稳定提示。
- [ ] 没有网络请求、云端写入、模型调用、音频文件或新依赖。
- [ ] 文档与能力矩阵准确区分本地朗读和未实现的云端语音能力。
- [ ] 全量验证、本地/远端 SHA 与 GitHub CI 全部成功。
