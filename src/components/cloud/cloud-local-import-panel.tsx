"use client";

import { CloudUpload, FileCheck2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildImportChunks,
  buildLocalStudyImportManifest,
  cloudImportMarkerStorageKey,
  doSelectedSourceSnapshotsMatch,
  localStudyImportKinds,
  localStudyImportSourceOrigins,
  runImportChunks,
  type LocalStudyImportKind,
  type LocalStudyImportSelection,
  type LocalStudyImportSource,
  type LocalStudyImportSourceOrigin,
  type LocalStudyImportSourceSnapshot,
} from "@/lib/cloud/import-client-core";
import {
  localReaderSelectionsStorageKey,
  parseReaderSelectionCollectionsResult,
} from "@/lib/reader/reader-selection-save";
import { localStorageScopeAttribute } from "@/lib/storage/local-storage-scope";
import {
  readLegacyLocalStorage,
  readScopedLocalStorage,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";
import {
  localNotesStorageKey,
  localSentencesStorageKey,
  localVocabularyStorageKey,
  parseStoredSentenceItemsResult,
  parseStoredStudyNotesResult,
  parseStoredVocabularyItemsResult,
} from "@/lib/study/local-study-storage";

const keys = [
  localVocabularyStorageKey,
  localSentencesStorageKey,
  localNotesStorageKey,
  localReaderSelectionsStorageKey,
] as const;

const sourceDefinitions = [
  { origin: "current-supabase-scope", label: "当前账号本地数据", historical: false },
  { origin: "legacy-unscoped", label: "历史未分区数据", historical: true },
] as const satisfies ReadonlyArray<{
  origin: LocalStudyImportSourceOrigin;
  label: string;
  historical: boolean;
}>;

const kindDefinitions = [
  { kind: "vocabulary", label: "词汇" },
  { kind: "sentence", label: "句子" },
  { kind: "note", label: "笔记" },
] as const satisfies ReadonlyArray<{ kind: LocalStudyImportKind; label: string }>;

type ReadResult = ReturnType<typeof readScopedLocalStorage>;
type Notice = { message: string; error: boolean };
type PreparedImport = Awaited<ReturnType<typeof buildLocalStudyImportManifest>>;
type ImportInspection = {
  sources: LocalStudyImportSource[];
  snapshots: LocalStudyImportSourceSnapshot[];
  scopeFingerprint: string;
};
type PreviewCandidate = {
  prepared: PreparedImport;
  selection: LocalStudyImportSelection;
  estimatedChunks: number;
};
type Phase = "idle" | "inspecting" | "previewing" | "importing";

export function CloudLocalImportPanel({ sessionBinding }: { sessionBinding: string }) {
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [selectedOrigins, setSelectedOrigins] = useState<LocalStudyImportSourceOrigin[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<LocalStudyImportKind[]>([
    ...localStudyImportKinds,
  ]);
  const [previewCandidate, setPreviewCandidate] = useState<PreviewCandidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = phase !== "idle";

  function invalidatePreview(clearNotice = true) {
    setPreviewCandidate(null);
    setConfirmed(false);
    if (clearNotice) setNotice(null);
  }

  async function handleInspect() {
    setPhase("inspecting");
    setInspection(null);
    setSelectedOrigins([]);
    setSelectedKinds([...localStudyImportKinds]);
    invalidatePreview();
    try {
      const result = readImportSources();
      if (!result.ok) {
        setNotice({ message: getReadErrorMessage(result), error: true });
        return;
      }
      const current = result.inspection.sources.find(
        (source) => source.origin === "current-supabase-scope",
      );
      const currentHasData = current ? getSourceCounts(current).discovered > 0 : false;
      setInspection(result.inspection);
      setSelectedOrigins(currentHasData ? ["current-supabase-scope"] : []);
      const total = result.inspection.sources.reduce(
        (sum, source) => sum + getSourceCounts(source).discovered,
        0,
      );
      setNotice({
        message:
          total > 0
            ? "检查完成。默认只选择当前账号数据；历史未分区数据需要你主动选择。"
            : "两个固定来源中没有发现本地学习数据。",
        error: false,
      });
    } finally {
      setPhase("idle");
    }
  }

  function handleOriginChange(origin: LocalStudyImportSourceOrigin, checked: boolean) {
    setSelectedOrigins((current) =>
      localStudyImportSourceOrigins.filter((candidate) =>
        candidate === origin ? checked : current.includes(candidate),
      ),
    );
    invalidatePreview();
  }

  function handleKindChange(kind: LocalStudyImportKind, checked: boolean) {
    setSelectedKinds((current) =>
      localStudyImportKinds.filter((candidate) =>
        candidate === kind ? checked : current.includes(candidate),
      ),
    );
    invalidatePreview();
  }

  async function handlePreview() {
    if (!inspection || selectedOrigins.length === 0 || selectedKinds.length === 0) {
      setNotice({ message: "请至少选择一个来源和一种数据分类。", error: true });
      return;
    }
    setPhase("previewing");
    setNotice(null);
    setConfirmed(false);
    try {
      const selection: LocalStudyImportSelection = {
        sourceOrigins: [...selectedOrigins],
        kinds: [...selectedKinds],
      };
      const prepared = await buildLocalStudyImportManifest(
        { sources: inspection.sources, selection },
        crypto.randomUUID(),
      );
      const estimatedChunks = buildImportChunks(
        prepared.items,
        () => crypto.randomUUID(),
      ).length;
      setPreviewCandidate({ prepared, selection, estimatedChunks });
      setNotice({
        message:
          prepared.items.length > 0
            ? "导入预览已生成。请核对数量并确认后再执行。"
            : prepared.unresolved > 0
              ? "所选数据都缺少可验证的书籍或章节来源，无法安全导入。"
              : "所选范围内没有可导入的学习数据。",
        error: prepared.items.length === 0,
      });
    } catch {
      setPreviewCandidate(null);
      setNotice({ message: "无法生成导入预览，请重新检查本地数据。", error: true });
    } finally {
      setPhase("idle");
    }
  }

  async function handleImport() {
    if (!inspection || !previewCandidate || !confirmed || previewCandidate.prepared.items.length === 0) {
      setNotice({ message: "请先生成有效预览并确认导入范围。", error: true });
      return;
    }
    setPhase("importing");
    setNotice(null);
    try {
      const recheck = recheckSelectedSourceSnapshots(
        inspection,
        previewCandidate.selection.sourceOrigins,
      );
      if (!recheck.ok) {
        setPreviewCandidate(null);
        setConfirmed(false);
        setNotice({
          message: "SOURCE_DATA_CHANGED：预览后本地数据或当前账号发生了变化，未发起网络请求。请重新检查。",
          error: true,
        });
        return;
      }

      const prepared = previewCandidate.prepared;
      const run = await runImportChunks(prepared.items, {
        uuid: () => crypto.randomUUID(),
        send: async (chunk) => {
          let response: Response;
          try {
            response = await fetch("/api/cloud/import", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Stray-Pages-Import-Binding": sessionBinding,
              },
              body: JSON.stringify(chunk),
            });
          } catch {
            throw new Error("NETWORK_ERROR");
          }
          let body: {
            result?: {
              complete: boolean;
              counts: { created: number; skipped: number; conflicts: number; errors: number };
              batchId: string;
              manifestId: string;
            };
            error?: { code?: string };
          };
          try {
            body = (await response.json()) as typeof body;
          } catch {
            throw new Error("INVALID_RESPONSE");
          }
          if (!response.ok || !body.result) {
            throw new Error(body.error?.code ?? "IMPORT_FAILED");
          }
          return body.result;
        },
      });
      const totals = run.totals;
      const chunksCompleted = run.completedChunks;
      if (!run.ok) {
        setNotice({
          message: getImportFailureMessage(run.reason, run.failedChunk, chunksCompleted),
          error: true,
        });
        return;
      }

      setPreviewCandidate(null);
      setConfirmed(false);
      if (prepared.unresolved === 0 && totals.conflicts === 0 && totals.errors === 0 && prepared.localErrors === 0) {
        const marker = writeScopedLocalStorage(
          cloudImportMarkerStorageKey,
          JSON.stringify({
            version: 2,
            batchId: run.lastBatchId,
            chunks: chunksCompleted,
            completedAt: new Date().toISOString(),
            counts: totals,
          }),
        );
        if (!marker.ok) {
          setNotice({
            message: "云端导入已完成，但最近完成记录无法写入当前浏览器。本地副本未删除。",
            error: true,
          });
          return;
        }
      }
      setNotice({
        message: `导入完成：${chunksCompleted} 批，新增 ${totals.created}，已存在 ${totals.skipped}，冲突 ${totals.conflicts}，失败 ${totals.errors}，未映射 ${prepared.unresolved}。本地副本未删除。`,
        error: false,
      });
    } catch {
      setNotice({ message: "导入未完成，可保留当前预览后重试。本地副本未删除。", error: true });
    } finally {
      setPhase("idle");
    }
  }

  const canPreview = Boolean(inspection && selectedOrigins.length > 0 && selectedKinds.length > 0);
  const canImport = Boolean(previewCandidate?.prepared.items.length && confirmed);

  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
      aria-labelledby="local-study-import-heading"
    >
      <div className="flex items-start gap-3">
        <CloudUpload aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={20} />
        <div>
          <h2 id="local-study-import-heading" className="text-lg font-semibold">
            迁移本地学习数据
          </h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--muted-foreground)]">
            检查当前账号和历史未分区固定数据后，可选择把词汇、句子和笔记手动导入云端。检查与预览不会联网，本地副本始终保留。
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-5">
        <Button type="button" variant="secondary" disabled={busy} onClick={handleInspect}>
          <FileCheck2 aria-hidden="true" size={16} />
          {phase === "inspecting" ? "正在检查" : "检查本地学习数据"}
        </Button>
        {notice ? <NoticeText notice={notice} /> : null}
      </div>

      {inspection ? (
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <fieldset disabled={busy}>
            <legend className="font-semibold">选择数据来源</legend>
            <p id="local-import-source-help" className="mt-2 max-w-[72ch] text-xs leading-5 text-[var(--muted-foreground)]">
              当前账号来源优先。历史未分区数据可能属于较早版本，必须主动选择。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sourceDefinitions.map((definition) => {
                const source = inspection.sources.find((item) => item.origin === definition.origin)!;
                const counts = getSourceCounts(source);
                return (
                  <label key={definition.origin} className="flex items-start gap-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      checked={selectedOrigins.includes(definition.origin)}
                      aria-describedby="local-import-source-help"
                      onChange={(event) => handleOriginChange(definition.origin, event.target.checked)}
                    />
                    <span>
                      <span className="font-medium">{definition.label}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        词汇 {counts.vocabulary} · 句子 {counts.sentence} · 笔记 {counts.note} · 无法映射 {counts.unresolved}
                        {definition.historical ? " · 默认不选" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5 border-t border-[var(--border)] pt-5" disabled={busy}>
            <legend className="font-semibold">选择数据分类</legend>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {kindDefinitions.map((definition) => (
                <label key={definition.kind} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={selectedKinds.includes(definition.kind)}
                    onChange={(event) => handleKindChange(definition.kind, event.target.checked)}
                  />
                  <span>
                    {definition.label}（{getSelectedKindCount(inspection.sources, selectedOrigins, definition.kind)}）
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <Button type="button" variant="secondary" disabled={!canPreview || busy} onClick={handlePreview}>
              <FileCheck2 aria-hidden="true" size={16} />
              {phase === "previewing" ? "正在生成预览" : "生成导入预览"}
            </Button>
            {!canPreview ? (
              <p className="mt-3 text-sm text-[var(--muted-foreground)]" role="status">
                请至少选择一个来源和一种数据分类。
              </p>
            ) : null}
          </div>

          {previewCandidate ? (
            <div className="mt-5 border-t border-[var(--border)] pt-5" aria-labelledby="local-import-preview-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="local-import-preview-heading" className="font-semibold">导入预览</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  预计 {previewCandidate.estimatedChunks} 批
                </p>
              </div>
              <p className="mt-2 max-w-[72ch] text-xs leading-5 text-[var(--muted-foreground)]">
                这里只显示数量，不显示学习内容。服务端仍会按当前登录账号校验来源和所有权。
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
                <PreviewCount label="词汇" value={previewCandidate.prepared.preview.totals.vocabulary} />
                <PreviewCount label="句子" value={previewCandidate.prepared.preview.totals.sentence} />
                <PreviewCount label="笔记" value={previewCandidate.prepared.preview.totals.note} />
                <PreviewCount label="无法映射" value={previewCandidate.prepared.preview.unresolved} />
                <PreviewCount label="本地非法" value={previewCandidate.prepared.preview.localErrors} />
              </dl>

              <label className="mt-5 flex items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  checked={confirmed}
                  disabled={busy || previewCandidate.prepared.items.length === 0}
                  aria-describedby="local-import-confirm-help"
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span id="local-import-confirm-help">
                  我了解本地副本不会删除；只导入预览中的所选记录，缺少唯一云端书籍或章节匹配的记录可能失败。
                </span>
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" disabled={!canImport || busy} onClick={handleImport}>
                  <ShieldCheck aria-hidden="true" size={16} />
                  {phase === "importing" ? "正在导入" : "导入所选数据"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => invalidatePreview()}>
                  取消预览
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function readImportSources():
  | { ok: true; inspection: ImportInspection }
  | { ok: false; code: "SCOPE_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "SOURCE_MALFORMED"; sourceLabel?: string; category?: string } {
  const scopeFingerprint = readCurrentScopeFingerprint();
  if (!scopeFingerprint) return { ok: false, code: "SCOPE_UNAVAILABLE" };
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return { ok: false, code: "STORAGE_UNAVAILABLE" };
  }

  const rawSources = sourceDefinitions.map((definition) => ({
    definition,
    reads: keys.map((key) =>
      definition.origin === "current-supabase-scope"
        ? readScopedLocalStorage(key)
        : readLegacyLocalStorage(storage, key, null),
    ),
  }));
  const sources: LocalStudyImportSource[] = [];
  const snapshots: LocalStudyImportSourceSnapshot[] = [];
  for (const raw of rawSources) {
    const failedRead = raw.reads.find((read) => !read.ok);
    if (failedRead) {
      return {
        ok: false,
        code: failedRead.reason === "scope-unavailable" ? "SCOPE_UNAVAILABLE" : "STORAGE_UNAVAILABLE",
      };
    }
    const parsed = parseSource(raw.definition.origin, raw.reads);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "SOURCE_MALFORMED",
        sourceLabel: raw.definition.label,
        category: parsed.category,
      };
    }
    sources.push(parsed.source);
    snapshots.push({
      origin: raw.definition.origin,
      rawValues: raw.reads.map((read) => (read.ok ? read.value : null)),
    });
  }
  return { ok: true, inspection: { sources, snapshots, scopeFingerprint } };
}

function parseSource(
  origin: LocalStudyImportSourceOrigin,
  reads: ReadResult[],
): { ok: true; source: LocalStudyImportSource } | { ok: false; category: string } {
  const vocabulary = parseStoredVocabularyItemsResult(reads[0].ok ? reads[0].value : null);
  if (!vocabulary.ok) return { ok: false, category: "词汇" };
  const sentences = parseStoredSentenceItemsResult(reads[1].ok ? reads[1].value : null);
  if (!sentences.ok) return { ok: false, category: "句子" };
  const notes = parseStoredStudyNotesResult(reads[2].ok ? reads[2].value : null);
  if (!notes.ok) return { ok: false, category: "笔记" };
  const selections = parseReaderSelectionCollectionsResult(reads[3].ok ? reads[3].value : null);
  if (!selections.ok) return { ok: false, category: "阅读器收藏" };
  return {
    ok: true,
    source: {
      origin,
      vocabulary: vocabulary.records,
      sentences: sentences.records,
      notes: notes.records,
      readerSelections: selections.collections,
    },
  };
}

function recheckSelectedSourceSnapshots(
  inspection: ImportInspection,
  selectedOrigins: LocalStudyImportSourceOrigin[],
): { ok: true } | { ok: false } {
  const actual = readImportSources();
  if (!actual.ok || actual.inspection.scopeFingerprint !== inspection.scopeFingerprint) {
    return { ok: false };
  }
  return doSelectedSourceSnapshotsMatch(
    inspection.snapshots,
    actual.inspection.snapshots,
    selectedOrigins,
  )
    ? { ok: true }
    : { ok: false };
}

function readCurrentScopeFingerprint() {
  return (
    document
      .querySelector<HTMLElement>(`[${localStorageScopeAttribute}]`)
      ?.getAttribute(localStorageScopeAttribute)
      ?.trim() || null
  );
}

function getSourceCounts(source: LocalStudyImportSource) {
  const vocabulary = source.vocabulary.length;
  const sentence = source.sentences.length;
  const note = source.notes.length;
  const unresolved =
    source.readerSelections.vocabularyTexts.length + source.readerSelections.sentenceTexts.length;
  return { vocabulary, sentence, note, unresolved, discovered: vocabulary + sentence + note + unresolved };
}

function getSelectedKindCount(
  sources: LocalStudyImportSource[],
  origins: LocalStudyImportSourceOrigin[],
  kind: LocalStudyImportKind,
) {
  return sources
    .filter((source) => origins.includes(source.origin as LocalStudyImportSourceOrigin))
    .reduce((sum, source) => sum + getSourceCounts(source)[kind], 0);
}

function getReadErrorMessage(result: Extract<ReturnType<typeof readImportSources>, { ok: false }>) {
  if (result.code === "SCOPE_UNAVAILABLE") return "当前登录状态无法确定本地数据归属，请重新登录后再试。";
  if (result.code === "STORAGE_UNAVAILABLE") return "浏览器已禁用或无法访问本地存储，检查未开始。";
  return `${result.sourceLabel ?? "本地来源"}的${result.category ?? "固定数据"}已损坏，未生成导入候选。`;
}

function getImportFailureMessage(reason: string, failedChunk: number, completedChunks: number) {
  if (reason === "NETWORK_ERROR") return `第 ${failedChunk + 1} 批遇到网络错误；此前已完成 ${completedChunks} 批，可安全重试。`;
  if (reason === "AUTH_REQUIRED") return "登录已失效，导入未完成。请重新登录后再检查。";
  if (reason === "SESSION_CHANGED") return "当前登录账号已经变化，导入已安全停止。请刷新页面并重新检查。";
  if (reason === "CLOUD_NOT_CONFIGURED" || reason === "CLOUD_CONFIG_INVALID" || reason === "BLOB_WRITE_DISABLED") return "云端写入尚未通过零费用配置，导入已安全停止。";
  if (reason === "INVALID_RESPONSE") return `第 ${failedChunk + 1} 批返回了无效结果；此前已完成 ${completedChunks} 批，可安全重试。`;
  if (reason === "PARTIAL") return `第 ${failedChunk + 1} 批包含冲突或失败记录；此前已完成 ${completedChunks} 批。本地副本未删除。`;
  return `第 ${failedChunk + 1} 批未完成；此前已完成 ${completedChunks} 批，可安全重试。`;
}

function NoticeText({ notice }: { notice: Notice }) {
  return (
    <p
      className={`mt-4 max-w-[72ch] text-sm leading-6 ${notice.error ? "font-medium text-[var(--danger)]" : "text-[var(--muted-foreground)]"}`}
      role={notice.error ? "alert" : "status"}
    >
      {notice.message}
    </p>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
