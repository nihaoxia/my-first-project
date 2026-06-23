import { Download, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { stageEightSentenceMarkdownExport, stageSevenSentenceView } from "@/lib/mock-data";

export default function SentencesPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">句子本</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            收藏句子或段落，保留对应译文、AI 解释、来源章节和备注。
          </p>
        </div>
        <div className="text-right">
          <Button variant="secondary">
            <Download aria-hidden="true" size={17} />
            导出 Markdown
          </Button>
          <p className="mt-2 max-w-72 break-all text-sm text-[var(--muted-foreground)]">
            {stageEightSentenceMarkdownExport.fileName}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-80 items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
          <Search aria-hidden="true" size={17} className="text-[var(--muted-foreground)]" />
          <input
            className="min-w-0 flex-1 outline-none"
            defaultValue={stageSevenSentenceView.query}
            placeholder="搜索句子或解释"
          />
        </label>
        <select className="h-11 rounded-md border border-[var(--border)] bg-white px-3 text-sm">
          <option>全部书籍</option>
          {stageSevenSentenceView.availableBooks.map((book) => (
            <option key={book.id}>{book.title}</option>
          ))}
          <option>Silent Archive</option>
        </select>
      </div>

      <div className="mt-6 grid gap-4">
        {stageSevenSentenceView.items.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap justify-between gap-4">
              <h2 className="font-semibold">{item.sourceLabel}</h2>
              <Button variant="ghost" className="h-9 px-2" aria-label="删除句子">
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
              AI 解释：{item.explanation}
            </p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              备注：{item.note || "暂无备注"}
            </p>
          </article>
        ))}
      </div>

      <p className="mt-4 text-sm text-[var(--muted-foreground)]">
        {stageSevenSentenceView.deletionPreview.message}
      </p>
    </AppShell>
  );
}
