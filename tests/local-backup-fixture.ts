import type { LocalBackupRawValues } from "../src/lib/backup/local-backup-core.ts";
import type { StoredLocalLibraryBook } from "../src/lib/library/local-library-storage.ts";
import type { StoredLocalTranslation } from "../src/lib/library/local-translation-storage.ts";
import type {
  SentenceStudyItem,
  VocabularyStudyItem,
} from "../src/lib/reader/study-collections.ts";
import type { StudyNote } from "../src/lib/study/study-notes-local.ts";

export const backupBook: StoredLocalLibraryBook = {
  id: "local-book-backup-test",
  title: "Backup Book",
  author: "A. Writer",
  format: "TXT",
  originalFileName: "backup-book.txt",
  chapterCount: 1,
  skippedChapterCount: 0,
  totalCharacters: 24,
  savedAt: "2026-07-21T08:00:00.000Z",
  chapters: [
    {
      position: 1,
      sourceIndex: 1,
      title: "Chapter 1",
      originalTitle: "Chapter 1",
      characterCount: 24,
      content: "The lantern stayed lit.",
      contentPreview: "The lantern stayed lit.",
      warnings: [],
    },
  ],
  skippedChapters: [],
};

const backupChapterId = `${backupBook.id}-chapter-1`;

export const backupTranslation: StoredLocalTranslation = {
  id: "local-translation-local-book-backup-test-zh-test",
  originalBookId: backupBook.id,
  originalTitle: backupBook.title,
  title: "Backup Book 中文译本",
  sourceLanguage: "英文",
  targetLanguage: "中文",
  status: "queued",
  origin: "mcp",
  style: "自然",
  webLookupEnabled: false,
  createdAt: "2026-07-21T08:05:00.000Z",
  updatedAt: "2026-07-21T08:05:00.000Z",
  tasks: [
    {
      id: "backup-task-1",
      chapterId: backupChapterId,
      chapterTitle: "Chapter 1",
      status: "queued",
      progressText: "等待翻译",
      balanceText: "演示免费额度",
      updatedAt: "2026-07-21T08:05:00.000Z",
    },
  ],
  chapters: [
    {
      id: backupChapterId,
      sourceChapterId: backupChapterId,
      title: "Chapter 1",
      wordCount: 24,
      sourceParagraphs: ["The lantern stayed lit."],
      translatedParagraphs: [],
      secondaryTranslationParagraphs: [""],
    },
  ],
};

export const backupVocabulary: VocabularyStudyItem = {
  id: "vocab-backup-1",
  term: "lantern",
  explanation: "灯笼",
  contextualMean: "照明物",
  sourceSentence: "The lantern stayed lit.",
  sourceLabel: "Backup Book · Chapter 1",
  note: "",
  bookId: backupBook.id,
  bookTitle: backupBook.title,
  chapterId: backupChapterId,
  chapterTitle: "Chapter 1",
};

export const backupSentence: SentenceStudyItem = {
  id: "sentence-backup-1",
  originalText: "The lantern stayed lit.",
  translatedText: "灯一直亮着。",
  explanation: "",
  sourceLabel: "Backup Book · Chapter 1",
  note: "",
  bookId: backupBook.id,
  bookTitle: backupBook.title,
  chapterId: backupChapterId,
  chapterTitle: "Chapter 1",
};

export const backupNote: StudyNote = {
  id: "note-local-1",
  title: "阅读笔记",
  source: "Backup Book",
  updatedAt: "2026-07-21T08:10:00.000Z",
  content: "记住灯笼意象。",
};

export function buildBackupRawValues(): LocalBackupRawValues {
  return {
    libraryBooks: JSON.stringify([backupBook]),
    translations: JSON.stringify([backupTranslation]),
    vocabulary: JSON.stringify([backupVocabulary]),
    sentences: JSON.stringify([backupSentence]),
    notes: JSON.stringify([backupNote]),
    readerSelections: JSON.stringify({
      vocabularyTexts: ["lantern"],
      sentenceTexts: ["The lantern stayed lit."],
    }),
  };
}
