export const MAX_CHAPTERS = 1000;
export const MAX_CHAPTER_EDIT_BYTES = 1024 * 1024;

export function validateChapterEditPayloadBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_CHAPTER_EDIT_BYTES) {
    throw Object.assign(new Error("CHAPTER_EDITS_TOO_LARGE"), { code: "CHAPTER_EDITS_TOO_LARGE" });
  }
}
