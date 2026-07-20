import { notFound } from "next/navigation";
import { ReaderWorkspace } from "@/components/reader/reader-workspace";
import { getCloudBooksService } from "@/lib/cloud/books";
import { getCloudStudyService } from "@/lib/cloud/study";
import { CloudTranslationError, getCloudBookLanguageLabel } from "@/lib/cloud/translations-core";
import { getCloudTranslationsService } from "@/lib/cloud/translations";
import { buildTranslatedBookTxtExport } from "@/lib/export/translation-export";
import { buildReaderView, type ReaderSettings } from "@/lib/reader/reader-view";

export async function CloudTranslationReader({ userId, translationId, chapterId }: { userId: string; translationId: string; chapterId?: string }) {
  let translation;
  try { translation = await getCloudTranslationsService().getReader(userId, translationId); }
  catch (error) { if (error instanceof CloudTranslationError && error.code === "TRANSLATION_NOT_FOUND") notFound(); throw error; }
  if (!translation.chapters.length) return <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">还没有可阅读的云端译文章节。</p>;
  const originalBook = await getCloudBooksService().get(userId, translation.originalBookId);
  const reading = (await getCloudStudyService().list(userId, { kind: "reading", bookId: translation.id, limit: 1 })).items[0];
  const restoredChapterId = chapterId ?? (reading?.chapterId as string | null) ?? undefined;
  const restoredSettings = isRecord(reading?.settings) ? reading.settings as Partial<ReaderSettings> : undefined;
  const restoredParagraphIndex = restoredChapterId === reading?.chapterId ? Number(reading?.paragraphIndex ?? 0) : 0;
  const chapters = translation.chapters.map((chapter) => ({ id: chapter.chapterId, title: chapter.title, wordCount: chapter.content.trim().split(/\s+/u).length, sourceParagraphs: [], translatedParagraphs: chapter.content.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean) }));
  const targetLanguageLabel = getCloudBookLanguageLabel(translation.targetLanguage);
  const exportInput = {
    title: translation.title,
    originalTitle: originalBook.title,
    targetLanguage: targetLanguageLabel,
    chapters: translation.chapters.map((chapter) => ({
      id: chapter.chapterId,
      title: chapter.title,
      paragraphs: chapter.content.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean),
    })),
  };
  const download = buildTranslatedBookTxtExport(exportInput);
  return <ReaderWorkspace title={translation.title} translationId={translation.id} readerView={buildReaderView({ chapters, currentChapterId: restoredChapterId, settings: restoredSettings })} speechLanguage={targetLanguageLabel} download={download} epubDownloadInput={exportInput} persistence="cloud" cloudSource={{ originalBookId: translation.originalBookId, translatedBookId: translation.id }} initialParagraphIndex={restoredParagraphIndex} initialReadingVersion={Number(reading?.version ?? 0)} />;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
