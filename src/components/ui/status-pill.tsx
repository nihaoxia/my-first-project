import { clsx } from "clsx";
import type { TranslationStatus } from "@/lib/mock-data";

const statusText: Record<TranslationStatus, string> = {
  ready: "已完成",
  processing: "进行中",
  review: "需检查",
  failed: "失败",
  queued: "排队中",
  skipped: "已跳过",
};

const statusClasses: Record<TranslationStatus, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  processing: "bg-blue-50 text-blue-700 ring-blue-200",
  review: "bg-amber-50 text-amber-800 ring-amber-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  queued: "bg-slate-100 text-slate-700 ring-slate-200",
  skipped: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function StatusPill({ status, label }: { status: TranslationStatus; label?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium ring-1",
        statusClasses[status],
      )}
    >
      {label ?? statusText[status]}
    </span>
  );
}
