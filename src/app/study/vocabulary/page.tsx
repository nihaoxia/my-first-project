import { AppShell } from "@/components/app-shell";
import { StudyExportButton } from "@/components/study/study-export-button";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import { VocabularyWorkspace } from "@/components/study/vocabulary-workspace";
import { stageEightVocabularyCsvExport, stageSevenVocabularyView } from "@/lib/mock-data";

export default function VocabularyPage() {
  return (
    <AppShell>
      <StudyLibraryHeader
        active="vocabulary"
        title="词汇本"
        description="阅读时收藏的单词和短语会保留上下文、来源章节和个人备注。"
        actions={
          <StudyExportButton
            content={stageEightVocabularyCsvExport.content}
            fileName={stageEightVocabularyCsvExport.fileName}
            kind="csv"
            label="导出 CSV"
          />
        }
      />

      <VocabularyWorkspace
        availableBooks={stageSevenVocabularyView.availableBooks}
        initialItems={stageSevenVocabularyView.items}
        initialQuery={stageSevenVocabularyView.query}
      />

      <p className="mt-4 text-sm text-[var(--muted-foreground)]">
        {stageSevenVocabularyView.deletionPreview.message}
      </p>
    </AppShell>
  );
}
