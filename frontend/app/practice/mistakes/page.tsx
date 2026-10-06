"use client";

import { LearningApp } from "@/components/learning/learning-app";

export default function MistakePracticeRoute() {
  return <LearningApp initialModule="mistakes" autoStartPractice="mistakes" />;
}
