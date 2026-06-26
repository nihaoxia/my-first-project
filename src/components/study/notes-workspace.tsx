"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createStudyNote,
  deleteStudyNote,
  updateStudyNote,
  type StudyNote,
} from "@/lib/study/study-notes-local";

export function NotesWorkspace({ initialNotes }: { initialNotes: StudyNote[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [drafts, setDrafts] = useState(() => buildDrafts(initialNotes));
  const [notice, setNotice] = useState("");
  const [errorNoteId, setErrorNoteId] = useState("");

  function handleCreateNote() {
    const result = createStudyNote(notes);

    setNotes(result.notes);
    setDrafts(buildDrafts(result.notes));
    setNotice("已新建笔记");
    setErrorNoteId("");
  }

  function handleSaveNote(noteId: string) {
    const draft = drafts[noteId];

    if (!draft) {
      return;
    }

    const result = updateStudyNote(notes, noteId, draft);

    if (!result.ok) {
      setErrorNoteId(noteId);
      setNotice(result.reason === "empty-title" ? "笔记标题不能为空" : "没有找到这条笔记");
      return;
    }

    setNotes(result.notes);
    setDrafts(buildDrafts(result.notes));
    setNotice("已保存笔记");
    setErrorNoteId("");
  }

  function handleDeleteNote(noteId: string) {
    const nextNotes = deleteStudyNote(notes, noteId);

    setNotes(nextNotes);
    setDrafts(buildDrafts(nextNotes));
    setNotice("已删除笔记");
    setErrorNoteId("");
  }

  function updateDraft(noteId: string, updates: Partial<Pick<StudyNote, "title" | "content">>) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [noteId]: {
        ...currentDrafts[noteId],
        ...updates,
      },
    }));
    setNotice("");
    setErrorNoteId("");
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" onClick={handleCreateNote}>
          <Plus aria-hidden="true" size={17} />
          新建笔记
        </Button>
        {notice ? <p className="text-sm font-medium text-[var(--primary)]">{notice}</p> : null}
      </div>

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
    </>
  );
}

function buildDrafts(notes: StudyNote[]) {
  return Object.fromEntries(
    notes.map((note) => [
      note.id,
      {
        title: note.title,
        content: note.content,
      },
    ]),
  );
}
