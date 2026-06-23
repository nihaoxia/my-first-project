import {
  BookmarkPlus,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquareText,
  Settings2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  stageSevenAssistantResult,
  stageSevenQuestionAnswer,
  stageSevenReaderView,
  stageSevenSentenceItems,
  stageSevenVocabularyItems,
  stageEightEpubDraft,
  stageEightTxtExport,
  translatedBooks,
} from "@/lib/mock-data";
import { routes } from "@/lib/routes";

export default function ReaderPage() {
  const translation = translatedBooks[0];
  const readerView = stageSevenReaderView;
  const settings = readerView.settings;

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[260px_1fr_320px]">
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen aria-hidden="true" size={18} className="text-[var(--primary)]" />
            <h2 className="font-semibold">目录</h2>
          </div>
          <div className="space-y-2">
            {readerView.chapters.map((chapter) => (
              <button
                key={chapter.id}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-2)] ${
                  chapter.isCurrent ? "bg-[var(--surface-2)] text-[var(--foreground)]" : ""
                }`}
              >
                <span className="block font-medium">{chapter.title}</span>
                <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                  {chapter.isCurrent ? "当前阅读" : `${chapter.wordCount} 字`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] p-5">
            <div>
              <p className="text-sm text-[var(--muted-foreground)]">{translation.title}</p>
              <h1 className="mt-1 text-2xl font-semibold">{readerView.currentChapter.title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!readerView.previousChapter}>
                <ChevronLeft aria-hidden="true" size={16} />
                上一章
              </Button>
              <Button variant="secondary" disabled={!readerView.nextChapter}>
                下一章
                <ChevronRight aria-hidden="true" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            {[
              { value: "translation", label: "译文" },
              { value: "source", label: "原文" },
              { value: "parallel", label: "对照" },
            ].map((mode) => (
              <button
                key={mode.value}
                className={`h-9 rounded-md px-3 text-sm ${
                  readerView.mode === mode.value
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface-2)] text-[var(--muted-foreground)]"
                }`}
              >
                {mode.label}
              </button>
            ))}
            <button className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 text-sm text-[var(--muted-foreground)]">
              <Settings2 aria-hidden="true" size={16} />
              {settings.fontSize}px · {settings.lineHeight}x · {settings.contentWidth}px
            </button>
          </div>

          <article
            className="mx-auto space-y-5 px-5 py-8 md:px-8"
            style={{
              maxWidth: `${settings.contentWidth}px`,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {readerView.paragraphRows.map((paragraph) => (
              <div
                key={paragraph.index}
                className={
                  readerView.mode === "parallel"
                    ? "grid gap-4 rounded-lg bg-[var(--surface-2)] p-4 md:grid-cols-2"
                    : ""
                }
              >
                {readerView.mode === "parallel" ? (
                  <>
                    <p>
                      <span className="mb-2 block text-xs font-medium text-[var(--muted-foreground)]">
                        原文
                      </span>
                      {paragraph.sourceText}
                    </p>
                    <p>
                      <span className="mb-2 block text-xs font-medium text-[var(--muted-foreground)]">
                        译文
                      </span>
                      {paragraph.translatedText || "这一段译文待生成。"}
                    </p>
                  </>
                ) : (
                  <p>{paragraph.displayText}</p>
                )}
              </div>
            ))}
          </article>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">AI 阅读助手</h2>
            </div>
            <div className="rounded-lg bg-[var(--surface-2)] p-3">
              <p className="text-sm font-medium">{stageSevenAssistantResult.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {stageSevenAssistantResult.explanation}
              </p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {stageSevenAssistantResult.sourceLabel}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="px-3">
                <BookmarkPlus aria-hidden="true" size={16} />
                词汇本
              </Button>
              <Button variant="secondary" className="px-3">
                <BookmarkPlus aria-hidden="true" size={16} />
                句子本
              </Button>
            </div>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-3">
              <p className="text-sm font-medium">{stageSevenQuestionAnswer.question}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                {stageSevenQuestionAnswer.answer}
              </p>
            </div>
            <Button className="mt-3 w-full">发送问题</Button>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Download aria-hidden="true" size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold">导出</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-[var(--surface-2)] p-3">
                <p className="font-medium">TXT</p>
                <p className="mt-1 break-all text-[var(--muted-foreground)]">
                  {stageEightTxtExport.fileName}
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-3">
                <p className="font-medium">EPUB 草稿</p>
                <p className="mt-1 break-all text-[var(--muted-foreground)]">
                  {stageEightEpubDraft.fileName}
                </p>
              </div>
            </div>
            <Button variant="secondary" className="mt-4 w-full">
              <Download aria-hidden="true" size={16} />
              导出译本
            </Button>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">最近收藏</h2>
            <div className="mt-4 space-y-3 text-sm">
              <a className="block rounded-lg bg-[var(--surface-2)] p-3" href={routes.vocabulary}>
                <span className="font-medium">{stageSevenVocabularyItems[0].term}</span>
                <span className="mt-1 block text-[var(--muted-foreground)]">
                  {stageSevenVocabularyItems[0].explanation}
                </span>
              </a>
              <a className="block rounded-lg bg-[var(--surface-2)] p-3" href={routes.sentences}>
                <span className="font-medium">句子本</span>
                <span className="mt-1 block text-[var(--muted-foreground)]">
                  {stageSevenSentenceItems[0].translatedText}
                </span>
              </a>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
