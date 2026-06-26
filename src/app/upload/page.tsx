import { AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LocalUploadPanel } from "@/components/upload/local-upload-panel";
import { inferBookMetadataFromFileName } from "@/lib/upload/book-metadata";
import { formatBytes, uploadFilePolicy } from "@/lib/upload/file-policy";
import { txtChapterParsePolicy } from "@/lib/upload/txt-chapter-parser";
import { buildUploadDraft } from "@/lib/upload/upload-draft";

const supportedFileFormats = uploadFilePolicy.supportedFormats.map((format) => format.label).join(" / ");
const maxUploadSize = formatBytes(uploadFilePolicy.maxSizeBytes);
const txtChapterRules = txtChapterParsePolicy.ruleLabels.slice(1);
const sampleMetadata = inferBookMetadataFromFileName("迷雾边境 - 林间客.epub");
const sampleTxtDraft = buildUploadDraft({
  name: "迷雾边境 - 林间客.txt",
  size: 4096,
  textContent: "第一章 雾起\n雾从边境漫过来。\n\n第二章 黑桥\n桥下没有水，只有风。",
});
const sampleEpubDraft = buildUploadDraft({
  name: "迷雾边境 - 林间客.epub",
  size: 2048,
});

const steps = [
  "识别 TXT/EPUB/MOBI/PDF 文件格式",
  "尝试识别书名、作者和原始语言",
  "自动拆章并标记异常章节",
  "进入章节预览，确认后保存原版书",
];

export default function UploadPage() {
  return (
    <AppShell>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h1 className="text-3xl font-semibold">上传小说</h1>
          <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">
            支持 {supportedFileFormats}，单文件上限 {maxUploadSize}。
          </p>

          <div className="mt-8">
            <LocalUploadPanel />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">上传后处理流程</h2>
            <div className="mt-4 space-y-4">
              {steps.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--primary)]">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-[var(--muted-foreground)]">{step}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
              <div>
                <h2 className="font-semibold">暂不支持</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  DOCX、图片 OCR 和扫描件不在第一版范围内。
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold">TXT 拆章准备</h2>
            <div className="mt-3 space-y-2">
              {txtChapterRules.map((rule) => (
                <p key={rule} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  {rule}
                </p>
              ))}
            </div>
          </section>

          {sampleMetadata ? (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="font-semibold">元数据预填准备</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">书名</dt>
                  <dd className="font-medium">{sampleMetadata.title}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">作者</dt>
                  <dd className="font-medium">{sampleMetadata.author}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">格式</dt>
                  <dd className="font-medium">{sampleMetadata.format}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {sampleTxtDraft.ok ? (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="font-semibold">拆章结果</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">状态</dt>
                  <dd className="font-medium">
                    {sampleTxtDraft.parseStatus === "parsed" ? "TXT 已拆章" : sampleTxtDraft.parseStatus}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">章节</dt>
                  <dd className="font-medium">{sampleTxtDraft.chapters.length} 章</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">第一章</dt>
                  <dd className="font-medium">{sampleTxtDraft.chapters[0]?.title}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {sampleEpubDraft.ok ? (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="font-semibold">非 TXT 处理状态</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                EPUB、MOBI 和 PDF 文件会先进入待处理状态，确认后再继续生成章节。
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
