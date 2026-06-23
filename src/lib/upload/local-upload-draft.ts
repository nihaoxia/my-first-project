import { detectUploadFileFormat } from "./file-policy.ts";
import { buildUploadDraft, type UploadDraftResult } from "./upload-draft.ts";

export type LocalUploadFile = {
  name: string;
  size: number;
  text: () => Promise<string>;
};

export type LocalUploadDraftResult =
  | UploadDraftResult
  | {
      ok: false;
      reason: "file-read-failed";
    };

export async function buildLocalUploadDraftFromFile(file: LocalUploadFile): Promise<LocalUploadDraftResult> {
  const initialDraft = buildUploadDraft({
    name: file.name,
    size: file.size,
  });

  if (!initialDraft.ok) {
    return initialDraft;
  }

  const format = detectUploadFileFormat(file.name);

  if (format !== "TXT") {
    return initialDraft;
  }

  try {
    const textContent = await file.text();

    return buildUploadDraft({
      name: file.name,
      size: file.size,
      textContent,
    });
  } catch {
    return {
      ok: false,
      reason: "file-read-failed",
    };
  }
}
