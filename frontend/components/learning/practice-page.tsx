"use client";

import { useEffect, useRef, useState } from "react";

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
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 sm:py-5">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] max-w-3xl flex-col sm:min-h-[calc(100vh-40px)]">
        <header className="flex items-center justify-between gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onExit}
            className="rounded-md border border-border bg-card px-3 py-2.5 text-sm font-semibold transition hover:border-primary/50"
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
                  className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:py-2"
                >
                  再来一轮
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-md border border-border bg-card px-4 py-3 text-sm font-semibold sm:py-2"
                >
                  回到首页
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-4 sm:py-8">
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
                <p className="mt-4 rounded-md bg-secondary p-3 text-sm leading-7 text-secondary-foreground sm:mt-5 sm:p-4">
                  {question.passage}
                </p>
              ) : null}

              <h1 className="mt-5 break-words text-xl font-black leading-snug tracking-tight sm:text-3xl sm:leading-tight">
                {question.prompt}
              </h1>
              {speakWord ? (
                <div className="mt-4">
                  <WordAudioButton word={speakWord} label="播放单词" />
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 sm:mt-6">
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
                      className={`min-h-[58px] min-w-0 flex-1 break-words rounded-md border px-3 py-3 text-left text-sm font-semibold leading-6 transition sm:px-4 sm:py-4 sm:text-base ${
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
                          className="min-h-[58px] w-11 shrink-0 px-0 sm:w-12"
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
                    className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:w-auto sm:py-2"
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

export function SpellingPracticePage({
  title,
  completionLabel,
  completionTitle,
  wrongLabel,
  questions,
  currentIndex,
  correctCount,
  wrongCount,
  onAnswer,
  onExit,
  onRestart,
}: {
  title: string;
  completionLabel: string;
  completionTitle: string;
  wrongLabel: string;
  questions: PracticeItem[];
  currentIndex: number;
  correctCount: number;
  wrongCount: number;
  onAnswer: (question: PracticeItem, answer: string) => Promise<Feedback | null>;
  onExit: () => void;
  onRestart: () => void;
}) {
  const question = questions[currentIndex];
  const isComplete = currentIndex >= questions.length;
  const totalAnswered = correctCount + wrongCount;
  const encouragement = getCompletionEncouragement(correctCount, wrongCount);
  const progress =
    questions.length === 0
      ? 100
      : Math.round((Math.min(currentIndex, questions.length) / questions.length) * 100);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [hasError, setHasError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastSubmittedAnswerRef = useRef("");
  const phonetic = question?.vocabulary?.find(Boolean) || "";
  const answerLength = Math.max(1, Number(question?.answerLength || 0));
  const spellingPattern = question?.spellingPattern || "_".repeat(answerLength);
  let nextInputIndex = 0;
  const spellingSlots = Array.from(spellingPattern).map((character) => ({
    character,
    inputIndex: character === "_" ? nextInputIndex++ : null,
  }));

  useEffect(() => {
    setTypedAnswer("");
    setWrongAttempts(0);
    setCorrectAnswer("");
    setHasError(false);
    lastSubmittedAnswerRef.current = "";
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [question?.id]);

  async function submitAnswer(answer: string) {
    if (!question || submitting || answer.length !== answerLength) return;
    if (lastSubmittedAnswerRef.current === answer) return;

    lastSubmittedAnswerRef.current = answer;
    setSubmitting(true);
    let letterIndex = 0;
    const submittedAnswer = Array.from(spellingPattern)
      .map((character) =>
        character === "_" ? answer[letterIndex++] || "" : character,
      )
      .join("");
    const result = await onAnswer(question, submittedAnswer);
    setSubmitting(false);

    if (!result) return;
    if (result.correct) return;

    const nextWrongAttempts = wrongAttempts + 1;
    setWrongAttempts(nextWrongAttempts);
    setCorrectAnswer(result.correctAnswer);
    setHasError(true);
  }

  function updateSpellingAnswer(value: string) {
    const nextAnswer = value
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, answerLength);

    setTypedAnswer(nextAnswer);
    setHasError(false);

    if (nextAnswer.length === answerLength) {
      void submitAnswer(nextAnswer);
    }
  }

  if (isComplete) {
    return (
      <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 sm:py-5">
        <section className="mx-auto flex min-h-[calc(100vh-32px)] max-w-5xl flex-col justify-center sm:min-h-[calc(100vh-40px)]">
          <section className="w-full rounded-lg border border-border bg-card p-4 text-center shadow-sm sm:p-6">
            <p className="text-sm font-semibold text-teal-700">{completionLabel}</p>
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
                <p className="mt-2 text-3xl font-black">{totalAnswered}</p>
              </div>
              <div className="rounded-md border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">答对</p>
                <p className="mt-2 text-3xl font-black text-teal-700">
                  {correctCount}
                </p>
              </div>
              <div className="rounded-md border border-border bg-background p-4 sm:col-span-2">
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
                className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:py-2"
              >
                再来一轮
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-md border border-border bg-card px-4 py-3 text-sm font-semibold sm:py-2"
              >
                回到首页
              </button>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 sm:py-5">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] max-w-5xl flex-col sm:min-h-[calc(100vh-40px)]">
        <header className="flex items-center justify-between gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onExit}
            className="rounded-md border border-border bg-card px-3 py-2.5 text-sm font-semibold transition hover:border-primary/50"
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

        <div className="flex flex-1 items-center justify-center py-4 sm:py-8">
          <article className="w-full rounded-lg border border-border bg-card p-4 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">
                {title}
              </span>
              <span className="text-sm text-muted-foreground">
                错误 {wrongAttempts}/3
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-sm font-semibold text-teal-700">中文意思</p>
              {phonetic ? (
                <p className="text-base font-semibold text-muted-foreground">
                  音标：{phonetic}
                </p>
              ) : null}
            </div>
            <h1 className="mt-2 break-words text-xl font-black leading-snug tracking-tight sm:text-3xl sm:leading-tight">
              {question.prompt.replace(/^根据中文意思拼写单词：/, "")}
            </h1>
            <div className="mt-7">
              <div
                onClick={() => inputRef.current?.focus()}
                className="relative grid w-full cursor-text grid-cols-[repeat(auto-fit,minmax(1.5rem,1fr))] justify-items-center gap-x-2 gap-y-4 rounded-md bg-background p-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-3 sm:p-5"
                aria-label="拼写输入框"
              >
                {spellingSlots.map((slot, index) =>
                  slot.inputIndex === null ? (
                    <span
                      key={`${question.id}-${index}`}
                      className="flex h-14 items-end justify-center pb-1 text-xl font-black text-muted-foreground"
                      aria-hidden="true"
                    >
                      {slot.character}
                    </span>
                  ) : (
                    <span
                      key={`${question.id}-${index}`}
                      className={`relative flex h-14 w-full max-w-8 items-center justify-center border-b-2 pt-3 text-lg font-black uppercase sm:w-10 sm:max-w-none sm:text-xl md:w-11 ${
                        hasError
                          ? "border-coral text-coral-strong"
                          : "border-foreground text-foreground"
                      }`}
                    >
                      {!submitting && typedAnswer.length === slot.inputIndex ? (
                        <span
                          className={`absolute top-0 h-5 w-0.5 animate-pulse rounded-full ${
                            hasError ? "bg-coral" : "bg-primary"
                          }`}
                          aria-hidden="true"
                        />
                      ) : null}
                      {typedAnswer[slot.inputIndex] || ""}
                    </span>
                  ),
                )}
                <input
                  ref={inputRef}
                  value={typedAnswer}
                  onChange={(event) => updateSpellingAnswer(event.target.value)}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  aria-label="输入英文拼写"
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                输入 {answerLength} 个字母后会自动检查
              </p>
              {submitting ? (
                <p className="mt-2 text-center text-sm font-semibold text-teal-700">
                  正在检查拼写
                </p>
              ) : null}
            </div>

            {hasError ? (
              <section className="mt-5 rounded-md bg-coral-soft p-4 text-sm leading-6 text-coral-strong">
                <p className="font-bold">拼写不正确，请再试一次。</p>
                {wrongAttempts >= 3 && correctAnswer ? (
                  <p className="mt-2">
                    正确单词：<span className="font-black">{correctAnswer}</span>
                  </p>
                ) : null}
              </section>
            ) : null}
          </article>
        </div>
      </section>
    </main>
  );
}
