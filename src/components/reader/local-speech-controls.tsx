"use client";

import { Loader2, Pause, Play, Square, Volume2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createLocalSpeechController,
  localSpeechRates,
  type LocalSpeechController,
  type LocalSpeechParagraph,
  type LocalSpeechRate,
  type LocalSpeechRuntime,
  type LocalSpeechSnapshot,
  type LocalSpeechVoice,
} from "@/lib/reader/local-speech-core";

type LocalSpeechControlsProps = {
  chapterId: string;
  language?: string;
  paragraphs: LocalSpeechParagraph[];
  onActiveParagraphChange(index: number | null): void;
};

const initialSnapshot: LocalSpeechSnapshot = {
  status: "checking",
  activeParagraphIndex: null,
  notice: "正在读取系统语音。",
};

export function LocalSpeechControls({
  chapterId,
  language,
  paragraphs,
  onActiveParagraphChange,
}: LocalSpeechControlsProps) {
  const [rate, setRate] = useState<LocalSpeechRate>(1);
  const [snapshot, setSnapshot] = useState<LocalSpeechSnapshot>(initialSnapshot);
  const controllerRef = useRef<LocalSpeechController | null>(null);
  const notifyActiveParagraph = useEffectEvent(onActiveParagraphChange);

  useEffect(() => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
      let cancelled = false;

      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setSnapshot({
          status: "unavailable",
          activeParagraphIndex: null,
          notice: "当前浏览器不支持本地语音朗读。",
        });
        notifyActiveParagraph(null);
      });

      return () => {
        cancelled = true;
        notifyActiveParagraph(null);
      };
    }

    const synthesis = window.speechSynthesis;
    const controller = createLocalSpeechController({
      runtime: createBrowserSpeechRuntime(synthesis),
      onSnapshot(nextSnapshot) {
        setSnapshot(nextSnapshot);
        notifyActiveParagraph(nextSnapshot.activeParagraphIndex);
      },
    });
    controllerRef.current = controller;

    function refreshVoices(final: boolean) {
      controller.setVoices(readBrowserVoices(synthesis), { final });
    }

    function handleVoicesChanged() {
      refreshVoices(true);
    }

    refreshVoices(false);
    synthesis.addEventListener("voiceschanged", handleVoicesChanged);

    return () => {
      synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      controller.destroy();
      controllerRef.current = null;
      notifyActiveParagraph(null);
    };
  }, [chapterId, language, paragraphs]);

  function handlePrimaryAction() {
    const controller = controllerRef.current;

    if (!controller) {
      return;
    }

    if (snapshot.status === "playing") {
      controller.pause();
      return;
    }

    if (snapshot.status === "paused") {
      controller.resume();
      return;
    }

    if ("speechSynthesis" in window) {
      controller.setVoices(readBrowserVoices(window.speechSynthesis), { final: true });
    }

    controller.start({ chapterId, language, paragraphs, rate });
  }

  function handleRateChange(value: string) {
    const nextRate = Number(value) as LocalSpeechRate;

    if (localSpeechRates.includes(nextRate)) {
      setRate(nextRate);
    }
  }

  const sessionActive = snapshot.status === "playing" || snapshot.status === "paused";
  const primaryLabel =
    snapshot.status === "playing"
      ? "暂停朗读"
      : snapshot.status === "paused"
        ? "继续朗读"
        : snapshot.status === "checking"
          ? "正在读取系统语音"
          : "朗读本章";
  const statusMessage =
    snapshot.notice ||
    (snapshot.status === "playing"
      ? "正在朗读当前段落。"
      : snapshot.status === "paused"
        ? "朗读已暂停。"
        : "");
  const PrimaryIcon =
    snapshot.status === "playing"
      ? Pause
      : snapshot.status === "paused"
        ? Play
        : snapshot.status === "checking"
          ? Loader2
          : Volume2;

  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={handlePrimaryAction}
        aria-pressed={sessionActive}
      >
        <PrimaryIcon
          aria-hidden="true"
          className={snapshot.status === "checking" ? "motion-safe:animate-spin" : undefined}
          size={17}
        />
        {primaryLabel}
      </Button>

      <Button
        type="button"
        variant="secondary"
        disabled={!sessionActive}
        onClick={() => controllerRef.current?.stop()}
      >
        <Square aria-hidden="true" size={15} />
        停止朗读
      </Button>

      <label className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--primary)]">
        <span>语速</span>
        <select
          className="bg-transparent text-sm outline-none disabled:opacity-50"
          aria-label="朗读语速"
          disabled={sessionActive}
          value={rate}
          onChange={(event) => handleRateChange(event.target.value)}
        >
          {localSpeechRates.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
      </label>

      {statusMessage ? (
        <p
          className={
            snapshot.status === "error" || snapshot.status === "unavailable"
              ? "basis-full text-right text-xs font-medium text-[var(--danger)]"
              : "basis-full text-right text-xs text-[var(--muted-foreground)]"
          }
          role={
            snapshot.status === "error" || snapshot.status === "unavailable"
              ? "alert"
              : "status"
          }
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

function readBrowserVoices(synthesis: SpeechSynthesis): LocalSpeechVoice[] {
  return synthesis.getVoices().map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    default: voice.default,
    localService: voice.localService,
    native: voice,
  }));
}

function createBrowserSpeechRuntime(synthesis: SpeechSynthesis): LocalSpeechRuntime {
  return {
    cancel() {
      synthesis.cancel();
    },
    pause() {
      synthesis.pause();
    },
    resume() {
      synthesis.resume();
    },
    speak(descriptor) {
      const utterance = new SpeechSynthesisUtterance(descriptor.text);
      utterance.lang = descriptor.lang;
      utterance.rate = descriptor.rate;

      if (descriptor.voice?.native) {
        utterance.voice = descriptor.voice.native as SpeechSynthesisVoice;
      }

      utterance.onend = () => descriptor.onEnd?.();
      utterance.onerror = () => descriptor.onError?.();
      synthesis.speak(utterance);
    },
  };
}
