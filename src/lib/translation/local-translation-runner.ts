import {
  failStoredLocalTranslationTask,
  type StoredLocalTranslation,
} from "../library/local-translation-storage.ts";

export function getNextQueuedTranslationTask(translation: StoredLocalTranslation) {
  if (translation.tasks.some((task) => task.status === "translating")) {
    return null;
  }

  return translation.tasks.find((task) => task.status === "queued") ?? null;
}

export function prepareLocalTranslationRun(translation: StoredLocalTranslation) {
  const recovery = recoverInterruptedTranslationTasks(translation);
  return {
    recovered: recovery.changed,
    translation: recovery.translation,
    nextTask: recovery.changed ? null : getNextQueuedTranslationTask(recovery.translation),
  };
}

export function createLocalTranslationRunLifetime() {
  let mounted = false;
  let activeController: AbortController | null = null;

  return {
    mount() {
      mounted = true;
    },
    scheduleUnmount() {
      mounted = false;
      queueMicrotask(() => {
        if (!mounted) activeController?.abort();
      });
    },
    beginRun() {
      activeController?.abort();
      activeController = new AbortController();
      return activeController;
    },
    finishRun(controller: AbortController) {
      if (activeController === controller) activeController = null;
    },
    isActive(controller: AbortController) {
      return mounted && activeController === controller && !controller.signal.aborted;
    },
    isMounted() {
      return mounted;
    },
  };
}

export type TranslationTaskLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>;
};

export async function runWithExclusiveTranslationTaskLock<T>(
  lockManager: TranslationTaskLockManager | undefined,
  translationId: string,
  taskId: string,
  run: () => Promise<T>,
): Promise<
  | { acquired: false; reason: "unsupported" | "busy" }
  | { acquired: true; value: T }
> {
  if (!lockManager) {
    return { acquired: false, reason: "unsupported" } as const;
  }

  const name = `stray-pages.translation.${translationId}.${taskId}`;
  return lockManager.request(name, { mode: "exclusive", ifAvailable: true }, async (lock) =>
    lock
      ? { acquired: true as const, value: await run() }
      : { acquired: false as const, reason: "busy" as const },
  );
}

export function recoverInterruptedTranslationTasks(
  translation: StoredLocalTranslation,
  recoveredAt = new Date().toISOString(),
): { changed: boolean; translation: StoredLocalTranslation } {
  const interruptedTaskIds = translation.tasks
    .filter((task) => task.status === "translating")
    .map((task) => task.id);

  if (interruptedTaskIds.length === 0) {
    return { changed: false, translation };
  }

  let current = translation;

  for (const taskId of interruptedTaskIds) {
    const result = failStoredLocalTranslationTask(
      current,
      taskId,
      "上次请求在页面离开后状态未知。为避免重复调用模型，请手动重试本章。",
      recoveredAt,
    );

    if (result.ok) {
      current = result.translation;
    }
  }

  return { changed: current !== translation, translation: current };
}
