import { AppShell } from "@/components/app-shell";
import { StudyExportButton } from "@/components/study/study-export-button";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import { VocabularyWorkspace } from "@/components/study/vocabulary-workspace";
import { stageEightVocabularyCsvExport, stageSevenVocabularyView } from "@/lib/mock-data";
import { getAppSession } from "@/lib/auth/app-session";
import { getCloudBooksService } from "@/lib/cloud/books";
import { getCloudServerConfig } from "@/lib/cloud/server-config";
import { resolveCloudPersistenceMode } from "@/lib/cloud/persistence-mode";
import { getCloudStudyService } from "@/lib/cloud/study";
import { buildVocabularyCsvExport } from "@/lib/export/study-export";
import { CloudStudyError, listAllStudyItemsForExport } from "@/lib/cloud/study-core";

export default async function VocabularyPage() {
  const persistence = resolveCloudPersistenceMode(getCloudServerConfig());
  const session = persistence === "cloud" ? await getAppSession() : null;
  const cloud = persistence === "cloud" && session?.authMode === "supabase";
  const page = cloud ? await getCloudStudyService().list(session.userId, { kind: "vocabulary" }) : { items: [], nextCursor: null };
  const rows = page.items;
  const books = cloud ? await getCloudBooksService().list(session.userId) : [];
  const initialItems = cloud ? rows.map((row) => ({ id: row.id as string, term: row.term as string, explanation: row.explanation as string, contextualMean: (row.contextualMean as string | null) ?? "", sourceSentence: (row.sourceSentence as string | null) ?? "", note: (row.note as string | null) ?? "", bookId: row.originalBookId as string, bookTitle: row.bookTitle as string, chapterId: (row.chapterId as string | null) ?? "", chapterTitle: (row.chapterTitle as string | null) ?? "", sourceLabel: `${row.bookTitle as string} · ${(row.chapterTitle as string | null) ?? "整本书"}` })) : persistence === "local" ? stageSevenVocabularyView.items : [];
  let exportData = stageEightVocabularyCsvExport;
  let exportLimitReached = false;
  if (cloud) {
    try {
      const exportRows = await listAllStudyItemsForExport(getCloudStudyService(), session.userId, "vocabulary");
      const exportItems = exportRows.map((row) => ({ id: row.id as string, term: row.term as string, explanation: row.explanation as string, contextualMean: (row.contextualMean as string | null) ?? "", sourceSentence: (row.sourceSentence as string | null) ?? "", note: (row.note as string | null) ?? "", bookId: row.originalBookId as string, bookTitle: row.bookTitle as string, chapterId: (row.chapterId as string | null) ?? "", chapterTitle: (row.chapterTitle as string | null) ?? "", sourceLabel: `${row.bookTitle as string} · ${(row.chapterTitle as string | null) ?? "整本书"}` }));
      exportData = buildVocabularyCsvExport({ bookTitle: "cloud-library", items: exportItems });
    } catch (error) { if (error instanceof CloudStudyError && error.code === "STUDY_EXPORT_LIMIT") exportLimitReached = true; else throw error; }
  }
  return (
    <AppShell requireAuth>
      <StudyLibraryHeader
        active="vocabulary"
        title="词汇本"
        description="阅读时收藏的单词和短语会保留上下文、来源章节和个人备注。"
        actions={persistence === "unavailable" ? undefined : exportLimitReached ? <span className="text-sm text-[var(--muted-foreground)]">云端词汇超过 10000 条，请先缩小数据范围再导出。</span> :
          <StudyExportButton
            content={exportData.content}
            fileName={exportData.fileName}
            kind="csv"
            label="导出 CSV"
          />
        }
      />

      <VocabularyWorkspace
        availableBooks={cloud ? books.map((book) => ({ id: book.id, title: book.title })) : persistence === "local" ? stageSevenVocabularyView.availableBooks : []}
        initialItems={initialItems}
        initialQuery={stageSevenVocabularyView.query}
        initialNextCursor={page.nextCursor}
        persistence={persistence}
      />

      {persistence === "local" ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">{stageSevenVocabularyView.deletionPreview.message}</p> : null}
    </AppShell>
  );
}
