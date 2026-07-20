"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  buildStoredLocalTranslationReaderView,
  findStoredLocalTranslation,
  getReadableStoredLocalTranslationChapters,
  localTranslationsStorageKey,
  parseStoredLocalTranslationsResult,
} from "@/lib/library/local-translation-storage";
import { routes } from "@/lib/routes";
import { buildTranslatedBookTxtExport } from "@/lib/export/translation-export";
import { ReaderWorkspace } from "./reader-workspace";
import {
  getLocalStorageFailureMessage,
  getLocalStorageSnapshotFailure,
  readScopedLocalStorage,
  toLocalStorageSnapshot,
} from "@/lib/storage/safe-local-storage";

const localTranslationsChangedEvent = "stray-pages.local-translations-changed";

type LocalTranslationReaderState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "malformed" }
  | { status: "storage-error"; reason: "unavailable" | "scope-unavailable" }
  | {
      status: "ready";
      translation: NonNullable<ReturnType<typeof findStoredLocalTranslation>>;
      readerView: ReturnType<typeof buildStoredLocalTranslationReaderView>;
    };

export function LocalTranslationReader({
  translationId,
  chapterId,
}: {
  translationId: string;
  chapterId?: string;
}) {
  const rawTranslations = useSyncExternalStore(
    subscribeToLocalTranslations,
    readLocalTranslationsSnapshot,
    getServerLocalTranslationsSnapshot,
  );
  const state = useMemo(
    () => parseLocalTranslationReaderState(rawTranslations, translationId, chapterId),
    [chapterId, rawTranslations, translationId],
  );

  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted-foreground)]">
        正在读取译本...
      </div>
    );
  }

  if (state.status === "missing" || state.status === "malformed" || state.status === "storage-error") {
    const description =
      state.status === "storage-error"
        ? getLocalStorageFailureMessage(state.reason)
        : state.status === "malformed"
          ? "本地译本数据已损坏，系统没有继续解析，也不会自动覆盖原始内容。"
          : "这个译本可能已经不在当前浏览器中。你可以回到书架重新打开书籍。";

    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 text-amber-700" size={19} aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold">
              {state.status === "missing" ? "没有找到可阅读的译本" : "无法读取本地译本"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
            <Button href={routes.library} className="mt-5">
              回到书架
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const readableChapters = getReadableStoredLocalTranslationChapters(state.translation);
  const exportInput = {
    title: state.translation.title,
    originalTitle: state.translation.originalTitle,
    targetLanguage: state.translation.targetLanguage,
    chapters: readableChapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      paragraphs: chapter.translatedParagraphs,
    })),
  };
  const download = buildTranslatedBookTxtExport(exportInput);

  return (
    <ReaderWorkspace
      title={state.translation.title}
      readerView={state.readerView}
      download={download}
      epubDownloadInput={exportInput}
      translationId={state.translation.id}
    />
  );
}

function subscribeToLocalTranslations(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(localTranslationsChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(localTranslationsChangedEvent, onStoreChange);
  };
}

function getServerLocalTranslationsSnapshot() {
  return undefined;
}

function readLocalTranslationsSnapshot() {
  const result = readScopedLocalStorage(localTranslationsStorageKey);
  return toLocalStorageSnapshot(result);
}

function parseLocalTranslationReaderState(
  rawTranslations: string | null | undefined,
  translationId: string,
  chapterId?: string,
): LocalTranslationReaderState {
  if (rawTranslations === undefined) {
    return { status: "loading" };
  }

  const storageFailure = getLocalStorageSnapshotFailure(rawTranslations);

  if (storageFailure) {
    return { status: "storage-error", reason: storageFailure };
  }

  const translationsParseResult = parseStoredLocalTranslationsResult(rawTranslations);

  if (!translationsParseResult.ok) {
    return { status: "malformed" };
  }

  const translation = findStoredLocalTranslation(
    translationsParseResult.records,
    translationId,
  );

  if (!translation || getReadableStoredLocalTranslationChapters(translation).length === 0) {
    return { status: "missing" };
  }

  return {
    status: "ready",
    translation,
    readerView: buildStoredLocalTranslationReaderView(translation, chapterId),
  };
}
