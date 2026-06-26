import { AlertTriangle, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LocalStoredBookChapters } from "@/components/library/local-stored-book-chapters";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { ChapterEditorPanel } from "@/components/upload/chapter-editor-panel";
import { LocalChapterPreview } from "@/components/upload/local-chapter-preview";
import { isLocalLibraryBookId } from "@/lib/library/local-library-view";
import { chapters, originalBooks } from "@/lib/mock-data";
import { routeBuilders } from "@/lib/routes";
import { buildEditableChapters } from "@/lib/upload/chapter-editing";
import { localUploadBookId } from "@/lib/upload/local-upload-storage";
import { buildUploadDraft } from "@/lib/upload/upload-draft";
import { parseTxtChapters, txtChapterParsePolicy } from "@/lib/upload/txt-chapter-parser";

const parsingRules = txtChapterParsePolicy.ruleLabels;
const sampleTextContent = "第一章 雾起\n雾从边境漫过来。\n\n目录\n\n第二章 黑桥\n桥下没有水，只有风。";
const parsedChapterPreview = parseTxtChapters(sampleTextContent).chapters;
const editableChapters = buildEditableChapters(parsedChapterPreview);
const sampleUploadDraft = buildUploadDraft({
  name: "迷雾边境 - 林间客.txt",
  size: 4096,
  textContent: sampleTextContent,
});

export default async function ChapterPreviewPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  if (bookId === localUploadBookId) {
    return (
      <AppShell>
        <LocalChapterPreview />
      </AppShell>
    );
  }

  if (isLocalLibraryBookId(bookId)) {
    return (
      <AppShell>
        <LocalStoredBookChapters bookId={bookId} />
      </AppShell>
    );
  }

  const book = originalBooks.find((item) => item.id === bookId);

  if (!book) {
    notFound();
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">章节预览</p>
          <h1 className="mt-1 text-3xl font-semibold">《{book.title}》</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            已识别 {book.chapters} 章。确认章节结构后，可以创建目标语言译本。
          </p>
        </div>
        <Button href={routeBuilders.bookTranslate(book.id)}>
          创建译本
          <ArrowRight aria-hidden="true" size={18} />
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">拆章规则</h2>
            <div className="mt-4 space-y-2">
              {parsingRules.map((rule, index) => (
                <label
                  key={rule}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                >
                  <input type="radio" name="rule" defaultChecked={index === 0} />
                  {rule}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
              <div>
                <h2 className="font-semibold">异常提示</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  发现 1 个疑似目录页，1 个较长章节。第一版支持重命名和跳过，不支持合并或拆分章节。
                </p>
              </div>
            </div>
          </section>

          {sampleUploadDraft.ok && sampleUploadDraft.parseStatus === "parsed" ? (
            <ChapterEditorPanel initialChapters={editableChapters} uploadDraft={sampleUploadDraft} />
          ) : null}
        </aside>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] p-5">
            <h2 className="font-semibold">章节列表</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              费用为静态估算示例，后续会根据语言和字数计算。
            </p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {chapters.map((chapter) => (
              <div key={chapter.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_120px_120px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{chapter.title}</h3>
                    <StatusPill status={chapter.status} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {chapter.note}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-[var(--muted-foreground)]">字数</p>
                  <p className="mt-1 font-medium">{chapter.words}</p>
                </div>
                <div className="text-sm">
                  <p className="text-[var(--muted-foreground)]">预计费用</p>
                  <p className="mt-1 font-medium">¥ {chapter.cost}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
