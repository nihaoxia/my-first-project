import type { ReactNode } from "react";
import { BookMarked, BookOpenText, NotebookPen } from "lucide-react";
import { clsx } from "clsx";
import { StudyNotebookPicker } from "@/components/study/study-notebook-picker";
import { routes } from "@/lib/routes";

type StudySection = "vocabulary" | "sentences" | "notes";

const sectionTabs: Array<{
  id: StudySection;
  label: string;
  href: string;
  icon: typeof BookMarked;
}> = [
  { id: "vocabulary", label: "词汇本", href: routes.vocabulary, icon: BookMarked },
  { id: "sentences", label: "句子本", href: routes.sentences, icon: BookOpenText },
  { id: "notes", label: "笔记本", href: routes.notes, icon: NotebookPen },
];

export function StudyLibraryHeader({
  active,
  title,
  description,
  actions,
}: {
  active: StudySection;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-2 max-w-3xl text-[var(--muted-foreground)]">{description}</p>
        </div>
        {actions ? <div className="shrink-0 text-right">{actions}</div> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap gap-2">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;

            return (
              <a
                key={tab.id}
                className={clsx(
                  "inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--muted)]",
                )}
                href={tab.href}
              >
                <Icon aria-hidden="true" size={17} />
                {tab.label}
              </a>
            );
          })}
        </div>

        <StudyNotebookPicker kind={active} />
      </div>
    </div>
  );
}
