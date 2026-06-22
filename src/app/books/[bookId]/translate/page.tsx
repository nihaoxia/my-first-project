import { Globe2, Languages, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { accountSummary, chapters, originalBooks } from "@/lib/mock-data";
import { routes } from "@/lib/routes";

const languages = ["中文", "英文", "日文", "韩文", "俄语", "德语", "西班牙语", "法语"];

export default function CreateTranslationPage() {
  const book = originalBooks[0];
  const selectedChapters = chapters.filter((chapter) => chapter.status !== "skipped");
  const totalCost = selectedChapters.reduce((sum, chapter) => sum + Number(chapter.cost), 0);

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">创建译本</p>
          <h1 className="mt-1 text-3xl font-semibold">《{book.title}》</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            选择目标语言和章节，系统会先冻结余额，翻译成功后正式扣费。
          </p>
        </div>
        <Button href={routes.tasks}>加入翻译队列</Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Languages aria-hidden="true" size={19} className="text-[var(--primary)]" />
              <h2 className="font-semibold">目标语言</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {languages.map((language) => (
                <label
                  key={language}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                >
                  <input type="radio" name="language" defaultChecked={language === "英文"} />
                  {language}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Globe2 aria-hidden="true" size={19} className="text-[var(--primary)]" />
              <h2 className="font-semibold">术语联网查证</h2>
            </div>
            <label className="flex items-start gap-3 rounded-lg bg-[var(--surface-2)] p-4">
              <input className="mt-1" type="checkbox" defaultChecked />
              <span>
                <span className="block font-medium">默认开启</span>
                <span className="mt-1 block text-sm leading-6 text-[var(--muted-foreground)]">
                  只查证书名、人名、地名、组织名、技能名和术语关键词，不搜索整章或大段正文。
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] p-5">
              <h2 className="font-semibold">选择章节</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                已跳过章节不会进入翻译队列。
              </p>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {chapters.map((chapter) => (
                <label
                  key={chapter.id}
                  className="grid gap-4 p-5 lg:grid-cols-[28px_1fr_120px_120px]"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    defaultChecked={chapter.status !== "skipped"}
                    disabled={chapter.status === "skipped"}
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{chapter.title}</h3>
                      <StatusPill status={chapter.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{chapter.note}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-[var(--muted-foreground)]">字数</p>
                    <p className="mt-1 font-medium">{chapter.words}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-[var(--muted-foreground)]">预计费用</p>
                    <p className="mt-1 font-medium">¥ {chapter.cost}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Wallet aria-hidden="true" size={19} className="text-[var(--primary)]" />
              <h2 className="font-semibold">费用预估</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">已选章节</dt>
                <dd className="font-medium">{selectedChapters.length} 章</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">预计费用</dt>
                <dd className="font-medium">¥ {totalCost.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-foreground)]">当前余额</dt>
                <dd className="font-medium">¥ {accountSummary.balance}</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-3">
                <dt className="text-[var(--muted-foreground)]">翻译后预计余额</dt>
                <dd className="font-medium">¥ {accountSummary.estimatedAfterSelection}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">翻译风格</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              第一版默认采用自然可读的小说翻译风格，不提供复杂风格选择。后续可扩展直译、文学化和学习对照版。
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
