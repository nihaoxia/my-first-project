import assert from "node:assert/strict";
import test from "node:test";

import type { StoredLocalTranslation } from "../src/lib/library/local-translation-storage.ts";
import {
  createLocalTranslationRunLifetime,
  getNextQueuedTranslationTask,
  prepareLocalTranslationRun,
  recoverInterruptedTranslationTasks,
  runWithExclusiveTranslationTaskLock,
} from "../src/lib/translation/local-translation-runner.ts";

const translation: StoredLocalTranslation = {
  id: "local-translation-book-ying-wen-1",
  originalBookId: "book",
  originalTitle: "Book",
  title: "Book（英文译本）",
  sourceLanguage: "中文",
  targetLanguage: "英文",
  status: "queued",
  origin: "mcp",
  style: "自然",
  webLookupEnabled: false,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
  tasks: [
    {
      id: "task-1",
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      status: "queued",
      attemptCount: 0,
      progressText: "等待翻译",
      balanceText: "演示计价",
      updatedAt: "00:00",
    },
    {
      id: "task-2",
      chapterId: "chapter-2",
      chapterTitle: "第二章",
      status: "queued",
      attemptCount: 0,
      progressText: "等待翻译",
      balanceText: "演示计价",
      updatedAt: "00:00",
    },
  ],
  chapters: [
    {
      id: "chapter-1",
      sourceChapterId: "chapter-1",
      title: "第一章",
      wordCount: 4,
      sourceParagraphs: ["原文一"],
      translatedParagraphs: [],
      secondaryTranslationParagraphs: ["原文一"],
    },
    {
      id: "chapter-2",
      sourceChapterId: "chapter-2",
      title: "第二章",
      wordCount: 4,
      sourceParagraphs: ["原文二"],
      translatedParagraphs: [],
      secondaryTranslationParagraphs: ["原文二"],
    },
  ],
};

test("selects only the first queued task when no request is active", () => {
  assert.equal(getNextQueuedTranslationTask(translation)?.id, "task-1");
  assert.equal(
    getNextQueuedTranslationTask({
      ...translation,
      tasks: translation.tasks.map((task, index) =>
        index === 0 ? { ...task, status: "translating" as const } : task,
      ),
    }),
    null,
  );
});

test("turns interrupted translating tasks into explicit manual-retry failures", () => {
  const interrupted = {
    ...translation,
    status: "processing" as const,
    tasks: translation.tasks.map((task, index) =>
      index === 0 ? { ...task, status: "translating" as const, attemptCount: 1 } : task,
    ),
  };
  const recovered = recoverInterruptedTranslationTasks(
    interrupted,
    "2026-07-11T01:00:00.000Z",
  );
  assert.equal(recovered.changed, true);
  assert.equal(recovered.translation.tasks[0].status, "failed");
  assert.match(recovered.translation.tasks[0].failureReason ?? "", /状态未知.*手动重试/);
  assert.equal(recovered.translation.tasks[1].status, "queued");
});

test("does not rewrite a translation without interrupted tasks", () => {
  const recovered = recoverInterruptedTranslationTasks(translation);
  assert.equal(recovered.changed, false);
  assert.equal(recovered.translation, translation);
});

test("prepares a fresh queued translation to run on the first production effect", () => {
  const prepared = prepareLocalTranslationRun(translation);

  assert.equal(prepared.recovered, false);
  assert.equal(prepared.translation, translation);
  assert.equal(prepared.nextTask?.id, "task-1");
});

test("aborts an active run only after the component is really unmounted", async () => {
  const lifetime = createLocalTranslationRunLifetime();
  lifetime.mount();
  const controller = lifetime.beginRun();

  lifetime.scheduleUnmount();
  lifetime.mount();
  await Promise.resolve();
  assert.equal(controller.signal.aborted, false);

  lifetime.scheduleUnmount();
  await Promise.resolve();
  assert.equal(controller.signal.aborted, true);
  assert.equal(lifetime.isMounted(), false);
});

test("runs chapter work only while the browser grants the cross-tab lock", async () => {
  const requested: Array<{ name: string; ifAvailable: boolean }> = [];
  const lockManager = {
    async request<T>(
      name: string,
      options: { mode: "exclusive"; ifAvailable: true },
      callback: (lock: object | null) => Promise<T>,
    ) {
      requested.push({ name, ifAvailable: options.ifAvailable });
      return callback({});
    },
  };
  let calls = 0;

  const result = await runWithExclusiveTranslationTaskLock(
    lockManager,
    "translation-1",
    "task-1",
    async () => {
      calls += 1;
      return "done";
    },
  );

  assert.deepEqual(requested, [
    { name: "stray-pages.translation.translation-1.task-1", ifAvailable: true },
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(result, { acquired: true, value: "done" });
});

test("fails closed when the browser cannot provide a cross-tab lock", async () => {
  let calls = 0;
  const result = await runWithExclusiveTranslationTaskLock(
    undefined,
    "translation-1",
    "task-1",
    async () => {
      calls += 1;
      return "unsafe";
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(result, { acquired: false, reason: "unsupported" });
});
