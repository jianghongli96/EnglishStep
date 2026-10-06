"use client";

import { LearningApp } from "@/components/learning/learning-app";

export default function DailyPracticeRoute() {
  return <LearningApp initialModule="daily" autoStartPractice="daily" />;
}
