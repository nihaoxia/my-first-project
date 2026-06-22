import { ArrowRight, BookOpen, Clock, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { accountSummary, originalBooks, translatedBooks, translationTasks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

export default function LibraryPage() {
  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">私人书架</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            管理你上传的原版小说和翻译后生成的译本。第一版只保留私人阅读，不提供公开书库或分享。
          </p>
        </div>
        <Button href={routes.upload}>
          <Upload aria-hidden="true" size={18} />
          上传小说
        </Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <MetricCard label="账户余额" value={`¥ ${accountSummary.balance}`} detail="公开体验版模拟余额" />
        <MetricCard label="冻结金额" value={`¥ ${accountSummary.frozen}`} detail="等待任务完成" />
        <MetricCard label="原版书籍" value={`${originalBooks.length}`} detail="TXT / EPUB" />
        <MetricCard label="译本数量" value={`${translatedBooks.length}`} detail="多目标语言" />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">原版书架</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              上传后先确认章节，再创建一个或多个目标语言译本。
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {originalBooks.map((book) => (
            <article
              key={book.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{book.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {book.author} · {book.language} · {book.format} · {book.size}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
                  {book.chapters} 章
                </span>
              </div>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-[var(--muted-foreground)]">上传时间</p>
                  <p className="mt-1 font-medium">{book.uploadedAt}</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">最近打开</p>
                  <p className="mt-1 font-medium">{book.lastOpenedAt}</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">进度</p>
                  <p className="mt-1 font-medium">{book.progress}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button href={book.href} variant="secondary">
                  确认章节
                </Button>
                <Button href={routes.translate} variant="ghost">
                  创建译本
                  <ArrowRight aria-hidden="true" size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">译本书架</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            同一本原版书可以创建多个目标语言译本，每个译本独立保存进度。
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {translatedBooks.map((book) => (
            <article
              key={book.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{book.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    《{book.originalTitle}》 · {book.targetLanguage}
                  </p>
                </div>
                <StatusPill status={book.status} />
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">翻译进度</span>
                  <span className="font-medium">{book.progress}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[var(--muted)]">
                  <div
                    className="h-2 rounded-full bg-[var(--primary)]"
                    style={{ width: `${book.progress}%` }}
                  />
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-[var(--muted-foreground)]">完成</p>
                  <p className="mt-1 font-medium">{book.completedChapters} 章</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">失败</p>
                  <p className="mt-1 font-medium">{book.failedChapters} 章</p>
                </div>
                <div>
                  <p className="text-[var(--muted-foreground)]">阅读进度</p>
                  <p className="mt-1 font-medium">{book.readingProgress}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button href={routes.reader}>
                  <BookOpen aria-hidden="true" size={16} />
                  打开阅读器
                </Button>
                <Button href={book.href} variant="secondary">
                  查看任务
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock aria-hidden="true" size={18} className="text-[var(--primary)]" />
          <h2 className="text-xl font-semibold">最近任务</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {translationTasks.slice(0, 3).map((task) => (
            <div key={task.chapter} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{task.chapter}</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {task.progress} · 更新于 {task.updatedAt}
                </p>
              </div>
              <StatusPill status={task.status} />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
