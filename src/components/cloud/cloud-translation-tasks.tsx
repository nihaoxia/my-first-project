"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { routeBuilders } from "@/lib/routes";

type Task = { id: string; chapterTitle: string; status: string; retryCount: number; progressPercent: number; canContinue: boolean; isLeaseExpired: boolean; error?: { message: string } };
export function CloudTranslationTasks({ translationId }: { translationId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]); const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { const response = await fetch(`/api/cloud/translations/${encodeURIComponent(translationId)}/tasks`, { cache: "no-store" }); const payload = await response.json().catch(() => null) as { tasks?: Task[]; error?: { message?: string } } | null; if (!response.ok) throw new Error(payload?.error?.message || "无法读取云端任务。"); setTasks(payload?.tasks || []); }, [translationId]);
  useEffect(() => {
    let canceled = false;
    fetch(`/api/cloud/translations/${encodeURIComponent(translationId)}/tasks`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { tasks?: Task[]; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(payload?.error?.message || "无法读取云端任务。");
        if (!canceled) setTasks(payload?.tasks || []);
      })
      .catch((error: Error) => { if (!canceled) setNotice(error.message); });
    return () => { canceled = true; };
  }, [translationId]);
  async function act(taskId: string, action: "run" | "retry" | "cancel") { setBusy(taskId); setNotice(""); try { const response = await fetch(`/api/cloud/translations/${encodeURIComponent(translationId)}/tasks/${encodeURIComponent(taskId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null; if (!response.ok) throw new Error(payload?.error?.message || "任务操作失败。"); await refresh(); } catch (error) { setNotice(error instanceof Error ? error.message : "任务操作失败。"); } finally { setBusy(null); } }
  const readable = tasks.some((task) => task.status === "COMPLETED");
  return <div><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted-foreground)]">云端 MCP 翻译</p><h1 className="mt-1 text-3xl font-semibold">章节任务</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">刷新或重新登录后，任务状态仍从数据库恢复。</p></div>{readable ? <Button href={routeBuilders.reader({ translationId })}>打开云端译文</Button> : null}</div>
    {notice ? <p className="mt-4 text-sm text-red-700" role="alert">{notice}</p> : null}
    <div className="mt-6 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">{tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-medium">{task.chapterTitle}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">{task.status} · {task.progressPercent}% · 重试 {task.retryCount}{task.isLeaseExpired ? " · 租约已过期，可接管" : ""}</p>{task.error ? <p className="mt-1 text-sm text-red-700">{task.error.message}</p> : null}</div><div className="flex gap-2">{task.canContinue ? <Button disabled={busy === task.id} onClick={() => act(task.id, "run")} type="button">{task.progressPercent > 0 ? "继续下一批" : "运行第一批"}</Button> : null}{task.status === "FAILED" ? <Button disabled={busy === task.id} onClick={() => act(task.id, "retry")} type="button" variant="secondary">重试</Button> : null}{["PENDING", "FAILED", "TRANSLATING"].includes(task.status) ? <Button disabled={busy === task.id} onClick={() => act(task.id, "cancel")} type="button" variant="secondary">取消</Button> : null}</div></div>)}</div>
  </div>;
}
