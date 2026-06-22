import { BookOpen, ChevronLeft, ChevronRight, MessageSquareText, Settings2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { chapters, sentenceItems, translatedBooks, vocabularyItems } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

const paragraphs = [
  "The mist moved like a drowsy gray cloth, slowly covering the border. From the watchtower, Lin could no longer see the black bridge, only the pale lamps swaying along its ribs.",
  "He did not answer; he simply raised the lamp higher. The old mistwarden had warned him that names changed in the fog, and that a careless translation could summon the wrong memory.",
  "At the threshold of the inn, the floorboards gave a soft, patient sound. Someone had written the same sentence on every door: Do not ask the road where it has been.",
];

export default function ReaderPage() {
  const translation = translatedBooks[0];

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[260px_1fr_320px]">
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen aria-hidden="true" size={18} className="text-[var(--primary)]" />
            <h2 className="font-semibold">目录</h2>
          </div>
          <div className="space-y-2">
            {chapters.slice(0, 4).map((chapter, index) => (
              <button
                key={chapter.id}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="block font-medium">{chapter.title}</span>
                <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                  {index === 1 ? "当前阅读" : `${chapter.words} 字`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] p-5">
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">{translation.title}</p>
              <h1 className="mt-1 text-2xl font-semibold">第二章：黑桥</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary">
                <ChevronLeft aria-hidden="true" size={16} />
                上一章
              </Button>
              <Button variant="secondary">
                下一章
                <ChevronRight aria-hidden="true" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            {["译文", "原文", "对照"].map((mode, index) => (
              <button
                key={mode}
                className={`h-9 rounded-md px-3 text-sm ${
                  index === 0
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                }`}
              >
                {mode}
              </button>
            ))}
            <button className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 text-sm text-[var(--muted-foreground)]">
              <Settings2 aria-hidden="true" size={16} />
              阅读设置
            </button>
          </div>

          <article className="mx-auto max-w-3xl space-y-6 px-8 py-10 text-lg leading-9">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">AI 阅读助手</h2>
            </div>
            <div className="space-y-2">
              {["解释选中词", "解释当前句", "为什么这样翻译"].map((action) => (
                <button
                  key={action}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                >
                  {action}
                </button>
              ))}
            </div>
            <textarea
              className="mt-4 min-h-24 w-full rounded-lg border border-[var(--border)] bg-white p-3 text-sm"
              placeholder="问一个关于当前段落的问题"
            />
            <Button className="mt-3 w-full">发送问题</Button>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">最近收藏</h2>
            <div className="mt-4 space-y-3 text-sm">
              <a className="block rounded-lg bg-[var(--surface-2)] p-3" href={routes.vocabulary}>
                <span className="font-medium">{vocabularyItems[0].term}</span>
                <span className="mt-1 block text-[var(--muted-foreground)]">
                  {vocabularyItems[0].meaning}
                </span>
              </a>
              <a className="block rounded-lg bg-[var(--surface-2)] p-3" href={routes.sentences}>
                <span className="font-medium">句子本</span>
                <span className="mt-1 block text-[var(--muted-foreground)]">
                  {sentenceItems[0].translation}
                </span>
              </a>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
