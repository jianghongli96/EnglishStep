"use client";

import { LearningApp } from "@/components/learning/learning-app";

export default function ReadingPracticeRoute() {
  return <LearningApp initialModule="reading" autoStartPractice="reading" />;
}
