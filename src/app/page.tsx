import { ArrowRight, BookMarked, Languages, SearchCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { originalBooks, translatedBooks, translationTasks } from "@/lib/mock-data";
import { homePrototypeCopy } from "@/lib/product-capabilities";
import { routes } from "@/lib/routes";

const workflow = [
  {
    title: "上传小说",
    description: homePrototypeCopy.uploadWorkflowDescription,
    icon: BookMarked,
  },
  {
    title: "确认章节",
    description: "预览拆章结果，跳过目录页或异常章节。",
    icon: SearchCheck,
  },
  {
    title: "创建译本",
    description: homePrototypeCopy.translationWorkflowDescription,
    icon: Languages,
  },
  {
    title: "阅读学习",
    description: "译本阅读器内划词、划句、收藏学习资料。",
    icon: Sparkles,
  },
];

export default function HomePage() {
  const activeTranslation = translatedBooks[0];

  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium text-[var(--primary)]">
            私人小说翻译与语言学习工作台
          </p>
          <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-normal text-[var(--foreground)] md:text-5xl">
            {homePrototypeCopy.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
            {homePrototypeCopy.summary}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={routes.upload}>
              上传小说
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
            <Button href={routes.library} variant="secondary">
              查看书架
            </Button>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <MetricCard label="演示原书" value={`${originalBooks.length}`} detail="另含你的本地导入" />
            <MetricCard label="演示译本" value={`${translatedBooks.length}`} detail="本地流程示例" />
            <MetricCard label="演示进度" value={`${translationTasks.length}`} detail="非真实后台任务" />
          </div>
        </div>

        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="border-b border-[var(--border)] pb-4">
            <p className="text-sm text-[var(--muted-foreground)]">当前演示译本</p>
            <h2 className="mt-1 text-xl font-semibold">{activeTranslation.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              来自《{activeTranslation.originalTitle}》 · {activeTranslation.targetLanguage}
            </p>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">演示生成进度</span>
              <span className="font-medium">{activeTranslation.progress}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[var(--muted)]">
              <div
                className="h-2 rounded-full bg-[var(--primary)]"
                style={{ width: `${activeTranslation.progress}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-[var(--surface-2)] p-3">
                <p className="text-[var(--muted-foreground)]">完成章节</p>
                <p className="mt-1 text-lg font-semibold">{activeTranslation.completedChapters}</p>
              </div>
              <div className="rounded-md bg-[var(--surface-2)] p-3">
                <p className="text-[var(--muted-foreground)]">未生成章节</p>
                <p className="mt-1 text-lg font-semibold">{activeTranslation.failedChapters}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {workflow.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--primary)]">
                    <Icon aria-hidden="true" size={19} />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
