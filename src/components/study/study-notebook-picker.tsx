"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createStudyNotebook,
  getDefaultStudyNotebooks,
  type StudyNotebook,
  type StudyNotebookKind,
} from "@/lib/study/study-notebooks";

const notebookErrorLabels = {
  "empty-title": "请输入本子名称",
  "duplicate-title": "已经有这个本子",
} as const;

export function StudyNotebookPicker({ kind }: { kind: StudyNotebookKind }) {
  const [notebooks, setNotebooks] = useState<StudyNotebook[]>(() => getDefaultStudyNotebooks(kind));
  const [selectedNotebookId, setSelectedNotebookId] = useState(() => getDefaultStudyNotebooks(kind)[0]?.id ?? "");
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");

  function handleCreateNotebook() {
    const result = createStudyNotebook(notebooks, newTitle);

    if (!result.ok) {
      setError(notebookErrorLabels[result.reason]);
      return;
    }

    setNotebooks(result.notebooks);
    setSelectedNotebookId(result.notebook.id);
    setNewTitle("");
    setError("");
    setIsAdding(false);
  }

  function handleCancel() {
    setNewTitle("");
    setError("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
        value={selectedNotebookId}
        onChange={(event) => setSelectedNotebookId(event.target.value)}
      >
        {notebooks.map((notebook) => (
          <option key={notebook.id} value={notebook.id}>
            {notebook.title}
          </option>
        ))}
      </select>

      {isAdding ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-10 w-44 rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[var(--primary)]"
            value={newTitle}
            autoFocus
            maxLength={18}
            placeholder="输入名称"
            onChange={(event) => {
              setNewTitle(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleCreateNotebook();
              }

              if (event.key === "Escape") {
                handleCancel();
              }
            }}
          />
          <Button type="button" onClick={handleCreateNotebook}>
            创建
          </Button>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            取消
          </Button>
          {error ? <p className="basis-full text-xs text-red-700">{error}</p> : null}
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setIsAdding(true)}>
          <Plus aria-hidden="true" size={16} />
          新建本
        </Button>
      )}
    </div>
  );
}
