import { AppShell } from "@/components/app-shell";
import { SentencesWorkspace } from "@/components/study/sentences-workspace";
import { StudyExportButton } from "@/components/study/study-export-button";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import { stageEightSentenceMarkdownExport, stageSevenSentenceView } from "@/lib/mock-data";

export default function SentencesPage() {
  return (
    <AppShell>
      <StudyLibraryHeader
        active="sentences"
        title="句子本"
        description="收藏阅读时喜欢的语句和段落，保留原文、译文、来源章节和备注。"
        actions={
          <StudyExportButton
            content={stageEightSentenceMarkdownExport.content}
            fileName={stageEightSentenceMarkdownExport.fileName}
            kind="markdown"
            label="导出 Markdown"
          />
        }
      />

      <SentencesWorkspace
        availableBooks={stageSevenSentenceView.availableBooks}
        initialItems={stageSevenSentenceView.items}
        initialQuery={stageSevenSentenceView.query}
      />

      <p className="mt-4 text-sm text-[var(--muted-foreground)]">
        {stageSevenSentenceView.deletionPreview.message}
      </p>
    </AppShell>
  );
}
