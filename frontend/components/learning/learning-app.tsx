"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import { PracticePage } from "@/components/learning/practice-page";
import { WordAudioButton } from "@/components/learning/word-audio-button";
import { loadCurrentAccount } from "@/lib/account";
import { api } from "@/lib/api";
import { getQuestionSpeakWord } from "@/lib/speech";
import type {
  AccountPayload,
  DailyPlan,
  DailyTask,
  Feedback,
  ImportSummary,
  Mistake,
  ParentReport,
  PracticeItem,
  PracticeKind,
  ProgressItem,
  Student,
  StudySummary,
  VocabularyItem,
} from "@/lib/types";

const modules = [
  {
    id: "daily",
    name: "今日任务",
    detail: "10-20 分钟完成一个小闭环",
    href: "/",
    roles: ["student"],
  },
  {
    id: "words",
    name: "词汇练习",
    detail: "先学词，再做题",
    href: "/vocabulary",
    roles: ["student"],
  },
  {
    id: "grammar",
    name: "语法基础",
    detail: "先理解，再做题巩固",
    href: "/grammar",
    roles: ["student"],
  },
  {
    id: "reading",
    name: "分级阅读",
    detail: "短文 + 生词 + 题目解析",
    href: "/reading",
    roles: ["student"],
  },
  {
    id: "mistakes",
    name: "错题本",
    detail: "自动收集薄弱点",
    href: "/mistakes",
    roles: ["student"],
  },
  {
    id: "parent",
    name: "家长查看",
    detail: "最近学习表现",
    href: "/parent",
    roles: ["parent"],
  },
  {
    id: "admin",
    name: "词库管理",
    detail: "导入词汇并自动生成题目",
    href: "/admin/vocabulary",
    roles: ["admin"],
  },
] as const;

const moduleLabels: Record<string, string> = {
  words: "词汇掌握",
  grammar: "语法基础",
  reading: "阅读理解",
};

const moduleColors: Record<string, string> = {
  words: "bg-teal-500",
  grammar: "bg-coral",
  reading: "bg-amber-400",
};

const sampleCsv = `word,meaning,partOfSpeech,example,grade,sourceBook,sourceUnit,difficulty,tags
borrow,借入,verb,I borrow a book from the library.,八年级,人教版,Unit 2,1,高频动词
enough,足够的,adj,We have enough time.,八年级,人教版,Unit 2,1,形容词
healthy,健康的,adj,Eating vegetables is healthy.,七年级,人教版,Unit 6,1,生活词汇`;

type ModuleId = (typeof modules)[number]["id"];
type ModuleRole = (typeof modules)[number]["roles"][number];

function canRoleViewModule(role: string | undefined, moduleId: ModuleId) {
  const module = modules.find((item) => item.id === moduleId);
  return Boolean(role && module?.roles.includes(role as ModuleRole));
}

function moduleFromPath(pathname: string): ModuleId | null {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const navModule = modules.find((item) => item.href === normalizedPath);
  return navModule?.id || null;
}

function shouldUseBrowserNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

function childToStudent(child: NonNullable<AccountPayload["children"]>[number]) {
  return {
    id: child.user.id,
    name: child.user.name,
    grade: child.profile.grade,
    level: child.profile.level,
  };
}

export function LearningApp({
  initialModule = "daily",
  autoStartPractice = null,
}: {
  initialModule?: ModuleId;
  autoStartPractice?: PracticeKind | null;
}) {
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);
  const [student, setStudent] = useState<Student | null>(null);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [questionsByModule, setQuestionsByModule] = useState<
    Record<string, PracticeItem[]>
  >({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(
    {},
  );
  const [feedbackById, setFeedbackById] = useState<Record<string, Feedback>>(
    {},
  );
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [csvInput, setCsvInput] = useState(sampleCsv);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [adminQuestions, setAdminQuestions] = useState<PracticeItem[]>([]);
  const [studyVocabulary, setStudyVocabulary] = useState<VocabularyItem[]>([]);
  const [studySummary, setStudySummary] = useState<StudySummary | null>(null);
  const [parentReport, setParentReport] = useState<ParentReport | null>(null);
  const [practiceKind, setPracticeKind] = useState<PracticeKind | null>(null);
  const [dailyQueue, setDailyQueue] = useState<PracticeItem[]>([]);
  const [dailyIndex, setDailyIndex] = useState(0);
  const [dailyFeedback, setDailyFeedback] = useState<Feedback | null>(null);
  const [dailySelected, setDailySelected] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyCorrect, setDailyCorrect] = useState(0);
  const [dailyWrong, setDailyWrong] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const autoStartedRef = useRef(false);
  const practiceProfileRefreshRef = useRef(false);
  const currentRole = account?.user.role;
  const visibleModules = useMemo(
    () => modules.filter((module) => module.roles.includes(currentRole as ModuleRole)),
    [currentRole],
  );
  const canViewActiveModule = canRoleViewModule(currentRole, activeModule);

  const activeQuestions = useMemo(() => {
    if (
      activeModule === "daily" ||
      activeModule === "mistakes" ||
      activeModule === "parent" ||
      activeModule === "admin"
    ) {
      return questionsByModule.words || [];
    }
    return questionsByModule[activeModule] || [];
  }, [activeModule, questionsByModule]);

  const readingQuestion = useMemo(
    () => (questionsByModule.reading || [])[0],
    [questionsByModule],
  );

  const ability = useMemo(() => {
    const fromApi = progress.map((item) => ({
      label: moduleLabels[item.module] || item.module,
      value: item.mastery,
      color: moduleColors[item.module] || "bg-sky-500",
    }));

    return [
      ...fromApi,
      { label: "听力跟读", value: 0, color: "bg-sky-500" },
    ];
  }, [progress]);

  useEffect(() => {
    async function boot() {
      try {
        const currentAccount = await loadCurrentAccount().catch(() => null);
        setAccount(currentAccount);
        if (!currentAccount) {
          setApiError("请先登录账号。");
          return;
        }

        if (currentAccount.user.role === "student") {
          if (!currentAccount.student) {
            setApiError("学生档案不完整，请重新登录或检查账号。");
            return;
          }

          setStudent(currentAccount.student);
          await Promise.all([
            loadProfile(currentAccount.student.id),
            loadQuestions(currentAccount.student.id, "words"),
            loadQuestions(currentAccount.student.id, "reading"),
          ]);
          return;
        }

        if (currentAccount.user.role === "parent") {
          const firstChild = currentAccount.children?.[0];
          if (firstChild) {
            const childStudent = childToStudent(firstChild);
            setStudent(childStudent);
            if (initialModule === "parent") {
              await loadParentReport(childStudent.id);
            }
          }
          return;
        }
      } catch (error) {
        setApiError(
          error instanceof Error
            ? error.message
            : "后端连接失败，请确认 API 已启动。",
        );
      } finally {
        setLoading(false);
      }
    }

    boot();
  }, []);

  useEffect(() => {
    setActiveModule(initialModule);
  }, [initialModule]);

  useEffect(() => {
    function syncModuleFromHistory() {
      const nextModule = moduleFromPath(window.location.pathname);
      if (!nextModule) return;

      setPracticeKind(null);
      setActiveModule(nextModule);
    }

    window.addEventListener("popstate", syncModuleFromHistory);
    return () => window.removeEventListener("popstate", syncModuleFromHistory);
  }, []);

  useEffect(() => {
    if (
      !student ||
      !canViewActiveModule ||
      activeModule === "daily" ||
      activeModule === "mistakes" ||
      activeModule === "parent" ||
      activeModule === "admin" ||
      questionsByModule[activeModule]?.length
    ) {
      return;
    }

    loadQuestions(student.id, activeModule).catch((error) => {
      setApiError(error instanceof Error ? error.message : "题目加载失败。");
    });
  }, [activeModule, canViewActiveModule, questionsByModule, student]);

  useEffect(() => {
    if (
      !student ||
      !canViewActiveModule ||
      activeModule !== "words" ||
      studyVocabulary.length > 0
    ) {
      return;
    }
    loadStudyVocabulary(student.id).catch((error) => {
      setApiError(error instanceof Error ? error.message : "词汇学习内容加载失败。");
    });
  }, [activeModule, canViewActiveModule, student, studyVocabulary.length]);

  useEffect(() => {
    if (!student || !canViewActiveModule || activeModule !== "parent") return;
    loadParentReport(student.id).catch((error) => {
      setApiError(error instanceof Error ? error.message : "家长报告加载失败。");
    });
  }, [activeModule, canViewActiveModule, student]);

  useEffect(() => {
    if (
      !student ||
      !canViewActiveModule ||
      !autoStartPractice ||
      autoStartedRef.current
    ) {
      return;
    }

    autoStartedRef.current = true;
    if (autoStartPractice === "daily") {
      void startDailyPractice();
      return;
    }
    if (autoStartPractice === "mistakes") {
      void startMistakePractice();
      return;
    }
    void startModulePractice(autoStartPractice);
  }, [autoStartPractice, canViewActiveModule, student]);

  async function loadProfile(studentId: string) {
    const profile = await api<{
      progress: ProgressItem[];
      tasks: DailyTask[];
      summary: StudySummary;
    }>(`/api/students/${studentId}/profile`);
    const mistakeList = await api<{ mistakes: Mistake[] }>(
      `/api/students/${studentId}/mistakes`,
    );

    setDailyTasks(profile.tasks);
    setProgress(profile.progress);
    setStudySummary(profile.summary);
    setMistakes(mistakeList.mistakes);
  }

  async function loadStudyVocabulary(studentId: string) {
    const response = await api<{ vocabulary: VocabularyItem[] }>(
      `/api/vocabulary/study?studentId=${studentId}&limit=12`,
    );
    setStudyVocabulary(response.vocabulary);
  }

  async function loadParentReport(studentId: string) {
    const response = await api<{ report: ParentReport }>(
      `/api/students/${studentId}/parent-report`,
    );
    setParentReport(response.report);
  }

  async function loadQuestions(studentId: string, module: string) {
    const response = await api<{ questions: PracticeItem[] }>(
      `/api/questions?studentId=${studentId}&module=${module}&limit=5`,
    );

    setQuestionsByModule((current) => ({
      ...current,
      [module]: response.questions,
    }));
  }

  function refreshProfileAfterPractice() {
    if (!student || practiceProfileRefreshRef.current) return;

    practiceProfileRefreshRef.current = true;
    loadProfile(student.id).catch(() => null);
  }

  function preparePracticeStart() {
    setPracticeKind(null);
    setDailyQueue([]);
    setDailyIndex(0);
    setDailyFeedback(null);
    setDailySelected("");
    setDailyCorrect(0);
    setDailyWrong(0);
    practiceProfileRefreshRef.current = false;
    setDailyLoading(true);
    setApiError("");
  }

  function navigateToModule(
    event: MouseEvent<HTMLAnchorElement>,
    navModule: (typeof modules)[number],
  ) {
    if (shouldUseBrowserNavigation(event)) return;

    event.preventDefault();
    setPracticeKind(null);
    setActiveModule(navModule.id);

    if (window.location.pathname !== navModule.href) {
      window.history.pushState({}, "", navModule.href);
    }
  }

  async function answerQuestion(question: PracticeItem, option: string) {
    if (!student) return;

    setSelectedAnswers((current) => ({ ...current, [question.id]: option }));

    try {
      const response = await api<{
        result: Feedback;
        progress: ProgressItem[];
        mistakes: Mistake[];
      }>("/api/attempts", {
        method: "POST",
        body: JSON.stringify({
          studentId: student.id,
          questionId: question.id,
          answer: option,
        }),
      });

      setFeedbackById((current) => ({
        ...current,
        [question.id]: response.result,
      }));
      setProgress(response.progress);
      setMistakes(response.mistakes);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "答题提交失败。");
    }
  }

  async function reloadActiveQuestions() {
    if (!student) return;
    const module =
      activeModule === "daily" ||
      activeModule === "mistakes" ||
      activeModule === "admin"
        ? "words"
        : activeModule;

    setSelectedAnswers({});
    setFeedbackById({});
    await loadQuestions(student.id, module);
  }

  async function startDailyPractice() {
    if (!student) return;

    preparePracticeStart();

    try {
      const response = await api<{ plan: DailyPlan }>(
        `/api/daily-plan?studentId=${student.id}`,
      );
      const queue = response.plan.questions;

      setDailyQueue(queue);
      setDailyTasks(response.plan.tasks);
      setPracticeKind("daily");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "今日任务加载失败。");
    } finally {
      setDailyLoading(false);
    }
  }

  async function startMistakePractice() {
    if (!student) return;

    preparePracticeStart();

    try {
      const response = await api<{ mistakes: Mistake[] }>(
        `/api/students/${student.id}/mistakes`,
      );
      const queue = response.mistakes
        .map((mistake) => mistake.question)
        .filter((question): question is PracticeItem => Boolean(question));

      setMistakes(response.mistakes);
      setDailyQueue(shuffleQuestions(queue));
      setPracticeKind("mistakes");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "错题训练加载失败。");
    } finally {
      setDailyLoading(false);
    }
  }

  async function startModulePractice(module: "words" | "grammar" | "reading") {
    if (!student) return;

    preparePracticeStart();

    const limit = module === "reading" ? 5 : 10;

    try {
      const response = await api<{ questions: PracticeItem[] }>(
        `/api/questions?studentId=${student.id}&module=${module}&limit=${limit}`,
      );

      setDailyQueue(shuffleQuestions(response.questions));
      setPracticeKind(module);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "专项练习加载失败。");
    } finally {
      setDailyLoading(false);
    }
  }

  async function answerDailyQuestion(question: PracticeItem, option: string) {
    if (!student || dailyFeedback || dailySelected) return;

    setDailySelected(option);

    try {
      const response = await api<{
        result: Feedback;
        progress: ProgressItem[];
        mistakes: Mistake[];
      }>("/api/attempts", {
        method: "POST",
        body: JSON.stringify({
          studentId: student.id,
          questionId: question.id,
          answer: option,
        }),
      });

      setProgress(response.progress);
      setMistakes(response.mistakes);

      if (response.result.correct) {
        setDailyCorrect((count) => count + 1);
        goToNextDailyQuestion();
      } else {
        setDailyWrong((count) => count + 1);
        setDailyFeedback(response.result);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "答题提交失败。");
    }
  }

  function goToNextDailyQuestion() {
    setDailyFeedback(null);
    setDailySelected("");
    const nextIndex = Math.min(dailyIndex + 1, dailyQueue.length);
    setDailyIndex(nextIndex);
    if (nextIndex >= dailyQueue.length) {
      refreshProfileAfterPractice();
    }
  }

  function exitDailyPractice() {
    setPracticeKind(null);
    setDailyFeedback(null);
    setDailySelected("");
    refreshProfileAfterPractice();
  }

  async function importVocabulary() {
    setImporting(true);
    setApiError("");

    try {
      const summary = await api<ImportSummary>("/api/admin/vocabulary/import", {
        method: "POST",
        body: JSON.stringify(buildVocabularyImportPayload(csvInput)),
      });
      setImportSummary(summary);

      const questions = await api<{ questions: PracticeItem[] }>(
        "/api/admin/questions?module=words&limit=12",
      );
      setAdminQuestions(questions.questions);

      if (student) {
        await loadQuestions(student.id, "words");
        await loadStudyVocabulary(student.id);
        await loadProfile(student.id);
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "词库导入失败。");
    } finally {
      setImporting(false);
    }
  }

  if (practiceKind) {
    const practiceCopy = getPracticeCopy(practiceKind);
    return (
      <PracticePage
        title={practiceCopy.title}
        completionLabel={practiceCopy.completionLabel}
        completionTitle={practiceCopy.completionTitle}
        wrongLabel={practiceCopy.wrongLabel}
        questions={dailyQueue}
        currentIndex={dailyIndex}
        selectedAnswer={dailySelected}
        feedback={dailyFeedback}
        correctCount={dailyCorrect}
        wrongCount={dailyWrong}
        onAnswer={answerDailyQuestion}
        onNext={goToNextDailyQuestion}
        onExit={exitDailyPractice}
        onRestart={
          practiceKind === "mistakes"
            ? startMistakePractice
            : practiceKind === "daily"
              ? startDailyPractice
              : () => startModulePractice(practiceKind)
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              English Step
            </p>
            <h1 className="text-lg font-bold tracking-tight sm:text-2xl">
              基础英语练习站
            </h1>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {account ? (
              <span className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                {account.user.name} · {account.user.role}
              </span>
            ) : null}
            <a
              href={account ? "/account" : "/login"}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50"
            >
              {account ? "账号" : "登录"}
            </a>
            {/* {currentRole === "student" ? (
              <button
                type="button"
                onClick={startDailyPractice}
                disabled={!student || dailyLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {dailyLoading ? "准备中" : "开始 15 分钟"}
              </button>
            ) : null} */}
          </div>
        </div>
      </header>

      <div
        className={`mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:px-8 ${
          account
            ? "lg:grid-cols-[260px_minmax(0,1fr)_300px]"
            : "lg:grid-cols-1"
        }`}
      >
        {visibleModules.length > 0 ? (
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <nav
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 lg:grid lg:overflow-visible lg:pb-0"
              aria-label="学习模块"
            >
              {visibleModules.map((module) => (
                <a
                  key={module.id}
                  href={module.href}
                  onClick={(event) => navigateToModule(event, module)}
                  className={`w-[150px] shrink-0 rounded-md border px-3 py-3 text-left transition sm:w-[170px] lg:w-auto ${
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
                </a>
              ))}
            </nav>
          </aside>
        ) : null}

        <section className="min-w-0 space-y-4 sm:space-y-5">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="relative min-h-[190px] sm:min-h-[230px]">
              <img
                src="/study-banner.webp"
                alt="英语学习桌面横幅"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-white/55 to-white/92 sm:from-white/10 sm:via-white/20 sm:to-white/88" />
              <div className="relative ml-auto flex min-h-[190px] max-w-md flex-col justify-center px-4 py-6 sm:min-h-[230px] sm:px-8 sm:py-8">
                <p className="text-sm font-semibold text-teal-700">
                  为基础薄弱学生设计
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  每天一点点，把英语补回来
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  从词汇、语法和短阅读开始，题目小步递进，错题自动沉淀为下一次复习。
                </p>
              </div>
            </div>
          </div>

          {apiError ? (
            <div className="rounded-md border border-coral bg-coral-soft p-4 text-sm text-coral-strong">
              {apiError}
            </div>
          ) : null}

          {!loading && !account ? (
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="text-2xl font-bold tracking-tight">
                请先登录账号
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                登录后会根据账号身份显示可访问的学习或管理页面。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="/login"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  去登录
                </a>
                <a
                  href="/register"
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold"
                >
                  注册账号
                </a>
              </div>
            </section>
          ) : null}

          {!loading && account && !canViewActiveModule ? (
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="text-2xl font-bold tracking-tight">没有访问权限</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                当前账号身份是 {account.user.role}，不能访问这个页面。请从左侧菜单进入当前身份可用的模块。
              </p>
            </section>
          ) : null}

          {loading ? (
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <h2 className="text-2xl font-bold tracking-tight">
                正在连接学习后端
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                正在读取学生档案、每日任务和推荐题目。
              </p>
            </section>
          ) : null}

          {activeModule === "daily" && !loading && student && canViewActiveModule ? (
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-teal-700">
                    今日推荐
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    15 分钟基础巩固
                  </h2>
                </div>
                <span className="w-full rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground sm:w-auto">
                  来自后端的个性化任务
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {dailyTasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-md border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <span className="text-sm text-muted-foreground">
                        {task.completed}/{task.target}
                      </span>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-teal-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {task.mistakeCount > 0
                        ? `待复习错题 ${task.mistakeCount} 道`
                        : "暂无待复习错题"}
                    </p>
                  </article>
                ))}
              </div>
              <button
                type="button"
                onClick={startDailyPractice}
                disabled={!student || dailyLoading}
                className="mt-5 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {dailyLoading ? "正在准备题目" : "进入今日任务练习"}
              </button>
            </section>
          ) : null}

          {canViewActiveModule &&
          (activeModule === "words" ||
            activeModule === "grammar" ||
            activeModule === "reading") ? (
            <>
              <ModuleOverview
                module={activeModule}
                mastery={
                  progress.find((item) => item.module === activeModule)?.mastery || 0
                }
                total={
                  progress.find((item) => item.module === activeModule)?.total || 0
                }
                correct={
                  progress.find((item) => item.module === activeModule)?.correct || 0
                }
                mistakeCount={
                  mistakes.filter((item) => item.module === activeModule).length
                }
                loading={dailyLoading}
                onStart={() => startModulePractice(activeModule)}
              />
              {activeModule === "words" ? (
                <VocabularyStudyPanel
                  vocabulary={studyVocabulary}
                  onReload={() => student && loadStudyVocabulary(student.id)}
                />
              ) : null}
            </>
          ) : null}

          {canViewActiveModule && activeModule === "admin" ? (
            <AdminPanel
              csvInput={csvInput}
              importing={importing}
              importSummary={importSummary}
              questions={adminQuestions}
              onCsvChange={setCsvInput}
              onImport={importVocabulary}
            />
          ) : canViewActiveModule && activeModule === "parent" ? (
            <ParentReportPanel report={parentReport} />
          ) : canViewActiveModule && activeModule === "mistakes" ? (
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-teal-700">
                    待复习 {mistakes.length} 道
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">
                    错题本
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={startMistakePractice}
                  disabled={mistakes.length === 0 || dailyLoading}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {dailyLoading ? "准备中" : "开始错题专项训练"}
                </button>
              </div>
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
                      <h3 className="font-semibold">
                        {item.question?.prompt || item.questionId}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        你的答案：{item.wrongAnswer} · 知识点：
                        {item.knowledgePoint}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        复习进度：连续答对 {item.correctReviewStreak}/2 次后移出错题本
                        {item.reviewCount > 0 ? ` · 已复习 ${item.reviewCount} 次` : ""}
                      </p>
                      <p className="mt-2 text-sm text-coral-strong">
                        {item.question?.explain}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </section>

        {account ? (
          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">学习连续天数</h2>
                <span className="text-3xl font-black text-teal-700">
                  {studySummary?.streakDays || 0}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {studySummary?.todayCompleted
                  ? "今天任务已完成，节奏很稳。"
                  : "完成今日任务后会点亮今天。"}
              </p>
              <div className="mt-4 grid grid-cols-7 gap-1">
                {(studySummary?.calendar || []).slice(-14).map((day) => (
                  <span
                    key={day.date}
                    title={`${day.date} · ${day.total} 题`}
                    className={`h-7 rounded-md border ${
                      day.total > 0
                        ? "border-teal-300 bg-teal-100"
                        : "border-border bg-background"
                    }`}
                  />
                ))}
              </div>
            </section>

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
                题目答错后会自动加入错题本，连续答对 2 次后会移出。
              </p>
            </section>
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function shuffleQuestions(questions: PracticeItem[]) {
  const copy = [...questions];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildVocabularyImportPayload(input: string) {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return { items: parsed, status: "published" };
    }
    if (Array.isArray(parsed.items)) {
      return { items: parsed.items, status: "published" };
    }
    if (Array.isArray(parsed.vocabulary)) {
      return { items: parsed.vocabulary, status: "published" };
    }
    if (parsed.word) {
      return { items: [parsed], status: "published" };
    }
  } catch {
    // Not JSON: treat the pasted content as CSV.
  }

  return { csv: input, status: "published" };
}

function getPracticeCopy(kind: PracticeKind) {
  const copy = {
    daily: {
      title: "今日任务",
      completionLabel: "今日任务完成",
      completionTitle: "做得不错，今天这一轮结束了",
      wrongLabel: "待复习",
    },
    mistakes: {
      title: "错题专项训练",
      completionLabel: "错题专项完成",
      completionTitle: "这轮错题复习结束了",
      wrongLabel: "仍需复习",
    },
    words: {
      title: "词汇专项训练",
      completionLabel: "词汇练习完成",
      completionTitle: "这一轮词汇训练结束了",
      wrongLabel: "错词",
    },
    grammar: {
      title: "语法专项训练",
      completionLabel: "语法练习完成",
      completionTitle: "这一轮语法训练结束了",
      wrongLabel: "薄弱题",
    },
    reading: {
      title: "阅读专项训练",
      completionLabel: "阅读练习完成",
      completionTitle: "这一轮阅读训练结束了",
      wrongLabel: "待复习",
    },
  };

  return copy[kind];
}

function VocabularyStudyPanel({
  vocabulary,
  onReload,
}: {
  vocabulary: VocabularyItem[];
  onReload: () => void;
}) {
  const [searchWord, setSearchWord] = useState("");
  const [searchResults, setSearchResults] = useState<VocabularyItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  async function searchVocabulary() {
    const keyword = searchWord.trim();
    setHasSearched(true);
    setSearchError("");

    if (!keyword) {
      setSearchResults([]);
      setSearchError("请输入要查询的英文单词。");
      return;
    }

    setSearching(true);
    try {
      const response = await api<{ vocabulary: VocabularyItem[] }>(
        `/api/vocabulary/search?word=${encodeURIComponent(keyword)}&limit=8`,
      );
      setSearchResults(response.vocabulary);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "单词查询失败。");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">先学再练</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">词汇学习卡</h2>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="min-h-10 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50 sm:w-auto"
        >
          换一批词
        </button>
      </div>

      <form
        className="mt-4 rounded-md border border-border bg-background p-3 sm:mt-5 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void searchVocabulary();
        }}
      >
        <label className="block text-sm font-semibold" htmlFor="vocabulary-search">
          查询单词
        </label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id="vocabulary-search"
            value={searchWord}
            onChange={(event) => setSearchWord(event.target.value)}
            placeholder="输入英文单词，例如 shop"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={searching}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {searching ? "查询中" : "查询"}
          </button>
        </div>

        {searchError ? (
          <p className="mt-3 rounded-md bg-coral-soft p-3 text-sm text-coral-strong">
            {searchError}
          </p>
        ) : null}

        {hasSearched && !searching && !searchError ? (
          searchResults.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {searchResults.map((item) => (
                <VocabularyLookupCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
              词库里暂时没有找到这个单词，可以先到词库管理导入后再查询。
            </p>
          )
        ) : null}
      </form>

      {vocabulary.length === 0 ? (
        <p className="mt-4 rounded-md bg-secondary p-4 text-sm text-muted-foreground">
          暂无词汇卡。可以先到词库管理导入一批词汇。
        </p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {vocabulary.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-border bg-background p-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-black tracking-tight sm:text-2xl">
                    {item.word}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-teal-700">
                    {item.partOfSpeech || "词汇"} · {item.meaning}
                  </p>
                </div>
                <WordAudioButton
                  word={item.word}
                  label="播放"
                  compact
                  className="shrink-0"
                />
              </div>
              {item.example ? (
                <p className="mt-3 rounded-md bg-secondary p-3 text-sm leading-6 text-secondary-foreground">
                  {item.example}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-md border border-border px-2 py-1">
                  难度 {item.difficulty || 1}
                </span>
                <span className="rounded-md border border-border px-2 py-1">
                  掌握等级 {item.masteryLevel || 0}/5
                </span>
                {item.sourceUnit ? (
                  <span className="rounded-md border border-border px-2 py-1">
                    {item.sourceUnit}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function VocabularyLookupCard({ item }: { item: VocabularyItem }) {
  return (
    <article className="rounded-md border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="break-words text-xl font-black tracking-tight sm:text-2xl">
              {item.word}
            </h3>
            {item.phonetic ? (
              <span className="text-sm font-semibold text-muted-foreground">
                {item.phonetic}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-semibold text-teal-700">
            {item.partOfSpeech || "词汇"} · {item.meaning}
          </p>
        </div>
        <WordAudioButton
          word={item.word}
          label="播放"
          compact
          className="shrink-0"
        />
      </div>
      {item.example ? (
        <p className="mt-3 rounded-md bg-secondary p-3 text-sm leading-6 text-secondary-foreground">
          {item.example}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {item.grade ? (
          <span className="rounded-md border border-border px-2 py-1">
            年级 {item.grade}
          </span>
        ) : null}
        {item.sourceBook ? (
          <span className="rounded-md border border-border px-2 py-1">
            {item.sourceBook}
          </span>
        ) : null}
        {item.sourceUnit ? (
          <span className="rounded-md border border-border px-2 py-1">
            {item.sourceUnit}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function ParentReportPanel({ report }: { report: ParentReport | null }) {
  if (!report) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-2xl font-bold tracking-tight">家长查看</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          正在整理最近学习记录。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-teal-700">学习概览</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">家长查看</h2>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="连续学习" value={report.summary.streakDays} suffix="天" />
        <MetricCard label="近 7 天做题" value={report.summary.last7.total} />
        <MetricCard label="近 7 天答对" value={report.summary.last7.correct} />
        <MetricCard label="近 7 天正确率" value={report.summary.last7.accuracy} suffix="%" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-4">
          <h3 className="font-bold">模块表现</h3>
          <div className="mt-4 space-y-3">
            {report.progress.map((item) => (
              <div key={item.module}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>{moduleLabels[item.module] || item.module}</span>
                  <span className="font-semibold">{item.mastery}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${
                      moduleColors[item.module] || "bg-teal-500"
                    }`}
                    style={{ width: `${item.mastery}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-4">
          <h3 className="font-bold">高频薄弱点</h3>
          <div className="mt-3 space-y-2">
            {report.topWeakPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                暂无明显薄弱点，继续保持练习即可。
              </p>
            ) : (
              report.topWeakPoints.map((item) => (
                <div
                  key={`${item.module}-${item.knowledgePoint}`}
                  className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2 text-sm"
                >
                  <span>
                    {moduleLabels[item.module] || item.module} · {item.knowledgePoint}
                  </span>
                  <span className="font-semibold text-coral-strong">
                    错 {item.wrongCount} 次
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-border bg-background p-4">
        <h3 className="font-bold">最近 14 天</h3>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {report.summary.calendar.map((day) => (
            <div
              key={day.date}
              className={`rounded-md border p-2 text-center text-xs ${
                day.total > 0
                  ? "border-teal-300 bg-teal-50 text-teal-800"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <p className="font-semibold">{day.date.slice(5)}</p>
              <p className="mt-1">{day.total} 题</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleOverview({
  module,
  mastery,
  total,
  correct,
  mistakeCount,
  loading,
  onStart,
}: {
  module: "words" | "grammar" | "reading";
  mastery: number;
  total: number;
  correct: number;
  mistakeCount: number;
  loading: boolean;
  onStart: () => void;
}) {
  const title = {
    words: "词汇练习",
    grammar: "语法基础",
    reading: "分级阅读",
  }[module];
  const description = {
    words: "从英译中、中译英和例句填空开始，逐步把教材词汇练熟。",
    grammar: "围绕 be 动词、时态、介词、代词等基础点做小步训练。",
    reading: "每次只读一篇短文并完成理解题，先保证看懂大意和细节。",
  }[module];
  const buttonText = {
    words: "开始词汇专项训练",
    grammar: "开始语法专项训练",
    reading: "开始阅读专项训练",
  }[module];

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">
            {moduleLabels[module]}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "准备中" : buttonText}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="掌握度" value={mastery} suffix="%" />
        <MetricCard label="已做题" value={total} />
        <MetricCard label="答对题" value={correct} />
      </div>

      <div className="mt-4 rounded-md bg-secondary p-4 text-sm text-muted-foreground">
        当前模块待复习错题：{mistakeCount} 道。点击开始后会进入单题训练页，首页不直接展示题目。
      </div>
    </section>
  );
}

function AdminPanel({
  csvInput,
  importing,
  importSummary,
  questions,
  onCsvChange,
  onImport,
}: {
  csvInput: string;
  importing: boolean;
  importSummary: ImportSummary | null;
  questions: PracticeItem[];
  onCsvChange: (value: string) => void;
  onImport: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">内部工具</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">
            教材词库导入
          </h2>
        </div>
        <button
          type="button"
          onClick={onImport}
          disabled={importing}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {importing ? "正在生成题目" : "导入并生成题目"}
        </button>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        粘贴教材词汇 CSV 或 JSON 后，后端会先写入 SQLite 词库，再按规则为每个词生成英译中、中译英和例句填空 3 道题，并通过 fingerprint 去重。
      </p>

      <textarea
        value={csvInput}
        onChange={(event) => onCsvChange(event.target.value)}
        spellCheck={false}
        className="mt-4 min-h-[190px] w-full resize-y rounded-md border border-border bg-background p-4 font-mono text-sm leading-6 outline-none focus:border-primary"
      />

      {importSummary ? (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MetricCard label="导入词汇" value={importSummary.importedVocabulary} />
          <MetricCard label="重复词汇" value={importSummary.skippedVocabulary} />
          <MetricCard label="生成题目" value={importSummary.generatedQuestions} />
          <MetricCard label="重复题目" value={importSummary.skippedQuestions} />
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-lg font-bold">最新题目</h3>
        <div className="mt-3 space-y-3">
          {questions.length === 0 ? (
            <p className="rounded-md bg-secondary p-4 text-sm text-muted-foreground">
              导入 CSV 或 JSON 后这里会显示最近生成的词汇题。
            </p>
          ) : null}
          {questions.map((question) => {
            const speakWord = getQuestionSpeakWord(question);

            return (
              <article
                key={question.id}
                className="rounded-md border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold">{question.prompt}</h4>
                    {speakWord ? (
                      <div className="mt-2">
                        <WordAudioButton word={speakWord} label="播放单词" />
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                    难度 {question.difficulty || 1}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {question.options.join(" / ")}
                </p>
                <p className="mt-2 text-sm text-teal-700">{question.explain}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function PracticePanel({
  title,
  questions,
  selectedAnswers,
  feedbackById,
  onAnswer,
  onReload,
}: {
  title: string;
  questions: PracticeItem[];
  selectedAnswers: Record<string, string>;
  feedbackById: Record<string, Feedback>;
  onAnswer: (question: PracticeItem, option: string) => void;
  onReload: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">
            后端判题并保存记录
          </span>
          <button
            type="button"
            onClick={onReload}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:border-primary/50"
          >
            换一批
          </button>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {questions.length === 0 ? (
          <p className="rounded-md bg-secondary p-4 text-sm text-muted-foreground">
            暂无题目，请先确认后端题库里有对应模块的数据。
          </p>
        ) : null}
        {questions.map((question, index) => {
          const selected = selectedAnswers[question.id];
          const feedback = feedbackById[question.id];

          return (
            <article
              key={question.id}
              className="rounded-md border border-border bg-background p-4"
            >
              <p className="text-sm font-semibold text-muted-foreground">
                Question {index + 1}
                {question.knowledgePoint ? ` · ${question.knowledgePoint}` : ""}
              </p>
              <h3 className="mt-2 text-lg font-bold">{question.prompt}</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const isSelected = selected === option;
                  const isAnswer = feedback?.correctAnswer === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onAnswer(question, option)}
                      className={`rounded-md border px-3 py-3 text-left text-sm font-semibold transition ${
                        feedback && isAnswer
                          ? "border-teal-500 bg-teal-50 text-teal-800"
                          : feedback && isSelected
                            ? "border-coral bg-coral-soft text-coral-strong"
                            : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {feedback ? (
                <div
                  className={`mt-4 rounded-md p-4 text-sm leading-6 ${
                    feedback.correct
                      ? "bg-teal-50 text-teal-800"
                      : "bg-coral-soft text-coral-strong"
                  }`}
                >
                  <strong>{feedback.correct ? "答对了。" : "先别急。"}</strong>{" "}
                  {feedback.explain}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
