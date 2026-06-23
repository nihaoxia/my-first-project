import type { MockAccountInput } from "../account/mock-account-summary.ts";
import {
  applyMockBalanceCharge,
  applyMockBalanceRelease,
} from "../account/mock-balance-operations.ts";
import type { TranslationTaskDraft } from "./translation-order-draft.ts";

export type MockTranslationTaskStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type MockTranslationQueueTask = Omit<TranslationTaskDraft, "status"> & {
  status: MockTranslationTaskStatus;
  progressPercent: number;
  attempt: number;
  chargedCents: number;
  releasedCents: number;
  failureReason?: string;
};

export type MockTranslationQueue = {
  tasks: MockTranslationQueueTask[];
};

export type MockTranslationQueueRunInput = {
  account: MockAccountInput;
  tasks: MockTranslationQueueTask[];
  failedChapterIds?: string[];
  canceledChapterIds?: string[];
  failureReason?: string;
};

export type MockTranslationQueueRunResult = {
  tasks: MockTranslationQueueTask[];
  accountAfterRun: MockAccountInput;
};

export type MockTranslationQueueSummary = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
  chargedCents: number;
  releasedCents: number;
};

export function buildMockTranslationQueue(taskDrafts: TranslationTaskDraft[]): MockTranslationQueue {
  return {
    tasks: taskDrafts.map((task) => ({
      ...task,
      status: "queued",
      progressPercent: 0,
      attempt: 0,
      chargedCents: 0,
      releasedCents: 0,
    })),
  };
}

export function runMockTranslationQueueBatch(
  input: MockTranslationQueueRunInput,
): MockTranslationQueueRunResult {
  const failedChapterIds = new Set(input.failedChapterIds ?? []);
  const canceledChapterIds = new Set(input.canceledChapterIds ?? []);
  let accountAfterRun = input.account;

  const tasks = input.tasks.map((task) => {
    if (task.status !== "queued" && task.status !== "running") {
      return task;
    }

    if (canceledChapterIds.has(task.chapterId)) {
      accountAfterRun = applyMockBalanceRelease(accountAfterRun, task.frozenCents);
      return finishTask(task, "canceled", {
        releasedCents: task.frozenCents,
      });
    }

    if (failedChapterIds.has(task.chapterId)) {
      accountAfterRun = applyMockBalanceRelease(accountAfterRun, task.frozenCents);
      return finishTask(task, "failed", {
        releasedCents: task.frozenCents,
        failureReason: input.failureReason ?? "mock translation failed",
      });
    }

    accountAfterRun = applyMockBalanceCharge(accountAfterRun, task.frozenCents);
    return finishTask(task, "succeeded", {
      chargedCents: task.frozenCents,
    });
  });

  return {
    tasks,
    accountAfterRun,
  };
}

export function getMockTranslationQueueSummary(
  tasks: MockTranslationQueueTask[],
): MockTranslationQueueSummary {
  return tasks.reduce<MockTranslationQueueSummary>(
    (summary, task) => {
      summary.total += 1;
      summary[task.status] += 1;
      summary.chargedCents += task.chargedCents;
      summary.releasedCents += task.releasedCents;
      return summary;
    },
    {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      canceled: 0,
      chargedCents: 0,
      releasedCents: 0,
    },
  );
}

function finishTask(
  task: MockTranslationQueueTask,
  status: Exclude<MockTranslationTaskStatus, "queued" | "running">,
  updates: Pick<Partial<MockTranslationQueueTask>, "chargedCents" | "releasedCents" | "failureReason">,
): MockTranslationQueueTask {
  return {
    ...task,
    ...updates,
    status,
    progressPercent: 100,
    attempt: task.attempt + 1,
  };
}
