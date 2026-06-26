"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  BookOpen,
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Languages,
  MessageCircleQuestion,
  MessageSquareText,
  Moon,
  PanelLeft,
  PanelRight,
  Send,
  Sun,
  TreePine,
  Volume2,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import {
  addReaderSelectionToLocalCollection,
  createEmptyReaderSelectionCollections,
} from "@/lib/reader/reader-selection-save";
import { buildSelectionLookupCard } from "@/lib/reader/selection-lookup-card";
import type { ReaderTheme, ReaderView } from "@/lib/reader/reader-view";

type ReaderWorkspaceProps = {
  title: string;
  readerView: ReaderView;
};

type SelectionMenu = {
  x: number;
  y: number;
};

type LookupCardPosition = SelectionMenu;

const themeOptions: Array<{
  value: ReaderTheme;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "白天", icon: Sun },
  { value: "sepia", label: "护眼", icon: TreePine },
  { value: "dark", label: "黑夜", icon: Moon },
];

const themeTokens: Record<ReaderTheme, Record<string, string>> = {
  light: {
    "--background": "oklch(0.982 0.006 245)",
    "--foreground": "oklch(0.19 0.018 255)",
    "--muted": "oklch(0.936 0.008 250)",
    "--muted-foreground": "oklch(0.39 0.018 255)",
    "--surface": "oklch(1 0 0)",
    "--surface-2": "oklch(0.958 0.007 248)",
    "--border": "oklch(0.865 0.012 250)",
    "--primary": "oklch(0.46 0.12 248)",
    "--primary-foreground": "oklch(0.99 0 0)",
    "--reader-page": "oklch(0.995 0.003 245)",
    "--reader-panel": "oklch(0.99 0.004 245)",
    "--reader-rail": "oklch(0.952 0.01 248)",
    "--reader-highlight": "oklch(0.91 0.035 224)",
    "--reader-shadow": "color-mix(in oklch, var(--foreground) 10%, transparent)",
  },
  sepia: {
    "--background": "oklch(0.955 0.018 132)",
    "--foreground": "oklch(0.22 0.03 145)",
    "--muted": "oklch(0.9 0.028 132)",
    "--muted-foreground": "oklch(0.38 0.035 145)",
    "--surface": "oklch(0.985 0.012 130)",
    "--surface-2": "oklch(0.925 0.026 136)",
    "--border": "oklch(0.82 0.035 140)",
    "--primary": "oklch(0.42 0.095 152)",
    "--primary-foreground": "oklch(0.99 0.004 130)",
    "--reader-page": "oklch(0.982 0.014 126)",
    "--reader-panel": "oklch(0.96 0.022 132)",
    "--reader-rail": "oklch(0.9 0.026 136)",
    "--reader-highlight": "oklch(0.86 0.055 148)",
    "--reader-shadow": "color-mix(in oklch, var(--foreground) 12%, transparent)",
  },
  dark: {
    "--background": "oklch(0.18 0.018 260)",
    "--foreground": "oklch(0.94 0.006 250)",
    "--muted": "oklch(0.29 0.023 260)",
    "--muted-foreground": "oklch(0.74 0.012 250)",
    "--surface": "oklch(0.225 0.02 260)",
    "--surface-2": "oklch(0.285 0.023 260)",
    "--border": "oklch(0.36 0.026 260)",
    "--primary": "oklch(0.72 0.11 242)",
    "--primary-foreground": "oklch(0.16 0.02 260)",
    "--reader-page": "oklch(0.205 0.018 260)",
    "--reader-panel": "oklch(0.245 0.02 260)",
    "--reader-rail": "oklch(0.155 0.017 260)",
    "--reader-highlight": "oklch(0.33 0.06 242)",
    "--reader-shadow": "color-mix(in oklch, black 34%, transparent)",
  },
};

const workspaceThemeClasses: Record<ReaderTheme, string> = {
  light: "bg-[var(--background)] text-[var(--foreground)]",
  sepia: "bg-[var(--background)] text-[var(--foreground)]",
  dark: "bg-[var(--background)] text-[var(--foreground)]",
};

const panelClasses =
  "border border-[var(--border)] bg-[var(--reader-panel)] text-[var(--foreground)] shadow-sm";

const quietButtonClasses =
  "inline-flex size-9 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--foreground)] transition-colors hover:bg-[var(--reader-highlight)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

const compactActionButtonClasses =
  "inline-flex h-9 items-center justify-center rounded-md bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--reader-highlight)] disabled:opacity-45";

export function ReaderWorkspace({ title, readerView }: ReaderWorkspaceProps) {
  const articleRef = useRef<HTMLElement>(null);
  const lookupCardRef = useRef<HTMLDivElement>(null);
  const [showToc, setShowToc] = useState(true);
  const [showAssistant, setShowAssistant] = useState(true);
  const [theme, setTheme] = useState<ReaderTheme>(readerView.settings.theme);
  const [expandedTranslations, setExpandedTranslations] = useState<Set<number>>(() => new Set());
  const [selectedText, setSelectedText] = useState("");
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [lookupCardPosition, setLookupCardPosition] = useState<LookupCardPosition | null>(null);
  const [lookupAddedToVocabulary, setLookupAddedToVocabulary] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");
  const [selectionCollections, setSelectionCollections] = useState(createEmptyReaderSelectionCollections);

  useEffect(() => {
    const root = document.documentElement;
    const previousValues = Object.fromEntries(
      Object.keys(themeTokens[theme]).map((name) => [name, root.style.getPropertyValue(name)]),
    );

    Object.entries(themeTokens[theme]).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });

    return () => {
      Object.entries(previousValues).forEach(([name, value]) => {
        if (value) {
          root.style.setProperty(name, value);
        } else {
          root.style.removeProperty(name);
        }
      });
    };
  }, [theme]);

  const gridTemplate = useMemo(() => {
    if (showToc && showAssistant) {
      return "xl:grid-cols-[220px_minmax(0,1fr)_300px]";
    }

    if (showToc) {
      return "xl:grid-cols-[220px_minmax(0,1fr)]";
    }

    if (showAssistant) {
      return "xl:grid-cols-[minmax(0,1fr)_300px]";
    }

    return "xl:grid-cols-1";
  }, [showAssistant, showToc]);

  const shellWidthClass = showToc || showAssistant ? "max-w-[1680px]" : "max-w-none";
  const activeContentWidth = showToc || showAssistant ? readerView.settings.contentWidth : 1480;
  const currentChapterIndex = readerView.chapters.findIndex((chapter) => chapter.isCurrent);
  const currentChapterNumber = currentChapterIndex >= 0 ? currentChapterIndex + 1 : 1;
  const chapterProgressPercent = Math.round(
    (currentChapterNumber / Math.max(readerView.chapters.length, 1)) * 100,
  );
  const lookupCard = lookupCardPosition
    ? buildSelectionLookupCard({
        selectedText,
        addedToVocabulary: lookupAddedToVocabulary,
      })
    : null;

  useEffect(() => {
    if (!lookupCardPosition) {
      return;
    }

    function closeLookupCardOnOutsidePointer(event: globalThis.MouseEvent | TouchEvent) {
      const target = event.target;

      if (target instanceof Node && lookupCardRef.current?.contains(target)) {
        return;
      }

      setLookupCardPosition(null);
    }

    document.addEventListener("mousedown", closeLookupCardOnOutsidePointer);
    document.addEventListener("touchstart", closeLookupCardOnOutsidePointer);

    return () => {
      document.removeEventListener("mousedown", closeLookupCardOnOutsidePointer);
      document.removeEventListener("touchstart", closeLookupCardOnOutsidePointer);
    };
  }, [lookupCardPosition]);

  function toggleTranslation(index: number) {
    setExpandedTranslations((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  function captureSelectedText(event?: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";

    if (!selection || selection.isCollapsed || !text) {
      setSelectionMenu(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const article = articleRef.current;

    if (!article?.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null);
      return;
    }

    if (event && "button" in event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const rect = range.getBoundingClientRect();

    setSelectedText(text);
    setSelectedAction("");
    setLookupCardPosition(null);
    setLookupAddedToVocabulary(
      selectionCollections.vocabularyTexts.some((item) => item.toLowerCase() === text.toLowerCase()),
    );
    setSelectionMenu({
      x: Math.min(Math.max(rect.left + rect.width / 2, 130), window.innerWidth - 130),
      y: Math.max(rect.top - 10, 78),
    });
  }

  function runSelectionAction(action: "translate" | "vocabulary" | "sentence") {
    if (!selectedText) {
      return;
    }

    if (action === "translate") {
      setLookupCardPosition({
        x: selectionMenu?.x ?? window.innerWidth / 2,
        y: Math.max((selectionMenu?.y ?? 150) + 12, 96),
      });
      setSelectionMenu(null);
      return;
    }

    const result = addReaderSelectionToLocalCollection(selectionCollections, action, selectedText);

    setSelectionCollections(result.collections);
    setSelectedAction(result.message);

    if (action === "vocabulary") {
      setLookupAddedToVocabulary(true);
    }
  }

  return (
    <div
      className={clsx(
        "-mx-5 -my-7 min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,var(--background)_0%,var(--reader-rail)_100%)] px-4 py-4 transition-colors md:-mx-6 md:-my-8 md:px-6 md:py-5",
        workspaceThemeClasses[theme],
      )}
    >
      <div className={clsx("mx-auto grid w-full gap-5", shellWidthClass, gridTemplate)}>
        {showToc ? (
          <aside className={clsx("h-fit rounded-lg p-3 xl:sticky xl:top-20", panelClasses)}>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <BookOpen aria-hidden="true" size={18} className="text-[var(--primary)]" />
                <h2 className="font-semibold">目录</h2>
              </div>
              <button
                className={quietButtonClasses}
                onClick={() => setShowToc(false)}
                type="button"
                aria-label="隐藏目录"
              >
                <EyeOff aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="space-y-1.5">
              {readerView.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  className={clsx(
                    "w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    chapter.isCurrent
                      ? "bg-[var(--reader-highlight)] text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
                  )}
                  type="button"
                >
                  <span className="block font-medium">{chapter.title}</span>
                  <span className="mt-1 block text-xs">
                    {chapter.isCurrent ? "当前阅读" : `${chapter.wordCount} 字`}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}

        <section className={clsx("min-w-0 overflow-hidden rounded-lg", panelClasses)}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--reader-panel)] px-5 py-4 md:px-7">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--muted-foreground)]">{title}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal">
                {readerView.currentChapter.title}
              </h1>
              <div className="mt-3 flex max-w-sm items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--primary)]"
                    style={{ width: `${chapterProgressPercent}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs font-medium text-[var(--muted-foreground)]">
                  {currentChapterNumber}/{readerView.chapters.length}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!showToc ? (
                <Button variant="secondary" onClick={() => setShowToc(true)}>
                  <PanelLeft aria-hidden="true" size={16} />
                  目录
                </Button>
              ) : null}
              {!showAssistant ? (
                <Button variant="secondary" onClick={() => setShowAssistant(true)}>
                  <PanelRight aria-hidden="true" size={16} />
                  助手
                </Button>
              ) : null}
              <Button variant="secondary" disabled={!readerView.previousChapter}>
                <ChevronLeft aria-hidden="true" size={16} />
                上一章
              </Button>
              <Button variant="secondary" disabled={!readerView.nextChapter}>
                下一章
                <ChevronRight aria-hidden="true" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--reader-page)] px-5 py-3 md:px-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-medium text-[var(--muted-foreground)]">主题</span>
              {themeOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    className={clsx(
                      "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                      theme === option.value
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--reader-highlight)]",
                    )}
                    onClick={() => setTheme(option.value)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={15} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <article
            ref={articleRef}
            className="mx-auto w-full space-y-6 bg-[var(--reader-page)] px-5 py-8 md:px-10 md:py-12"
            onContextMenu={(event) => event.preventDefault()}
            onMouseUp={captureSelectedText}
            onKeyUp={captureSelectedText}
            style={{
              maxWidth: `${activeContentWidth}px`,
              fontSize: `${readerView.settings.fontSize}px`,
              lineHeight: readerView.settings.lineHeight,
            }}
          >
            {readerView.paragraphRows.map((paragraph) => {
              const isExpanded = expandedTranslations.has(paragraph.index);

              return (
                <section
                  key={paragraph.index}
                  className="relative rounded-md px-3 py-3 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <p className="pr-12 text-pretty">{paragraph.learningText}</p>
                  <button
                    className={clsx(
                      "absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      isExpanded
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--reader-page)] text-[var(--primary)] hover:bg-[var(--reader-highlight)]",
                    )}
                    onClick={() => toggleTranslation(paragraph.index)}
                    type="button"
                    aria-label={isExpanded ? "收起翻译" : "查看翻译"}
                  >
                    译
                  </button>
                  {isExpanded ? (
                    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[0.94em] text-[var(--foreground)]">
                      <p>{paragraph.secondaryTranslationText}</p>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </article>
        </section>

        {showAssistant ? (
          <aside className={clsx("h-fit rounded-lg p-4 xl:sticky xl:top-20", panelClasses)}>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <MessageSquareText aria-hidden="true" size={18} className="text-[var(--primary)]" />
                <h2 className="font-semibold">AI 阅读助手</h2>
              </div>
              <button
                className={quietButtonClasses}
                onClick={() => setShowAssistant(false)}
                type="button"
                aria-label="隐藏 AI 阅读助手"
              >
                <Eye aria-hidden="true" size={16} />
              </button>
            </div>

            <div className="rounded-md bg-[var(--surface-2)] p-3 text-sm">
              <p className="font-medium">选中内容</p>
              <p className="mt-2 max-h-28 overflow-auto leading-6 text-[var(--muted-foreground)]">
                {selectedText || "未选择文本"}
              </p>
              {selectedAction ? (
                <p className="mt-2 text-xs font-medium text-[var(--primary)]">{selectedAction}</p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted-foreground)]">
                <span>词汇本 {selectionCollections.vocabularyTexts.length}</span>
                <span>句子本 {selectionCollections.sentenceTexts.length}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                className={compactActionButtonClasses}
                disabled={!selectedText}
                onClick={() => runSelectionAction("translate")}
                type="button"
              >
                翻译
              </button>
              <button
                className={compactActionButtonClasses}
                disabled={!selectedText}
                onClick={() => runSelectionAction("vocabulary")}
                type="button"
              >
                词汇本
              </button>
              <button
                className={compactActionButtonClasses}
                disabled={!selectedText}
                onClick={() => runSelectionAction("sentence")}
                type="button"
              >
                句子本
              </button>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-medium">你的问题</span>
              <textarea
                className="mt-2 min-h-32 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--reader-page)] p-3 text-sm outline-none transition focus:border-[var(--primary)]"
                placeholder="输入想问的问题"
              />
            </label>

            <Button className="mt-3 w-full">
              <Send aria-hidden="true" size={16} />
              提问
            </Button>
          </aside>
        ) : null}
      </div>

      {selectionMenu ? (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--reader-panel)] p-1 text-sm shadow-sm"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded px-3 font-medium hover:bg-[var(--reader-highlight)]"
            onClick={() => runSelectionAction("translate")}
            type="button"
          >
            <Languages aria-hidden="true" size={15} />
            翻译
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded px-3 font-medium hover:bg-[var(--reader-highlight)]"
            onClick={() => runSelectionAction("vocabulary")}
            type="button"
          >
            <BookmarkPlus aria-hidden="true" size={15} />
            词汇本
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded px-3 font-medium hover:bg-[var(--reader-highlight)]"
            onClick={() => runSelectionAction("sentence")}
            type="button"
          >
            <MessageCircleQuestion aria-hidden="true" size={15} />
            句子本
          </button>
        </div>
      ) : null}

      {lookupCard && lookupCardPosition ? (
        <div
          ref={lookupCardRef}
          className="fixed z-50 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--reader-panel)] p-4 text-sm shadow-sm"
          style={{
            left: Math.min(Math.max(lookupCardPosition.x, 180), window.innerWidth - 180),
            top: lookupCardPosition.y,
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-base font-semibold">{lookupCard.term}</p>
              <p className="mt-1 text-[var(--muted-foreground)]">{lookupCard.phonetic}</p>
            </div>
            <button
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--foreground)] transition-colors hover:bg-[var(--reader-highlight)]"
              type="button"
              aria-label={lookupCard.pronunciationLabel}
            >
              <Volume2 aria-hidden="true" size={17} />
            </button>
          </div>

          <p className="mt-3 leading-6 text-[var(--foreground)]">{lookupCard.explanation}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              className={clsx(
                "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                lookupAddedToVocabulary
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--reader-highlight)]",
              )}
              onClick={() => {
                const result = addReaderSelectionToLocalCollection(
                  selectionCollections,
                  "vocabulary",
                  selectedText,
                );

                setSelectionCollections(result.collections);
                setLookupAddedToVocabulary(true);
                setSelectedAction(result.message);
              }}
              type="button"
            >
              {lookupAddedToVocabulary ? (
                <Check aria-hidden="true" size={15} />
              ) : (
                <BookmarkPlus aria-hidden="true" size={15} />
              )}
              {lookupCard.vocabularyActionLabel}
            </button>
            <button
              className="h-9 rounded-md px-3 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--reader-highlight)] hover:text-[var(--foreground)]"
              onClick={() => setLookupCardPosition(null)}
              type="button"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
