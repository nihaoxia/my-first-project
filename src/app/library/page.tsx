import {
  Clock3,
  Filter,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LibraryShelf } from "@/components/library/library-shelf";
import { defaultShelfCollections } from "@/lib/library/library-categories";
import { originalBooks, translatedBooks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

const shelfFilters = ["上传", "翻译"];

const bookTiles = [
  ...translatedBooks.map((book, index) => ({
    id: book.id,
    title: book.title,
    detail: `${book.readingProgress} / ${book.progress}%`,
    href: routes.reader,
    tone:
      index % 2 === 0
        ? "from-orange-200 via-amber-100 to-emerald-200"
        : "from-rose-200 via-pink-100 to-sky-200",
    coverTitle: book.title,
    coverSubTitle: book.originalTitle,
    kind: book.targetLanguage,
  })),
  ...originalBooks.map((book, index) => ({
    id: book.id,
    title: book.title,
    detail: `${book.progress} / ${book.chapters} 章`,
    href: book.href,
    tone:
      index % 2 === 0
        ? "from-zinc-900 via-slate-700 to-stone-400"
        : "from-cyan-900 via-blue-800 to-slate-200",
    coverTitle: book.title,
    coverSubTitle: book.author,
    kind: book.language,
  })),
];

export default function LibraryPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,oklch(0.99_0_0),oklch(0.965_0.012_155))] px-5 py-5 md:px-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-normal">书架</h1>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  管理上传原文和翻译后的阅读版本。
                </p>
              </div>

            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
                <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <Clock3 aria-hidden="true" size={15} />
                </span>
                今日已读 90 分钟
              </div>

            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {shelfFilters.map((filter) => (
                  <span
                    key={filter}
                    className={
                      filter === "上传"
                        ? "shrink-0 rounded-lg bg-orange-50 px-5 py-3 text-base font-semibold text-orange-700"
                        : "shrink-0 rounded-lg bg-white px-5 py-3 text-base font-medium text-[var(--foreground)] shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition hover:bg-[var(--surface-2)]"
                    }
                  >
                    {filter}
                  </span>
                ))}
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-base font-medium text-[var(--foreground)] shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition hover:bg-[var(--surface-2)]"
              >
                <Filter aria-hidden="true" size={18} />
                语言：全部
              </span>
            </div>
          </div>

          <LibraryShelf initialCollections={defaultShelfCollections} books={bookTiles} />
        </section>
      </div>
    </AppShell>
  );
}
