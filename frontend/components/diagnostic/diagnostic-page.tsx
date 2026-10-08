"use client";

import { ArrowLeft, CheckCircle2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { loadCurrentAccount } from "@/lib/account";
import { api } from "@/lib/api";
import type { DiagnosticPlan, Feedback } from "@/lib/types";

const moduleLabels: Record<string, string> = {
  words: "词汇",
  grammar: "语法",
  reading: "阅读",
};

export function DiagnosticPage() {
  const [diagnostic, setDiagnostic] = useState<DiagnosticPlan | null>(null);
  const [nextDiagnostic, setNextDiagnostic] = useState<DiagnosticPlan | null>(null);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const account = await loadCurrentAccount();
        if (!account) {
          window.location.href = "/login";
          return;
        }
        if (account.user.role !== "student" || !account.student) {
          window.location.href = "/";
          return;
        }
        const response = await api<{ diagnostic: DiagnosticPlan }>(
          `/api/diagnostic?studentId=${account.student.id}`,
        );
        setDiagnostic(response.diagnostic);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "诊断加载失败。");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const index = diagnostic?.currentIndex || 0;
  const question = diagnostic?.questions[index];

  async function answer(value: string) {
    if (!diagnostic?.sessionId || !question || submitting || feedback) return;
    setSelected(value);
    setSubmitting(true);
    setError("");
    try {
      const account = await loadCurrentAccount();
      if (!account?.student) throw new Error("学生账号已退出，请重新登录。");
      const response = await api<{
        result: Feedback;
        diagnostic: DiagnosticPlan;
      }>("/api/diagnostic/attempts", {
        method: "POST",
        body: JSON.stringify({
          studentId: account.student.id,
          sessionId: diagnostic.sessionId,
          questionId: question.id,
          answer: value,
        }),
      });
      setFeedback(response.result);
      setNextDiagnostic(response.diagnostic);
      if (response.result.correct) {
        window.setTimeout(() => advance(response.diagnostic), 550);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "答案提交失败。");
      setSelected("");
    } finally {
      setSubmitting(false);
    }
  }

  function advance(next = nextDiagnostic) {
    if (!next) return;
    setDiagnostic(next);
    setNextDiagnostic(null);
    setSelected("");
    setFeedback(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">正在准备分级诊断...</p>
      </main>
    );
  }

  if (error && !diagnostic) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <section className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-center">
          <h1 className="text-xl font-bold">暂时无法开始诊断</h1>
          <p className="mt-3 text-sm text-coral-strong">{error}</p>
          <a className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground" href="/">
            返回首页
          </a>
        </section>
      </main>
    );
  }

  if (diagnostic?.status === "completed") {
    const state = diagnostic.learningState;
    return (
      <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-14">
        <section className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
            <CheckCircle2 className="h-10 w-10 text-teal-600" aria-hidden="true" />
            <h1 className="mt-4 text-2xl font-black sm:text-3xl">诊断完成，起点已确定</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              后续练习会从这个起点开始，并根据真实答题表现逐步调整。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Result label="词频学习边界" value={`前 ${state.frequencyFrontier} 词`} />
              <Result label="题目难度" value={`第 ${state.questionLevel} 级`} />
              <Result label="词汇诊断" value={`${state.vocabularyScore ?? 0} 分`} />
              <Result label="语法 / 阅读" value={`${state.grammarScore ?? 0} / ${state.readingScore ?? 0} 分`} />
            </div>
            <a
              href="/"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:w-auto"
            >
              开始学习 <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!diagnostic || !question) return null;
  const total = diagnostic.questions.length;
  const progress = total ? Math.round((index / total) * 100) : 0;

  return (
    <main className="min-h-screen bg-background px-3 py-4 text-foreground sm:px-6 sm:py-8">
      <section className="mx-auto max-w-3xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <a href="/account" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 账号
          </a>
          <p className="text-sm font-semibold">首次分级诊断</p>
          <span className="text-sm tabular-nums text-muted-foreground">{index + 1} / {total}</span>
        </header>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <article className="mt-5 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-7">
          <p className="text-sm font-bold text-teal-700">{moduleLabels[question.module] || question.module}</p>
          {question.passage ? (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md bg-muted/60 p-4 text-sm leading-7 sm:text-base">
              {question.passage}
            </div>
          ) : null}
          <h1 className="mt-4 text-lg font-bold leading-8 sm:text-xl">{question.prompt}</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {question.options.map((option) => {
              const isSelected = selected === option;
              const isAnswer = feedback && option === feedback.correctAnswer;
              const style = isAnswer
                ? "border-teal-600 bg-teal-50 text-teal-900"
                : feedback && isSelected
                  ? "border-coral bg-coral-soft text-coral-strong"
                  : isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/60";
              return (
                <button
                  key={option}
                  type="button"
                  disabled={submitting || Boolean(feedback)}
                  onClick={() => void answer(option)}
                  className={`min-h-12 rounded-md border px-4 py-3 text-left text-sm font-semibold transition ${style}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {feedback ? (
            <div className={`mt-5 rounded-md p-4 text-sm ${feedback.correct ? "bg-teal-50 text-teal-900" : "bg-coral-soft text-coral-strong"}`}>
              <p className="font-bold">{feedback.correct ? "回答正确" : `正确答案：${feedback.correctAnswer}`}</p>
              {!feedback.correct && feedback.explain ? <p className="mt-2 leading-6">{feedback.explain}</p> : null}
            </div>
          ) : null}
          {error ? <p className="mt-4 text-sm text-coral-strong">{error}</p> : null}
          {feedback && !feedback.correct ? (
            <button
              type="button"
              onClick={() => advance()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:w-auto"
            >
              下一题 <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </article>
      </section>
    </main>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}
