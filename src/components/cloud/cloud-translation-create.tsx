"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routeBuilders } from "@/lib/routes";

const languages = [["CHINESE", "中文"], ["ENGLISH", "英文"], ["JAPANESE", "日文"], ["KOREAN", "韩语"], ["RUSSIAN", "俄语"], ["GERMAN", "德语"], ["SPANISH", "西班牙语"], ["FRENCH", "法语"]] as const;

export function CloudTranslationCreate({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const router = useRouter();
  const [targetLanguage, setTargetLanguage] = useState("CHINESE");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function create() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/cloud/translations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ originalBookId: bookId, targetLanguage }) });
      const payload = await response.json().catch(() => null) as { translation?: { id?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.translation?.id) throw new Error(payload?.error?.message || "无法创建云端译本。");
      router.push(routeBuilders.translationTasks(payload.translation.id));
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法创建云端译本。"); setBusy(false); }
  }
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
    <p className="text-sm text-[var(--muted-foreground)]">云端译本</p><h1 className="mt-1 text-3xl font-semibold">《{bookTitle}》</h1>
    <p className="mt-2 text-sm text-[var(--muted-foreground)]">服务端将从云端原书中选取所有可翻译章节，任务和译文会持久保存。</p>
    <label className="mt-5 block max-w-sm text-sm font-medium">目标语言<select className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>{languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {notice ? <p className="mt-3 text-sm text-red-700" role="alert">{notice}</p> : null}
    <Button className="mt-5" disabled={busy} onClick={create} type="button">{busy ? "正在创建…" : "创建云端翻译任务"}</Button>
  </section>;
}
