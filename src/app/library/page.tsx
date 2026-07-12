import {
  Clock3,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LibraryShelf } from "@/components/library/library-shelf";
import { defaultShelfCollections } from "@/lib/library/library-categories";
import { originalBooks, translatedBooks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";
import { getAppSession } from "@/lib/auth/app-session";
import { getCloudBooksService } from "@/lib/cloud/books";
import { getCloudServerConfig } from "@/lib/cloud/server-config";
import { resolveCloudPersistenceMode } from "@/lib/cloud/persistence-mode";

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
    source: "translation" as const,
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
    source: "upload" as const,
  })),
];

export default async function LibraryPage() {
  const persistenceMode = resolveCloudPersistenceMode(getCloudServerConfig());
  const session = persistenceMode === "cloud" ? await getAppSession() : null;
  const cloudBooks = persistenceMode === "cloud" && session?.authMode === "supabase" ? await getCloudBooksService().list(session.userId) : null;
  const visibleBookTiles = cloudBooks ? cloudBooks.map((book, index) => ({
    id: book.id, title: book.title, detail: `${book.chapterCount} 章 / TXT`,
    href: `/books/${encodeURIComponent(book.id)}/chapters`,
    tone: index % 2 === 0 ? "from-emerald-950 via-teal-700 to-lime-200" : "from-slate-950 via-blue-800 to-cyan-200",
    coverTitle: book.title, coverSubTitle: book.author ?? "云端原书", kind: book.sourceLanguage, source: "upload" as const,
  })) : persistenceMode === "local" ? bookTiles : [];
  return (
    <AppShell requireAuth>
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

          </div>

          {persistenceMode === "unavailable" ? <p className="mx-7 mt-7 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">云端数据库或私有对象存储配置不完整，书架已停止读取；系统不会回退到本地数据。</p> : null}
          <LibraryShelf initialCollections={defaultShelfCollections} books={visibleBookTiles} persistence={persistenceMode === "local" ? "local" : "cloud"} />
        </section>
      </div>
    </AppShell>
  );
}
