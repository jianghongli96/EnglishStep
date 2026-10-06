"use client";

import { LearningApp } from "@/components/learning/learning-app";

export default function WordsPracticeRoute() {
  return <LearningApp initialModule="words" autoStartPractice="words" />;
}
