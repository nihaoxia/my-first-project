"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { defaultMockAccount } from "@/lib/account/mock-account-summary";
import {
  findStoredLocalLibraryBook,
  localLibraryBooksStorageKey,
  parseStoredLocalLibraryBooksResult,
} from "@/lib/library/local-library-storage";
import { buildLocalLibraryTranslationSource } from "@/lib/library/local-library-translation";
import {
  buildQueuedLocalTranslationFromOrder,
  localTranslationsStorageKey,
  parseStoredLocalTranslationsResult,
  upsertStoredLocalTranslation,
} from "@/lib/library/local-translation-storage";
import { routes, routeBuilders } from "@/lib/routes";
import type { TranslationOrderDraftResult } from "@/lib/translation/translation-order-draft";
import { Button } from "@/components/ui/button";
import { TranslationCreatePanel } from "./translation-create-panel";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";

const localLibraryBooksChangedEvent = "stray-pages.local-library-books-changed";
const localTranslationsChangedEvent = "stray-pages.local-translations-changed";

type LocalTranslationCreateState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "malformed" }
  | { status: "storage-error"; reason: "unavailable" | "scope-unavailable" }
  | {
      status: "ready";
      book: NonNullable<ReturnType<typeof findStoredLocalLibraryBook>>;
      source: ReturnType<typeof buildLocalLibraryTranslationSource>;
    };

export function LocalTranslationCreate({ bookId, userId }: { bookId: string; userId: string }) {
  const rawBooks = useSyncExternalStore(
    subscribeToLocalLibraryBooks,
    readLocalLibraryBooksSnapshot,
    getServerLocalLibraryBooksSnapshot,
  );
  const state = useMemo(() => parseLocalTranslationCreateState(rawBooks, bookId), [bookId, rawBooks]);

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
        正在读取书籍...
      </div>
    );
  }

  if (state.status === "missing" || state.status === "malformed" || state.status === "storage-error") {
    const description =
      state.status === "storage-error"
        ? getLocalStorageFailureMessage(state.reason)
        : state.status === "malformed"
          ? "本地书架数据已损坏。为避免覆盖原始内容，请先返回书架处理或重新导入。"
          : "这本书可能已经从书架移出。你可以回到书架查看当前保存的书籍。";

    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">
              {state.status === "missing" ? "没有找到这本书" : "无法读取本地书架"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
            <Button href={routes.library} className="mt-5">
              回到书架
            </Button>
          </div>
        </div>
      </section>
    );
  }

  function handleCreateLocalTranslation(
    orderDraft: Extract<TranslationOrderDraftResult, { ok: true }>,
  ) {
    if (state.status !== "ready") {
      return {
        notice: "",
        tasksHref: routes.tasks,
      };
    }

    const currentTranslationsResult = readScopedLocalStorage(localTranslationsStorageKey);

    if (!currentTranslationsResult.ok) {
      return {
        notice: getLocalStorageFailureMessage(currentTranslationsResult.reason),
        tasksHref: "",
        tone: "error" as const,
      };
    }

    const translationsParseResult = parseStoredLocalTranslationsResult(
      currentTranslationsResult.value,
    );

    if (!translationsParseResult.ok) {
      return {
        notice: "本地译本数据已损坏，为避免覆盖原始数据，本次生成已取消。",
        tasksHref: "",
        tone: "error" as const,
      };
    }

    const currentTranslations = translationsParseResult.records;
    const storedTranslation = buildQueuedLocalTranslationFromOrder({
      book: state.book,
      orderDraft,
      sourceLanguage: state.source.sourceLanguage,
    });
    const nextTranslations = upsertStoredLocalTranslation(currentTranslations, storedTranslation);
    const writeResult = writeScopedLocalStorage(
      localTranslationsStorageKey,
      JSON.stringify(nextTranslations),
    );

    if (!writeResult.ok) {
      return {
        notice: getLocalStorageFailureMessage(writeResult.reason),
        tasksHref: "",
        tone: "error" as const,
      };
    }

    window.dispatchEvent(new Event(localTranslationsChangedEvent));

    return {
      notice: `已创建 ${storedTranslation.targetLanguage} 翻译队列，共 ${storedTranslation.tasks.length} 个章节。请进入进度页开始翻译。`,
      tasksHref: routeBuilders.translationTasks(storedTranslation.id),
      tone: "success" as const,
    };
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">创建译本</p>
          <h1 className="mt-1 text-3xl font-semibold">《{state.source.title}》</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            选择目标语言和章节后，通过已配置的 MCP 服务逐章翻译；完成结果保存在当前账号的浏览器中。费用和余额仍仅作界面演示。
          </p>
        </div>
        <Button href={routeBuilders.bookChapters(state.source.id)} variant="secondary">
          返回章节预览
        </Button>
      </div>

      <div className="mt-8">
        <TranslationCreatePanel
          userId={userId}
          originalBookId={state.source.id}
          sourceLanguage={state.source.sourceLanguage}
          account={defaultMockAccount}
          chapters={state.source.chapters}
          onCreateDraft={handleCreateLocalTranslation}
        />
      </div>
    </div>
  );
}

function subscribeToLocalLibraryBooks(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localLibraryBooksChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localLibraryBooksChangedEvent, onStoreChange);
  };
}

function getServerLocalLibraryBooksSnapshot() {
  return undefined;
}

function readLocalLibraryBooksSnapshot() {
  const result = readScopedLocalStorage(localLibraryBooksStorageKey);
  return toLocalStorageSnapshot(result);
}

function parseLocalTranslationCreateState(
  rawBooks: string | null | undefined,
  bookId: string,
): LocalTranslationCreateState {
  if (rawBooks === undefined) {
    return { status: "loading" };
  }

  const storageFailure = getLocalStorageSnapshotFailure(rawBooks);

  if (storageFailure) {
    return { status: "storage-error", reason: storageFailure };
  }

  const booksParseResult = parseStoredLocalLibraryBooksResult(rawBooks);

  if (!booksParseResult.ok) {
    return { status: "malformed" };
  }

  const book = findStoredLocalLibraryBook(booksParseResult.records, bookId);

  if (!book) {
    return { status: "missing" };
  }

  return {
    status: "ready",
    book,
    source: buildLocalLibraryTranslationSource(book),
  };
}
