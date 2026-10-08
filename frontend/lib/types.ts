export type Student = {
  id: string;
  name: string;
  grade: number | string;
  level: string;
};

export type DailyTask = {
  id: string;
  module?: string;
  purpose?: "review" | "reinforcement" | "new";
  title: string;
  detail?: string;
  target: number;
  completed: number;
  progress: number;
  mistakeCount: number;
};

export type DailyPlan = {
  id: string;
  sessionId: string;
  mode: "daily" | "extra";
  date: string;
  status: "active" | "completed";
  createdAt: string;
  completedAt?: string | null;
  currentIndex: number;
  correctCount: number;
  wrongCount: number;
  questions: PracticeItem[];
  tasks: DailyTask[];
};

export type PracticeItem = {
  id: string;
  module: string;
  type: string;
  title?: string;
  passage?: string;
  vocabulary?: string[];
  prompt: string;
  options: string[];
  explain: string;
  answerLength?: number;
  spellingPattern?: string;
  grade?: string;
  difficulty?: number;
  knowledgePoint?: string;
  practicePurpose?: "review" | "reinforcement" | "new";
};

export type VocabularyItem = {
  id: string;
  word: string;
  meaning: string;
  partOfSpeech?: string;
  phonetic?: string;
  example?: string;
  grade?: string;
  sourceBook?: string;
  sourceUnit?: string;
  difficulty?: number;
  tag?: string;
  bnc?: number;
  frq?: number;
  frequencyRank?: number;
  curriculumStage?: string;
  curriculumFrequencyCeiling?: number;
  tags?: string[];
  masteryLevel?: number;
  lastPracticedAt?: string;
};

export type ImportSummary = {
  importedVocabulary: number;
  skippedVocabulary: number;
  generatedQuestions: number;
  skippedQuestions: number;
  vocabulary: VocabularyItem[];
  questions: PracticeItem[];
};

export type Mistake = {
  id: string;
  questionId: string;
  module: string;
  knowledgePoint: string;
  wrongAnswer: string;
  reviewCount: number;
  correctReviewStreak: number;
  reviewStage: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  isDue: boolean;
  question: PracticeItem | null;
};

export type ProgressItem = {
  module: string;
  total: number;
  correct: number;
  mastery: number;
};

export type Feedback = {
  correct: boolean;
  correctAnswer: string;
  explain: string;
};

export type StudentLearningState = {
  studentId: string;
  frequencyFrontier: number;
  questionLevel: number;
  diagnosticStatus: "pending" | "in_progress" | "completed";
  diagnosticScore?: number | null;
  vocabularyScore?: number | null;
  grammarScore?: number | null;
  readingScore?: number | null;
  lastEvaluatedAttemptCount: number;
  diagnosticCompletedAt?: string | null;
};

export type DiagnosticPlan = {
  sessionId?: string;
  status: "active" | "completed";
  currentIndex?: number;
  correctCount?: number;
  wrongCount?: number;
  questions: PracticeItem[];
  learningState: StudentLearningState;
};

export type PracticeKind =
  | "daily"
  | "mistakes"
  | "words"
  | "grammar"
  | "reading"
  | "spelling";

export type StudyDay = {
  date: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type StudySummary = {
  streakDays: number;
  todayCompleted: boolean;
  activeDaysIn14: number;
  last7: {
    total: number;
    correct: number;
    accuracy: number;
  };
  calendar: StudyDay[];
};

export type ParentReport = {
  summary: StudySummary;
  progress: ProgressItem[];
  mistakes: Mistake[];
  topWeakPoints: {
    module: string;
    knowledgePoint: string;
    wrongCount: number;
  }[];
  recentAttempts: {
    module: string;
    knowledgePoint: string;
    answer: string;
    correct: boolean;
    createdAt: string;
  }[];
};

export type AccountRole = "student" | "parent" | "teacher" | "admin";

export type AccountUser = {
  id: string;
  username: string;
  name: string;
  role: AccountRole;
  createdAt: string;
};

export type StudentProfile = {
  userId: string;
  grade: number | string;
  level: string;
  currentBook?: string;
  createdAt?: string;
};

export type TeacherGroup = {
  id: string;
  teacherUserId: string;
  name: string;
  shareCode: string;
  studentCount?: number;
  teacherName?: string;
  joinedAt?: string;
  createdAt: string;
};

export type AccountPayload = {
  user: AccountUser;
  token?: string;
  profile?: StudentProfile;
  student?: Student;
  learningState?: StudentLearningState;
  children?: {
    user: AccountUser;
    profile: StudentProfile;
    linkedAt: string;
  }[];
  parents?: {
    user: AccountUser;
    linkedAt: string;
  }[];
  groups?: TeacherGroup[];
};
