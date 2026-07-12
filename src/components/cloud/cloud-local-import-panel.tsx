"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildLocalStudyImportManifest, cloudImportMarkerStorageKey, runImportChunks, type LocalStudyImportSource } from "@/lib/cloud/import-client-core";
import { localReaderSelectionsStorageKey, parseReaderSelectionCollectionsResult } from "@/lib/reader/reader-selection-save";
import { deriveLocalStorageScope } from "@/lib/storage/local-storage-scope";
import { readLegacyLocalStorage, readScopedLocalStorage, writeScopedLocalStorage } from "@/lib/storage/safe-local-storage";
import { localNotesStorageKey, localSentencesStorageKey, localVocabularyStorageKey, parseStoredSentenceItemsResult, parseStoredStudyNotesResult, parseStoredVocabularyItemsResult } from "@/lib/study/local-study-storage";

const keys = [localVocabularyStorageKey, localSentencesStorageKey, localNotesStorageKey, localReaderSelectionsStorageKey] as const;
type ReadResult = ReturnType<typeof readScopedLocalStorage>;

export function CloudLocalImportPanel({ legacyMockUserId }: { legacyMockUserId: string }) {
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function runImport() {
    setBusy(true); setNotice("");
    try {
      const existingMarker = readScopedLocalStorage(cloudImportMarkerStorageKey);
      if (existingMarker.ok && existingMarker.value) { try { if ((JSON.parse(existingMarker.value) as { version?: unknown }).version === 1) { setNotice("这份本地学习数据已经完成过云端导入；本地副本仍保留。"); return; } } catch { /* malformed marker cannot hide data */ } }
      let storage: Storage; try { storage = window.localStorage; } catch { setNotice("无法安全读取本地副本，导入未开始。"); return; }
      const legacyScope = deriveLocalStorageScope(legacyMockUserId);
      const rawSources = [
        { origin: "current-supabase-scope", reads: keys.map((key) => readScopedLocalStorage(key)) },
        { origin: `legacy-mock-scope:${legacyScope}`, reads: keys.map((key) => readLegacyLocalStorage(storage, key, legacyScope)) },
        { origin: "legacy-unscoped", reads: keys.map((key) => readLegacyLocalStorage(storage, key, null)) },
      ];
      const sources: LocalStudyImportSource[] = [];
      for (const source of rawSources) { const parsed = parseSource(source.origin, source.reads); if (!parsed.ok) { setNotice(`本地来源 ${source.origin} 数据损坏或不可读，导入已停止。`); return; } sources.push(parsed.source); }
      const prepared = await buildLocalStudyImportManifest({ sources }, crypto.randomUUID());
      if (!prepared.items.length) { setNotice(prepared.unresolved ? `有 ${prepared.unresolved} 条记录缺少书籍/章节来源，无法安全映射。` : "三个受支持来源中没有可导入的本地学习数据。"); return; }
      const summary = prepared.sourceCounts.map((item) => `${item.origin}：${item.records} 条`).join("\n");
      if (!window.confirm(`即将从以下受支持来源导入：\n${summary}\n共 ${prepared.items.length} 条；本地副本不会删除。是否继续？`)) { setNotice("已取消导入，本地副本保持不变。"); return; }
      const run = await runImportChunks(prepared.items, { uuid: () => crypto.randomUUID(), send: async (chunk) => {
        let response: Response; try { response = await fetch("/api/cloud/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chunk) }); } catch { throw new Error("NETWORK_ERROR"); }
        let body: { result?: { complete: boolean; counts: { created: number; skipped: number; conflicts: number; errors: number }; batchId: string; manifestId: string }; error?: { code?: string } }; try { body = await response.json() as typeof body; } catch { throw new Error("INVALID_RESPONSE"); }
        if (!response.ok || !body.result) throw new Error(body.error?.code ?? "IMPORT_FAILED"); return body.result;
      } });
      const totals = run.totals; const chunksCompleted = run.completedChunks;
      if (!run.ok) { setNotice(`第 ${run.failedChunk + 1} 批失败（${run.reason}）；已完成 ${chunksCompleted} 批，可安全重新运行。`); return; }
      if (prepared.unresolved === 0 && totals.conflicts === 0 && totals.errors === 0) {
        const marker = writeScopedLocalStorage(cloudImportMarkerStorageKey, JSON.stringify({ version: 1, batchId: run.lastBatchId, chunks: chunksCompleted, completedAt: new Date().toISOString() }));
        if (!marker.ok) { setNotice("云端导入已完成，但当前账号完成标记写入失败；本地副本仍保留。"); return; }
      }
      setNotice(`导入完成：${chunksCompleted} 批，新增 ${totals.created}，已存在 ${totals.skipped}，冲突 ${totals.conflicts}，失败 ${totals.errors}，未映射 ${prepared.unresolved}。本地副本未删除。`);
    } finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">导入本地学习数据</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">将显式检查当前账号范围、同手机号旧 Mock 账号范围和历史未分区固定键；确认后按每批最多 1000 条导入，不枚举其他浏览器键。</p><div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={busy} onClick={runImport}>{busy ? "正在导入…" : "检查并确认导入"}</Button>{notice ? <p className="whitespace-pre-line text-sm" role="status">{notice}</p> : null}</div></section>;
}

function parseSource(origin: string, reads: ReadResult[]): { ok: true; source: LocalStudyImportSource } | { ok: false } {
  if (reads.some((read) => !read.ok)) return { ok: false };
  const [vocabulary, sentences, notes, selections] = [parseStoredVocabularyItemsResult(reads[0].ok ? reads[0].value : null), parseStoredSentenceItemsResult(reads[1].ok ? reads[1].value : null), parseStoredStudyNotesResult(reads[2].ok ? reads[2].value : null), parseReaderSelectionCollectionsResult(reads[3].ok ? reads[3].value : null)];
  if (!vocabulary.ok || !sentences.ok || !notes.ok || !selections.ok) return { ok: false };
  return { ok: true, source: { origin, vocabulary: vocabulary.records, sentences: sentences.records, notes: notes.records, readerSelections: selections.collections } };
}
