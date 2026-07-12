import assert from "node:assert/strict";
import test from "node:test";

import {
  createStudyNote,
  deleteStudyNote,
  updateStudyNote,
  type StudyNote,
} from "../src/lib/study/study-notes-local.ts";

const existingNotes: StudyNote[] = [
  {
    id: "note-1",
    title: "黑桥段落的阅读感觉",
    source: "迷雾边境 · 第二章",
    updatedAt: "今天 18:12",
    content: "这一章的节奏比较克制。",
  },
];

test("creates a local study note at the top of the list", () => {
  const result = createStudyNote(existingNotes);

  assert.equal(result.notes.length, 2);
  assert.equal(result.note.title, "未命名笔记");
  assert.equal(result.notes[0].id, result.note.id);
});

test("does not reuse an existing local note id after deletions", () => {
  const result = createStudyNote([
    { ...existingNotes[0], id: "note-local-2" },
  ]);

  assert.notEqual(result.note.id, "note-local-2");
});

test("updates a local study note title and content", () => {
  const result = updateStudyNote(existingNotes, "note-1", {
    title: "  黑桥重点  ",
    content: "  先看动作，再看环境。  ",
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.equal(result.note.title, "黑桥重点");
  assert.equal(result.note.content, "先看动作，再看环境。");
});

test("rejects empty local study note titles", () => {
  assert.deepEqual(updateStudyNote(existingNotes, "note-1", { title: " " }), {
    ok: false,
    reason: "empty-title",
  });
});

test("deletes a local study note", () => {
  assert.deepEqual(deleteStudyNote(existingNotes, "note-1"), []);
});
