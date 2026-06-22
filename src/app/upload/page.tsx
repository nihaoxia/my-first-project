import { AlertTriangle, FileText, ShieldCheck, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { formatBytes, uploadFilePolicy } from "@/lib/upload/file-policy";

const supportedFileFormats = uploadFilePolicy.supportedFormats.map((format) => format.label).join(" / ");
const maxUploadSize = formatBytes(uploadFilePolicy.maxSizeBytes);

const steps = [
  "识别 TXT/EPUB 文件格式",
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
            第一版支持 {supportedFileFormats}，开发期单文件上限 {maxUploadSize}。上传后不会公开分享，只进入你的私人书架。
          </p>

          <div className="mt-8 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8">
            <div className="flex max-w-xl flex-col items-start">
              <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--primary)]">
                <UploadCloud aria-hidden="true" size={24} />
              </div>
              <h2 className="mt-5 text-xl font-semibold">选择 TXT 或 EPUB 文件</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                静态原型阶段暂不执行真实上传。后续会在这里接入文件选择、大小限制、上传进度和解析任务。当前已先建立{" "}
                {supportedFileFormats} 格式和 {maxUploadSize} 大小边界。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="secondary">
                  <FileText aria-hidden="true" size={17} />
                  选择文件
                </Button>
                <Button href={routes.chapters}>查看章节预览示例</Button>
              </div>
            </div>
          </div>

          <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 text-[var(--primary)]" size={20} aria-hidden="true" />
              <div>
                <h2 className="font-semibold">版权与隐私提示</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  请仅上传你有权处理的文本。Stray Pages 不提供小说资源搜索、公开书库或译本传播服务。
                </p>
              </div>
            </div>
          </section>
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
                  PDF、DOCX、图片 OCR 和扫描件不在第一版范围内。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
