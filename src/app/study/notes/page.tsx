import { AppShell } from "@/components/app-shell";
import { NotesWorkspace } from "@/components/study/notes-workspace";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import type { StudyNote } from "@/lib/study/study-notes-local";
import { getAppSession } from "@/lib/auth/app-session";
import { getCloudServerConfig } from "@/lib/cloud/server-config";
import { resolveCloudPersistenceMode } from "@/lib/cloud/persistence-mode";
import { getCloudStudyService } from "@/lib/cloud/study";
import { CloudStudyError, listAllStudyItemsForExport } from "@/lib/cloud/study-core";

const noteItems: StudyNote[] = [
  {
    id: "note-1",
    title: "黑桥段落的阅读感觉",
    source: "迷雾边境 · 第二章",
    updatedAt: "今天 18:12",
    content:
      "这一章的节奏比较克制，动作描写短，但环境信息很多。以后阅读类似段落时，可以先抓住人物动作，再回头看雾、灯、桥这些意象。",
  },
  {
    id: "note-2",
    title: "常见叙事句式整理",
    source: "英语精读",
    updatedAt: "昨天 22:08",
    content:
      "英文叙事里经常用短句推动动作，再用一个补充短语交代情绪或环境。读的时候不要逐词卡住，先把动作链读顺。",
  },
];

export default async function NotesPage() {
  const persistence = resolveCloudPersistenceMode(getCloudServerConfig());
  const session = persistence === "cloud" ? await getAppSession() : null;
  const cloud = persistence === "cloud" && Boolean(session);
  const page = cloud && session ? await getCloudStudyService().list(session.user.id, { kind: "note" }) : { items: [], nextCursor: null };
  const rows = page.items;
  const visibleNotes: StudyNote[] = cloud ? rows.map(toStudyNote) : persistence === "local" ? noteItems : [];
  let initialExportNotes: StudyNote[] = [];
  let exportLimitReached = false;

  if (cloud && session) {
    try {
      initialExportNotes = (await listAllStudyItemsForExport(
        getCloudStudyService(),
        session.user.id,
        "note",
      )).map(toStudyNote);
    } catch (error) {
      if (error instanceof CloudStudyError && error.code === "STUDY_EXPORT_LIMIT") {
        exportLimitReached = true;
      } else {
        throw error;
      }
    }
  }

  return (
    <AppShell requireAuth>
      <StudyLibraryHeader
        active="notes"
        title="笔记本"
        description="这里放你自己写的阅读总结、学习方法和章节感想，不依赖选中文本。"
      />

      {exportLimitReached ? (
        <p className="mt-5 text-sm text-[var(--muted-foreground)]">
          云端笔记超过 10000 条，请先缩小数据范围再导出。
        </p>
      ) : null}

      <NotesWorkspace
        initialNotes={visibleNotes}
        initialExportNotes={initialExportNotes}
        initialNextCursor={page.nextCursor}
        exportLimitReached={exportLimitReached}
        persistence={persistence}
      />
    </AppShell>
  );
}

function toStudyNote(row: Record<string, unknown>): StudyNote {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    source: (row.targetLabel as string) || "自由笔记",
    updatedAt: new Date(row.updatedAt as Date).toLocaleString("zh-CN"),
  };
}
