"use client";

import { useMemo, useState } from "react";

const modules = [
  { id: "daily", name: "今日任务", detail: "10-20 分钟完成一个小闭环" },
  { id: "words", name: "词汇练习", detail: "认读、拼写、例句一起练" },
  { id: "grammar", name: "语法基础", detail: "先理解，再做题巩固" },
  { id: "reading", name: "分级阅读", detail: "短文 + 生词 + 题目解析" },
  { id: "mistakes", name: "错题本", detail: "自动收集薄弱点" },
];

const dailyTasks = [
  { title: "核心词汇", amount: "8 题", progress: 75 },
  { title: "be 动词专项", amount: "6 题", progress: 48 },
  { title: "50 词阅读", amount: "1 篇", progress: 20 },
];

const wordQuestions = [
  {
    id: "w1",
    prompt: "Choose the meaning of \"borrow\".",
    answer: "借入",
    options: ["归还", "借入", "购买", "丢失"],
    explain: "borrow 表示“借入”，常见搭配是 borrow sth. from sb.。",
  },
  {
    id: "w2",
    prompt: "Which word means “足够的”?",
    answer: "enough",
    options: ["early", "enough", "every", "empty"],
    explain: "enough 可以作形容词或副词，表示“足够的/足够地”。",
  },
];

const grammarQuestions = [
  {
    id: "g1",
    prompt: "My sister ____ a new bike.",
    answer: "has",
    options: ["have", "has", "is", "are"],
    explain: "主语 My sister 是第三人称单数，一般现在时用 has。",
  },
  {
    id: "g2",
    prompt: "There ____ some milk in the glass.",
    answer: "is",
    options: ["is", "are", "am", "be"],
    explain: "milk 是不可数名词，There be 句型中 be 动词用 is。",
  },
];

const readingQuestions = [
  {
    id: "r1",
    prompt: "What is the passage mainly about?",
    answer: "A student starts a simple English plan.",
    options: [
      "A student buys a new phone.",
      "A student starts a simple English plan.",
      "A teacher visits a family.",
      "A class goes to the park.",
    ],
    explain: "短文围绕 Li Ming 每天听一句、背五个词、读一小段展开。",
  },
];

const readingText =
  "Li Ming is in Grade Eight. English is difficult for him, so he starts with small steps. Every morning, he listens to one short sentence and reads it aloud. After school, he reviews five words and writes two simple sentences. After two weeks, he can understand more in class.";

const ability = [
  { label: "词汇掌握", value: 62, color: "bg-teal-500" },
  { label: "语法基础", value: 45, color: "bg-coral" },
  { label: "阅读理解", value: 38, color: "bg-amber-400" },
  { label: "听力跟读", value: 28, color: "bg-sky-500" },
];

type PracticeItem = (typeof wordQuestions)[number];

export default function Home() {
  const [activeModule, setActiveModule] = useState("daily");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(
    {},
  );
  const [mistakes, setMistakes] = useState<PracticeItem[]>([]);

  const activeQuestions = useMemo(() => {
    if (activeModule === "grammar") return grammarQuestions;
    if (activeModule === "reading") return readingQuestions;
    return wordQuestions;
  }, [activeModule]);

  function answerQuestion(question: PracticeItem, option: string) {
    setSelectedAnswers((current) => ({ ...current, [question.id]: option }));
    if (option !== question.answer) {
      setMistakes((current) =>
        current.some((item) => item.id === question.id)
          ? current
          : [...current, question],
      );
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              English Step
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              基础英语练习站
            </h1>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              连续学习 6 天
            </span>
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px]">
              开始 15 分钟
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:px-8">
        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          <nav className="grid gap-2" aria-label="学习模块">
            {modules.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={`rounded-md border px-4 py-3 text-left transition ${
                  activeModule === module.id
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:border-primary/45"
                }`}
              >
                <span className="block text-sm font-semibold">
                  {module.name}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    activeModule === module.id
                      ? "text-primary-foreground/78"
                      : "text-muted-foreground"
                  }`}
                >
                  {module.detail}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-5">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="relative min-h-[230px]">
              <img
                src="/study-banner.png"
                alt="英语学习桌面横幅"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/20 to-white/88" />
              <div className="relative ml-auto flex min-h-[230px] max-w-md flex-col justify-center px-5 py-8 sm:px-8">
                <p className="text-sm font-semibold text-teal-700">
                  为基础薄弱学生设计
                </p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  每天一点点，把英语补回来
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  从词汇、语法和短阅读开始，题目小步递进，错题自动沉淀为下一次复习。
                </p>
              </div>
            </div>
          </div>

          {activeModule === "daily" ? (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-teal-700">
                    今日推荐
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    15 分钟基础巩固
                  </h2>
                </div>
                <span className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                  目标正确率 80%
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {dailyTasks.map((task) => (
                  <article
                    key={task.title}
                    className="rounded-md border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <span className="text-sm text-muted-foreground">
                        {task.amount}
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-teal-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      已完成 {task.progress}%
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeModule === "reading" ? (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-semibold text-teal-700">
                Level A1-A2
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                小步阅读：A Small English Plan
              </h2>
              <p className="mt-4 rounded-md bg-secondary p-4 text-sm leading-7 text-secondary-foreground">
                {readingText}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["difficult 困难的", "small steps 小步骤", "review 复习"].map(
                  (word) => (
                    <span
                      key={word}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      {word}
                    </span>
                  ),
                )}
              </div>
            </section>
          ) : null}

          {activeModule === "mistakes" ? (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="text-2xl font-bold tracking-tight">错题本</h2>
              {mistakes.length === 0 ? (
                <p className="mt-3 rounded-md bg-secondary p-4 text-sm text-muted-foreground">
                  还没有错题。做错的词汇、语法和阅读题会自动出现在这里。
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {mistakes.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-md border border-border bg-background p-4"
                    >
                      <h3 className="font-semibold">{item.prompt}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        正确答案：{item.answer}
                      </p>
                      <p className="mt-2 text-sm text-coral-strong">
                        {item.explain}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <PracticePanel
              title={
                activeModule === "grammar"
                  ? "语法专项练习"
                  : activeModule === "reading"
                    ? "阅读理解题"
                    : "词汇快练"
              }
              questions={activeQuestions}
              selectedAnswers={selectedAnswers}
              onAnswer={answerQuestion}
            />
          )}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">能力雷达</h2>
            <div className="mt-4 space-y-4">
              {ability.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <span
                      className={`block h-full rounded-full ${item.color}`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">下一步建议</h2>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>先把高频动词和课堂常见名词练熟。</li>
              <li>语法从一般现在时和 There be 开始。</li>
              <li>阅读控制在 50-100 词，先保证看懂大意。</li>
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">错题数量</h2>
              <span className="text-3xl font-black text-coral-strong">
                {mistakes.length}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              题目答错后会自动加入错题本，方便安排第二天复习。
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function PracticePanel({
  title,
  questions,
  selectedAnswers,
  onAnswer,
}: {
  title: string;
  questions: PracticeItem[];
  selectedAnswers: Record<string, string>;
  onAnswer: (question: PracticeItem, option: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">
          做完立刻看解析
        </span>
      </div>
      <div className="mt-5 space-y-4">
        {questions.map((question, index) => {
          const selected = selectedAnswers[question.id];
          const isCorrect = selected === question.answer;

          return (
            <article
              key={question.id}
              className="rounded-md border border-border bg-background p-4"
            >
              <p className="text-sm font-semibold text-muted-foreground">
                Question {index + 1}
              </p>
              <h3 className="mt-2 text-lg font-bold">{question.prompt}</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const isSelected = selected === option;
                  const isAnswer = question.answer === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onAnswer(question, option)}
                      className={`rounded-md border px-3 py-3 text-left text-sm font-semibold transition ${
                        isSelected && isAnswer
                          ? "border-teal-500 bg-teal-50 text-teal-800"
                          : isSelected
                            ? "border-coral bg-coral-soft text-coral-strong"
                            : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {selected ? (
                <div
                  className={`mt-4 rounded-md p-4 text-sm leading-6 ${
                    isCorrect
                      ? "bg-teal-50 text-teal-800"
                      : "bg-coral-soft text-coral-strong"
                  }`}
                >
                  <strong>{isCorrect ? "答对了。" : "先别急。"}</strong>{" "}
                  {question.explain}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
