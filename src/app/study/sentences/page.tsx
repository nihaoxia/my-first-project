import { AppShell } from "@/components/app-shell";
import { SentencesWorkspace } from "@/components/study/sentences-workspace";
import { StudyExportButton } from "@/components/study/study-export-button";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import { stageEightSentenceMarkdownExport, stageSevenSentenceView } from "@/lib/mock-data";
import { getAppSession } from "@/lib/auth/app-session";
import { getCloudBooksService } from "@/lib/cloud/books";
import { getCloudServerConfig } from "@/lib/cloud/server-config";
import { resolveCloudPersistenceMode } from "@/lib/cloud/persistence-mode";
import { getCloudStudyService } from "@/lib/cloud/study";
import { buildSentenceMarkdownExport } from "@/lib/export/study-export";
import { CloudStudyError, listAllStudyItemsForExport } from "@/lib/cloud/study-core";

export default async function SentencesPage() {
  const persistence = resolveCloudPersistenceMode(getCloudServerConfig());
  const session = persistence === "cloud" ? await getAppSession() : null;
  const cloud = persistence === "cloud" && session?.authMode === "supabase";
  const page = cloud ? await getCloudStudyService().list(session.userId, { kind: "sentence" }) : { items: [], nextCursor: null };
  const rows = page.items;
  const books = cloud ? await getCloudBooksService().list(session.userId) : [];
  const initialItems = cloud ? rows.map((row) => ({ id: row.id as string, originalText: row.originalText as string, translatedText: (row.translatedText as string | null) ?? "", explanation: (row.explanation as string | null) ?? "", note: (row.note as string | null) ?? "", bookId: row.originalBookId as string, bookTitle: row.bookTitle as string, chapterId: (row.chapterId as string | null) ?? "", chapterTitle: (row.chapterTitle as string | null) ?? "", sourceLabel: `${row.bookTitle as string} · ${(row.chapterTitle as string | null) ?? "整本书"}` })) : persistence === "local" ? stageSevenSentenceView.items : [];
  let exportData = stageEightSentenceMarkdownExport;
  let exportLimitReached = false;
  if (cloud) {
    try {
      const exportRows = await listAllStudyItemsForExport(getCloudStudyService(), session.userId, "sentence");
      const exportItems = exportRows.map((row) => ({ id: row.id as string, originalText: row.originalText as string, translatedText: (row.translatedText as string | null) ?? "", explanation: (row.explanation as string | null) ?? "", note: (row.note as string | null) ?? "", bookId: row.originalBookId as string, bookTitle: row.bookTitle as string, chapterId: (row.chapterId as string | null) ?? "", chapterTitle: (row.chapterTitle as string | null) ?? "", sourceLabel: `${row.bookTitle as string} · ${(row.chapterTitle as string | null) ?? "整本书"}` }));
      exportData = buildSentenceMarkdownExport({ bookTitle: "cloud-library", items: exportItems });
    } catch (error) { if (error instanceof CloudStudyError && error.code === "STUDY_EXPORT_LIMIT") exportLimitReached = true; else throw error; }
  }
  return (
    <AppShell requireAuth>
      <StudyLibraryHeader
        active="sentences"
        title="句子本"
        description="收藏阅读时喜欢的语句和段落，保留原文、译文、来源章节和备注。"
        actions={persistence === "unavailable" ? undefined : exportLimitReached ? <span className="text-sm text-[var(--muted-foreground)]">云端句子超过 10000 条，请先缩小数据范围再导出。</span> :
          <StudyExportButton
            content={exportData.content}
            fileName={exportData.fileName}
            kind="markdown"
            label="导出 Markdown"
          />
        }
      />

      <SentencesWorkspace
        availableBooks={cloud ? books.map((book) => ({ id: book.id, title: book.title })) : persistence === "local" ? stageSevenSentenceView.availableBooks : []}
        initialItems={initialItems}
        initialQuery={stageSevenSentenceView.query}
        initialNextCursor={page.nextCursor}
        persistence={persistence}
      />

      {persistence === "local" ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">{stageSevenSentenceView.deletionPreview.message}</p> : null}
    </AppShell>
  );
}
