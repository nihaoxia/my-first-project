# 浏览器本地语音朗读实现计划

> **面向 AI 代理的工作者：** 必须使用 `executing-plans` 逐任务实现本计划。每个生产行为先写失败测试、确认红灯、再写最小实现。当前会话禁止子代理，因此使用内联执行，不调用 `subagent-driven-development`。任何时候都不得访问 EdgeOne、Blob、KV、Models、COS、云端 TTS 或其他收费资源。

**目标：** 为本地、云端和固定示例译本阅读器增加只使用系统本地声音的当前章节语音朗读，支持播放、暂停、继续、停止、四档语速、长段落分片、当前段落高亮和可靠取消。

**架构：** `local-speech-core.ts` 提供浏览器无关的语言映射、声音选择、Unicode 分片和可注入状态机；`local-speech-controls.tsx` 只负责 Web Speech API 适配与可访问 UI；`ReaderWorkspace` 负责把当前显示段落与语言传入并渲染高亮。本地、云端和示例调用方只传现有语言数据，不增加服务请求。

**技术栈：** TypeScript 6、React 19、Next.js 16、浏览器 Web Speech API、现有 Node 原生测试、ESLint、零费用验证器。

---

## 文件结构

- 创建 `src/lib/reader/local-speech-core.ts`：语言、声音、分片、状态机和稳定错误状态。
- 创建 `tests/local-speech-core.test.ts`：纯核心的行为、边界和迟到回调测试。
- 创建 `src/components/reader/local-speech-controls.tsx`：浏览器适配器、声音刷新、控制 UI 和清理。
- 创建 `tests/local-speech-ui-contract.test.ts`：客户端边界、控件、清理与零网络静态合同。
- 修改 `src/components/reader/reader-workspace.tsx`：传入朗读数据、控制组、段落高亮和滚动。
- 修改 `src/components/reader/local-translation-reader.tsx`：传入本地译本目标语言。
- 修改 `src/components/cloud/cloud-translation-reader.tsx`：传入现有云端语言标签，不增加查询。
- 修改 `src/app/reader/page.tsx`：为固定示例译本传入现有目标语言。
- 创建 `tests/local-speech-reader-contract.test.ts`：三类阅读器接线和高亮合同。
- 修改 `src/lib/product-capabilities.ts`、`tests/product-capabilities.test.ts`：声明浏览器本地语音能力。
- 修改 `README.md`、`docs/ROADMAP.md`、`docs/DEV_LOG.md`、`tests/current-production-docs.test.ts`：迁移当前能力和未实现范围。

## 固定合同

- 只选择 `localService === true` 的声音。
- `localService` 缺失或为 `false` 与远程声音等价，必须拒绝。
- 单 utterance 最大 1,200 Unicode code point。
- 语速只允许 `0.75 | 1 | 1.25 | 1.5`。
- 播放会话期间语速选择禁用；改变语速需要停止后重新播放。
- 状态为 `checking | idle | playing | paused | unavailable | error`。
- 切章、停止、重启和销毁都先使旧世代失效，再调用 `cancel()`。
- 朗读仅使用 `readerView.paragraphRows[].displayText`，保留原始 `index`。
- 不生成音频文件，不保存朗读状态，不发起网络请求，不新增依赖。

---

### 任务 1：语言、本地声音和 Unicode 分片核心

**文件：**

- 创建：`src/lib/reader/local-speech-core.ts`
- 创建：`tests/local-speech-core.test.ts`

- [ ] **步骤 1：编写语言和声音选择失败测试**

测试固定八种产品语言、未知语言、远程声音拒绝和确定性优先级：

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalSpeechLanguageTag,
  selectLocalSpeechVoice,
  type LocalSpeechVoice,
} from "../src/lib/reader/local-speech-core.ts";

const localVoice = (name: string, lang: string, isDefault = false): LocalSpeechVoice => ({
  name,
  lang,
  default: isDefault,
  localService: true,
  native: { name },
});

test("maps product languages to speech language tags", () => {
  assert.deepEqual(
    ["中文", "英文", "日文", "韩文", "俄语", "德语", "西班牙语", "法语", "未知"].map(
      getLocalSpeechLanguageTag,
    ),
    ["zh-CN", "en", "ja", "ko", "ru", "de", "es", "fr", undefined],
  );
});

test("selects only local voices by exact, primary, default, then stable name order", () => {
  const remote = { ...localVoice("Remote exact", "en-US"), localService: false };
  const voices = [
    remote,
    localVoice("Zulu", "fr-FR"),
    localVoice("English UK", "en-GB"),
    localVoice("Default local", "de-DE", true),
  ];

  assert.equal(selectLocalSpeechVoice(voices, "en-GB").voice?.name, "English UK");
  assert.equal(selectLocalSpeechVoice(voices, "en-US").voice?.name, "English UK");
  assert.equal(selectLocalSpeechVoice(voices, "ja").voice?.name, "Default local");
  assert.equal(selectLocalSpeechVoice([remote], "en-US").voice, undefined);
});
```

- [ ] **步骤 2：运行测试确认红灯**

运行：

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts
```

预期：FAIL，`local-speech-core.ts` 不存在。

- [ ] **步骤 3：实现最小语言与声音选择**

在 `local-speech-core.ts` 定义：

```ts
export const localSpeechRates = [0.75, 1, 1.25, 1.5] as const;
export type LocalSpeechRate = (typeof localSpeechRates)[number];

export type LocalSpeechVoice = {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
  native: unknown;
};

export function getLocalSpeechLanguageTag(language: string | undefined) {
  return language ? languageTags[language.trim()] : undefined;
}

export function selectLocalSpeechVoice(voices: LocalSpeechVoice[], language?: string) {
  const local = voices
    .filter((voice) => voice.localService === true)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  // exact -> primary -> default -> stable first
  return { voice, languageMatched };
}
```

完整实现必须把 `_` 归一化成 `-`、忽略大小写，并只在本地集合中选择。

- [ ] **步骤 4：编写 Unicode 分片失败测试**

```ts
import { buildLocalSpeechSegments } from "../src/lib/reader/local-speech-core.ts";

test("splits long paragraphs by Unicode code points and preserves paragraph indexes", () => {
  const text = `${"甲".repeat(700)}。${"😀".repeat(700)}`;
  const segments = buildLocalSpeechSegments([
    { index: 4, text: "   " },
    { index: 9, text },
  ]);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map((segment) => segment.paragraphIndex), [9, 9]);
  assert.ok(segments.every((segment) => Array.from(segment.text).length <= 1_200));
  assert.equal(segments.map((segment) => segment.text).join(""), text);
});

test("prefers sentence punctuation, then whitespace, then a hard code-point split", () => {
  const punctuation = `${"甲".repeat(700)}。${"乙".repeat(700)}`;
  const whitespace = `${"a".repeat(800)} ${"b".repeat(500)}`;
  const hard = "😀".repeat(1_201);

  const punctuationParts = buildLocalSpeechSegments([{ index: 1, text: punctuation }]);
  const whitespaceParts = buildLocalSpeechSegments([{ index: 2, text: whitespace }]);
  const hardParts = buildLocalSpeechSegments([{ index: 3, text: hard }]);

  assert.equal(punctuationParts[0].text.endsWith("。"), true);
  assert.equal(whitespaceParts[0].text.endsWith(" "), true);
  assert.equal(Array.from(hardParts[0].text).length, 1_200);
  assert.equal(punctuationParts.map((part) => part.text).join(""), punctuation);
  assert.equal(whitespaceParts.map((part) => part.text).join(""), whitespace);
  assert.equal(hardParts.map((part) => part.text).join(""), hard);
});
```

- [ ] **步骤 5：确认新增分片测试红灯**

运行同一测试文件。预期：语言/声音测试通过，分片测试因 `buildLocalSpeechSegments` 缺失失败。

- [ ] **步骤 6：实现确定性分片**

定义：

```ts
export const localSpeechUtteranceCodePointLimit = 1_200;

export type LocalSpeechParagraph = { index: number; text: string };
export type LocalSpeechSegment = { paragraphIndex: number; text: string };

export function buildLocalSpeechSegments(
  paragraphs: LocalSpeechParagraph[],
): LocalSpeechSegment[];
```

使用 `Array.from(text)` 按 code point 操作；在窗口后半段从后向前寻找 `。！？!?；;：:\n`，其次寻找 Unicode 空白，最后硬切。仅清理每个原始段落首尾空白，不改变片段内部文字；空段跳过。

- [ ] **步骤 7：绿灯、类型检查和提交**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts
pnpm typecheck
git diff --check
git add src/lib/reader/local-speech-core.ts tests/local-speech-core.test.ts
git commit -m "feat: prepare browser-local speech content (task 1/5)"
```

预期：全部通过，提交只包含任务 1 文件。

---

### 任务 2：播放状态机、世代隔离与稳定错误

**文件：**

- 修改：`src/lib/reader/local-speech-core.ts`
- 修改：`tests/local-speech-core.test.ts`

- [ ] **步骤 1：编写播放推进失败测试**

建立假的运行时，保存每个 descriptor 并由测试显式调用 `onEnd`：

```ts
function createRuntime() {
  const spoken: LocalSpeechUtterance[] = [];
  const events: string[] = [];
  return {
    spoken,
    events,
    runtime: {
      cancel: () => events.push("cancel"),
      pause: () => events.push("pause"),
      resume: () => events.push("resume"),
      speak: (utterance: LocalSpeechUtterance) => {
        spoken.push(utterance);
        events.push(`speak:${utterance.text}`);
      },
    },
  };
}

test("plays segments in order and keeps paragraph highlight across chunks", () => {
  const port = createRuntime();
  const snapshots: LocalSpeechSnapshot[] = [];
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
  });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({
    chapterId: "chapter-1",
    language: "英文",
    rate: 1,
    paragraphs: [{ index: 7, text: `${"a".repeat(1_200)}${"b".repeat(10)}` }],
  });

  assert.equal(port.spoken.length, 1);
  assert.equal(controller.getSnapshot().activeParagraphIndex, 7);
  port.spoken[0].onEnd?.();
  assert.equal(port.spoken.length, 2);
  assert.equal(controller.getSnapshot().activeParagraphIndex, 7);
  port.spoken[1].onEnd?.();
  assert.equal(controller.getSnapshot().status, "idle");
  assert.equal(controller.getSnapshot().notice, "本章朗读完成。");
});
```

- [ ] **步骤 2：编写暂停、停止和迟到回调失败测试**

覆盖：

```ts
test("pauses, resumes, stops, and ignores callbacks from an invalidated generation", () => {
  const port = createRuntime();
  const controller = createLocalSpeechController({ runtime: port.runtime, onSnapshot: () => undefined });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({ chapterId: "one", language: "英文", rate: 1, paragraphs: [
    { index: 0, text: "First" },
    { index: 1, text: "Second" },
  ] });
  const staleEnd = port.spoken[0].onEnd;

  controller.pause();
  assert.equal(controller.getSnapshot().status, "paused");
  controller.resume();
  assert.equal(controller.getSnapshot().status, "playing");
  controller.stop();
  const spokenCount = port.spoken.length;
  staleEnd?.();

  assert.equal(port.spoken.length, spokenCount);
  assert.equal(controller.getSnapshot().status, "idle");
  assert.equal(controller.getSnapshot().activeParagraphIndex, null);
  assert.deepEqual(port.events.slice(0, 4), ["cancel", "speak:First", "pause", "resume"]);
});

test("restart and destroy invalidate old callbacks and destroy prevents notifications", () => {
  const port = createRuntime();
  let notificationCount = 0;
  const controller = createLocalSpeechController({
    runtime: port.runtime,
    onSnapshot: () => { notificationCount += 1; },
  });
  controller.setVoices([localVoice("Local", "en-US")], { final: true });
  controller.start({ chapterId: "a", language: "英文", rate: 1, paragraphs: [{ index: 0, text: "A" }] });
  const oldEnd = port.spoken.at(-1)?.onEnd;
  controller.start({ chapterId: "b", language: "英文", rate: 1, paragraphs: [{ index: 0, text: "B" }] });
  const currentEnd = port.spoken.at(-1)?.onEnd;
  const beforeStale = port.spoken.length;
  oldEnd?.();
  assert.equal(port.spoken.length, beforeStale);

  controller.destroy();
  const beforeDestroyedCallback = notificationCount;
  currentEnd?.();
  assert.equal(notificationCount, beforeDestroyedCallback);
});
```

- [ ] **步骤 3：编写不可用和错误失败测试**

覆盖：

- `setVoices([], { final: false })` 保持 `checking`；
- `{ final: true }` 进入 `unavailable`；
- 空正文显示“当前章节没有可朗读的正文。”；
- 使用非语言匹配的本地回退时保留回退提示；
- `runtime.speak()` 同步抛错进入 `error`；
- 有效会话 `onError` 进入 `error`；
- 原始错误文本不会进入 `notice`。

实现这些断言时使用同一个 `createRuntime()`，分别替换 `runtime.speak` 为抛错函数，以及显式调用已保存 utterance 的 `onError`；两个分支都精确断言：

```ts
assert.deepEqual(controller.getSnapshot(), {
  status: "error",
  activeParagraphIndex: null,
  notice: "无法使用本地语音朗读，请检查系统语音设置后重试。",
});
```

- [ ] **步骤 4：运行测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts
```

预期：FAIL，控制器、状态和运行时类型尚不存在。

- [ ] **步骤 5：实现最小状态机**

在核心增加规格中的全部公开类型和：

```ts
export function createLocalSpeechController(input: {
  runtime: LocalSpeechRuntime;
  onSnapshot(snapshot: LocalSpeechSnapshot): void;
}): LocalSpeechController {
  let generation = 0;
  let destroyed = false;
  let queue: LocalSpeechSegment[] = [];
  let cursor = 0;
  let snapshot: LocalSpeechSnapshot = {
    status: "checking",
    activeParagraphIndex: null,
    notice: "正在读取系统语音。",
  };
  // setVoices/start/speakNext/pause/resume/stop/destroy
}
```

`invalidate()` 必须先递增 `generation` 再调用 `runtime.cancel()`；每个 utterance 闭包捕获自己的 generation。所有通知都通过返回新对象的 `publish()` 完成，销毁后 `publish()` 无操作。

声音、语言和语速在 `start()` 时冻结。回退声音提示在播放期间保留；完成提示覆盖它。任何播放错误先使会话失效，再发布稳定错误状态。

- [ ] **步骤 6：绿灯、回归和提交**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts tests/reader-view.test.ts
pnpm typecheck
git diff --check
git add src/lib/reader/local-speech-core.ts tests/local-speech-core.test.ts
git commit -m "feat: control browser-local speech playback (task 2/5)"
```

---

### 任务 3：浏览器适配器与可访问控制组件

**文件：**

- 创建：`src/components/reader/local-speech-controls.tsx`
- 创建：`tests/local-speech-ui-contract.test.ts`

- [ ] **步骤 1：编写组件合同失败测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/reader/local-speech-controls.tsx", "utf8");

test("adapts only browser-local speech and cleans up every listener and session", () => {
  assert.match(source, /^"use client";/u);
  assert.match(source, /window\.speechSynthesis/u);
  assert.match(source, /SpeechSynthesisUtterance/u);
  assert.match(source, /localService/u);
  assert.match(source, /addEventListener\("voiceschanged"/u);
  assert.match(source, /removeEventListener\("voiceschanged"/u);
  assert.match(source, /controller\.destroy\(\)/u);
});

test("renders accessible playback controls and four fixed rates", () => {
  assert.match(source, /朗读本章/u);
  assert.match(source, /暂停朗读/u);
  assert.match(source, /继续朗读/u);
  assert.match(source, /停止朗读/u);
  assert.match(source, /0\.75/u);
  assert.match(source, /1\.25/u);
  assert.match(source, /1\.5/u);
  assert.match(source, /aria-live/u);
  assert.match(source, /snapshot\.status === "error" \|\| snapshot\.status === "unavailable"/u);
});

test("contains no network, cloud, model, filesystem, or audio persistence path", () => {
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|edgeone|BlobStore|models?|node:fs|localStorage|indexedDB|MediaRecorder/iu);
});
```

- [ ] **步骤 2：运行测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-speech-ui-contract.test.ts
```

预期：FAIL，组件文件不存在。

- [ ] **步骤 3：实现浏览器运行时适配器**

组件 props：

```ts
type LocalSpeechControlsProps = {
  chapterId: string;
  language?: string;
  paragraphs: LocalSpeechParagraph[];
  onActiveParagraphChange(index: number | null): void;
};
```

实现 `readBrowserVoices()`，把原生 `SpeechSynthesisVoice` 映射为 `LocalSpeechVoice`，原生对象放在 `native`。不要先过滤；核心负责唯一权威过滤。

实现 `createBrowserSpeechRuntime(synthesis)`：

```ts
speak(descriptor) {
  const utterance = new SpeechSynthesisUtterance(descriptor.text);
  utterance.lang = descriptor.lang;
  utterance.rate = descriptor.rate;
  utterance.voice = descriptor.voice?.native as SpeechSynthesisVoice;
  utterance.onend = () => descriptor.onEnd?.();
  utterance.onerror = () => descriptor.onError?.();
  synthesis.speak(utterance);
}
```

`cancel/pause/resume` 直接委托给注入的 `SpeechSynthesis`。

- [ ] **步骤 4：实现 React 生命周期和 UI**

- 在 effect 内使用 `"speechSynthesis" in window` 和 `typeof SpeechSynthesisUtterance === "function"` 检测能力；缺失时展示 unsupported 稳定错误。
- 创建一个控制器，`onSnapshot` 同时更新组件状态和调用 `onActiveParagraphChange`。
- 初次读取声音使用 `{ final: false }`；`voiceschanged` 使用 `{ final: true }`。
- 用户点击开始时再次读取声音并使用 `{ final: true }`，然后 `start(request)`。
- effect cleanup 先移除 `voiceschanged`，再 `controller.destroy()`，最后回传 `null` 高亮。
- props 中 chapter/language/paragraphs 改变时 effect 重建，保证切章取消。
- 四档 `<select>` 只在 `idle`、`checking`、`unavailable` 或 `error` 可改；播放和暂停时禁用。
- UI 使用现有 `Button`、lucide-react 的 `Volume2`、`Pause`、`Square`，不新增组件库。

- [ ] **步骤 5：绿灯、lint、类型检查和提交**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts tests/local-speech-ui-contract.test.ts
pnpm lint
pnpm typecheck
git diff --check
git add src/components/reader/local-speech-controls.tsx tests/local-speech-ui-contract.test.ts
git commit -m "feat: add browser-local speech controls (task 3/5)"
```

---

### 任务 4：阅读器接线、高亮和章节生命周期

**文件：**

- 修改：`src/components/reader/reader-workspace.tsx`
- 修改：`src/components/reader/local-translation-reader.tsx`
- 修改：`src/components/cloud/cloud-translation-reader.tsx`
- 修改：`src/app/reader/page.tsx`
- 创建：`tests/local-speech-reader-contract.test.ts`
- 修改：`tests/text-export-ui-contract.test.ts`（仅在原合同需要适配新 props 时修改）

- [ ] **步骤 1：编写阅读器接线失败测试**

```ts
test("reader speaks the current displayed paragraphs and highlights the active index", () => {
  const reader = source("src/components/reader/reader-workspace.tsx");
  assert.match(reader, /speechLanguage\?: string/u);
  assert.match(reader, /LocalSpeechControls/u);
  assert.match(reader, /text: paragraph\.displayText/u);
  assert.match(reader, /index: paragraph\.index/u);
  assert.match(reader, /activeSpeechParagraphIndex/u);
  assert.match(reader, /scrollIntoView\(\{ block: "center" \}\)/u);
  assert.match(reader, /aria-current=\{isSpeechActive/u);
});

test("local, cloud, and example readers pass existing target-language metadata", () => {
  const local = source("src/components/reader/local-translation-reader.tsx");
  const cloud = source("src/components/cloud/cloud-translation-reader.tsx");
  const example = source("src/app/reader/page.tsx");
  assert.match(local, /speechLanguage=\{state\.translation\.targetLanguage\}/u);
  assert.match(cloud, /speechLanguage=\{getCloudBookLanguageLabel\(translation\.targetLanguage\)\}/u);
  assert.match(example, /speechLanguage=\{translation\.targetLanguage\}/u);
});
```

同时固定云端文件中现有服务调用数量或关键调用集合，证明没有新增语言查询、API 或对象读取。

- [ ] **步骤 2：运行测试确认红灯**

```powershell
node --experimental-strip-types --test tests/local-speech-reader-contract.test.ts tests/text-export-ui-contract.test.ts
```

预期：FAIL，ReaderWorkspace 尚无朗读 props、控制组件和高亮。

- [ ] **步骤 3：接入 ReaderWorkspace**

新增 props：

```ts
speechLanguage?: string;
```

新增：

```ts
const [activeSpeechParagraphIndex, setActiveSpeechParagraphIndex] = useState<number | null>(null);
const speechParagraphs = useMemo(
  () => readerView.paragraphRows.map((paragraph) => ({
    index: paragraph.index,
    text: paragraph.displayText,
  })),
  [readerView.paragraphRows],
);
```

在章节标题工具区渲染 `LocalSpeechControls`。当 active index 改变时：

```ts
useEffect(() => {
  if (activeSpeechParagraphIndex === null) return;
  document
    .getElementById(`reader-paragraph-${activeSpeechParagraphIndex}`)
    ?.scrollIntoView({ block: "center" });
}, [activeSpeechParagraphIndex]);
```

段落 section 用 `clsx` 加入 active 样式，并设置：

```tsx
aria-current={isSpeechActive ? "true" : undefined}
```

高亮使用现有 `--reader-highlight`、`--primary` 和 border/ring，不使用硬编码亮色；保留 hover、翻译展开和点击保存阅读进度行为。

- [ ] **步骤 4：传入三类语言数据**

- 本地译本：`speechLanguage={state.translation.targetLanguage}`。
- 云端译本：复用一次计算的 `targetLanguageLabel`，同时用于导出和朗读，避免重复映射。
- 示例译本：`speechLanguage={translation.targetLanguage}`。

不改变任何 service 获取顺序，不新增 `fetch`，不读取对象正文。

- [ ] **步骤 5：绿灯、阅读器回归、构建和提交**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts tests/local-speech-ui-contract.test.ts tests/local-speech-reader-contract.test.ts tests/reader-view.test.ts tests/text-export-ui-contract.test.ts tests/cloud-study-ui-contract.test.ts
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git add src/components/reader/reader-workspace.tsx src/components/reader/local-translation-reader.tsx src/components/cloud/cloud-translation-reader.tsx src/app/reader/page.tsx tests/local-speech-reader-contract.test.ts tests/text-export-ui-contract.test.ts
git commit -m "feat: read current chapters aloud locally (task 4/5)"
```

---

### 任务 5：能力文档、最终审查、推送和 CI

**文件：**

- 修改：`src/lib/product-capabilities.ts`
- 修改：`tests/product-capabilities.test.ts`
- 修改：`README.md`
- 修改：`docs/ROADMAP.md`
- 修改：`docs/DEV_LOG.md`
- 修改：`tests/current-production-docs.test.ts`

- [ ] **步骤 1：先写能力和文档合同失败测试**

要求：

```ts
assert.equal(localPrototypeCapabilities.browserLocalSpeechPlayback, true);
assert.match(homePrototypeCopy.summary, /浏览器本地语音朗读/u);
```

README/ROADMAP 合同同时断言：

- 当前能力包含“只使用系统本地声音的浏览器语音朗读”；
- 不再把泛化的“语音朗读”列为完全未实现；
- 仍声明云端 TTS、远程语音、音频导出和跨章节后台连续播放未实现；
- 不出现“已接入云端语音”“生成音频文件”等错误能力声明。

运行并确认旧能力描述导致 FAIL：

```powershell
node --experimental-strip-types --test tests/product-capabilities.test.ts tests/current-production-docs.test.ts
```

- [ ] **步骤 2：更新能力矩阵与文档**

- `localPrototypeCapabilities.browserLocalSpeechPlayback = true`。
- 首页摘要只用用户能理解的“浏览器本地语音朗读”，不出现 Provider、模型或内部状态机术语。
- README 当前功能说明本地声音与隐私边界；未实现列表改为云端 TTS、音频导出和跨章节后台连续播放。
- ROADMAP 阶段 7 标记当前章节本地朗读已完成，远程 AI/跨设备能力继续未接入。
- DEV_LOG 追加架构、TDD 红绿证据、浏览器差异、零费用边界和最终验证结果，不改写历史记录。

- [ ] **步骤 3：本地界面检查**

使用项目现有开发服务器和浏览器控制能力检查阅读器：

- 桌面宽度下控件不挤压章节标题、下载和导航按钮；
- 窄宽度下工具区自然换行；
- 播放/暂停/停止/语速文案可见；
- 高亮不会遮挡正文和“译”按钮；
- 没有系统本地声音的测试环境显示稳定不可用状态，不尝试网络回退。

如果浏览器运行环境没有声音输出设备，只验证 API 调用、状态和 UI；不能把“听不到声音”误报为代码失败，也不能声称完成真实音频听感验收。

- [ ] **步骤 4：本地代码审查**

按照 `requesting-code-review` 检查从 `ab6c390` 到当前 HEAD 的完整差异。当前禁止子代理，因此主代理执行同等范围的本地审查：

- 状态机是否存在迟到回调、重复播放或销毁后通知；
- 所有声音路径是否精确要求 `localService === true`；
- 分片是否丢失 Unicode、错位段落索引或产生空 utterance；
- React effect 是否成对清理 listener/controller；
- 云端阅读器是否增加请求；
- UI 是否有不可达状态或缺失无障碍属性；
- 文档是否夸大跨浏览器或音频质量保证。

Critical/Important 必须先补失败测试再修复。

- [ ] **步骤 5：完整验证**

```powershell
node --experimental-strip-types --test tests/local-speech-core.test.ts tests/local-speech-ui-contract.test.ts tests/local-speech-reader-contract.test.ts tests/product-capabilities.test.ts tests/current-production-docs.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:zero-cost
rg -n 'fetch\s*\(|XMLHttpRequest|WebSocket|edgeone|BlobStore|models?|node:fs|localStorage|indexedDB|MediaRecorder' src/lib/reader/local-speech-core.ts src/components/reader/local-speech-controls.tsx
rg -n 'AKID[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----' . --glob '!node_modules/**' --glob '!.next/**' --glob '!pnpm-lock.yaml'
git diff --check
```

预期：

- 所有测试 0 失败；
- lint、typecheck、build、zero-cost、diff check 均退出 0；
- 第一条 `rg` 退出 1，表示朗读核心和适配器没有网络/云/模型/持久化路径；
- 第二条 `rg` 退出 1，表示没有 AKID 或私钥命中；
- 构建只允许仓库既有的多 lockfile 和 Edge Runtime 提示，不允许新错误。

- [ ] **步骤 6：提交文档并推送**

```powershell
git add README.md docs/ROADMAP.md docs/DEV_LOG.md src/lib/product-capabilities.ts tests/product-capabilities.test.ts tests/current-production-docs.test.ts
git commit -m "docs: document browser-local speech playback (task 5/5)"
git status --short --branch
git push origin HEAD:main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

本地与远端 SHA 必须逐字一致。

- [ ] **步骤 7：监控 GitHub Actions**

通过 GitHub REST API 只读查询该 SHA 对应的 Actions，直到：

```text
status=completed
conclusion=success
```

失败时读取 job/step，在本地复现并按 TDD 修复后重新推送；不得操作 EdgeOne 控制台或部署资源。

## 完成定义

- 本地、云端和示例译本阅读器都能从当前显示段落启动本地章节朗读。
- 只使用浏览器明确标记的系统本地声音，远程声音永不进入播放运行时。
- 播放、暂停、继续、停止、四档语速、长段落分片、高亮和滚动行为有测试证据。
- 停止、切章、重启和卸载后的旧回调无法污染当前会话。
- 无本地声音、无 API、空正文和播放失败均有稳定用户提示。
- 没有新依赖、网络语音、云端写入、模型调用、音频文件或朗读持久化。
- 文档准确区分本地章节朗读与仍未实现的云端 TTS、音频导出和后台跨章节播放。
- 全量验证、本地/远端 SHA 和 GitHub CI 全部成功。
