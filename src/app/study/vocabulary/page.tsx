import { Download, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { vocabularyItems } from "@/lib/mock-data";

export default function VocabularyPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">词汇本</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            阅读时收藏的单词和短语会保留上下文、来源章节和个人备注。
          </p>
        </div>
        <Button variant="secondary">
          <Download aria-hidden="true" size={17} />
          导出 CSV
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-80 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
          <Search aria-hidden="true" size={17} className="text-[var(--muted-foreground)]" />
          <input className="min-w-0 flex-1 outline-none" placeholder="搜索单词或短语" />
        </label>
        <select className="h-11 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
          <option>全部书籍</option>
          <option>迷雾边境</option>
          <option>Silent Archive</option>
        </select>
      </div>

      <div className="mt-6 grid gap-4">
        {vocabularyItems.map((item) => (
          <article
            key={item.term}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{item.term}</h2>
                <p className="mt-1 text-[var(--muted-foreground)]">{item.meaning}</p>
              </div>
              <span className="text-sm text-[var(--muted-foreground)]">{item.source}</span>
            </div>
            <p className="mt-4 rounded-lg bg-[var(--surface-2)] p-3 text-sm leading-6">
              {item.context}
            </p>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              备注：{item.note || "暂无备注"}
            </p>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
