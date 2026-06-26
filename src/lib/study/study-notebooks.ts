export type StudyNotebookKind = "vocabulary" | "sentences" | "notes";

export type StudyNotebook = {
  id: string;
  title: string;
  itemCount: number;
};

export type CreateStudyNotebookResult =
  | {
      ok: true;
      notebook: StudyNotebook;
      notebooks: StudyNotebook[];
    }
  | {
      ok: false;
      reason: "empty-title" | "duplicate-title";
    };

const defaultNotebookTitles: Record<StudyNotebookKind, string[]> = {
  vocabulary: ["默认词汇本"],
  sentences: ["默认句子本"],
  notes: ["默认笔记本"],
};

export function getDefaultStudyNotebooks(kind: StudyNotebookKind): StudyNotebook[] {
  return defaultNotebookTitles[kind].map((title, index) => ({
    id: `${kind}-default-${index + 1}`,
    title,
    itemCount: 0,
  }));
}

export function createStudyNotebook(
  currentNotebooks: StudyNotebook[],
  titleInput: string,
): CreateStudyNotebookResult {
  const title = titleInput.trim().replace(/\s+/g, " ");

  if (!title) {
    return {
      ok: false,
      reason: "empty-title",
    };
  }

  if (currentNotebooks.some((notebook) => notebook.title === title)) {
    return {
      ok: false,
      reason: "duplicate-title",
    };
  }

  const notebook: StudyNotebook = {
    id: `notebook-${slugifyNotebookTitle(title)}-${currentNotebooks.length + 1}`,
    title,
    itemCount: 0,
  };

  return {
    ok: true,
    notebook,
    notebooks: [...currentNotebooks, notebook],
  };
}

function slugifyNotebookTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "notebook";
}
