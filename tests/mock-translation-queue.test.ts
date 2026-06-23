import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMockTranslationQueue,
  getMockTranslationQueueSummary,
  runMockTranslationQueueBatch,
} from "../src/lib/translation/mock-translation-queue.ts";

const taskDrafts = [
  {
    chapterId: "chapter-1",
    chapterTitle: "Chapter 1",
    status: "queued" as const,
    standardUnits: 1,
    baseCostCents: 50,
    freeUnitsApplied: 1,
    frozenCents: 0,
  },
  {
    chapterId: "chapter-2",
    chapterTitle: "Chapter 2",
    status: "queued" as const,
    standardUnits: 1,
    baseCostCents: 50,
    freeUnitsApplied: 0,
    frozenCents: 50,
  },
  {
    chapterId: "chapter-3",
    chapterTitle: "Chapter 3",
    status: "queued" as const,
    standardUnits: 3,
    baseCostCents: 150,
    freeUnitsApplied: 0,
    frozenCents: 150,
  },
];

test("builds queued mock translation tasks from stage four task drafts", () => {
  const queue = buildMockTranslationQueue(taskDrafts);

  assert.deepEqual(
    queue.tasks.map((task) => ({
      chapterId: task.chapterId,
      status: task.status,
      progressPercent: task.progressPercent,
      frozenCents: task.frozenCents,
      chargedCents: task.chargedCents,
      releasedCents: task.releasedCents,
    })),
    [
      {
        chapterId: "chapter-1",
        status: "queued",
        progressPercent: 0,
        frozenCents: 0,
        chargedCents: 0,
        releasedCents: 0,
      },
      {
        chapterId: "chapter-2",
        status: "queued",
        progressPercent: 0,
        frozenCents: 50,
        chargedCents: 0,
        releasedCents: 0,
      },
      {
        chapterId: "chapter-3",
        status: "queued",
        progressPercent: 0,
        frozenCents: 150,
        chargedCents: 0,
        releasedCents: 0,
      },
    ],
  );
});

test("charges completed tasks and releases failed tasks after a mock batch run", () => {
  const queue = buildMockTranslationQueue(taskDrafts);
  const result = runMockTranslationQueueBatch({
    account: {
      balanceCents: 1230,
      frozenCents: 200,
      freeChaptersLeft: 0,
    },
    tasks: queue.tasks,
    failedChapterIds: ["chapter-3"],
    failureReason: "mock quality check failed",
  });

  assert.deepEqual(
    result.tasks.map((task) => ({
      chapterId: task.chapterId,
      status: task.status,
      progressPercent: task.progressPercent,
      chargedCents: task.chargedCents,
      releasedCents: task.releasedCents,
      failureReason: task.failureReason,
    })),
    [
      {
        chapterId: "chapter-1",
        status: "succeeded",
        progressPercent: 100,
        chargedCents: 0,
        releasedCents: 0,
        failureReason: undefined,
      },
      {
        chapterId: "chapter-2",
        status: "succeeded",
        progressPercent: 100,
        chargedCents: 50,
        releasedCents: 0,
        failureReason: undefined,
      },
      {
        chapterId: "chapter-3",
        status: "failed",
        progressPercent: 100,
        chargedCents: 0,
        releasedCents: 150,
        failureReason: "mock quality check failed",
      },
    ],
  );
  assert.deepEqual(result.accountAfterRun, {
    balanceCents: 1180,
    frozenCents: 0,
    freeChaptersLeft: 0,
  });
});

test("cancels queued tasks and releases their frozen balance", () => {
  const queue = buildMockTranslationQueue(taskDrafts);
  const result = runMockTranslationQueueBatch({
    account: {
      balanceCents: 1230,
      frozenCents: 200,
      freeChaptersLeft: 0,
    },
    tasks: queue.tasks,
    canceledChapterIds: ["chapter-2"],
  });

  const canceledTask = result.tasks.find((task) => task.chapterId === "chapter-2");

  assert.equal(canceledTask?.status, "canceled");
  assert.equal(canceledTask?.releasedCents, 50);
  assert.deepEqual(result.accountAfterRun, {
    balanceCents: 1080,
    frozenCents: 0,
    freeChaptersLeft: 0,
  });
});

test("summarizes mock queue statuses and balance movements", () => {
  const queue = buildMockTranslationQueue(taskDrafts);
  const result = runMockTranslationQueueBatch({
    account: {
      balanceCents: 1230,
      frozenCents: 200,
      freeChaptersLeft: 0,
    },
    tasks: queue.tasks,
    failedChapterIds: ["chapter-3"],
  });

  assert.deepEqual(getMockTranslationQueueSummary(result.tasks), {
    total: 3,
    queued: 0,
    running: 0,
    succeeded: 2,
    failed: 1,
    canceled: 0,
    chargedCents: 50,
    releasedCents: 150,
  });
});
