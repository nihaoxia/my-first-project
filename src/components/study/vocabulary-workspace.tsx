"use client";

import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteVocabularyItem,
  filterVocabularyItems,
  type VocabularyStudyItem,
} from "@/lib/reader/study-collections";

export function VocabularyWorkspace({
  availableBooks,
  initialItems,
  initialQuery,
}: {
  availableBooks: Array<{ id: string; title: string }>;
  initialItems: VocabularyStudyItem[];
  initialQuery: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(initialQuery);
  const [selectedBookId, setSelectedBookId] = useState("all");
  const [notice, setNotice] = useState("");
  const visibleItems = useMemo(
    () => filterVocabularyItems(items, { query, bookId: selectedBookId }),
    [items, query, selectedBookId],
  );

  function handleDelete(item: VocabularyStudyItem) {
    setItems((currentItems) => deleteVocabularyItem(currentItems, item.id));
    setNotice(`已删除 ${item.term}`);
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
            placeholder="搜索单词或短语"
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{item.term}</h2>
                <p className="mt-1 text-[var(--muted-foreground)]">{item.explanation}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--muted-foreground)]">{item.sourceLabel}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-2"
                  aria-label={`删除 ${item.term}`}
                  onClick={() => handleDelete(item)}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </Button>
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-sm leading-6">
              {item.sourceSentence}
            </p>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              备注：{item.note || "暂无备注"}
            </p>
          </article>
        ))}
        {visibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            没有找到匹配的词汇。
          </div>
        ) : null}
      </div>
    </>
  );
}
