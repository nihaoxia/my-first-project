"use client";

import { Search, Trash2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteSentenceItem,
  filterSentenceItems,
  type SentenceStudyItem,
} from "@/lib/reader/study-collections";
import {
  localReaderSelectionsStorageKey,
  parseReaderSelectionCollectionsResult,
  removeReaderSelectionFromLocalCollection,
} from "@/lib/reader/reader-selection-save";
import {
  localReaderSelectionBook,
  localSentencesStorageKey,
  mergeReaderSelectionsIntoSentenceItems,
  parseStoredSentenceItemsResult,
} from "@/lib/study/local-study-storage";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";

const localSentencesChangedEvent = "stray-pages.study-sentences-changed";
const localReaderSelectionsChangedEvent = "stray-pages.reader-selections-changed";

export function SentencesWorkspace({
  availableBooks,
  initialItems,
  initialQuery,
  initialNextCursor = null,
  persistence = "local",
}: {
  availableBooks: Array<{ id: string; title: string }>;
  initialItems: SentenceStudyItem[];
  initialQuery: string;
  initialNextCursor?: string | null;
  persistence?: "local" | "cloud" | "unavailable";
}) {
  const [cloudItems, setCloudItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const rawItems = useSyncExternalStore(
    persistence === "local" ? subscribeToSentences : subscribeNoop,
    persistence === "local" ? readSentencesSnapshot : getServerStorageSnapshot,
    getServerStorageSnapshot,
  );
  const rawSelections = useSyncExternalStore(
    persistence === "local" ? subscribeToReaderSelections : subscribeNoop,
    persistence === "local" ? readReaderSelectionsSnapshot : getServerStorageSnapshot,
    getServerStorageSnapshot,
  );
  const itemsParseResult = useMemo(
    () => parseStoredSentenceItemsResult(rawItems ?? null),
    [rawItems],
  );
  const persistedItems = useMemo(
    () => persistence === "cloud" ? cloudItems : persistence === "local" ? (rawItems ? itemsParseResult.records : initialItems) : [],
    [cloudItems, initialItems, itemsParseResult.records, persistence, rawItems],
  );
  const selectionsParseResult = useMemo(
    () => parseReaderSelectionCollectionsResult(rawSelections ?? null),
    [rawSelections],
  );
  const selections = selectionsParseResult.collections;
  const items = useMemo(
    () => persistence === "local" ? mergeReaderSelectionsIntoSentenceItems(persistedItems, selections) : persistedItems,
    [persistedItems, persistence, selections],
  );
  const [query, setQuery] = useState(initialQuery);
  const [selectedBookId, setSelectedBookId] = useState("all");
  const [notice, setNotice] = useState("");
  const itemStorageFailure = getLocalStorageSnapshotFailure(rawItems);
  const selectionStorageFailure = getLocalStorageSnapshotFailure(rawSelections);
  const storageWarning = persistence === "unavailable" ? "云端服务未配置，句子本已停止读取；系统不会回退到本地数据。" : persistence === "cloud" ? "" : itemStorageFailure
    ? getLocalStorageFailureMessage(itemStorageFailure)
    : selectionStorageFailure
      ? getLocalStorageFailureMessage(selectionStorageFailure)
      : !itemsParseResult.ok
        ? "句子本本地数据已损坏。为避免覆盖原始内容，删除操作已暂停。"
        : !selectionsParseResult.ok
          ? "阅读器收藏本地数据已损坏。为避免覆盖原始内容，句子本删除操作已暂停。"
          : "";
  const visibleItems = useMemo(
    () => filterSentenceItems(items, { query, bookId: selectedBookId }),
    [items, query, selectedBookId],
  );

  async function handleDelete(item: SentenceStudyItem) {
    if (storageWarning) {
      setNotice(storageWarning);
      return;
    }

    if (!window.confirm("确定从句子本删除这条内容吗？")) {
      return;
    }

    if (persistence === "cloud") {
      const response = await fetch(`/api/cloud/study?kind=sentence&id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!response.ok) { setNotice("云端删除失败，请刷新后重试。"); return; }
      setCloudItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice("已删除句子");
      return;
    }

    if (item.bookId === localReaderSelectionBook.id) {
      const nextSelections = removeReaderSelectionFromLocalCollection(
        selections,
        "sentence",
        item.originalText,
      );
      const selectionWriteResult = writeScopedLocalStorage(
        localReaderSelectionsStorageKey,
        JSON.stringify(nextSelections),
      );

      if (!selectionWriteResult.ok) {
        setNotice(getLocalStorageFailureMessage(selectionWriteResult.reason));
        return;
      }

      window.dispatchEvent(new Event(localReaderSelectionsChangedEvent));
    }

    const nextItems = deleteSentenceItem(items, item.id);
    const writeResult = writeScopedLocalStorage(
      localSentencesStorageKey,
      JSON.stringify(nextItems),
    );

    if (!writeResult.ok) {
      setNotice(getLocalStorageFailureMessage(writeResult.reason));
      return;
    }

    window.dispatchEvent(new Event(localSentencesChangedEvent));
    setNotice("已删除句子");
  }

  async function loadMore() {
    if (persistence !== "cloud" || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/cloud/study?kind=sentence&limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      if (!response.ok) { setNotice("加载更多句子失败，请稍后重试。"); return; }
      const body = await response.json() as { items?: Array<Record<string, unknown>>; nextCursor?: string | null };
      if (!Array.isArray(body.items) || !(body.nextCursor === null || typeof body.nextCursor === "string")) { setNotice("云端句子分页响应无效。"); return; }
      const added = body.items.map((row) => ({ id: row.id as string, originalText: row.originalText as string, translatedText: (row.translatedText as string | null) ?? "", explanation: (row.explanation as string | null) ?? "", note: (row.note as string | null) ?? "", bookId: row.originalBookId as string, bookTitle: row.bookTitle as string, chapterId: (row.chapterId as string | null) ?? "", chapterTitle: (row.chapterTitle as string | null) ?? "", sourceLabel: `${row.bookTitle as string} · ${(row.chapterTitle as string | null) ?? "整本书"}` }));
      setCloudItems((current) => [...current, ...added.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(body.nextCursor ?? null);
    } finally { setLoadingMore(false); }
  }

  const visibleBooks = items.some((item) => item.bookId === localReaderSelectionBook.id)
    ? [...availableBooks, localReaderSelectionBook]
    : availableBooks;

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-80 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
          <Search aria-hidden="true" size={17} className="text-[var(--muted-foreground)]" />
          <input
            className="min-w-0 flex-1 outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索句子或解释"
          />
        </label>
        <select
          className="h-11 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
          value={selectedBookId}
          onChange={(event) => setSelectedBookId(event.target.value)}
        >
          <option value="all">全部书籍</option>
          {visibleBooks.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
        {notice ? <p className="self-center text-sm font-medium text-[var(--primary)]">{notice}</p> : null}
      </div>

      {storageWarning ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {storageWarning}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4">
        {visibleItems.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap justify-between gap-4">
              <h2 className="font-semibold">{item.sourceLabel}</h2>
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-2"
                aria-label="删除句子"
                onClick={() => handleDelete(item)}
              >
                <Trash2 aria-hidden="true" size={16} />
              </Button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg bg-[var(--surface-2)] p-4">
                <p className="text-sm text-[var(--muted-foreground)]">原文</p>
                <p className="mt-2 leading-7">{item.originalText}</p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-4">
                <p className="text-sm text-[var(--muted-foreground)]">译文</p>
                <p className="mt-2 leading-7">{item.translatedText}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
              解释：{item.explanation}
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              备注：{item.note || "暂无备注"}
            </p>
          </article>
        ))}
        {visibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            没有找到匹配的句子。
          </div>
        ) : null}
      </div>
      {persistence === "cloud" && nextCursor ? <div className="mt-5 text-center"><Button type="button" variant="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "加载中…" : "加载更多"}</Button></div> : null}
    </>
  );
}

function subscribeToSentences(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localSentencesChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localSentencesChangedEvent, onStoreChange);
  };
}

function subscribeToReaderSelections(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localReaderSelectionsChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localReaderSelectionsChangedEvent, onStoreChange);
  };
}

function getServerStorageSnapshot() {
  return undefined;
}

function subscribeNoop() { return () => undefined; }

function readSentencesSnapshot() {
  const result = readScopedLocalStorage(localSentencesStorageKey);
  return toLocalStorageSnapshot(result);
}

function readReaderSelectionsSnapshot() {
  const result = readScopedLocalStorage(localReaderSelectionsStorageKey);
  return toLocalStorageSnapshot(result);
}
