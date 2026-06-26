"use client";

import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteSentenceItem,
  filterSentenceItems,
  type SentenceStudyItem,
} from "@/lib/reader/study-collections";

export function SentencesWorkspace({
  availableBooks,
  initialItems,
  initialQuery,
}: {
  availableBooks: Array<{ id: string; title: string }>;
  initialItems: SentenceStudyItem[];
  initialQuery: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(initialQuery);
  const [selectedBookId, setSelectedBookId] = useState("all");
  const [notice, setNotice] = useState("");
  const visibleItems = useMemo(
    () => filterSentenceItems(items, { query, bookId: selectedBookId }),
    [items, query, selectedBookId],
  );

  function handleDelete(item: SentenceStudyItem) {
    setItems((currentItems) => deleteSentenceItem(currentItems, item.id));
    setNotice("已删除句子");
  }

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
          {availableBooks.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
        {notice ? <p className="self-center text-sm font-medium text-[var(--primary)]">{notice}</p> : null}
      </div>

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
    </>
  );
}
