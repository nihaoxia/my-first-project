"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { TextDownloadButton } from "@/components/export/text-download-button";
import { buildNotesMarkdownExport } from "@/lib/export/study-export";
import {
  createStudyNote,
  deleteStudyNote,
  updateStudyNote,
  type StudyNote,
} from "@/lib/study/study-notes-local";
import {
  localNotesStorageKey,
  parseStoredStudyNotesResult,
} from "@/lib/study/local-study-storage";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
  writeScopedLocalStorage,
} from "@/lib/storage/safe-local-storage";

const localNotesChangedEvent = "stray-pages.study-notes-changed";

export function NotesWorkspace({
  initialNotes,
  initialExportNotes = [],
  initialNextCursor = null,
  exportLimitReached = false,
  persistence = "local",
}: {
  initialNotes: StudyNote[];
  initialExportNotes?: StudyNote[];
  initialNextCursor?: string | null;
  exportLimitReached?: boolean;
  persistence?: "local" | "cloud" | "unavailable";
}) {
  const [cloudNotes, setCloudNotes] = useState(initialNotes);
  const [cloudExportNotes, setCloudExportNotes] = useState(initialExportNotes);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const rawNotes = useSyncExternalStore(
    persistence === "local" ? subscribeToNotes : subscribeNoop,
    persistence === "local" ? readNotesSnapshot : getServerNotesSnapshot,
    getServerNotesSnapshot,
  );
  const notesParseResult = useMemo(
    () => parseStoredStudyNotesResult(rawNotes ?? null),
    [rawNotes],
  );
  const notes = persistence === "cloud" ? cloudNotes : persistence === "local" ? (rawNotes ? notesParseResult.records : initialNotes) : [];
  const exportNotes = persistence === "cloud" ? cloudExportNotes : notes;
  const exportData = useMemo(() => buildNotesMarkdownExport({ notes: exportNotes }), [exportNotes]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; content: string }>>({});
  const [notice, setNotice] = useState("");
  const [errorNoteId, setErrorNoteId] = useState("");
  const storageFailure = getLocalStorageSnapshotFailure(rawNotes);
  const storageWarning = persistence === "unavailable" ? "云端服务未配置，笔记本已停止读取；系统不会回退到本地数据。" : persistence === "cloud" ? "" : storageFailure
    ? getLocalStorageFailureMessage(storageFailure)
    : !notesParseResult.ok
      ? "笔记本本地数据已损坏。为避免覆盖原始内容，新建、保存和删除已暂停。"
      : "";

  function persistNotes(nextNotes: StudyNote[]) {
    if (storageWarning) {
      setNotice(storageWarning);
      return false;
    }

    const result = writeScopedLocalStorage(localNotesStorageKey, JSON.stringify(nextNotes));

    if (!result.ok) {
      setNotice(getLocalStorageFailureMessage(result.reason));
      return false;
    }

    window.dispatchEvent(new Event(localNotesChangedEvent));
    return true;
  }

  async function handleCreateNote() {
    if (persistence === "cloud") {
      const response = await fetch("/api/cloud/study", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "note", title: "新笔记", content: "", target: { type: "freeform" } }) });
      if (!response.ok) { setNotice("云端新建失败，请稍后重试。"); return; }
      const body = await response.json() as { item: { id: string; title: string; content: string; targetLabel?: string; updatedAt: string } };
      const created = { id: body.item.id, title: body.item.title, content: body.item.content, source: body.item.targetLabel || "自由笔记", updatedAt: new Date(body.item.updatedAt).toLocaleString("zh-CN") };
      setCloudNotes((current) => [created, ...current]);
      setCloudExportNotes((current) => [created, ...current]);
      setNotice("已新建笔记"); setErrorNoteId(""); return;
    }
    const result = createStudyNote(notes);

    if (!persistNotes(result.notes)) {
      return;
    }

    setNotice("已新建笔记");
    setErrorNoteId("");
  }

  async function handleSaveNote(noteId: string) {
    const draft = drafts[noteId];

    if (!draft) {
      return;
    }

    if (persistence === "cloud") {
      if (!draft.title.trim()) { setErrorNoteId(noteId); setNotice("笔记标题不能为空"); return; }
      const response = await fetch("/api/cloud/study", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: noteId, kind: "note", title: draft.title, content: draft.content }) });
      if (!response.ok) { setNotice("云端保存失败，请刷新后重试。"); return; }
      const updateSavedNote = (note: StudyNote) => note.id === noteId ? { ...note, title: draft.title.trim(), content: draft.content.trim(), updatedAt: new Date().toLocaleString("zh-CN") } : note;
      setCloudNotes((current) => current.map(updateSavedNote));
      setCloudExportNotes((current) => current.map(updateSavedNote));
      setDrafts((current) => { const next = { ...current }; delete next[noteId]; return next; });
      setNotice("已保存笔记"); setErrorNoteId(""); return;
    }

    const result = updateStudyNote(notes, noteId, draft);

    if (!result.ok) {
      setErrorNoteId(noteId);
      setNotice(result.reason === "empty-title" ? "笔记标题不能为空" : "没有找到这条笔记");
      return;
    }

    if (!persistNotes(result.notes)) {
      return;
    }

    setDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[noteId];
      return nextDrafts;
    });
    setNotice("已保存笔记");
    setErrorNoteId("");
  }

  async function handleDeleteNote(noteId: string) {
    if (!window.confirm("确定删除这条笔记吗？")) {
      return;
    }

    if (persistence === "cloud") {
      const response = await fetch(`/api/cloud/study?kind=note&id=${encodeURIComponent(noteId)}`, { method: "DELETE" });
      if (!response.ok) { setNotice("云端删除失败，请刷新后重试。"); return; }
      setCloudNotes((current) => current.filter((note) => note.id !== noteId));
      setCloudExportNotes((current) => current.filter((note) => note.id !== noteId));
      setDrafts((current) => { const next = { ...current }; delete next[noteId]; return next; });
      setNotice("已删除笔记"); setErrorNoteId(""); return;
    }

    const nextNotes = deleteStudyNote(notes, noteId);

    if (!persistNotes(nextNotes)) {
      return;
    }

    setDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[noteId];
      return nextDrafts;
    });
    setNotice("已删除笔记");
    setErrorNoteId("");
  }

  async function loadMore() {
    if (persistence !== "cloud" || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/cloud/study?kind=note&limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      if (!response.ok) { setNotice("加载更多笔记失败，请稍后重试。"); return; }
      const body = await response.json() as { items?: Array<Record<string, unknown>>; nextCursor?: string | null };
      if (!Array.isArray(body.items) || !(body.nextCursor === null || typeof body.nextCursor === "string")) { setNotice("云端笔记分页响应无效。"); return; }
      const added = body.items.map((row) => ({ id: row.id as string, title: row.title as string, content: row.content as string, source: (row.targetLabel as string) || "自由笔记", updatedAt: new Date(row.updatedAt as string).toLocaleString("zh-CN") }));
      setCloudNotes((current) => [...current, ...added.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(body.nextCursor ?? null);
    } finally { setLoadingMore(false); }
  }

  function updateDraft(noteId: string, updates: Partial<Pick<StudyNote, "title" | "content">>) {
    const note = notes.find((item) => item.id === noteId);

    if (!note) {
      return;
    }

    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [noteId]: {
        ...(currentDrafts[noteId] ?? { title: note.title, content: note.content }),
        ...updates,
      },
    }));
    setNotice("");
    setErrorNoteId("");
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <Button type="button" onClick={handleCreateNote}>
            <Plus aria-hidden="true" size={17} />
            新建笔记
          </Button>
          {persistence !== "unavailable" && !exportLimitReached && !storageWarning ? (
            <TextDownloadButton
              content={exportData.content}
              fileName={exportData.fileName}
              kind="markdown"
              label="导出 Markdown"
            />
          ) : null}
        </div>
        {notice ? <p className="text-sm font-medium text-[var(--primary)]">{notice}</p> : null}
      </div>

      {storageWarning ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {storageWarning}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4">
        {notes.map((note) => {
          const draft = drafts[note.id] ?? { title: note.title, content: note.content };

          return (
            <article
              key={note.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <input
                    className="w-full min-w-72 bg-transparent text-xl font-semibold outline-none"
                    value={draft.title}
                    aria-label="笔记标题"
                    onChange={(event) => updateDraft(note.id, { title: event.target.value })}
                  />
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {note.source} · 更新于 {note.updatedAt}
                  </p>
                  {errorNoteId === note.id ? (
                    <p className="mt-2 text-sm text-red-700">笔记标题不能为空</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => handleSaveNote(note.id)}>
                    <Save aria-hidden="true" size={16} />
                    保存
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 px-2"
                    aria-label={`删除 ${note.title}`}
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </div>
              </div>

              <textarea
                className="mt-4 min-h-36 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4 leading-7 outline-none transition focus:border-[var(--primary)]"
                value={draft.content}
                aria-label={`${note.title} 内容`}
                onChange={(event) => updateDraft(note.id, { content: event.target.value })}
              />
            </article>
          );
        })}
      </div>
      {persistence === "cloud" && nextCursor ? <div className="mt-5 text-center"><Button type="button" variant="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "加载中…" : "加载更多"}</Button></div> : null}
    </>
  );
}

function subscribeToNotes(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localNotesChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localNotesChangedEvent, onStoreChange);
  };
}

function getServerNotesSnapshot() {
  return undefined;
}

function subscribeNoop() { return () => undefined; }

function readNotesSnapshot() {
  const result = readScopedLocalStorage(localNotesStorageKey);
  return toLocalStorageSnapshot(result);
}
