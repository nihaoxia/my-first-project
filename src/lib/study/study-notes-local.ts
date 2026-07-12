export type StudyNote = {
  id: string;
  title: string;
  source: string;
  updatedAt: string;
  content: string;
};

export type UpdateStudyNoteResult =
  | {
      ok: true;
      note: StudyNote;
      notes: StudyNote[];
    }
  | {
      ok: false;
      reason: "empty-title" | "not-found";
    };

export function createStudyNote(currentNotes: StudyNote[]) {
  const nextLocalId =
    currentNotes.reduce((highestId, note) => {
      const match = note.id.match(/^note-local-(\d+)$/);
      return match ? Math.max(highestId, Number(match[1])) : highestId;
    }, 0) + 1;
  const note: StudyNote = {
    id: `note-local-${nextLocalId}`,
    title: "未命名笔记",
    source: "个人笔记",
    updatedAt: "刚刚",
    content: "",
  };

  return {
    note,
    notes: [note, ...currentNotes],
  };
}

export function updateStudyNote(
  currentNotes: StudyNote[],
  noteId: string,
  updates: Partial<Pick<StudyNote, "title" | "content">>,
): UpdateStudyNoteResult {
  const note = currentNotes.find((item) => item.id === noteId);

  if (!note) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const nextTitle = updates.title === undefined ? note.title : updates.title.trim();

  if (!nextTitle) {
    return {
      ok: false,
      reason: "empty-title",
    };
  }

  const nextNote: StudyNote = {
    ...note,
    title: nextTitle,
    content: updates.content === undefined ? note.content : updates.content.trim(),
    updatedAt: "刚刚",
  };

  return {
    ok: true,
    note: nextNote,
    notes: currentNotes.map((item) => (item.id === noteId ? nextNote : item)),
  };
}

export function deleteStudyNote(currentNotes: StudyNote[], noteId: string) {
  return currentNotes.filter((note) => note.id !== noteId);
}
