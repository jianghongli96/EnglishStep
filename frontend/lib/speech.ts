import type { PracticeItem } from "@/lib/types";

export function getSpeakableEnglishText(value: string | undefined) {
  const text = String(value || "")
    .replace(/[“”"]/g, "")
    .replace(/[。！？；，、]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!/[a-z]/i.test(text) || /[\u4e00-\u9fa5]/.test(text)) {
    return "";
  }

  if (!/^[a-z][a-z'\-\s.]*$/i.test(text)) {
    return "";
  }

  return text.replace(/[.]+$/g, "");
}

export function getQuestionSpeakWord(question: PracticeItem | undefined) {
  if (!question || question.module !== "words") return "";
  return getSpeakableEnglishText(question.knowledgePoint);
}

export function speakEnglish(value: string) {
  const text = getSpeakableEnglishText(value);
  if (!text) return;

  if (typeof window === "undefined") {
    return;
  }

  if (!("speechSynthesis" in window)) {
    window.alert("当前浏览器暂不支持英语朗读。");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.82;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith("en-us") &&
        /samantha|alex|google|microsoft|english/i.test(voice.name),
    ) || voices.find((voice) => voice.lang.toLowerCase().startsWith("en"));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
