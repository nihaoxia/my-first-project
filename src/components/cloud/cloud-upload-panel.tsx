"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routeBuilders } from "@/lib/routes";
import { buildEditableChapters, type EditableChapter } from "@/lib/upload/chapter-editing";
import { uploadFilePolicy } from "@/lib/upload/file-policy";
import { parseTxtChapters } from "@/lib/upload/txt-chapter-parser";
import { MAX_CHAPTERS, MAX_CHAPTER_EDIT_BYTES } from "@/lib/cloud/upload-limits";

export function CloudUploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [chapters, setChapters] = useState<EditableChapter[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(next: File | null) {
    setFile(null); setChapters([]); setError("");
    if (!next) return;
    if (next.size <= 0 || next.size > uploadFilePolicy.maxSizeBytes || !next.name.toLowerCase().endsWith(".txt")) { setError("请选择不超过 2 MiB 的 TXT 文件。"); return; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await next.arrayBuffer());
      if (!text.trim() || text.includes("\0")) throw new Error("invalid");
      setFile(next);
      setTitle((current) => current || next.name.replace(/\.txt$/i, ""));
      setChapters(buildEditableChapters(parseTxtChapters(text).chapters));
    } catch (cause) { setError(cause instanceof Error && cause.message === "TOO_MANY_CHAPTERS" ? `单本书最多支持 ${MAX_CHAPTERS} 章。` : "文件不是有效的 UTF-8 TXT 文本。"); }
  }

  function editChapter(index: number, update: Partial<Pick<EditableChapter, "title" | "included">>) {
    setChapters((current) => current.map((chapter) => chapter.index === index ? { ...chapter, ...update } : chapter));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !title.trim() || chapters.length === 0 || chapters.some((chapter) => !chapter.title.trim())) { setError("请先选择文件并确认每个章节标题。"); return; }
    setPending(true); setError("");
    try {
      const chapterEdits = JSON.stringify(chapters.map((chapter) => ({ sourceIndex: chapter.index, title: chapter.title.trim(), isSkipped: !chapter.included })));
      if (new TextEncoder().encode(chapterEdits).byteLength > MAX_CHAPTER_EDIT_BYTES) { setError("章节编辑数据超过 1 MiB，请缩短章节标题。"); return; }
      const formData = new FormData();
      formData.set("title", title.trim()); formData.set("author", author.trim()); formData.set("sourceLanguage", "UNKNOWN"); formData.set("file", file);
      formData.set("chapterEdits", chapterEdits);
      const response = await fetch("/api/cloud/books", { method: "POST", body: formData });
      const payload = await response.json() as { book?: { id?: string }; error?: { code?: string } };
      if (!response.ok || !payload.book?.id) { setError(uploadError(payload.error?.code)); return; }
      router.push(routeBuilders.bookChapters(payload.book.id)); router.refresh();
    } catch { setError("云端上传暂时不可用，请稍后重试。"); }
    finally { setPending(false); }
  }

  return (
    <form className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">书名<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2" /></label>
        <label className="text-sm font-medium">作者（可选）<input maxLength={200} value={author} onChange={(event) => setAuthor(event.target.value)} className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2" /></label>
      </div>
      <label className="block text-sm font-medium">UTF-8 TXT 原文件<input type="file" required accept=".txt,text/plain" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-md border border-dashed border-[var(--border)] p-5" /></label>
      {chapters.length ? <section className="space-y-3"><div><h3 className="font-semibold">确认章节</h3><p className="text-sm text-[var(--muted-foreground)]">服务端仍会重新拆章，并只按源章节序号应用标题和跳过设置。</p></div>{chapters.map((chapter) => <div key={chapter.index} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-[1fr_auto]"><label className="text-xs text-[var(--muted-foreground)]">第 {chapter.index} 章<input maxLength={500} value={chapter.title} onChange={(event) => editChapter(chapter.index, { title: event.target.value })} className="mt-1 block w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!chapter.included} onChange={(event) => editChapter(chapter.index, { included: !event.target.checked })} />跳过</label></div>)}</section> : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      <Button type="submit" disabled={pending || !file || chapters.length === 0}>{pending ? "正在安全上传…" : "确认章节并上传云端"}</Button>
      <p className="text-xs text-[var(--muted-foreground)]">原文件存入私有对象存储；客户端不能提交正文、字数、状态或存储路径。</p>
    </form>
  );
}

function uploadError(code?: string) {
  if (code === "FILE_TOO_LARGE" || code === "REQUEST_BODY_TOO_LARGE") return "文件或请求超过安全上限。";
  if (code === "UNSUPPORTED_MEDIA_TYPE" || code === "INVALID_TEXT_FILE") return "请选择有效的 UTF-8 TXT 文本。";
  if (code === "INVALID_CHAPTER_EDITS") return "章节设置与服务端重新拆分的结果不一致，请重新选择文件。";
  if (code === "AUTH_REQUIRED") return "登录已失效，请重新登录。";
  return "云端上传失败，没有保存为云端书籍。";
}
