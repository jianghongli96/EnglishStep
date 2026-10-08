"use client";

import { WordAudioButton } from "@/components/learning/word-audio-button";
import { getQuestionSpeakWord, getSpeakableEnglishText } from "@/lib/speech";
import type { Feedback, PracticeItem } from "@/lib/types";

const moduleLabels: Record<string, string> = {
  words: "词汇掌握",
  grammar: "语法基础",
  reading: "阅读理解",
};

function getCompletionEncouragement(correctCount: number, wrongCount: number) {
  const totalCount = correctCount + wrongCount;
  const accuracy = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

  if (totalCount === 0) {
    return {
      title: "准备开始就已经很好",
      message: "先进入练习状态，下一轮从第一题慢慢做起。",
      suggestion: "建议先完成一小组题目，再回来看看自己的进步。",
      accuracy,
    };
  }

  if (wrongCount === 0) {
    return {
      title: "这一轮全对，掌握得很稳",
      message: "你不仅完成了练习，还把这一组知识点答得很准确。",
      suggestion: "可以再来一轮新题，或者换一个模块挑战一下。",
      accuracy,
    };
  }

  if (accuracy >= 80) {
    return {
      title: "表现很稳，离全对已经很近了",
      message: "大部分题目你都能判断正确，说明这组内容已经开始真正掌握。",
      suggestion: "把错题再练一遍，很可能下一轮就能拿下。",
      accuracy,
    };
  }

  if (accuracy >= 50) {
    return {
      title: "已经有进步，继续练会更顺",
      message: "这轮你答对了一半以上，错题正在帮你找到需要补强的地方。",
      suggestion: "建议先做一轮错题专项，再回到当前模块继续刷题。",
      accuracy,
    };
  }

  return {
    title: "这一轮是在定位薄弱点",
    message: "错题多不代表失败，它们把不熟的词汇和语法点都标出来了。",
    suggestion: "先看正确答案和解析，再用错题专项做一小轮巩固。",
    accuracy,
  };
}

export function PracticePage({
  title,
  completionLabel,
  completionTitle,
  wrongLabel,
  questions,
  currentIndex,
  selectedAnswer,
  feedback,
  correctCount,
  wrongCount,
  onAnswer,
  onNext,
  onExit,
  onRestart,
}: {
  title: string;
  completionLabel: string;
  completionTitle: string;
  wrongLabel: string;
  questions: PracticeItem[];
  currentIndex: number;
  selectedAnswer: string;
  feedback: Feedback | null;
  correctCount: number;
  wrongCount: number;
  onAnswer: (question: PracticeItem, option: string) => void;
  onNext: () => void;
  onExit: () => void;
  onRestart: () => void;
}) {
  const question = questions[currentIndex];
  const isComplete = currentIndex >= questions.length;
  const totalAnswered = correctCount + wrongCount;
  const encouragement = getCompletionEncouragement(correctCount, wrongCount);
  const speakWord = getQuestionSpeakWord(question);
  const progress =
    questions.length === 0
      ? 100
      : Math.round((Math.min(currentIndex, questions.length) / questions.length) * 100);

  return (
    <main className="min-h-screen bg-background px-3 py-4 text-foreground sm:px-6 sm:py-5">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] max-w-3xl flex-col sm:min-h-[calc(100vh-40px)]">
        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50"
          >
            返回
          </button>
          <div className="min-w-0 flex-1 px-2">
            <div className="h-2 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-teal-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="whitespace-nowrap text-sm font-semibold text-muted-foreground">
            {Math.min(currentIndex + 1, questions.length)}/{questions.length}
          </span>
        </header>

        {isComplete ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <section className="w-full rounded-lg border border-border bg-card p-4 text-center shadow-sm sm:p-6">
              <p className="text-sm font-semibold text-teal-700">
                {completionLabel}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                {completionTitle}
              </h1>
              <div className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-4 text-left">
                <p className="text-base font-black text-teal-800">
                  {encouragement.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-teal-900">
                  {encouragement.message}
                </p>
                <p className="mt-3 text-sm font-semibold leading-6 text-teal-800">
                  {encouragement.suggestion}
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">完成题数</p>
                  <p className="mt-2 text-3xl font-black">
                    {totalAnswered}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">正确率</p>
                  <p className="mt-2 text-3xl font-black text-primary">
                    {encouragement.accuracy}%
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">答对</p>
                  <p className="mt-2 text-3xl font-black text-teal-700">
                    {correctCount}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">{wrongLabel}</p>
                  <p className="mt-2 text-3xl font-black text-coral-strong">
                    {wrongCount}
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
                <button
                  type="button"
                  onClick={onRestart}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  再来一轮
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold"
                >
                  回到首页
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-5 sm:py-8">
            <article className="w-full rounded-lg border border-border bg-card p-4 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
                  {moduleLabels[question.module] || title}
                </span>
                <span className="text-sm text-muted-foreground">
                  难度 {question.difficulty || 1}
                </span>
              </div>

              {question.passage ? (
                <p className="mt-5 rounded-md bg-secondary p-4 text-sm leading-7 text-secondary-foreground">
                  {question.passage}
                </p>
              ) : null}

              <h1 className="mt-5 break-words text-xl font-black leading-tight tracking-tight sm:text-3xl">
                {question.prompt}
              </h1>
              {speakWord ? (
                <div className="mt-4">
                  <WordAudioButton word={speakWord} label="播放单词" />
                </div>
              ) : null}

              <div className="mt-6 grid gap-3">
                {question.options.map((option) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrectAnswer = feedback?.correctAnswer === option;
                  const canSpeakOption =
                    question.module === "words" && Boolean(getSpeakableEnglishText(option));
                  const optionButton = (
                    <button
                      type="button"
                      onClick={() => onAnswer(question, option)}
                      disabled={Boolean(feedback || selectedAnswer)}
                      className={`min-h-[54px] min-w-0 flex-1 break-words rounded-md border px-3 py-3 text-left text-sm font-semibold transition sm:px-4 sm:py-4 sm:text-base ${
                        feedback && isCorrectAnswer
                          ? "border-teal-500 bg-teal-50 text-teal-800"
                          : feedback && isSelected
                            ? "border-coral bg-coral-soft text-coral-strong"
                            : "border-border bg-background hover:border-primary/50"
                      } disabled:cursor-default`}
                    >
                      {option}
                    </button>
                  );

                  if (canSpeakOption) {
                    return (
                      <div key={option} className="flex items-stretch gap-2">
                        {optionButton}
                        <WordAudioButton
                          word={option}
                          label="播放选项"
                          compact
                          className="min-h-[54px] w-11 shrink-0 px-0 sm:w-12"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={option} className="flex items-stretch">
                      {optionButton}
                    </div>
                  );
                })}
              </div>

              {feedback ? (
                <section className="mt-6 rounded-md bg-coral-soft p-4 text-sm leading-6 text-coral-strong">
                  <p className="font-bold">正确答案：{feedback.correctAnswer}</p>
                  <p className="mt-1">{feedback.explain}</p>
                  <button
                    type="button"
                    onClick={onNext}
                    className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    下一题
                  </button>
                </section>
              ) : null}
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
