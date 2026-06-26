import { AppShell } from "@/components/app-shell";
import { NotesWorkspace } from "@/components/study/notes-workspace";
import { StudyLibraryHeader } from "@/components/study/study-library-header";
import type { StudyNote } from "@/lib/study/study-notes-local";

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

export default function NotesPage() {
  return (
    <AppShell>
      <StudyLibraryHeader
        active="notes"
        title="笔记本"
        description="这里放你自己写的阅读总结、学习方法和章节感想，不依赖选中文本。"
      />

      <NotesWorkspace initialNotes={noteItems} />
    </AppShell>
  );
}
