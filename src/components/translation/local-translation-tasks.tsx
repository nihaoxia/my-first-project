"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  completeStoredLocalTranslationTask,
  failStoredLocalTranslationTask,
  findStoredLocalTranslation,
  getStoredLocalTranslationSummary,
  localTranslationsStorageKey,
  parseStoredLocalTranslationsResult,
  retryStoredLocalTranslationTask,
  startStoredLocalTranslationTask,
  upsertStoredLocalTranslation,
  type StoredLocalTranslation,
  type StoredLocalTranslationMutationResult,
} from "@/lib/library/local-translation-storage";
import { routeBuilders, routes } from "@/lib/routes";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";
import { parseTranslationChapterHttpResponse } from "@/lib/translation/mcp-contract";
import {
  createLocalTranslationRunLifetime,
  getNextQueuedTranslationTask,
  prepareLocalTranslationRun,
  runWithExclusiveTranslationTaskLock,
  type TranslationTaskLockManager,
} from "@/lib/translation/local-translation-runner";
import { assessTranslationQuality } from "@/lib/translation/translation-quality";
import type { TranslationProviderSegmentResult } from "@/lib/translation/translation-provider";

const localTranslationsChangedEvent = "stray-pages.local-translations-changed";

type LocalTranslationTasksState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "malformed" }
  | { status: "storage-error"; reason: "unavailable" | "scope-unavailable" }
  | {
      status: "ready";
      translation: NonNullable<ReturnType<typeof findStoredLocalTranslation>>;
      summary: ReturnType<typeof getStoredLocalTranslationSummary>;
    };

export function LocalTranslationTasks({ translationId }: { translationId: string }) {
  const rawTranslations = useSyncExternalStore(
    subscribeToLocalTranslations,
    readLocalTranslationsSnapshot,
    getServerLocalTranslationsSnapshot,
  );
  const state = useMemo(
    () => parseLocalTranslationTasksState(rawTranslations, translationId),
    [rawTranslations, translationId],
  );
  const activeTaskIdRef = useRef<string | null>(null);
  const recoveryCompletedRef = useRef(false);
  const [runLifetime] = useState(() => createLocalTranslationRunLifetime());
  const [runnerTick, setRunnerTick] = useState(0);
  const [runnerPaused, setRunnerPaused] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    runLifetime.mount();
    return () => runLifetime.scheduleUnmount();
  }, [runLifetime]);

  useEffect(() => {
    if (state.status !== "ready") return;

    if (!recoveryCompletedRef.current) {
      recoveryCompletedRef.current = true;
      const prepared = prepareLocalTranslationRun(state.translation);
      if (prepared.recovered) {
        const saved = replaceStoredTranslation(translationId, prepared.translation);
        queueMicrotask(() =>
          runLifetime.isMounted() &&
          setNotice(saved.ok
            ? "检测到上次中断的章节。为避免重复调用模型，请手动重试失败章节。"
            : saved.message),
        );
        queueMicrotask(() => runLifetime.isMounted() && setRunnerPaused(true));
        return;
      }
    }

    if (runnerPaused || activeTaskIdRef.current) return;
    const nextTask = getNextQueuedTranslationTask(state.translation);
    if (!nextTask) return;

    activeTaskIdRef.current = nextTask.id;
    void runWithExclusiveTranslationTaskLock(
      getTranslationTaskLockManager(),
      translationId,
      nextTask.id,
      async () => {
        if (!runLifetime.isMounted()) return;
        const controller = runLifetime.beginRun();
        const attemptId = globalThis.crypto.randomUUID();
        const started = mutateStoredTranslation(translationId, (translation) =>
          startStoredLocalTranslationTask(translation, nextTask.id, new Date().toISOString(), attemptId),
        );

        if (!started.ok) {
          if (runLifetime.isActive(controller)) setNotice(started.message);
          runLifetime.finishRun(controller);
          return;
        }

        const runningTranslation = started.translation;
        const runningTask = runningTranslation.tasks.find((task) => task.id === nextTask.id);
        const chapter = runningTranslation.chapters.find((item) => item.id === runningTask?.chapterId);

        if (!runningTask || !chapter) {
          const message = "找不到待翻译章节，请重新创建译本。";
          const failed = mutateStoredTranslation(translationId, (translation) =>
            failStoredLocalTranslationTask(
              translation,
              nextTask.id,
              message,
              new Date().toISOString(),
              attemptId,
            ),
          );
          if (runLifetime.isActive(controller)) {
            setRunnerPaused(true);
            setNotice(failed.ok ? message : failed.message);
          }
          runLifetime.finishRun(controller);
          return;
        }

        const sourceSegments = chapter.sourceParagraphs.map((text, index) => ({
          id: `${chapter.id}-segment-${index + 1}`,
          index,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          text,
          characterCount: text.length,
        }));

        try {
          const result = await translateChapterInBatches({
            signal: controller.signal,
            sourceLanguage: runningTranslation.sourceLanguage,
            targetLanguage: runningTranslation.targetLanguage,
            style: runningTranslation.style ?? "自然",
            segments: sourceSegments,
          });
          if (!runLifetime.isActive(controller)) return;

          if (!result.ok) {
            const failed = mutateStoredTranslation(translationId, (translation) =>
              failStoredLocalTranslationTask(
                translation,
                nextTask.id,
                result.error.message,
                new Date().toISOString(),
                attemptId,
              ),
            );
            setRunnerPaused(true);
            setNotice(failed.ok ? result.error.message : failed.message);
            return;
          }

          const quality = assessTranslationQuality({
            sourceSegments,
            translatedSegments: result.translations,
          });
          const completed = mutateStoredTranslation(translationId, (translation) =>
            completeStoredLocalTranslationTask(translation, nextTask.id, {
              translations: result.translations,
              providerName: result.providerName,
              model: result.model,
              usage: result.usage,
              qualityStatus: quality.status,
              attemptId,
            }),
          );
          setNotice(completed.ok ? `${runningTask.chapterTitle} 翻译完成。` : completed.message);
        } catch {
          if (!runLifetime.isActive(controller)) return;
          const message = "翻译请求意外中断，请手动重试本章。";
          const failed = mutateStoredTranslation(translationId, (translation) =>
            failStoredLocalTranslationTask(
              translation,
              nextTask.id,
              message,
              new Date().toISOString(),
              attemptId,
            ),
          );
          setRunnerPaused(true);
          setNotice(failed.ok ? message : failed.message);
        } finally {
          runLifetime.finishRun(controller);
        }
      },
    )
      .then((lockResult) => {
        if (!lockResult.acquired && runLifetime.isMounted()) {
          setRunnerPaused(true);
          setNotice(
            lockResult.reason === "unsupported"
              ? "当前浏览器不支持跨标签页安全锁，翻译已暂停；请使用最新版浏览器。"
              : "另一个标签页正在处理本章；当前页面已暂停，避免重复调用模型。",
          );
        }
      })
      .catch(() => {
        if (runLifetime.isMounted()) {
          setRunnerPaused(true);
          setNotice("无法取得章节翻译锁，请刷新页面后重试。");
        }
      })
      .finally(() => {
        activeTaskIdRef.current = null;
        if (runLifetime.isMounted()) setRunnerTick((value) => value + 1);
      });
  }, [runnerPaused, runnerTick, runLifetime, state, translationId]);

  function handleRetry(taskId: string) {
    const retried = mutateStoredTranslation(translationId, (translation) =>
      retryStoredLocalTranslationTask(translation, taskId),
    );
    setNotice(retried.ok ? "章节已重新加入翻译队列。" : retried.message);
    if (retried.ok) {
      setRunnerPaused(false);
      setRunnerTick((value) => value + 1);
    }
  }

  if (state.status === "loading") {
    return <LoadingState />;
  }

  if (state.status === "missing" || state.status === "malformed" || state.status === "storage-error") {
    return <UnavailableState state={state} />;
  }

  const readerHref = routeBuilders.reader({ translationId: state.translation.id });
  const canRead = state.summary.finishedChapters > 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">MCP 翻译进度</p>
          <h1 className="mt-1 text-3xl font-semibold">{state.translation.title}</h1>
          <p className="mt-2 text-[var(--muted-foreground)]" aria-live="polite">
            {notice || (state.translation.status === "ready" ? "全部章节翻译完成。" : "页面会按顺序逐章翻译，完成一章立即保存。")}
          </p>
        </div>
        {canRead ? (
          <Button href={readerHref}>打开已完成章节</Button>
        ) : (
          <Button disabled title="至少完成一个章节后才能阅读">打开阅读器</Button>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard label="翻译进度" value={`${state.summary.progressPercent}%`} detail="按完成章节统计" />
        <MetricCard label="完成章节" value={`${state.summary.finishedChapters}`} detail="可以阅读" />
        <MetricCard label="需重试章节" value={`${state.summary.failedChapters}`} detail="不会自动重试" />
        <MetricCard label="等待章节" value={`${state.summary.queuedChapters}`} detail="逐章执行" />
      </div>

      <section className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] p-5">
          <h2 className="font-semibold">章节进度</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            译文由已配置的 MCP 服务生成；失败不会写入模板内容或覆盖已完成章节。
          </p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {state.translation.tasks.map((task) => (
            <div key={task.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_140px_160px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{task.chapterTitle}</h3>
                  <StatusPill status={task.status === "translating" ? "processing" : task.status} />
                </div>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{task.progressText}</p>
                {task.failureReason ? (
                  <div className="mt-3" role="alert">
                    <p className="text-sm text-red-700">{task.failureReason}</p>
                    <Button className="mt-2" onClick={() => handleRetry(task.id)} type="button" variant="secondary">
                      <RefreshCw aria-hidden="true" size={15} />
                      重试本章
                    </Button>
                  </div>
                ) : null}
                {task.providerName ? (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {task.providerName}{task.model ? ` · ${task.model}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">更新时间</p>
                <p className="mt-1 font-medium">{task.updatedAt}</p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--muted-foreground)]">计价说明</p>
                <p className="mt-1 font-medium">{task.balanceText}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

async function translateChapterInBatches(input: {
  signal: AbortSignal;
  sourceLanguage: string;
  targetLanguage: string;
  style: "自然";
  segments: Array<{
    id: string;
    index: number;
    chapterId: string;
    chapterTitle: string;
    text: string;
    characterCount: number;
  }>;
}): Promise<
  | {
      ok: true;
      providerName: string;
      model?: string;
      usage: { inputTokens: number; outputTokens: number };
      translations: TranslationProviderSegmentResult[];
    }
  | { ok: false; error: { message: string } }
> {
  const translations: TranslationProviderSegmentResult[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let providerName = "";
  let model: string | undefined;

  for (let offset = 0; offset < input.segments.length; offset += 10) {
    const batch = input.segments.slice(offset, offset + 10);
    const response = await fetch("/api/translation/chapters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        style: input.style,
        glossaryTerms: [],
        segments: batch.map((segment) => ({
          id: segment.id,
          index: segment.index,
          chapterId: segment.chapterId,
          chapterTitle: segment.chapterTitle,
          text: segment.text,
        })),
      }),
      signal: input.signal,
    });
    const payload = await response.json().catch(() => null);
    const parsed = parseTranslationChapterHttpResponse(payload, batch);
    if (!parsed.ok) return parsed;
    providerName = parsed.providerName;
    model = parsed.model;
    usage.inputTokens += parsed.usage?.inputTokens ?? 0;
    usage.outputTokens += parsed.usage?.outputTokens ?? 0;
    translations.push(...parsed.translations);
  }

  return { ok: true, providerName, model, usage, translations };
}

function getTranslationTaskLockManager(): TranslationTaskLockManager | undefined {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return undefined;
  return navigator.locks as unknown as TranslationTaskLockManager;
}

function mutateStoredTranslation(
  translationId: string,
  mutate: (translation: StoredLocalTranslation) => StoredLocalTranslationMutationResult,
): { ok: true; translation: StoredLocalTranslation } | { ok: false; message: string } {
  const readResult = readScopedLocalStorage(localTranslationsStorageKey);
  if (!readResult.ok) return { ok: false, message: getLocalStorageFailureMessage(readResult.reason) };
  const parsed = parseStoredLocalTranslationsResult(readResult.value);
  if (!parsed.ok) return { ok: false, message: "本地译本数据已损坏，操作已停止。" };
  const current = findStoredLocalTranslation(parsed.records, translationId);
  if (!current) return { ok: false, message: "没有找到当前译本。" };
  const result = mutate(current);
  if (!result.ok) return { ok: false, message: "译本状态已经变化，请刷新后重试。" };
  return replaceStoredTranslation(translationId, result.translation, parsed.records);
}

function replaceStoredTranslation(
  translationId: string,
  translation: StoredLocalTranslation,
  knownRecords?: StoredLocalTranslation[],
): { ok: true; translation: StoredLocalTranslation } | { ok: false; message: string } {
  let records = knownRecords;
  if (!records) {
    const readResult = readScopedLocalStorage(localTranslationsStorageKey);
    if (!readResult.ok) return { ok: false, message: getLocalStorageFailureMessage(readResult.reason) };
    const parsed = parseStoredLocalTranslationsResult(readResult.value);
    if (!parsed.ok) return { ok: false, message: "本地译本数据已损坏，操作已停止。" };
    records = parsed.records;
  }
  if (!records.some((record) => record.id === translationId)) {
    return { ok: false, message: "没有找到当前译本。" };
  }
  const writeResult = writeScopedLocalStorage(
    localTranslationsStorageKey,
    JSON.stringify(upsertStoredLocalTranslation(records, translation)),
  );
  if (!writeResult.ok) return { ok: false, message: getLocalStorageFailureMessage(writeResult.reason) };
  window.dispatchEvent(new Event(localTranslationsChangedEvent));
  return { ok: true, translation };
}

function subscribeToLocalTranslations(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localTranslationsChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localTranslationsChangedEvent, onStoreChange);
  };
}

function getServerLocalTranslationsSnapshot() {
  return undefined;
}

function readLocalTranslationsSnapshot() {
  return toLocalStorageSnapshot(readScopedLocalStorage(localTranslationsStorageKey));
}

function parseLocalTranslationTasksState(
  rawTranslations: string | null | undefined,
  translationId: string,
): LocalTranslationTasksState {
  if (rawTranslations === undefined) return { status: "loading" };
  const storageFailure = getLocalStorageSnapshotFailure(rawTranslations);
  if (storageFailure) return { status: "storage-error", reason: storageFailure };
  const parsed = parseStoredLocalTranslationsResult(rawTranslations);
  if (!parsed.ok) return { status: "malformed" };
  const translation = findStoredLocalTranslation(parsed.records, translationId);
  return translation
    ? { status: "ready", translation, summary: getStoredLocalTranslationSummary(translation) }
    : { status: "missing" };
}

function LoadingState() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
      正在读取译本...
    </div>
  );
}

function UnavailableState({ state }: { state: Exclude<LocalTranslationTasksState, { status: "ready" | "loading" }> }) {
  const description =
    state.status === "storage-error"
      ? getLocalStorageFailureMessage(state.reason)
      : state.status === "malformed"
        ? "本地译本数据已损坏，系统没有继续解析，也不会自动覆盖原始内容。"
        : "这个译本可能已经不在当前浏览器中。你可以回到书架重新打开书籍。";
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold">{state.status === "missing" ? "没有找到这个译本" : "无法读取本地译本"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{description}</p>
          <Button href={routes.library} className="mt-5">回到书架</Button>
        </div>
      </div>
    </section>
  );
}
