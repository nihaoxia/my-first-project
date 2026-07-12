import assert from "node:assert/strict";
import test from "node:test";

import { defaultMockAccount } from "../src/lib/account/mock-account-summary.ts";
import {
  buildQueuedLocalTranslationFromOrder,
  buildStoredLocalTranslationReaderView,
  completeStoredLocalTranslationTask,
  failStoredLocalTranslationTask,
  getStoredLocalTranslationSummary,
  localTranslationsStorageKey,
  parseStoredLocalTranslations,
  parseStoredLocalTranslationsResult,
  removeStoredLocalTranslation,
  renameStoredLocalTranslation,
  retryStoredLocalTranslationTask,
  startStoredLocalTranslationTask,
} from "../src/lib/library/local-translation-storage.ts";
import { buildTranslationOrderDraft } from "../src/lib/translation/translation-order-draft.ts";
import type { StoredLocalLibraryBook } from "../src/lib/library/local-library-storage.ts";

const storedBook: StoredLocalLibraryBook = {
  id: "local-book-the-local-book-txt-mb1be1",
  title: "The Local Book",
  author: "A. Writer",
  format: "TXT",
  originalFileName: "the-local-book.txt",
  chapterCount: 2,
  skippedChapterCount: 0,
  totalCharacters: 1200,
  savedAt: "2026-06-26T12:00:00.000Z",
  chapters: [
    {
      position: 1,
      sourceIndex: 1,
      title: "Chapter 1",
      originalTitle: "Chapter 1",
      characterCount: 600,
      content: "Mist covered the old bridge.\nThe lamp stayed bright.",
      contentPreview: "Mist covered the old bridge.",
      warnings: [],
    },
    {
      position: 2,
      sourceIndex: 2,
      title: "Chapter 2",
      originalTitle: "Chapter 2",
      characterCount: 600,
      content: "The inn door opened.",
      contentPreview: "The inn door opened.",
      warnings: [],
    },
  ],
  skippedChapters: [],
};

function buildOrderDraft() {
  const draft = buildTranslationOrderDraft({
    userId: "local-user",
    originalBookId: storedBook.id,
    sourceLanguage: "英文",
    targetLanguage: "中文",
    webLookupEnabled: false,
    account: defaultMockAccount,
    chapters: storedBook.chapters.map((chapter) => ({
      id: `${storedBook.id}-chapter-${chapter.sourceIndex}`,
      title: chapter.title,
      characterCount: chapter.characterCount,
    })),
    selectedChapterIds: [`${storedBook.id}-chapter-1`, `${storedBook.id}-chapter-2`],
  });

  assert.equal(draft.ok, true);

  if (!draft.ok) {
    throw new Error("expected draft");
  }

  return draft;
}

test("defines a stable local translation storage key", () => {
  assert.equal(localTranslationsStorageKey, "stray-pages.local-translations");
});

test("distinguishes missing translations from malformed persisted data", () => {
  assert.deepEqual(parseStoredLocalTranslationsResult(null), {
    ok: true,
    status: "missing",
    records: [],
  });
  assert.deepEqual(parseStoredLocalTranslationsResult("not-json"), {
    ok: false,
    reason: "malformed",
    records: [],
  });
});

test("builds a queued local translation without template translations", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });

  assert.equal(
    translation.id.startsWith("local-translation-local-book-the-local-book-txt-mb1be1-zhong-wen-"),
    true,
  );
  assert.equal(translation.originalBookId, storedBook.id);
  assert.equal(translation.sourceLanguage, "英文");
  assert.equal(translation.targetLanguage, "中文");
  assert.equal(translation.status, "queued");
  assert.equal(translation.tasks.length, 2);
  assert.deepEqual(
    translation.tasks.map((task) => [task.chapterTitle, task.status, task.progressText]),
    [
      ["Chapter 1", "queued", "等待翻译"],
      ["Chapter 2", "queued", "等待翻译"],
    ],
  );
  assert.equal(translation.chapters.length, 2);
  assert.equal(translation.chapters.every((chapter) => chapter.translatedParagraphs.length === 0), true);
  assert.equal(translation.chapters.every((chapter) => chapter.sourceParagraphs.length > 0), true);
});

test("does not silently overwrite repeated translations into the same target language", () => {
  const first = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const second = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T14:00:00.000Z",
  });

  assert.notEqual(first.id, second.id);
});

test("summarizes a stored local translation for task pages", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });

  assert.deepEqual(getStoredLocalTranslationSummary(translation), {
    totalChapters: 2,
    finishedChapters: 0,
    failedChapters: 0,
    queuedChapters: 2,
    progressPercent: 0,
  });
});

test("builds a reader view from a stored local translation", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const task = translation.tasks[1];
  const started = startStoredLocalTranslationTask(translation, task.id, "2026-06-26T13:01:00.000Z");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const completed = completeStoredLocalTranslationTask(started.translation, task.id, {
    translations: started.translation.chapters[1].sourceParagraphs.map((text, index) => ({
      segmentId: `${task.chapterId}-segment-${index + 1}`,
      index,
      translatedText: `译文：${text}`,
    })),
    providerName: "openai-compatible",
    model: "translator-model",
    qualityStatus: "passed",
    completedAt: "2026-06-26T13:02:00.000Z",
  });
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  const readerView = buildStoredLocalTranslationReaderView(
    completed.translation,
    completed.translation.chapters[1].id,
  );

  assert.equal(readerView.currentChapter.title, "Chapter 2");
  assert.equal(readerView.paragraphRows[0].sourceText, "The inn door opened.");
  assert.equal(readerView.paragraphRows[0].learningText.length > 0, true);
});

test("parses only valid stored local translations", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });

  assert.deepEqual(parseStoredLocalTranslations(JSON.stringify([translation, { id: "bad" }])), [
    translation,
  ]);
  assert.deepEqual(parseStoredLocalTranslations("not-json"), []);
});

test("rejects translations whose tasks chapters or ready paragraphs are relationally inconsistent", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const missingChapter = {
    ...translation,
    tasks: translation.tasks.map((task, index) =>
      index === 0 ? { ...task, chapterId: "missing-chapter" } : task,
    ),
  };
  const readyWithoutTranslation = {
    ...translation,
    status: "processing" as const,
    tasks: translation.tasks.map((task, index) =>
      index === 0 ? { ...task, status: "ready" as const } : task,
    ),
  };
  const duplicateTaskChapter = {
    ...translation,
    tasks: translation.tasks.map((task, index) =>
      index === 1
        ? {
            ...task,
            chapterId: translation.tasks[0].chapterId,
            chapterTitle: translation.tasks[0].chapterTitle,
          }
        : task,
    ),
  };
  const mismatchedSecondaryParagraphs = {
    ...translation,
    chapters: translation.chapters.map((chapter, index) =>
      index === 0 ? { ...chapter, secondaryTranslationParagraphs: [] } : chapter,
    ),
  };

  assert.equal(parseStoredLocalTranslationsResult(JSON.stringify([missingChapter])).ok, false);
  assert.equal(parseStoredLocalTranslationsResult(JSON.stringify([readyWithoutTranslation])).ok, false);
  assert.equal(parseStoredLocalTranslationsResult(JSON.stringify([duplicateTaskChapter])).ok, false);
  assert.equal(
    parseStoredLocalTranslationsResult(JSON.stringify([mismatchedSecondaryParagraphs])).ok,
    false,
  );
});

test("renames and removes stored local translations", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const renamed = renameStoredLocalTranslation([translation], translation.id, "  My Translation  ");

  assert.equal(renamed.ok, true);

  if (!renamed.ok) {
    return;
  }

  assert.equal(renamed.translations[0].title, "My Translation");
  assert.deepEqual(removeStoredLocalTranslation(renamed.translations, translation.id), []);
  assert.deepEqual(renameStoredLocalTranslation([translation], translation.id, " "), {
    ok: false,
    reason: "empty-title",
  });
});

test("rejects duplicate stored local translation titles", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "鑻辨枃",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const otherTranslation = {
    ...translation,
    id: `${translation.id}-other`,
    title: "Other Translation",
  };

  assert.deepEqual(
    renameStoredLocalTranslation(
      [translation, otherTranslation],
      translation.id,
      " Other   Translation ",
    ),
    {
      ok: false,
      reason: "duplicate-title",
    },
  );
});

test("moves a chapter through translating, failed, retry, and ready states", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const task = translation.tasks[0];
  const started = startStoredLocalTranslationTask(translation, task.id, "2026-06-26T13:01:00.000Z");
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.translation.status, "processing");
  assert.equal(started.translation.tasks[0].attemptCount, 1);

  const failed = failStoredLocalTranslationTask(
    started.translation,
    task.id,
    "模型服务当前请求过多，请稍后重试。",
    "2026-06-26T13:02:00.000Z",
  );
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  assert.equal(failed.translation.status, "queued");
  assert.equal(failed.translation.tasks[0].status, "failed");

  const retried = retryStoredLocalTranslationTask(
    failed.translation,
    task.id,
    "2026-06-26T13:03:00.000Z",
  );
  assert.equal(retried.ok, true);
  if (!retried.ok) return;
  assert.equal(retried.translation.tasks[0].status, "queued");
  assert.equal(retried.translation.tasks[0].failureReason, undefined);
});

test("only the owning attempt can fail or complete a translating task", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const task = translation.tasks[0];
  const started = startStoredLocalTranslationTask(
    translation,
    task.id,
    "2026-06-26T13:01:00.000Z",
    "attempt-owner",
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  assert.equal(started.translation.tasks[0].attemptId, "attempt-owner");
  assert.deepEqual(
    failStoredLocalTranslationTask(
      started.translation,
      task.id,
      "should not win",
      "2026-06-26T13:02:00.000Z",
      "attempt-other",
    ),
    { ok: false, reason: "attempt-not-owned" },
  );
  assert.deepEqual(
    completeStoredLocalTranslationTask(started.translation, task.id, {
      translations: started.translation.chapters[0].sourceParagraphs.map((text, index) => ({
        segmentId: `${task.chapterId}-segment-${index + 1}`,
        index,
        translatedText: `译文：${text}`,
      })),
      providerName: "openai-compatible",
      qualityStatus: "passed",
      attemptId: "attempt-other",
    }),
    { ok: false, reason: "attempt-not-owned" },
  );
});

test("rejects completing a chapter with misaligned provider segments", () => {
  const translation = buildQueuedLocalTranslationFromOrder({
    book: storedBook,
    orderDraft: buildOrderDraft(),
    sourceLanguage: "英文",
    createdAt: "2026-06-26T13:00:00.000Z",
  });
  const task = translation.tasks[0];
  const started = startStoredLocalTranslationTask(translation, task.id);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.deepEqual(
    completeStoredLocalTranslationTask(started.translation, task.id, {
      translations: [{ segmentId: "wrong", index: 0, translatedText: "Wrong" }],
      providerName: "openai-compatible",
      model: "translator-model",
      qualityStatus: "passed",
    }),
    { ok: false, reason: "misaligned-translations" },
  );
});
