"use client";

import { Volume2 } from "lucide-react";

import { getSpeakableEnglishText, speakEnglish } from "@/lib/speech";

export function WordAudioButton({
  word,
  label = "播放读音",
  compact = false,
  className = "",
}: {
  word: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const speakableText = getSpeakableEnglishText(word);
  if (!speakableText) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        speakEnglish(speakableText);
      }}
      aria-label={`${label}：${speakableText}`}
      title={`${label}：${speakableText}`}
      className={`inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-secondary ${className}`}
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      <span className={compact ? "sr-only" : ""}>{label}</span>
    </button>
  );
}
