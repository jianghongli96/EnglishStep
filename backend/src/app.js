import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createAuthHelpers, hashPassword, verifyPassword } from "./auth.js";
import { parseCsv } from "./csv.js";
import {
  badRequest as writeBadRequest,
  forbidden as writeForbidden,
  notFound as writeNotFound,
  parseBody,
  send as writeJson,
  unauthorized as writeUnauthorized,
} from "./http.js";
import { initSchema } from "./schema.js";
import {
  ALLOW_LEGACY_LOGIN,
  ALLOW_LEGACY_STUDENTS,
  AUTH_SECRET,
  AUTO_SEED_DATABASE,
  AUTO_SUPPLEMENTAL_QUESTIONS,
  CORS_ORIGIN,
  DATA_DIR,
  DB_PATH,
  HOST,
  PASSWORD_MIN_LENGTH,
  PORT,
  SEED_PATH,
} from "./config.js";
import {
  normalizeStudentGrade,
  normalizeStudentLevel,
  studentGradeForResponse,
  studentLevelForResponse,
} from "./student-options.js";
import { normalizeText, parseJson, publicQuestion } from "./utils.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": CORS_ORIGIN,
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const fallbackMeanings = ["归还", "购买", "丢失", "携带", "打开", "关闭"];
const fallbackWords = ["learn", "review", "write", "listen", "speak", "read"];
const builtInAdmin = {
  username: "admin",
  password: "jiang2026",
  name: "管理员",
};
const dailyTaskPlan = [
  {
    id: "daily-review",
    purpose: "review",
    title: "到期复习",
    detail: "只复习今天已经到期的内容",
    target: 5,
  },
  {
    id: "daily-reinforcement",
    purpose: "reinforcement",
    title: "薄弱巩固",
    detail: "换一道题巩固掌握不稳的知识点",
    target: 4,
  },
  {
    id: "daily-new",
    purpose: "new",
    title: "新内容",
    detail: "按当前词频边界和题目难度继续学习",
    target: 6,
  },
];

await mkdir(DATA_DIR, { recursive: true });
const isNewDatabase = !existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
initSchema(db);
ensureVocabularyUuidIds();
ensureVocabularyDifficultyFromFrequency();
ensureVocabularySpellingRules();
ensureBuiltInAdminAccount();
if (AUTO_SEED_DATABASE && (isNewDatabase || countRows("questions") === 0)) {
  await seedDatabase();
}
if (AUTO_SUPPLEMENTAL_QUESTIONS) {
  ensureSupplementalQuestionBank();
}

async function seedDatabase() {
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));
  const insertQuestion = db.prepare(`
    INSERT OR IGNORE INTO questions (
      id, module, type, title, passage, vocabulary_json, prompt, options_json,
      answer, explain, grade, difficulty, knowledge_point, vocabulary_id,
      source_book, source_unit, source_type, status, fingerprint, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const question of seed.questions || []) {
    const normalized = normalizeQuestion({
      ...question,
      sourceType: "seed",
      status: "published",
      createdAt: now,
    });
    insertQuestion.run(...questionParams(normalized));
  }
}

function ensureSupplementalQuestionBank() {
  const now = new Date().toISOString();
  const supplementalQuestions = [
    {
      id: "g-be-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "I ____ a student.",
      options: ["am", "is", "are", "be"],
      answer: "am",
      explain: "主语 I 后面的 be 动词用 am。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "be 动词",
    },
    {
      id: "g-be-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "They ____ my classmates.",
      options: ["am", "is", "are", "be"],
      answer: "are",
      explain: "主语 They 是复数，be 动词用 are。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "be 动词",
    },
    {
      id: "g-present-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "Tom ____ football after school.",
      options: ["play", "plays", "playing", "played"],
      answer: "plays",
      explain: "Tom 是第三人称单数，一般现在时动词要加 s。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "一般现在时",
    },
    {
      id: "g-present-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "My parents ____ TV in the evening.",
      options: ["watch", "watches", "watching", "watched"],
      answer: "watch",
      explain: "主语 My parents 是复数，一般现在时用动词原形。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "一般现在时",
    },
    {
      id: "g-therebe-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "There ____ two books on the desk.",
      options: ["is", "are", "am", "be"],
      answer: "are",
      explain: "two books 是复数，There be 句型中 be 动词用 are。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "There be 句型",
    },
    {
      id: "g-past-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "She ____ her homework last night.",
      options: ["does", "do", "did", "doing"],
      answer: "did",
      explain: "last night 表示过去时间，do 的过去式是 did。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "一般过去时",
    },
    {
      id: "g-past-003",
      module: "grammar",
      type: "grammar_choice",
      prompt: "We ____ a film yesterday.",
      options: ["see", "saw", "sees", "seeing"],
      answer: "saw",
      explain: "yesterday 表示过去时间，see 的过去式是 saw。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "一般过去时",
    },
    {
      id: "g-future-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "I ____ visit my grandparents tomorrow.",
      options: ["will", "was", "did", "am"],
      answer: "will",
      explain: "tomorrow 表示将来时间，可以用 will + 动词原形。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "一般将来时",
    },
    {
      id: "g-pronoun-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "This is Lucy. ____ is my friend.",
      options: ["He", "She", "It", "They"],
      answer: "She",
      explain: "Lucy 是女孩名，作主语时用 She。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "人称代词",
    },
    {
      id: "g-pronoun-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "Please give ____ the book.",
      options: ["I", "me", "my", "mine"],
      answer: "me",
      explain: "give 后面作宾语时用宾格 me。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "人称代词",
    },
    {
      id: "g-article-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "There is ____ apple on the table.",
      options: ["a", "an", "the", "/"],
      answer: "an",
      explain: "apple 以元音音素开头，前面用 an。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "冠词",
    },
    {
      id: "g-preposition-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "We go to school ____ Monday.",
      options: ["in", "on", "at", "for"],
      answer: "on",
      explain: "具体某一天前用介词 on。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "介词",
    },
    {
      id: "g-preposition-002",
      module: "grammar",
      type: "grammar_choice",
      prompt: "The cat is ____ the box.",
      options: ["in", "at", "for", "from"],
      answer: "in",
      explain: "表示“在盒子里面”用 in。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "介词",
    },
    {
      id: "g-plural-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "There are three ____ in the room.",
      options: ["child", "childs", "children", "childes"],
      answer: "children",
      explain: "child 的复数是不规则变化 children。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "名词复数",
    },
    {
      id: "g-modal-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "He can ____ English well.",
      options: ["speak", "speaks", "speaking", "spoke"],
      answer: "speak",
      explain: "情态动词 can 后接动词原形。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "情态动词",
    },
    {
      id: "g-comparative-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "This box is ____ than that one.",
      options: ["heavy", "heavier", "heaviest", "more heavy"],
      answer: "heavier",
      explain: "than 前常用比较级，heavy 的比较级是 heavier。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "形容词比较级",
    },
    {
      id: "g-conjunction-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "I like English ____ it is interesting.",
      options: ["because", "but", "or", "so"],
      answer: "because",
      explain: "后半句解释喜欢英语的原因，所以用 because。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "连词",
    },
    {
      id: "g-infinitive-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "It is important ____ English every day.",
      options: ["read", "to read", "reading", "reads"],
      answer: "to read",
      explain: "It is + adj. + to do sth. 是常见句型。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "动词不定式",
    },
    {
      id: "g-gerund-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "I enjoy ____ music.",
      options: ["listen", "to listen", "listening to", "listened"],
      answer: "listening to",
      explain: "enjoy 后接动名词，listen to music 是固定搭配。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "动名词",
    },
    {
      id: "g-question-001",
      module: "grammar",
      type: "grammar_choice",
      prompt: "____ do you go to school? By bus.",
      options: ["What", "How", "Where", "Who"],
      answer: "How",
      explain: "回答 By bus 表示方式，所以疑问词用 How。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "特殊疑问句",
    },
    {
      id: "r-family-001",
      module: "reading",
      type: "reading_detail",
      title: "My Busy Morning",
      passage: "Every morning, Jack gets up at six thirty. He washes his face and has breakfast with his parents. At seven twenty, he walks to school with his sister. He likes the morning because the air is fresh.",
      vocabulary: ["wash 洗", "breakfast 早餐", "fresh 新鲜的"],
      prompt: "How does Jack go to school?",
      options: ["By bus.", "By bike.", "On foot.", "By car."],
      answer: "On foot.",
      explain: "文中说 he walks to school，所以 Jack 步行去学校。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "细节理解",
    },
    {
      id: "r-library-001",
      module: "reading",
      type: "reading_detail",
      title: "At the Library",
      passage: "May likes reading stories. On Saturday afternoon, she goes to the library. She borrows two books and reads one chapter there. The library is quiet, so she can study well.",
      vocabulary: ["library 图书馆", "borrow 借入", "quiet 安静的"],
      prompt: "Why can May study well in the library?",
      options: ["It is quiet.", "It is far.", "It is small.", "It is new."],
      answer: "It is quiet.",
      explain: "文中说 The library is quiet, so she can study well.",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "细节理解",
    },
    {
      id: "r-sport-001",
      module: "reading",
      type: "reading_main_idea",
      title: "A New Sport",
      passage: "Ben was not good at running before. His teacher asked him to run for ten minutes every day. At first, he felt tired. One month later, he could run faster and felt healthier.",
      vocabulary: ["running 跑步", "tired 累的", "healthier 更健康的"],
      prompt: "What is the passage mainly about?",
      options: [
        "Ben learns to cook.",
        "Ben gets better at running.",
        "Ben buys new shoes.",
        "Ben visits his teacher."
      ],
      answer: "Ben gets better at running.",
      explain: "短文主要讲 Ben 通过每天练习跑步变得更好。",
      grade: "初中",
      difficulty: 1,
      knowledgePoint: "主旨理解",
    },
    {
      id: "r-weather-001",
      module: "reading",
      type: "reading_inference",
      title: "A Rainy Day",
      passage: "It rained heavily after school. Lily did not have an umbrella. Her friend Emma shared one with her. They walked home together and talked about their English homework.",
      vocabulary: ["heavily 大量地", "umbrella 雨伞", "shared 分享"],
      prompt: "What can we know about Emma?",
      options: [
        "She is helpful.",
        "She is late.",
        "She dislikes Lily.",
        "She forgets homework."
      ],
      answer: "She is helpful.",
      explain: "Emma 和 Lily 共用雨伞，说明她乐于帮助朋友。",
      grade: "初中",
      difficulty: 2,
      knowledgePoint: "推理判断",
    }
  ];

  for (const question of supplementalQuestions) {
    insertQuestion(
      normalizeQuestion({
        ...question,
        sourceType: "seed",
        status: "published",
        createdAt: now,
      }),
    );
  }
}

function countRows(table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function withTransaction(work) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function clampDifficulty(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return 1;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function frequencyRank(entry) {
  const ranks = [entry?.bnc, entry?.frq]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  return ranks.length ? Math.min(...ranks) : 0;
}

function difficultyFromFrequency(entry, fallback = 1) {
  const rank = frequencyRank(entry);
  if (!rank) return clampDifficulty(fallback);
  if (rank <= 1000) return 1;
  if (rank <= 3000) return 2;
  if (rank <= 8000) return 3;
  if (rank <= 15000) return 4;
  return 5;
}

function questionDifficultyForVocabulary(vocab, offset = 0) {
  return clampDifficulty(difficultyFromFrequency(vocab, vocab?.difficulty || 1) + offset);
}

function spellingSettingsForVocabulary(entry) {
  const word = normalizeText(entry?.word || "");
  const partOfSpeech = normalizeText(
    entry?.partOfSpeech || entry?.part_of_speech || "",
  ).toLowerCase();

  if (!word) {
    return { enabled: false, mode: "unsupported", answer: "" };
  }
  if (/\s/.test(word)) {
    return { enabled: false, mode: "phrase", answer: word };
  }
  if (/[./=()\[\]／]/.test(word)) {
    return { enabled: false, mode: "abbreviation", answer: word };
  }
  if (
    /^[A-Z]{2,6}$/.test(word) ||
    partOfSpeech.includes("abbr") ||
    partOfSpeech.includes("缩写")
  ) {
    return { enabled: false, mode: "abbreviation", answer: word };
  }
  if (!/^[A-Za-z'-]+$/.test(word)) {
    return { enabled: false, mode: "unsupported", answer: word };
  }

  return {
    enabled: true,
    mode: /['-]/.test(word) ? "punctuated" : "word",
    answer: word,
  };
}

function ensureVocabularySpellingRules() {
  const rows = db
    .prepare(
      `SELECT id, word, part_of_speech, spelling_enabled,
              spelling_mode, spelling_answer
       FROM vocabulary`,
    )
    .all();
  const updateVocabulary = db.prepare(
    `UPDATE vocabulary
     SET spelling_enabled = ?, spelling_mode = ?, spelling_answer = ?
     WHERE id = ?`,
  );
  const archiveSpellingQuestions = db.prepare(
    `UPDATE questions SET status = 'archived'
     WHERE vocabulary_id = ? AND type = 'spelling' AND status = 'published'`,
  );

  withTransaction(() => {
    for (const row of rows) {
      const settings = spellingSettingsForVocabulary(row);
      if (
        Number(row.spelling_enabled) !== Number(settings.enabled) ||
        row.spelling_mode !== settings.mode ||
        row.spelling_answer !== settings.answer
      ) {
        updateVocabulary.run(
          settings.enabled ? 1 : 0,
          settings.mode,
          settings.answer,
          row.id,
        );
      }
      if (!settings.enabled) archiveSpellingQuestions.run(row.id);
    }
  });
}

function ensureVocabularyUuidIds() {
  const rows = db.prepare("SELECT id FROM vocabulary").all();
  const migrations = rows
    .filter((row) => !isUuid(row.id))
    .map((row) => ({ oldId: row.id, newId: randomUUID() }));

  if (migrations.length === 0) return;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    withTransaction(() => {
      const updateQuestions = db.prepare(
        "UPDATE questions SET vocabulary_id = ? WHERE vocabulary_id = ?",
      );
      const updateVocabulary = db.prepare("UPDATE vocabulary SET id = ? WHERE id = ?");

      for (const item of migrations) {
        updateQuestions.run(item.newId, item.oldId);
        updateVocabulary.run(item.newId, item.oldId);
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function ensureVocabularyDifficultyFromFrequency() {
  const rows = db
    .prepare("SELECT id, difficulty, bnc, frq FROM vocabulary WHERE bnc > 0 OR frq > 0")
    .all();
  if (rows.length === 0) return;

  withTransaction(() => {
    const updateVocabulary = db.prepare("UPDATE vocabulary SET difficulty = ? WHERE id = ?");
    const updateQuestions = db.prepare(`
      UPDATE questions
      SET difficulty = CASE
        WHEN type = 'sentence_blank' THEN ?
        ELSE ?
      END
      WHERE vocabulary_id = ?
    `);

    for (const row of rows) {
      const baseDifficulty = difficultyFromFrequency(row, row.difficulty || 1);
      updateVocabulary.run(baseDifficulty, row.id);
      updateQuestions.run(clampDifficulty(baseDifficulty + 1), baseDifficulty, row.id);
    }
  });
}

function send(res, status, payload) {
  writeJson(res, status, payload, jsonHeaders);
}

function notFound(res) {
  writeNotFound(res, jsonHeaders);
}

function badRequest(res, message) {
  writeBadRequest(res, message, jsonHeaders);
}

function unauthorized(res, message = "Authentication required") {
  writeUnauthorized(res, jsonHeaders, message);
}

function forbidden(res, message = "Permission denied") {
  writeForbidden(res, jsonHeaders, message);
}

function rowToStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    grade: studentGradeForResponse(row.grade),
    level: studentLevelForResponse(row.level),
    createdAt: row.created_at,
  };
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

function rowToStudentProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    grade: studentGradeForResponse(row.grade),
    level: studentLevelForResponse(row.level),
    currentBook: row.current_book,
    createdAt: row.created_at,
  };
}

function rowToStudentLearningState(row) {
  if (!row) return null;
  return {
    studentId: row.student_id,
    frequencyFrontier: Number(row.frequency_frontier),
    questionLevel: Number(row.question_level),
    diagnosticStatus: row.diagnostic_status,
    diagnosticScore: row.diagnostic_score,
    vocabularyScore: row.vocabulary_score,
    grammarScore: row.grammar_score,
    readingScore: row.reading_score,
    lastEvaluatedAttemptCount: Number(row.last_evaluated_attempt_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    diagnosticCompletedAt: row.diagnostic_completed_at,
  };
}

function rowToTeacherGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    teacherUserId: row.teacher_user_id,
    name: row.name,
    shareCode: row.share_code,
    createdAt: row.created_at,
  };
}

function rowToVocabulary(row) {
  if (!row) return null;
  return {
    id: row.id,
    word: row.word,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech,
    phonetic: row.phonetic,
    example: row.example,
    grade: row.grade,
    semester: row.semester,
	    sourceBook: row.source_book,
	    sourceUnit: row.source_unit,
	    difficulty: row.difficulty,
	    tag: row.tag,
	    bnc: Number(row.bnc || 0),
	    frq: Number(row.frq || 0),
	    spellingEnabled: Boolean(row.spelling_enabled),
	    spellingMode: row.spelling_mode || "word",
	    spellingAnswer: row.spelling_answer || row.word,
	    acceptedAnswers: parseJson(row.accepted_answers_json, []),
	    tags: parseJson(row.tags_json, []),
	    createdAt: row.created_at,
  };
}

function rowToQuestion(row, includeAnswer = true) {
  if (!row) return null;
  const question = {
    id: row.id,
    module: row.module,
    type: row.type,
    title: row.title,
    passage: row.passage,
    vocabulary: parseJson(row.vocabulary_json, []),
    prompt: row.prompt,
    options: parseJson(row.options_json, []),
    explain: row.explain,
    grade: row.grade,
    difficulty: row.difficulty,
    knowledgePoint: row.knowledge_point,
    vocabularyId: row.vocabulary_id,
    sourceBook: row.source_book,
    sourceUnit: row.source_unit,
    sourceType: row.source_type,
    status: row.status,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
  };
  if (row.session_purpose) question.practicePurpose = row.session_purpose;
  if (includeAnswer) question.answer = row.answer;
  return question;
}

function rowToMistake(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    questionId: row.question_id,
    module: row.module,
    knowledgePoint: row.knowledge_point,
    wrongAnswer: row.wrong_answer,
    reviewCount: row.review_count || 0,
    correctReviewStreak: row.correct_review_streak || 0,
    reviewStage: Number(row.review_stage || 0),
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
    isDue: !row.next_review_at || row.next_review_at <= new Date().toISOString(),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function normalizeUsername(value) {
  return normalizeText(value).toLowerCase();
}

function ensureBuiltInAdminAccount() {
  const username = normalizeText(builtInAdmin.username);
  const normalizedUsername = normalizeUsername(username);
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(builtInAdmin.password);
  const existing = db
    .prepare("SELECT id FROM users WHERE normalized_username = ?")
    .get(normalizedUsername);

  if (existing) {
    db.prepare(
      `UPDATE users
       SET username = ?, name = ?, role = 'admin',
           password_hash = ?, password_salt = ?
       WHERE id = ?`,
    ).run(username, builtInAdmin.name, hash, salt, existing.id);
    return;
  }

  db.prepare(
    `INSERT INTO users (
      id, username, normalized_username, name, role,
      password_hash, password_salt, created_at
    ) VALUES (?, ?, ?, ?, 'admin', ?, ?, ?)`,
  ).run(randomUUID(), username, normalizedUsername, builtInAdmin.name, hash, salt, now);
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  return user;
}

function isAdmin(user) {
  return user?.role === "admin";
}

function canAccessStudent(user, studentId) {
  const accountStudent = findUser(studentId);
  if (!accountStudent) {
    return ALLOW_LEGACY_STUDENTS && Boolean(findStudent(studentId));
  }

  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "student" && user.id === studentId) return true;
  if (user.role === "parent") {
    return Boolean(
      db
        .prepare(
          `SELECT id FROM parent_student_links
           WHERE parent_user_id = ? AND student_user_id = ? AND status = 'active'`,
        )
        .get(user.id, studentId),
    );
  }
  if (user.role === "teacher") {
    return Boolean(
      db
        .prepare(
          `SELECT gm.id
           FROM group_members gm
           JOIN teacher_groups tg ON tg.id = gm.group_id
           WHERE tg.teacher_user_id = ?
             AND gm.student_user_id = ?
             AND gm.status = 'active'`,
        )
        .get(user.id, studentId),
    );
  }
  return false;
}

function findUser(userId) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

const { getAuthUser, signAuthToken } = createAuthHelpers({
  authSecret: AUTH_SECRET,
  findUser,
});

function findUserWithSecretByUsername(username) {
  return db
    .prepare("SELECT * FROM users WHERE normalized_username = ?")
    .get(normalizeUsername(username));
}

function findStudentProfile(userId) {
  return rowToStudentProfile(
    db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(userId),
  );
}

function ensureStudentRecordForUser(user, profile) {
  if (!user || user.role !== "student" || !profile) return null;

  const existing = findStudent(user.id);
  if (existing) return existing;

  const normalizedName = normalizeText(user.name).toLowerCase();
  db.prepare(
    `INSERT OR IGNORE INTO students
      (id, name, normalized_name, grade, level, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    user.name,
    normalizedName,
    profile.grade,
    profile.level,
    user.createdAt,
  );

  return findStudent(user.id);
}

function initialLearningState(student) {
  const grade = Math.min(12, Math.max(7, Number(student?.grade) || 7));
  const level = ["low", "middle", "high"].includes(student?.level)
    ? student.level
    : "low";
  const frontiers = {
    7: { low: 500, middle: 1500, high: 3000 },
    8: { low: 800, middle: 2000, high: 4000 },
    9: { low: 1200, middle: 3000, high: 6000 },
    10: { low: 2000, middle: 5000, high: 8000 },
    11: { low: 3000, middle: 8000, high: 12000 },
    12: { low: 5000, middle: 12000, high: 15000 },
  };
  const levelBase = { low: 1, middle: 2, high: 3 }[level];
  return {
    frequencyFrontier: frontiers[grade][level],
    questionLevel: clampDifficulty(levelBase + (grade >= 10 ? 1 : 0)),
  };
}

function ensureStudentLearningState(studentId) {
  const existing = db
    .prepare("SELECT * FROM student_learning_states WHERE student_id = ?")
    .get(studentId);
  if (existing) return rowToStudentLearningState(existing);

  const student = findStudent(studentId);
  if (!student) return null;
  const initial = initialLearningState(student);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO student_learning_states (
      student_id, frequency_frontier, question_level, diagnostic_status,
      last_evaluated_attempt_count, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
  ).run(studentId, initial.frequencyFrontier, initial.questionLevel, now, now);
  return rowToStudentLearningState(
    db.prepare("SELECT * FROM student_learning_states WHERE student_id = ?").get(studentId),
  );
}

function accountPayload(user, { includeToken = false } = {}) {
  const payload = { user };
  if (includeToken && user) {
    payload.token = signAuthToken(user);
  }
  if (user?.role === "student") {
    const profile = findStudentProfile(user.id);
    payload.profile = profile;
    payload.student = ensureStudentRecordForUser(user, profile);
    payload.learningState = ensureStudentLearningState(user.id);
    payload.parents = listStudentParents(user.id);
    payload.groups = listStudentGroups(user.id);
  }
  if (user?.role === "parent") {
    payload.children = listParentChildren(user.id);
  }
  if (user?.role === "teacher") {
    payload.groups = listTeacherGroups(user.id);
  }
  return payload;
}

function fingerprintFor(question) {
  const raw = [
    question.module,
    question.type,
    question.vocabularyId || "",
    normalizeText(question.prompt).toLowerCase(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeQuestion(question) {
  const normalized = {
    id: question.id || `q-${randomUUID()}`,
    module: question.module || "words",
    type: question.type || "choice",
    title: question.title || null,
    passage: question.passage || null,
    vocabulary: question.vocabulary || [],
    prompt: normalizeText(question.prompt),
    options: question.options || [],
    answer: normalizeText(question.answer),
    explain: normalizeText(question.explain),
    grade: question.grade || "初中",
    difficulty: Number(question.difficulty || 1),
    knowledgePoint: question.knowledgePoint || question.knowledge_point,
    vocabularyId: question.vocabularyId || question.vocabulary_id || null,
    sourceBook: question.sourceBook || question.source_book || null,
    sourceUnit: question.sourceUnit || question.source_unit || null,
    sourceType: question.sourceType || question.source_type || "manual",
    status: question.status || "published",
    createdAt: question.createdAt || new Date().toISOString(),
  };
  normalized.fingerprint = question.fingerprint || fingerprintFor(normalized);
  return normalized;
}

function questionParams(question) {
  return [
    question.id,
    question.module,
    question.type,
    question.title,
    question.passage,
    JSON.stringify(question.vocabulary || []),
    question.prompt,
    JSON.stringify(question.options || []),
    question.answer,
    question.explain,
    question.grade,
    question.difficulty,
    question.knowledgePoint,
    question.vocabularyId,
    question.sourceBook,
    question.sourceUnit,
    question.sourceType,
    question.status,
    question.fingerprint,
    question.createdAt,
  ];
}

function findStudent(studentId) {
  return rowToStudent(db.prepare("SELECT * FROM students WHERE id = ?").get(studentId));
}

function getQuestion(questionId, includeAnswer = true) {
  return rowToQuestion(
    db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId),
    includeAnswer,
  );
}

function getStudentMistakes(studentId, dueOnly = false) {
  const rows = db
    .prepare(
      `SELECT * FROM mistakes
       WHERE student_id = ? AND resolved_at IS NULL
         AND (? = 0 OR next_review_at IS NULL OR next_review_at <= ?)
       ORDER BY CASE WHEN next_review_at IS NULL OR next_review_at <= ? THEN 0 ELSE 1 END,
                next_review_at ASC, created_at DESC`,
    )
    .all(studentId, dueOnly ? 1 : 0, new Date().toISOString(), new Date().toISOString());

  return rows.map((row) => {
    const mistake = rowToMistake(row);
    return {
      ...mistake,
      question: publicQuestion(getQuestion(mistake.questionId, false)),
    };
  });
}

function buildProgress(studentId) {
  const modules = ["words", "grammar", "reading"];
  const statement = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct
    FROM attempts
    WHERE student_id = ? AND module = ?
  `);

  return modules.map((module) => {
    const row = statement.get(studentId, module);
    const total = Number(row.total || 0);
    const correct = Number(row.correct || 0);
    return {
      module,
      total,
      correct,
      mastery: total === 0 ? 0 : Math.round((correct / total) * 100),
    };
  });
}

function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateKeysFromToday(days) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return toLocalDateKey(date);
  });
}

function buildStudySummary(studentId) {
  const rows = db
    .prepare(
      `SELECT created_at, correct
       FROM attempts
       WHERE student_id = ?
       ORDER BY created_at DESC
       LIMIT 1000`,
    )
    .all(studentId);
  const dayMap = new Map();

  for (const row of rows) {
    const key = toLocalDateKey(row.created_at);
    const current = dayMap.get(key) || { date: key, total: 0, correct: 0 };
    current.total += 1;
    current.correct += row.correct ? 1 : 0;
    dayMap.set(key, current);
  }

  const calendar = dateKeysFromToday(14)
    .reverse()
    .map((date) => {
      const item = dayMap.get(date) || { date, total: 0, correct: 0 };
      return {
        ...item,
        accuracy: item.total === 0 ? 0 : Math.round((item.correct / item.total) * 100),
      };
    });

  let streakDays = 0;
  for (const date of dateKeysFromToday(60)) {
    if ((dayMap.get(date)?.total || 0) === 0) break;
    streakDays += 1;
  }

  const last7Keys = new Set(dateKeysFromToday(7));
  const last7 = rows.reduce(
    (result, row) => {
      if (last7Keys.has(toLocalDateKey(row.created_at))) {
        result.total += 1;
        result.correct += row.correct ? 1 : 0;
      }
      return result;
    },
    { total: 0, correct: 0 },
  );

  const tasks = buildDailyTasks(studentId);
  const todayCompleted =
    tasks.length > 0 && tasks.every((task) => task.completed >= task.target);

  return {
    streakDays,
    todayCompleted,
    activeDaysIn14: calendar.filter((item) => item.total > 0).length,
    last7: {
      ...last7,
      accuracy: last7.total === 0 ? 0 : Math.round((last7.correct / last7.total) * 100),
    },
    calendar,
  };
}

function buildParentReport(studentId) {
  const topWeakPoints = db
    .prepare(
      `SELECT module, knowledge_point, COUNT(*) AS wrong_count
       FROM attempts
       WHERE student_id = ? AND correct = 0
       GROUP BY module, knowledge_point
       ORDER BY wrong_count DESC
       LIMIT 8`,
    )
    .all(studentId)
    .map((row) => ({
      module: row.module,
      knowledgePoint: row.knowledge_point,
      wrongCount: Number(row.wrong_count || 0),
    }));

  const recentAttempts = db
    .prepare(
      `SELECT module, knowledge_point, answer, correct, created_at
       FROM attempts
       WHERE student_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .all(studentId)
    .map((row) => ({
      module: row.module,
      knowledgePoint: row.knowledge_point,
      answer: row.answer,
      correct: Boolean(row.correct),
      createdAt: row.created_at,
    }));

  return {
    summary: buildStudySummary(studentId),
    progress: buildProgress(studentId),
    mistakes: getStudentMistakes(studentId),
    topWeakPoints,
    recentAttempts,
  };
}

function buildDailyTasks(studentId, sessionId = "") {
  const session = sessionId
    ? db
        .prepare("SELECT * FROM practice_sessions WHERE id = ? AND student_id = ?")
        .get(sessionId, studentId)
    : db
        .prepare(
          `SELECT * FROM practice_sessions
           WHERE student_id = ? AND session_date = ? AND mode = 'daily'
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .get(studentId, getTodayKey());

  if (session) {
    const plannedByPurpose = new Map(
      db
        .prepare(
          `SELECT sq.purpose, COUNT(*) AS total,
                  SUM(CASE WHEN sq.answered_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
           FROM session_questions sq
           WHERE sq.session_id = ?
           GROUP BY sq.purpose`,
        )
        .all(session.id)
        .map((row) => [
          row.purpose,
          { total: Number(row.total || 0), completed: Number(row.completed || 0) },
        ]),
    );

    return dailyTaskPlan.map((task) => {
      const planned = plannedByPurpose.get(task.purpose) || { total: 0, completed: 0 };
      return {
        ...task,
        target: planned.total,
        completed: planned.completed,
        progress: planned.total
          ? Math.min(100, Math.round((planned.completed / planned.total) * 100))
          : 100,
        mistakeCount: task.purpose === "review" ? countDueReviews(studentId) : 0,
      };
    });
  }

  const dueTarget = Math.min(5, countDueReviews(studentId));
  return dailyTaskPlan.map((task) => ({
    ...task,
    target:
      task.purpose === "review"
        ? dueTarget
        : task.purpose === "new"
          ? task.target + (5 - dueTarget)
          : task.target,
    completed: 0,
    progress: 0,
    mistakeCount: task.purpose === "review" ? dueTarget : 0,
  }));
}

function countDueReviews(studentId) {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT question_id) AS total FROM (
         SELECT m.question_id
         FROM mistakes m
         JOIN questions q ON q.id = m.question_id
         WHERE m.student_id = ? AND m.resolved_at IS NULL
           AND (m.next_review_at IS NULL OR m.next_review_at <= ?)
           AND q.status = 'published' AND q.type <> 'spelling'
         UNION
         SELECT q.id AS question_id
         FROM student_knowledge sk
         JOIN questions q ON q.knowledge_point = sk.knowledge_point
         WHERE sk.student_id = ? AND sk.next_review_at <= ?
           AND q.status = 'published' AND q.type <> 'spelling'
       )`,
    )
    .get(studentId, now, studentId, now);
  return Number(row.total || 0);
}

function getTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((result, part) => {
      if (part.type !== "literal") {
        result[part.type] = part.value;
      }
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getStudentCurriculumProfile(studentId) {
  const student = findStudent(studentId);
  const storedGrade = Number(student?.grade);
  const grade = Number.isFinite(storedGrade) && storedGrade >= 7 && storedGrade <= 12
    ? storedGrade
    : 7;
  const level = ["low", "middle", "high"].includes(student?.level)
    ? student.level
    : "low";
  const learningState = ensureStudentLearningState(studentId);
  const learned = db
    .prepare(
      `SELECT COUNT(DISTINCT q.vocabulary_id) AS total
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       WHERE a.student_id = ? AND a.correct = 1
         AND q.vocabulary_id IS NOT NULL`,
    )
    .get(studentId);
  const learnedVocabularyCount = Number(learned.total || 0);
  const initial = initialLearningState(student);
  const targetDifficulty = learningState?.questionLevel || initial.questionLevel;
  const frequencyCeiling =
    learningState?.frequencyFrontier || initial.frequencyFrontier;

  return {
    grade,
    level,
    stage: grade <= 9 ? "初中" : "高中",
    stageTag: grade <= 9 ? "zk" : "gk",
    targetDifficulty: clampDifficulty(targetDifficulty),
    maxDifficulty: Math.min(5, clampDifficulty(targetDifficulty) + 1),
    frequencyCeiling: Math.min(30000, frequencyCeiling),
    learnedVocabularyCount,
    diagnosticStatus: learningState?.diagnosticStatus || "pending",
  };
}

function getPracticeSession(sessionId) {
  return db
    .prepare("SELECT * FROM practice_sessions WHERE id = ?")
    .get(sessionId);
}

function getPracticeSessionQuestionRows(sessionId) {
  return db
    .prepare(
      `SELECT q.*, sq.answered_at AS session_answered_at,
              sq.correct AS session_correct, sq.sort_order AS session_sort_order,
              sq.purpose AS session_purpose
       FROM session_questions sq
       JOIN questions q ON q.id = sq.question_id
       WHERE sq.session_id = ?
       ORDER BY sq.sort_order ASC`,
    )
    .all(sessionId);
}

function practiceSessionPayload(session) {
  const rows = getPracticeSessionQuestionRows(session.id);
  const currentIndex = rows.findIndex((row) => !row.session_answered_at);
  const correctCount = rows.filter(
    (row) => row.session_answered_at && Number(row.session_correct) === 1,
  ).length;
  const wrongCount = rows.filter(
    (row) => row.session_answered_at && Number(row.session_correct) === 0,
  ).length;

  return {
    id: session.id,
    sessionId: session.id,
    mode: session.mode,
    date: session.session_date,
    status: session.status,
    createdAt: session.created_at,
    completedAt: session.completed_at,
    currentIndex: currentIndex === -1 ? rows.length : currentIndex,
    correctCount,
    wrongCount,
    questions: rows.map((row) => publicQuestion(rowToQuestion(row, false))),
    tasks: buildDailyTasks(session.student_id, session.id),
  };
}

function filterDailyCandidates(rows, excludedIds, limit) {
  const excluded = new Set(excludedIds);
  const vocabularyIds = new Set();
  return rows
    .filter((row) => {
      if (excluded.has(row.id)) return false;
      if (row.module === "words" && row.vocabulary_id) {
        if (vocabularyIds.has(row.vocabulary_id)) return false;
        vocabularyIds.add(row.vocabulary_id);
      }
      return true;
    })
    .slice(0, limit);
}

function selectDueReviewRows(studentId, limit, excludedIds = []) {
  const now = new Date().toISOString();
  const mistakeRows = db
    .prepare(
      `SELECT q.* FROM mistakes m
       JOIN questions q ON q.id = m.question_id
       WHERE m.student_id = ? AND m.resolved_at IS NULL
         AND (m.next_review_at IS NULL OR m.next_review_at <= ?)
         AND q.status = 'published' AND q.type <> 'spelling'
       ORDER BY COALESCE(m.next_review_at, m.created_at) ASC`,
    )
    .all(studentId, now);
  const selected = filterDailyCandidates(mistakeRows, excludedIds, limit);
  if (selected.length >= limit) return selected;

  const knowledgeRows = db
    .prepare(
      `SELECT q.* FROM student_knowledge sk
       JOIN questions q ON q.knowledge_point = sk.knowledge_point
       WHERE sk.student_id = ? AND sk.next_review_at <= ?
         AND q.status = 'published' AND q.type <> 'spelling'
       ORDER BY sk.next_review_at ASC, sk.mastery_level ASC, RANDOM()
       LIMIT 100`,
    )
    .all(studentId, now);
  const seenKnowledgePoints = new Set(selected.map((row) => row.knowledge_point));
  const uniqueKnowledgeRows = knowledgeRows.filter((row) => {
    if (seenKnowledgePoints.has(row.knowledge_point)) return false;
    seenKnowledgePoints.add(row.knowledge_point);
    return true;
  });
  return [
    ...selected,
    ...filterDailyCandidates(
      uniqueKnowledgeRows,
      [...excludedIds, ...selected.map((row) => row.id)],
      limit - selected.length,
    ),
  ];
}

function selectReinforcementRows(studentId, limit, excludedIds = []) {
  const curriculum = getStudentCurriculumProfile(studentId);
  const now = new Date().toISOString();
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT q.* FROM student_knowledge sk
       JOIN questions q ON q.knowledge_point = sk.knowledge_point
       LEFT JOIN vocabulary v ON v.id = q.vocabulary_id
       WHERE sk.student_id = ? AND sk.mastery_level <= 3
         AND (sk.next_review_at IS NULL OR sk.next_review_at > ?)
         AND q.status = 'published' AND q.type <> 'spelling'
         AND q.difficulty <= ?
         AND NOT EXISTS (
           SELECT 1 FROM attempts recent
           WHERE recent.student_id = ? AND recent.question_id = q.id
             AND recent.created_at >= ?
         )
         AND (q.module <> 'words' OR (
           CASE
             WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
             WHEN v.bnc > 0 THEN v.bnc
             WHEN v.frq > 0 THEN v.frq
             ELSE 999999
           END <= ?
         ))
       ORDER BY sk.mastery_level ASC,
                ABS(q.difficulty - ?) ASC, RANDOM()
       LIMIT 100`,
    )
    .all(
      studentId,
      now,
      curriculum.maxDifficulty,
      studentId,
      recentCutoff,
      curriculum.frequencyCeiling,
      curriculum.targetDifficulty,
    );
  const seenKnowledgePoints = new Set();
  const uniqueRows = rows.filter((row) => {
    if (seenKnowledgePoints.has(row.knowledge_point)) return false;
    seenKnowledgePoints.add(row.knowledge_point);
    return true;
  });
  return filterDailyCandidates(uniqueRows, excludedIds, limit);
}

function selectNewDailyRows(studentId, limit, excludedIds = []) {
  const moduleTargets = [
    ["words", Math.ceil(limit * 0.6)],
    ["grammar", Math.floor(limit * 0.25)],
    ["reading", Math.max(1, limit - Math.ceil(limit * 0.6) - Math.floor(limit * 0.25))],
  ];
  const selected = [];
  for (const [module, target] of moduleTargets) {
    if (target <= 0) continue;
    const vocabularyIds =
      module === "words"
        ? listStudyVocabulary(studentId, Math.max(target * 4, 20)).map((item) => item.id)
        : [];
    const rows = selectRecommendedQuestionRows(
      studentId,
      module,
      target,
      vocabularyIds,
      [...excludedIds, ...selected.map((row) => row.id)],
      { onlyUnattempted: true },
    );
    selected.push(...rows);
  }
  return selected.slice(0, limit);
}

function getOrCreateDailyPracticeSession(studentId, requestedMode = "resume") {
  const student = findStudent(studentId);
  if (!student) return null;

  const sessionDate = getTodayKey();
  const activeSession = db
    .prepare(
      `SELECT * FROM practice_sessions
       WHERE student_id = ? AND session_date = ? AND status = 'active'
         AND mode IN ('daily', 'extra')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(studentId, sessionDate);

  if (activeSession) {
    return practiceSessionPayload(activeSession);
  }

  if (requestedMode !== "extra") {
    const completedDailySession = db
      .prepare(
        `SELECT * FROM practice_sessions
         WHERE student_id = ? AND session_date = ?
           AND mode = 'daily' AND status = 'completed'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(studentId, sessionDate);
    if (completedDailySession) {
      return practiceSessionPayload(completedDailySession);
    }
  }

  const excludedQuestionIds = db
    .prepare(
      `SELECT DISTINCT sq.question_id
       FROM session_questions sq
       JOIN practice_sessions ps ON ps.id = sq.session_id
       WHERE ps.student_id = ? AND ps.session_date = ?`,
    )
    .all(studentId, sessionDate)
    .map((row) => row.question_id);
  const plannedQuestions = [];
  const reviewRows = selectDueReviewRows(studentId, 5, excludedQuestionIds);
  plannedQuestions.push(...reviewRows.map((row) => ({ row, purpose: "review" })));
  const afterReview = [...excludedQuestionIds, ...reviewRows.map((row) => row.id)];
  const reinforcementRows = selectReinforcementRows(studentId, 4, afterReview);
  plannedQuestions.push(
    ...reinforcementRows.map((row) => ({ row, purpose: "reinforcement" })),
  );
  const newTarget = 15 - plannedQuestions.length;
  const newRows = selectNewDailyRows(
    studentId,
    newTarget,
    [...afterReview, ...reinforcementRows.map((row) => row.id)],
  );
  plannedQuestions.push(...newRows.map((row) => ({ row, purpose: "new" })));
  if (plannedQuestions.length < 15) {
    const fallbackRows = selectRecommendedQuestionRows(
      studentId,
      null,
      15 - plannedQuestions.length,
      [],
      [...excludedQuestionIds, ...plannedQuestions.map((item) => item.row.id)],
      { onlyUnattempted: true },
    );
    plannedQuestions.push(...fallbackRows.map((row) => ({ row, purpose: "new" })));
  }

  const shuffledQuestions = shuffleArray(plannedQuestions);
  const questionIds = shuffledQuestions.map((item) => item.row.id);
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    studentId,
    mode: requestedMode === "extra" ? "extra" : "daily",
    sessionDate,
    status: questionIds.length ? "active" : "completed",
    targetCount: questionIds.length,
    createdAt: now,
    completedAt: questionIds.length ? null : now,
  };

  withTransaction(() => {
    db.prepare(
      `INSERT INTO practice_sessions (
        id, student_id, mode, session_date, status, target_count,
        created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      session.studentId,
      session.mode,
      session.sessionDate,
      session.status,
      session.targetCount,
      session.createdAt,
      session.completedAt,
    );

    const insertQuestion = db.prepare(
      `INSERT INTO session_questions (
        id, session_id, question_id, sort_order, purpose, answered_at, correct
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    );
    shuffledQuestions.forEach((item, index) => {
      insertQuestion.run(randomUUID(), session.id, item.row.id, index, item.purpose);
    });
  });

  return practiceSessionPayload(getPracticeSession(session.id));
}

function rowToDailyPlan(row) {
  const questionIds = parseJson(row.question_ids_json, []);
  return {
    id: row.id,
    studentId: row.student_id,
    planDate: row.plan_date,
    questionIds,
    createdAt: row.created_at,
    questions: getQuestionsByIds(questionIds).map((question) => publicQuestion(question)),
  };
}

function getQuestionsByIds(questionIds) {
  if (!questionIds.length) return [];

  const rows = db
    .prepare(
      `SELECT * FROM questions
       WHERE id IN (${questionIds.map(() => "?").join(",")})`,
    )
    .all(...questionIds);
  const byId = new Map(rows.map((row) => [row.id, rowToQuestion(row, false)]));

  return questionIds
    .map((id) => byId.get(id))
    .filter((question) => question && question.type !== "spelling");
}

function countCompletedPlannedQuestions(studentId, questionIds, createdAt) {
  if (!questionIds.length) return 0;

  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT question_id) AS total
       FROM attempts
       WHERE student_id = ?
         AND created_at >= ?
         AND question_id IN (${questionIds.map(() => "?").join(",")})`,
    )
    .get(studentId, createdAt, ...questionIds);

  return Number(row.total || 0);
}

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function recommendQuestions(studentId, module, limit = 5, vocabularyIds = []) {
  return selectRecommendedQuestionRows(studentId, module, limit, vocabularyIds).map((row) =>
    publicQuestion(rowToQuestion(row, false)),
  );
}

function recommendSpellingQuestions(studentId, limit = 10) {
  ensureSpellingQuestions();
  const curriculum = getStudentCurriculumProfile(studentId);
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  return db
    .prepare(
      `
      SELECT q.*,
        CASE
          WHEN m.id IS NOT NULL THEN 0
          WHEN a.question_id IS NULL THEN 1
          WHEN a.last_attempt_at < ? THEN 2
          ELSE 3
        END AS priority
      FROM questions q
      JOIN vocabulary v
        ON v.id = q.vocabulary_id
        AND v.spelling_enabled = 1
      LEFT JOIN mistakes m
        ON m.question_id = q.id
        AND m.student_id = ?
        AND m.resolved_at IS NULL
        AND (m.next_review_at IS NULL OR m.next_review_at <= ?)
      LEFT JOIN (
        SELECT question_id, MAX(created_at) AS last_attempt_at
        FROM attempts
        WHERE student_id = ?
        GROUP BY question_id
      ) a ON a.question_id = q.id
      WHERE q.status = 'published'
        AND q.module = 'words'
        AND q.type = 'spelling'
        AND NOT EXISTS (
          SELECT 1 FROM mistakes future_mistake
          WHERE future_mistake.student_id = ?
            AND future_mistake.question_id = q.id
            AND future_mistake.resolved_at IS NULL
            AND future_mistake.next_review_at > ?
        )
        AND (v.grade = ? OR (' ' || COALESCE(v.tag, '') || ' ') LIKE ?)
        AND CASE
              WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
              WHEN v.bnc > 0 THEN v.bnc
              WHEN v.frq > 0 THEN v.frq
              ELSE 0
            END BETWEEN 1 AND ?
      ORDER BY priority ASC,
        CASE
          WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
          WHEN v.bnc > 0 THEN v.bnc
          WHEN v.frq > 0 THEN v.frq
          ELSE 999999
        END ASC,
        ABS(q.difficulty - ?) ASC,
        RANDOM()
      LIMIT ?
    `,
    )
    .all(
      recentCutoff,
      studentId,
      now,
      studentId,
      studentId,
      now,
      curriculum.stage,
      `% ${curriculum.stageTag} %`,
      curriculum.frequencyCeiling,
      curriculum.targetDifficulty,
      limit,
    )
    .map((row) => publicQuestion(withSpellingPhonetic(rowToQuestion(row, true))));
}

function withSpellingPhonetic(question) {
  if (!question || question.type !== "spelling" || !question.vocabularyId) {
    return question;
  }

  const existingPhonetic = question.vocabulary?.find(Boolean);
  if (existingPhonetic) return question;

  const vocab = rowToVocabulary(
    db.prepare("SELECT * FROM vocabulary WHERE id = ?").get(question.vocabularyId),
  );
  if (!vocab?.phonetic) return question;

  return {
    ...question,
    vocabulary: [vocab.phonetic],
  };
}

function selectRecommendedQuestionRows(
  studentId,
  module,
  limit = 5,
  vocabularyIds = [],
  excludeQuestionIds = [],
  { onlyUnattempted = false } = {},
) {
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const curriculum = getStudentCurriculumProfile(studentId);
  const filteredVocabularyIds = vocabularyIds
    .map((id) => normalizeText(id))
    .filter(Boolean)
    .slice(0, 50);
  const filteredExcludeQuestionIds = excludeQuestionIds
    .map((id) => normalizeText(id))
    .filter(Boolean)
    .slice(0, 500);
  const vocabularyFilter = filteredVocabularyIds.length
    ? `AND q.vocabulary_id IN (${filteredVocabularyIds.map(() => "?").join(",")})`
    : "";
  const excludeFilter = filteredExcludeQuestionIds.length
    ? `AND q.id NOT IN (${filteredExcludeQuestionIds.map(() => "?").join(",")})`
    : "";

  const queryLimit = Math.max(limit, limit * 6);
  const rows = db
    .prepare(
      `
      SELECT q.*, v.bnc AS vocabulary_bnc, v.frq AS vocabulary_frq,
        CASE
          WHEN m.id IS NOT NULL THEN 0
          WHEN a.question_id IS NULL THEN 1
          WHEN a.last_attempt_at < ? THEN 2
          ELSE 3
        END AS priority
      FROM questions q
      LEFT JOIN vocabulary v ON v.id = q.vocabulary_id
      LEFT JOIN mistakes m
        ON m.question_id = q.id
        AND m.student_id = ?
        AND m.resolved_at IS NULL
        AND (m.next_review_at IS NULL OR m.next_review_at <= ?)
      LEFT JOIN (
        SELECT question_id, MAX(created_at) AS last_attempt_at
        FROM attempts
        WHERE student_id = ?
        GROUP BY question_id
      ) a ON a.question_id = q.id
      WHERE q.status = 'published'
        AND (? IS NULL OR q.module = ?)
        AND q.type <> 'spelling'
        AND (m.id IS NOT NULL OR q.difficulty <= ?)
        AND (? = 0 OR a.question_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM mistakes future_mistake
          WHERE future_mistake.student_id = ?
            AND future_mistake.question_id = q.id
            AND future_mistake.resolved_at IS NULL
            AND future_mistake.next_review_at > ?
        )
        ${vocabularyFilter}
        ${excludeFilter}
      ORDER BY priority ASC,
        CASE WHEN q.grade = ? THEN 0 ELSE 1 END ASC,
        CASE
          WHEN q.module = 'words' THEN
            CASE
              WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
              WHEN v.bnc > 0 THEN v.bnc
              WHEN v.frq > 0 THEN v.frq
              ELSE 999999
            END
          ELSE 0
        END ASC,
        ABS(q.difficulty - ?) ASC,
        q.difficulty ASC,
        RANDOM()
      LIMIT ?
    `,
    )
    .all(
      recentCutoff,
      studentId,
      now,
      studentId,
      module || null,
      module || null,
      curriculum.maxDifficulty,
      onlyUnattempted ? 1 : 0,
      studentId,
      now,
      ...filteredVocabularyIds,
      ...filteredExcludeQuestionIds,
      curriculum.stage,
      curriculum.targetDifficulty,
      queryLimit,
    );

  if (module !== "words") return rows.slice(0, limit);

  const seenVocabularyIds = new Set();
  return rows
    .filter((row) => {
      const key = row.vocabulary_id || row.id;
      if (seenVocabularyIds.has(key)) return false;
      seenVocabularyIds.add(key);
      return true;
    })
    .slice(0, limit);
}

function listParentChildren(parentUserId) {
  return db
    .prepare(
      `SELECT u.*, sp.grade, sp.level, sp.current_book, l.created_at AS linked_at
       FROM parent_student_links l
       JOIN users u ON u.id = l.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE l.parent_user_id = ? AND l.status = 'active'
       ORDER BY l.created_at DESC`,
    )
    .all(parentUserId)
    .map((row) => ({
      user: rowToUser(row),
      profile: {
        userId: row.id,
        grade: row.grade,
        level: row.level,
        currentBook: row.current_book,
      },
      linkedAt: row.linked_at,
    }));
}

function listStudentParents(studentUserId) {
  return db
    .prepare(
      `SELECT u.*, l.created_at AS linked_at
       FROM parent_student_links l
       JOIN users u ON u.id = l.parent_user_id
       WHERE l.student_user_id = ? AND l.status = 'active'
       ORDER BY l.created_at DESC`,
    )
    .all(studentUserId)
    .map((row) => ({
      user: rowToUser(row),
      linkedAt: row.linked_at,
    }));
}

function listTeacherGroups(teacherUserId) {
  return db
    .prepare(
      `SELECT g.*,
        COUNT(CASE WHEN gm.status = 'active' THEN 1 END) AS student_count
       FROM teacher_groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.teacher_user_id = ?
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
    )
    .all(teacherUserId)
    .map((row) => ({
      ...rowToTeacherGroup(row),
      studentCount: Number(row.student_count || 0),
    }));
}

function listStudentGroups(studentUserId) {
  return db
    .prepare(
      `SELECT g.*, u.name AS teacher_name, gm.joined_at
       FROM group_members gm
       JOIN teacher_groups g ON g.id = gm.group_id
       JOIN users u ON u.id = g.teacher_user_id
       WHERE gm.student_user_id = ? AND gm.status = 'active'
       ORDER BY gm.joined_at DESC`,
    )
    .all(studentUserId)
    .map((row) => ({
      ...rowToTeacherGroup(row),
      teacherName: row.teacher_name,
      joinedAt: row.joined_at,
    }));
}

function listGroupStudents(groupId, teacherUserId) {
  const group = db
    .prepare("SELECT * FROM teacher_groups WHERE id = ? AND teacher_user_id = ?")
    .get(groupId, teacherUserId);
  if (!group) return null;

  const students = db
    .prepare(
      `SELECT u.*, sp.grade, sp.level, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE gm.group_id = ? AND gm.status = 'active'
       ORDER BY gm.joined_at DESC`,
    )
    .all(groupId)
    .map((row) => ({
      user: rowToUser(row),
      profile: {
        userId: row.id,
        grade: row.grade,
        level: row.level,
      },
      joinedAt: row.joined_at,
      progress: buildProgress(row.id),
      summary: buildStudySummary(row.id),
    }));

  return { group: rowToTeacherGroup(group), students };
}

function makeShareCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

async function handleAccountRegister(req, res) {
  const body = await parseBody(req);
  const username = normalizeText(body.username);
  const password = String(body.password || "");
  const name = normalizeText(body.name);
  const role = normalizeText(body.role || "student");
  const allowedRoles = new Set(["student", "parent", "teacher"]);

  if (!username || !password || !name) {
    badRequest(res, "username, password and name are required");
    return;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    badRequest(res, `password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    return;
  }

  if (!allowedRoles.has(role)) {
    badRequest(res, "role must be student, parent or teacher");
    return;
  }

  const studentProfile =
    role === "student"
      ? {
          grade: normalizeStudentGrade(body.grade),
          level: normalizeStudentLevel(body.level),
          currentBook: normalizeText(body.currentBook || ""),
        }
      : null;
  if (studentProfile && (!studentProfile.grade || !studentProfile.level)) {
    badRequest(res, "student grade must be 7-12 and level must be low, middle or high");
    return;
  }

  if (findUserWithSecretByUsername(username)) {
    badRequest(res, "username already exists");
    return;
  }

  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    username,
    normalizedUsername: normalizeUsername(username),
    name,
    role,
    createdAt: now,
  };
  const { hash, salt } = hashPassword(password);

  withTransaction(() => {
    db.prepare(
      `INSERT INTO users (
        id, username, normalized_username, name, role,
        password_hash, password_salt, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      user.username,
      user.normalizedUsername,
      user.name,
      user.role,
      hash,
      salt,
      user.createdAt,
    );

    if (role === "student") {
      db.prepare(
        `INSERT INTO student_profiles
          (user_id, grade, level, current_book, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        user.id,
        studentProfile.grade,
        studentProfile.level,
        studentProfile.currentBook,
        now,
      );
      ensureStudentRecordForUser(rowToUser({ ...user, created_at: now }), {
        grade: studentProfile.grade,
        level: studentProfile.level,
        currentBook: studentProfile.currentBook,
      });
    }
  });

  send(res, 201, accountPayload(findUser(user.id), { includeToken: true }));
}

async function handleAccountLogin(req, res) {
  const body = await parseBody(req);
  const row = findUserWithSecretByUsername(body.username || "");

  if (!row || !verifyPassword(body.password || "", row.password_salt, row.password_hash)) {
    badRequest(res, "username or password is incorrect");
    return;
  }

  send(res, 200, accountPayload(rowToUser(row), { includeToken: true }));
}

async function handleLinkParent(req, res) {
  const body = await parseBody(req);
  const authUser = getAuthUser(req);
  const student = findUser(body.studentUserId);
  const parent = findUser(body.parentUserId);

  if (!student || student.role !== "student") {
    badRequest(res, "studentUserId is invalid");
    return;
  }

  if (!parent || parent.role !== "parent") {
    badRequest(res, "parentUserId is invalid");
    return;
  }

  if (authUser?.id !== student.id && authUser?.id !== parent.id && authUser?.role !== "admin") {
    forbidden(res);
    return;
  }

  const existingLink = db
    .prepare(
      `SELECT id FROM parent_student_links
       WHERE parent_user_id = ? AND student_user_id = ? AND status = 'active'`,
    )
    .get(parent.id, student.id);
  if (existingLink) {
    badRequest(res, "已绑定该家长");
    return;
  }

  db.prepare(
    `INSERT OR IGNORE INTO parent_student_links (
      id, parent_user_id, student_user_id, status, created_at
    ) VALUES (?, ?, ?, 'active', ?)`,
  ).run(randomUUID(), parent.id, student.id, new Date().toISOString());

  send(res, 200, {
    student: accountPayload(student),
    parent: accountPayload(parent),
  });
}

async function handleCreateTeacherGroup(req, res) {
  const body = await parseBody(req);
  const authUser = getAuthUser(req);
  const teacher = findUser(body.teacherUserId);
  const name = normalizeText(body.name);

  if (!teacher || teacher.role !== "teacher") {
    badRequest(res, "teacherUserId is invalid");
    return;
  }

  if (authUser?.id !== teacher.id && authUser?.role !== "admin") {
    forbidden(res);
    return;
  }

  if (!name) {
    badRequest(res, "name is required");
    return;
  }

  let shareCode = makeShareCode();
  while (db.prepare("SELECT id FROM teacher_groups WHERE share_code = ?").get(shareCode)) {
    shareCode = makeShareCode();
  }

  const group = {
    id: randomUUID(),
    teacherUserId: teacher.id,
    name,
    shareCode,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO teacher_groups (
      id, teacher_user_id, name, share_code, created_at
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(group.id, group.teacherUserId, group.name, group.shareCode, group.createdAt);

  send(res, 201, { group, groups: listTeacherGroups(teacher.id) });
}

async function handleJoinTeacherGroup(req, res) {
  const body = await parseBody(req);
  const authUser = getAuthUser(req);
  const student = findUser(body.studentUserId);
  const shareCode = normalizeText(body.shareCode).toUpperCase();

  if (!student || student.role !== "student") {
    badRequest(res, "studentUserId is invalid");
    return;
  }

  if (authUser?.id !== student.id && authUser?.role !== "admin") {
    forbidden(res);
    return;
  }

  const group = db
    .prepare("SELECT * FROM teacher_groups WHERE share_code = ?")
    .get(shareCode);
  if (!group) {
    badRequest(res, "shareCode is invalid");
    return;
  }

  const existingMember = db
    .prepare(
      `SELECT id FROM group_members
       WHERE group_id = ? AND student_user_id = ? AND status = 'active'`,
    )
    .get(group.id, student.id);
  if (existingMember) {
    badRequest(res, "已加入该分组");
    return;
  }

  db.prepare(
    `INSERT OR IGNORE INTO group_members (
      id, group_id, student_user_id, status, joined_at
    ) VALUES (?, ?, ?, 'active', ?)`,
  ).run(randomUUID(), group.id, student.id, new Date().toISOString());

  send(res, 200, {
    group: rowToTeacherGroup(group),
    groups: listStudentGroups(student.id),
  });
}

async function handleLogin(req, res) {
  if (!ALLOW_LEGACY_LOGIN) {
    forbidden(res);
    return;
  }

  const body = await parseBody(req);
  const name = normalizeText(body.name);
  const grade = normalizeStudentGrade(body.grade);
  const level = normalizeStudentLevel(body.level);

  if (!name || !grade || !level) {
    badRequest(res, "name is required, grade must be 7-12 and level must be low, middle or high");
    return;
  }

  const normalizedName = name.toLowerCase();
  const existing = rowToStudent(
    db.prepare("SELECT * FROM students WHERE normalized_name = ? AND grade = ?").get(
      normalizedName,
      grade,
    ),
  );

  if (existing) {
    send(res, 200, { student: existing });
    return;
  }

  const student = {
    id: randomUUID(),
    name,
    normalizedName,
    grade,
    level,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO students
      (id, name, normalized_name, grade, level, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    student.id,
    student.name,
    student.normalizedName,
    student.grade,
    student.level,
    student.createdAt,
  );

  send(res, 200, { student });
}

function selectDiagnosticQuestions(studentId) {
  const student = findStudent(studentId);
  const initial = initialLearningState(student);
  const stage = Number(student?.grade) <= 9 ? "初中" : "高中";
  const stageTag = Number(student?.grade) <= 9 ? "zk" : "gk";
  const wordRows = db
    .prepare(
      `SELECT q.*,
              CASE
                WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
                WHEN v.bnc > 0 THEN v.bnc
                ELSE v.frq
              END AS frequency_rank
       FROM questions q
       JOIN vocabulary v ON v.id = q.vocabulary_id
       WHERE q.module = 'words' AND q.status = 'published'
         AND q.type IN ('meaning_choice', 'word_choice')
         AND (v.tag LIKE ? OR q.grade = ?)
         AND (v.bnc > 0 OR v.frq > 0)`,
    )
    .all(`%${stageTag}%`, stage);
  const targets = [0.12, 0.25, 0.4, 0.6, 0.8, 1, 1.2, 1.45, 1.7, 2, 2.4, 3]
    .map((factor) => Math.max(1, Math.round(initial.frequencyFrontier * factor)));
  const selectedWords = [];
  const usedQuestionIds = new Set();
  const usedVocabularyIds = new Set();
  for (const target of targets) {
    const row = wordRows
      .filter(
        (item) =>
          !usedQuestionIds.has(item.id) &&
          !usedVocabularyIds.has(item.vocabulary_id),
      )
      .sort(
        (left, right) =>
          Math.abs(Number(left.frequency_rank) - target) -
          Math.abs(Number(right.frequency_rank) - target),
      )[0];
    if (!row) continue;
    selectedWords.push(row);
    usedQuestionIds.add(row.id);
    usedVocabularyIds.add(row.vocabulary_id);
  }

  function selectModule(module, count) {
    const rows = db
      .prepare(
        `SELECT * FROM questions
         WHERE module = ? AND status = 'published' AND type <> 'spelling'
           AND json_array_length(options_json) > 1
         ORDER BY CASE WHEN grade = ? THEN 0 ELSE 1 END, RANDOM()`,
      )
      .all(module, stage);
    const targetsByCount =
      count === 5
        ? [-1, 0, 0, 1, 1]
        : [-1, 0, 1];
    const selected = [];
    const used = new Set();
    for (const offset of targetsByCount) {
      const target = clampDifficulty(initial.questionLevel + offset);
      const row = rows
        .filter((item) => !used.has(item.id))
        .sort(
          (left, right) =>
            Math.abs(Number(left.difficulty) - target) -
            Math.abs(Number(right.difficulty) - target),
        )[0];
      if (!row) continue;
      selected.push(row);
      used.add(row.id);
    }
    return selected.slice(0, count);
  }

  return shuffleArray([
    ...selectedWords,
    ...selectModule("grammar", 5),
    ...selectModule("reading", 3),
  ]);
}

function diagnosticSessionPayload(session) {
  const questionIds = parseJson(session.question_ids_json, []);
  const rows = questionIds
    .map((questionId) => db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId))
    .filter(Boolean);
  const attempts = db
    .prepare("SELECT * FROM diagnostic_attempts WHERE session_id = ? ORDER BY created_at")
    .all(session.id);
  const answeredIds = new Set(attempts.map((attempt) => attempt.question_id));
  const currentIndex = rows.findIndex((row) => !answeredIds.has(row.id));
  return {
    sessionId: session.id,
    status: session.status,
    currentIndex: currentIndex === -1 ? rows.length : currentIndex,
    correctCount: attempts.filter((attempt) => Number(attempt.correct) === 1).length,
    wrongCount: attempts.filter((attempt) => Number(attempt.correct) === 0).length,
    questions: rows.map((row) => publicQuestion(rowToQuestion(row, false))),
    learningState: ensureStudentLearningState(session.student_id),
  };
}

function getOrCreateDiagnosticSession(studentId) {
  const state = ensureStudentLearningState(studentId);
  if (!state) return null;
  const existing = db
    .prepare(
      `SELECT * FROM diagnostic_sessions
       WHERE student_id = ? AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(studentId);
  if (existing) return diagnosticSessionPayload(existing);
  if (state.diagnosticStatus === "completed") {
    return { status: "completed", questions: [], learningState: state };
  }

  const questions = selectDiagnosticQuestions(studentId);
  if (questions.length === 0) return null;
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    studentId,
    questionIds: questions.map((question) => question.id),
  };
  withTransaction(() => {
    db.prepare(
      `INSERT INTO diagnostic_sessions
        (id, student_id, status, question_ids_json, created_at)
       VALUES (?, ?, 'active', ?, ?)`,
    ).run(session.id, studentId, JSON.stringify(session.questionIds), now);
    db.prepare(
      `UPDATE student_learning_states
       SET diagnostic_status = 'in_progress', updated_at = ?
       WHERE student_id = ?`,
    ).run(now, studentId);
  });
  return diagnosticSessionPayload(
    db.prepare("SELECT * FROM diagnostic_sessions WHERE id = ?").get(session.id),
  );
}

function completeDiagnostic(session, now) {
  const attempts = db
    .prepare(
      `SELECT da.correct, q.module
       FROM diagnostic_attempts da
       JOIN questions q ON q.id = da.question_id
       WHERE da.session_id = ?`,
    )
    .all(session.id);
  const scoreFor = (module) => {
    const rows = attempts.filter((attempt) => attempt.module === module);
    if (!rows.length) return 0;
    return Math.round(
      (rows.filter((attempt) => Number(attempt.correct) === 1).length / rows.length) * 100,
    );
  };
  const totalScore = attempts.length
    ? Math.round(
        (attempts.filter((attempt) => Number(attempt.correct) === 1).length /
          attempts.length) *
          100,
      )
    : 0;
  const vocabularyScore = scoreFor("words");
  const initial = initialLearningState(findStudent(session.student_id));
  const frontierFactor =
    vocabularyScore < 30
      ? 0.55
      : vocabularyScore < 50
        ? 0.8
        : vocabularyScore < 70
          ? 1
          : vocabularyScore < 85
            ? 1.35
            : 1.75;
  const frequencyFrontier = Math.min(
    30000,
    Math.max(100, Math.round((initial.frequencyFrontier * frontierFactor) / 50) * 50),
  );
  const questionLevel =
    totalScore < 45 ? 1 : totalScore < 65 ? 2 : totalScore < 80 ? 3 : totalScore < 92 ? 4 : 5;

  db.prepare(
    `UPDATE diagnostic_sessions
     SET status = 'completed', completed_at = ? WHERE id = ?`,
  ).run(now, session.id);
  db.prepare(
    `UPDATE student_learning_states
     SET frequency_frontier = ?, question_level = ?,
         diagnostic_status = 'completed', diagnostic_score = ?,
         vocabulary_score = ?, grammar_score = ?, reading_score = ?,
         updated_at = ?, diagnostic_completed_at = ?
     WHERE student_id = ?`,
  ).run(
    frequencyFrontier,
    questionLevel,
    totalScore,
    vocabularyScore,
    scoreFor("grammar"),
    scoreFor("reading"),
    now,
    now,
    session.student_id,
  );
}

async function handleDiagnosticAttempt(req, res) {
  const body = await parseBody(req);
  const student = findStudent(body.studentId);
  const session = db
    .prepare("SELECT * FROM diagnostic_sessions WHERE id = ?")
    .get(normalizeText(body.sessionId || ""));
  const question = getQuestion(body.questionId);
  if (!student || !session || !question || session.student_id !== student.id) {
    badRequest(res, "diagnostic session, student or question is invalid");
    return;
  }
  if (!canAccessStudent(getAuthUser(req), student.id)) {
    forbidden(res);
    return;
  }
  if (session.status !== "active") {
    badRequest(res, "diagnostic session is already completed");
    return;
  }
  const questionIds = parseJson(session.question_ids_json, []);
  if (!questionIds.includes(question.id)) {
    badRequest(res, "question is not part of this diagnostic session");
    return;
  }
  const existing = db
    .prepare(
      "SELECT id FROM diagnostic_attempts WHERE session_id = ? AND question_id = ?",
    )
    .get(session.id, question.id);
  if (existing) {
    badRequest(res, "question has already been answered");
    return;
  }

  const answer = normalizeText(body.answer || "");
  const correct = normalizeAnswer(answer) === normalizeAnswer(question.answer);
  const now = new Date().toISOString();
  withTransaction(() => {
    db.prepare(
      `INSERT INTO diagnostic_attempts
        (id, session_id, student_id, question_id, answer, correct, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), session.id, student.id, question.id, answer, correct ? 1 : 0, now);
    const completed = db
      .prepare("SELECT COUNT(*) AS total FROM diagnostic_attempts WHERE session_id = ?")
      .get(session.id);
    if (Number(completed.total) >= questionIds.length) {
      completeDiagnostic(session, now);
    }
  });

  const updatedSession = db
    .prepare("SELECT * FROM diagnostic_sessions WHERE id = ?")
    .get(session.id);
  send(res, 201, {
    result: {
      correct,
      correctAnswer: question.answer,
      explain: question.explain,
    },
    diagnostic: diagnosticSessionPayload(updatedSession),
  });
}

function maybeUpdateStudentLearningState(studentId) {
  const state = ensureStudentLearningState(studentId);
  if (!state || state.diagnosticStatus !== "completed") return state;
  const countRow = db
    .prepare("SELECT COUNT(*) AS total FROM attempts WHERE student_id = ?")
    .get(studentId);
  const totalAttempts = Number(countRow.total || 0);
  if (totalAttempts - state.lastEvaluatedAttemptCount < 30) return state;
  const recent = db
    .prepare(
      `SELECT correct, question_id, module FROM attempts
       WHERE student_id = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .all(studentId);
  if (new Set(recent.map((attempt) => attempt.question_id)).size < 20) return state;
  const accuracy = recent.filter((attempt) => Number(attempt.correct) === 1).length / recent.length;
  const recentVocabulary = recent.filter((attempt) => attempt.module === "words");
  const vocabularyCoverage = new Set(
    recentVocabulary.map((attempt) => attempt.question_id),
  ).size;
  const vocabularyAccuracy = recentVocabulary.length
    ? recentVocabulary.filter((attempt) => Number(attempt.correct) === 1).length /
      recentVocabulary.length
    : null;
  let frequencyFrontier = state.frequencyFrontier;
  let questionLevel = state.questionLevel;
  if (accuracy >= 0.85) {
    questionLevel = clampDifficulty(questionLevel + 1);
  } else if (accuracy < 0.55) {
    questionLevel = clampDifficulty(questionLevel - 1);
  }
  if (vocabularyCoverage >= 10 && vocabularyAccuracy >= 0.85) {
    frequencyFrontier = Math.min(30000, Math.round(frequencyFrontier * 1.15));
  } else if (vocabularyCoverage >= 10 && vocabularyAccuracy >= 0.65) {
    frequencyFrontier = Math.min(30000, Math.round(frequencyFrontier * 1.08));
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE student_learning_states
     SET frequency_frontier = ?, question_level = ?,
         last_evaluated_attempt_count = ?, updated_at = ?
     WHERE student_id = ?`,
  ).run(frequencyFrontier, questionLevel, totalAttempts, now, studentId);
  return ensureStudentLearningState(studentId);
}

async function handleAttempt(req, res) {
  const body = await parseBody(req);
  const student = findStudent(body.studentId);
  const question = getQuestion(body.questionId);
  const sessionId = normalizeText(body.sessionId || "");

  if (!student) {
    badRequest(res, "studentId is invalid");
    return;
  }

  if (!question) {
    badRequest(res, "questionId is invalid");
    return;
  }

  if (!canAccessStudent(getAuthUser(req), student.id)) {
    forbidden(res);
    return;
  }

  const practiceSession = sessionId ? getPracticeSession(sessionId) : null;
  if (
    sessionId &&
    (!practiceSession ||
      practiceSession.student_id !== student.id ||
      !db
        .prepare(
          `SELECT 1 FROM session_questions
           WHERE session_id = ? AND question_id = ?`,
        )
        .get(sessionId, question.id))
  ) {
    badRequest(res, "sessionId does not contain this question");
    return;
  }

  const answer = normalizeText(body.answer || "");
  const acceptedAnswers = [question.answer];
  if (question.type === "spelling" && question.vocabularyId) {
    const vocabulary = rowToVocabulary(
      db.prepare("SELECT * FROM vocabulary WHERE id = ?").get(question.vocabularyId),
    );
    acceptedAnswers.push(...(vocabulary?.acceptedAnswers || []));
  }
  const correct = acceptedAnswers.some(
    (acceptedAnswer) => normalizeAnswer(answer) === normalizeAnswer(acceptedAnswer),
  );
  const now = new Date().toISOString();
  const attempt = {
    id: randomUUID(),
    studentId: student.id,
    questionId: question.id,
    module: question.module,
    knowledgePoint: question.knowledgePoint,
    answer,
    correct,
    timeSpentSeconds: Number(body.timeSpentSeconds || 0),
    createdAt: now,
  };

  withTransaction(() => {
    db.prepare(
      `INSERT INTO attempts (
        id, student_id, question_id, module, knowledge_point, answer,
        correct, time_spent_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      attempt.id,
      attempt.studentId,
      attempt.questionId,
      attempt.module,
      attempt.knowledgePoint,
      attempt.answer,
      correct ? 1 : 0,
      attempt.timeSpentSeconds,
      attempt.createdAt,
    );

    const existingMistake = db
      .prepare(
        `SELECT * FROM mistakes
         WHERE student_id = ? AND question_id = ? AND resolved_at IS NULL`,
      )
      .get(student.id, question.id);

    if (!correct && !existingMistake) {
      db.prepare(
        `INSERT INTO mistakes (
          id, student_id, question_id, module, knowledge_point, wrong_answer,
          review_count, correct_review_streak, review_stage, last_reviewed_at,
          next_review_at, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, NULL)`,
      ).run(
        randomUUID(),
        student.id,
        question.id,
        question.module,
        question.knowledgePoint,
        answer,
        now,
        scheduleAfterDays(1),
        now,
      );
    }

    if (!correct && existingMistake) {
      db.prepare(
        `UPDATE mistakes
         SET wrong_answer = ?, review_count = review_count + 1,
             correct_review_streak = 0, review_stage = 0,
             last_reviewed_at = ?, next_review_at = ?
         WHERE id = ?`,
      ).run(answer, now, scheduleAfterDays(1), existingMistake.id);
    }

    if (correct && existingMistake) {
      const nextReviewStage = Number(existingMistake.review_stage || 0) + 1;
      const resolvedAt = nextReviewStage >= 4 ? now : null;
      const reviewIntervals = [1, 3, 7, 14];
      const nextReviewAt = resolvedAt
        ? null
        : scheduleAfterDays(reviewIntervals[Math.min(nextReviewStage - 1, 3)]);
      db.prepare(
        `UPDATE mistakes
         SET review_count = review_count + 1,
             correct_review_streak = ?,
             review_stage = ?,
             last_reviewed_at = ?,
             next_review_at = ?,
             resolved_at = COALESCE(?, resolved_at)
         WHERE id = ?`,
      ).run(
        nextReviewStage,
        nextReviewStage,
        now,
        nextReviewAt,
        resolvedAt,
        existingMistake.id,
      );
    }

    updateStudentKnowledge(student.id, question.knowledgePoint, correct, now);

    if (practiceSession?.status === "active") {
      db.prepare(
        `UPDATE session_questions
         SET answered_at = COALESCE(answered_at, ?),
             correct = COALESCE(correct, ?)
         WHERE session_id = ? AND question_id = ?`,
      ).run(now, correct ? 1 : 0, practiceSession.id, question.id);

      const remaining = db
        .prepare(
          `SELECT COUNT(*) AS total FROM session_questions
           WHERE session_id = ? AND answered_at IS NULL`,
        )
        .get(practiceSession.id);
      if (Number(remaining.total || 0) === 0) {
        db.prepare(
          `UPDATE practice_sessions
           SET status = 'completed', completed_at = ?
           WHERE id = ?`,
        ).run(now, practiceSession.id);
      }
    }
  });

  const updatedSession = practiceSession
    ? practiceSessionPayload(getPracticeSession(practiceSession.id))
    : null;
  const learningState = maybeUpdateStudentLearningState(student.id);

  send(res, 201, {
    attempt,
    result: {
      correct,
      correctAnswer: question.answer,
      explain: question.explain,
    },
    session: updatedSession
      ? {
          id: updatedSession.id,
          status: updatedSession.status,
          currentIndex: updatedSession.currentIndex,
          completedAt: updatedSession.completedAt,
        }
      : null,
    progress: buildProgress(student.id),
    mistakes: getStudentMistakes(student.id),
    learningState,
  });
}

function updateStudentKnowledge(studentId, knowledgePoint, correct, now) {
  const existing = db
    .prepare(
      `SELECT * FROM student_knowledge
       WHERE student_id = ? AND knowledge_point = ?`,
    )
    .get(studentId, knowledgePoint);

  if (!existing) {
    db.prepare(
      `INSERT INTO student_knowledge (
        id, student_id, knowledge_point, mastery_level, correct_streak,
        wrong_streak, last_practiced_at, next_review_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      studentId,
      knowledgePoint,
      correct ? 1 : 0,
      correct ? 1 : 0,
      correct ? 0 : 1,
      now,
      nextReviewAt(correct ? 1 : 0, correct),
    );
    return;
  }

  const correctStreak = correct ? existing.correct_streak + 1 : 0;
  const wrongStreak = correct ? 0 : existing.wrong_streak + 1;
  const masteryLevel = Math.max(
    0,
    Math.min(5, existing.mastery_level + (correct ? 1 : -1)),
  );

  db.prepare(
    `UPDATE student_knowledge
     SET mastery_level = ?, correct_streak = ?, wrong_streak = ?,
         last_practiced_at = ?, next_review_at = ?
     WHERE id = ?`,
  ).run(
    masteryLevel,
    correctStreak,
    wrongStreak,
    now,
    nextReviewAt(masteryLevel, correct),
    existing.id,
  );
}

function normalizeAnswer(value) {
  return normalizeText(value)
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/\s+$/g, "");
}

function nextReviewAt(masteryLevel, correct) {
  const days = correct ? [1, 3, 7, 15, 30][Math.min(masteryLevel, 4)] : 1;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function scheduleAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function handleCreateQuestion(req, res) {
  const body = await parseBody(req);
  const required = ["module", "prompt", "options", "answer", "explain", "knowledgePoint"];
  const missing = required.filter((key) => !body[key]);

  if (missing.length > 0) {
    badRequest(res, `Missing fields: ${missing.join(", ")}`);
    return;
  }

  const question = normalizeQuestion(body);
  const inserted = insertQuestion(question);
  send(res, inserted ? 201 : 200, {
    question: publicQuestion(question),
    inserted,
  });
}

function insertQuestion(question) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO questions (
        id, module, type, title, passage, vocabulary_json, prompt, options_json,
        answer, explain, grade, difficulty, knowledge_point, vocabulary_id,
        source_book, source_unit, source_type, status, fingerprint, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...questionParams(question));
  return result.changes > 0;
}

async function handleImportVocabulary(req, res) {
  const body = await parseBody(req);
  const rawItems = Array.isArray(body.items) ? body.items : parseCsv(body.csv || "");
  const status = body.status === "draft" ? "draft" : "published";

  if (rawItems.length === 0) {
    badRequest(res, "items or csv is required");
    return;
  }

  const summary = {
    importedVocabulary: 0,
    skippedVocabulary: 0,
    generatedQuestions: 0,
    skippedQuestions: 0,
    vocabulary: [],
    questions: [],
  };

  withTransaction(() => {
    for (const rawItem of rawItems) {
      const vocab = normalizeVocabulary(rawItem);
      if (!vocab.word || !vocab.meaning) {
        summary.skippedVocabulary += 1;
        continue;
      }

      const inserted = insertVocabulary(vocab);
      const savedVocabulary =
        rowToVocabulary(db.prepare("SELECT * FROM vocabulary WHERE id = ?").get(vocab.id)) ||
        rowToVocabulary(
          db
            .prepare(
              `SELECT * FROM vocabulary
               WHERE word = ? AND meaning = ?
                 AND COALESCE(source_book, '') = COALESCE(?, '')
                 AND COALESCE(source_unit, '') = COALESCE(?, '')`,
            )
            .get(vocab.word, vocab.meaning, vocab.sourceBook, vocab.sourceUnit),
        );

      if (inserted) {
        summary.importedVocabulary += 1;
      } else {
        summary.skippedVocabulary += 1;
      }

      if (savedVocabulary) {
        summary.vocabulary.push(savedVocabulary);
        const generated = generateVocabularyQuestions(savedVocabulary, status);
        for (const question of generated) {
          if (insertQuestion(question)) {
            summary.generatedQuestions += 1;
            summary.questions.push(publicQuestion(question));
          } else {
            summary.skippedQuestions += 1;
          }
        }
      }
    }
  });
  send(res, 201, summary);
}

function normalizeVocabulary(item) {
  const now = new Date().toISOString();
  const word = cleanVocabularyWord(item.word);
  const meaning = normalizeText(item.meaning);
  const sourceBook = normalizeText(item.sourceBook || item.source_book || "");
  const sourceUnit = normalizeText(item.sourceUnit || item.source_unit || "");
  const id = isUuid(item.id) ? item.id : randomUUID();
  const bnc = Number(item.bnc || 0);
  const frq = Number(item.frq || 0);
  const explicitDifficulty = Number(item.difficulty || 0);

  const vocabulary = {
    id,
    word,
    meaning,
    partOfSpeech: normalizeText(item.partOfSpeech || item.part_of_speech || ""),
    phonetic: normalizeText(item.phonetic || ""),
    example: normalizeText(item.example || ""),
    grade: normalizeText(item.grade || "初中"),
    semester: normalizeText(item.semester || ""),
    sourceBook,
    sourceUnit,
    difficulty: difficultyFromFrequency({ bnc, frq }, explicitDifficulty || 1),
    tag: normalizeText(item.tag || ""),
    bnc,
    frq,
    tags: normalizeTags(item.tags || item.tag),
    acceptedAnswers: Array.isArray(item.acceptedAnswers)
      ? item.acceptedAnswers.map(normalizeText).filter(Boolean)
      : [],
    createdAt: item.createdAt || now,
  };
  const spelling = spellingSettingsForVocabulary(vocabulary);
  return {
    ...vocabulary,
    spellingEnabled: spelling.enabled,
    spellingMode: spelling.mode,
    spellingAnswer: spelling.answer,
  };
}

function cleanVocabularyWord(value) {
  return normalizeText(value).replaceAll("*", "").replace(/\s+/g, "").trim();
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(normalizeText).filter(Boolean);
  return String(tags || "")
    .split(/[\s|,，、]+/)
    .map(normalizeText)
    .filter(Boolean);
}

function insertVocabulary(vocab) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO vocabulary (
        id, word, meaning, part_of_speech, phonetic, example, grade, semester,
        source_book, source_unit, difficulty, tag, bnc, frq, spelling_enabled,
        spelling_mode, spelling_answer, accepted_answers_json, tags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      vocab.id,
      vocab.word,
      vocab.meaning,
      vocab.partOfSpeech,
      vocab.phonetic,
      vocab.example,
      vocab.grade,
      vocab.semester,
      vocab.sourceBook,
      vocab.sourceUnit,
      vocab.difficulty,
      vocab.tag,
      vocab.bnc,
      vocab.frq,
      vocab.spellingEnabled ? 1 : 0,
      vocab.spellingMode,
      vocab.spellingAnswer,
      JSON.stringify(vocab.acceptedAnswers || []),
      JSON.stringify(vocab.tags),
      vocab.createdAt,
    );
  return result.changes > 0;
}

function generateVocabularyQuestions(vocab, status) {
  const createdAt = new Date().toISOString();
  const baseDifficulty = questionDifficultyForVocabulary(vocab);
  const common = {
    module: "words",
    grade: vocab.grade,
    knowledgePoint: vocab.word,
    vocabularyId: vocab.id,
    sourceBook: vocab.sourceBook,
    sourceUnit: vocab.sourceUnit,
    sourceType: "rule-generated",
    status,
    createdAt,
  };

  const questions = [
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-meaning-choice`,
      type: "meaning_choice",
      prompt: `Choose the meaning of "${vocab.word}".`,
      options: buildOptions(vocab.meaning, meaningDistractors(vocab)),
      answer: vocab.meaning,
      explain: `${vocab.word} 表示“${vocab.meaning}”。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-word-choice`,
      type: "word_choice",
      prompt: `Which word means “${vocab.meaning}”?`,
      options: buildOptions(vocab.word, wordDistractors(vocab)),
      answer: vocab.word,
      explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-sentence-blank`,
      type: "sentence_blank",
      prompt: sentenceBlankPrompt(vocab),
      options: buildOptions(vocab.word, wordDistractors(vocab)),
      answer: vocab.word,
      explain: `根据句意和词义，这里应填 ${vocab.word}。`,
      difficulty: questionDifficultyForVocabulary(vocab, 1),
    }),
  ];
  const spellingQuestion = spellingQuestionForVocabulary(vocab, status);
  if (spellingQuestion) questions.push(spellingQuestion);
  return questions;
}

function spellingQuestionForVocabulary(vocab, status = "published") {
  const spelling = spellingSettingsForVocabulary(vocab);
  if (!spelling.enabled) return null;

  return normalizeQuestion({
    module: "words",
    grade: vocab.grade,
    knowledgePoint: vocab.word,
    vocabularyId: vocab.id,
    sourceBook: vocab.sourceBook,
    sourceUnit: vocab.sourceUnit,
    sourceType: "rule-generated",
    status,
    createdAt: new Date().toISOString(),
    id: `q-${vocab.id}-spelling`,
    type: "spelling",
    title: "拼写练习",
    vocabulary: [vocab.phonetic || ""],
    prompt: `根据中文意思拼写单词：${vocab.meaning}`,
    options: [],
    answer: vocab.spellingAnswer || spelling.answer,
    explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
    difficulty: questionDifficultyForVocabulary(vocab),
  });
}

function ensureSpellingQuestions() {
  const rows = db
    .prepare(
      `SELECT v.*
       FROM vocabulary v
       LEFT JOIN questions q ON q.vocabulary_id = v.id
        AND q.type = 'spelling'
       WHERE q.id IS NULL AND v.spelling_enabled = 1
       LIMIT 500`,
    )
    .all();

  for (const row of rows) {
    const vocab = rowToVocabulary(row);
    if (vocab) {
      const question = spellingQuestionForVocabulary(vocab, "published");
      if (question) insertQuestion(question);
    }
  }
}

function meaningDistractors(vocab) {
  const rows = db
    .prepare("SELECT meaning FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8")
    .all(vocab.id)
    .map((row) => row.meaning);
  return [...rows, ...fallbackMeanings];
}

function wordDistractors(vocab) {
  const rows = db
    .prepare("SELECT word FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8")
    .all(vocab.id)
    .map((row) => row.word);
  return [...rows, ...fallbackWords];
}

function buildOptions(answer, candidates) {
  const options = [answer];
  for (const candidate of candidates) {
    const value = normalizeText(candidate);
    if (value && value !== answer && !options.includes(value)) {
      options.push(value);
    }
    if (options.length === 4) break;
  }
  return options.sort((a, b) =>
    createHash("sha1").update(a).digest("hex").localeCompare(
      createHash("sha1").update(b).digest("hex"),
    ),
  );
}

function sentenceBlankPrompt(vocab) {
  if (vocab.example && vocab.example.toLowerCase().includes(vocab.word.toLowerCase())) {
    const pattern = new RegExp(`\\b${escapeRegExp(vocab.word)}\\b`, "i");
    return vocab.example.replace(pattern, "____");
  }
  return `Choose the word that best fits the sentence: I need to use "${vocab.meaning}" in English: ____.`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listVocabulary(limit = 50) {
  return db
    .prepare("SELECT * FROM vocabulary ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(rowToVocabulary);
}

function listStudyVocabulary(studentId, limit = 12) {
  const curriculum = getStudentCurriculumProfile(studentId);
  const rows = db
    .prepare(
      `WITH base AS (
         SELECT v.*, COALESCE(sk.mastery_level, 0) AS mastery_level,
                sk.last_practiced_at,
                CASE
                  WHEN v.bnc > 0 AND v.frq > 0 THEN MIN(v.bnc, v.frq)
                  WHEN v.bnc > 0 THEN v.bnc
                  WHEN v.frq > 0 THEN v.frq
                  ELSE 0
                END AS frequency_rank
         FROM vocabulary v
         LEFT JOIN student_knowledge sk
           ON lower(sk.knowledge_point) = lower(v.word)
           AND sk.student_id = ?
         WHERE v.grade = ?
            OR (' ' || COALESCE(v.tag, '') || ' ') LIKE ?
       ), ranked AS (
         SELECT base.*,
                ROW_NUMBER() OVER (
                  PARTITION BY lower(word)
                  ORDER BY CASE WHEN source_book = 'ECDICT' THEN 1 ELSE 0 END,
                           CASE WHEN COALESCE(phonetic, '') = '' THEN 1 ELSE 0 END,
                           created_at ASC
                ) AS word_row
         FROM base
         WHERE frequency_rank > 0 AND frequency_rank <= ?
       )
       SELECT * FROM ranked
       WHERE word_row = 1
       ORDER BY mastery_level ASC,
                last_practiced_at IS NOT NULL ASC,
                frequency_rank ASC,
                RANDOM()
       LIMIT ?`,
    )
    .all(
      studentId,
      curriculum.stage,
      `% ${curriculum.stageTag} %`,
      curriculum.frequencyCeiling,
      limit,
    );

  return rows.map((row) => ({
    ...rowToVocabulary(row),
    masteryLevel: Number(row.mastery_level || 0),
    lastPracticedAt: row.last_practiced_at,
    frequencyRank: Number(row.frequency_rank || 0),
    curriculumStage: curriculum.stage,
    curriculumFrequencyCeiling: curriculum.frequencyCeiling,
  }));
}

function searchVocabulary(word, limit = 10) {
  const keyword = normalizeText(word).toLowerCase();
  if (!keyword) return [];

  return db
    .prepare(
      `SELECT *
       FROM vocabulary
       WHERE lower(word) = ?
          OR lower(word) LIKE ?
       ORDER BY CASE WHEN lower(word) = ? THEN 0 ELSE 1 END,
                length(word) ASC,
                created_at DESC
       LIMIT ?`,
    )
    .all(keyword, `%${keyword}%`, keyword, limit)
    .map(rowToVocabulary);
}

function listQuestions({ module, status, limit }) {
  const rows = db
    .prepare(
      `SELECT * FROM questions
       WHERE (? IS NULL OR module = ?)
         AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(module || null, module || null, status || null, status || null, limit);
  return rows.map((row) => publicQuestion(rowToQuestion(row, false)));
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, jsonHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);
  const authUser = getAuthUser(req);

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, {
      ok: true,
      service: "english-learning-backend",
      database: DB_PATH,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/register") {
    await handleAccountRegister(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts/login") {
    await handleAccountLogin(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/accounts/me") {
    const user = requireAuth(req, res);
    if (!user) {
      return;
    }
    send(res, 200, accountPayload(user, { includeToken: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/parent-student-links") {
    const user = requireAuth(req, res);
    if (!user) return;
    await handleLinkParent(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teacher-groups") {
    const user = requireAuth(req, res);
    if (!user) return;
    await handleCreateTeacherGroup(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/group-members/join") {
    const user = requireAuth(req, res);
    if (!user) return;
    await handleJoinTeacherGroup(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/teacher-groups") {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.role !== "teacher" && user.role !== "admin") {
      forbidden(res);
      return;
    }
    send(res, 200, { groups: listTeacherGroups(user.id) });
    return;
  }

  if (
    req.method === "GET" &&
    segments[0] === "api" &&
    segments[1] === "teacher-groups" &&
    segments[2]
  ) {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.role !== "teacher" && user.role !== "admin") {
      forbidden(res);
      return;
    }
    const result = listGroupStudents(segments[2], user.id);
    if (!result) {
      badRequest(res, "groupId is invalid");
      return;
    }
    send(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    const module = url.searchParams.get("module");
    const studentId = url.searchParams.get("studentId") || "";
    const limit = Number(url.searchParams.get("limit") || 5);
    const vocabularyIds = (url.searchParams.get("vocabularyIds") || "")
      .split(",")
      .map((id) => normalizeText(id))
      .filter(Boolean);
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    send(res, 200, {
      questions: recommendQuestions(studentId, module, limit, vocabularyIds),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/daily-tasks") {
    const studentId = url.searchParams.get("studentId") || "";
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    send(res, 200, { tasks: buildDailyTasks(studentId) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/diagnostic") {
    const studentId = url.searchParams.get("studentId") || "";
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    const diagnostic = getOrCreateDiagnosticSession(studentId);
    if (!diagnostic) {
      badRequest(res, "诊断题库不足，请先补充已发布题目");
      return;
    }
    send(res, 200, { diagnostic });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/diagnostic/attempts") {
    await handleDiagnosticAttempt(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/daily-plan") {
    const studentId = url.searchParams.get("studentId") || "";
    const mode = url.searchParams.get("mode") === "extra" ? "extra" : "resume";
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    const plan = getOrCreateDailyPracticeSession(studentId, mode);
    if (!plan) {
      badRequest(res, "studentId is invalid");
      return;
    }

    send(res, 200, { plan });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/spelling-questions") {
    const studentId = url.searchParams.get("studentId") || "";
    const limit = Number(url.searchParams.get("limit") || 10);
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    if (!findStudent(studentId)) {
      badRequest(res, "studentId is invalid");
      return;
    }

    send(res, 200, { questions: recommendSpellingQuestions(studentId, limit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/vocabulary/study") {
    const studentId = url.searchParams.get("studentId") || "";
    const limit = Number(url.searchParams.get("limit") || 12);
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    if (!findStudent(studentId)) {
      badRequest(res, "studentId is invalid");
      return;
    }

    send(res, 200, { vocabulary: listStudyVocabulary(studentId, limit) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/vocabulary/search") {
    const user = requireAuth(req, res);
    if (!user) return;

    const word = url.searchParams.get("word") || "";
    const limit = Number(url.searchParams.get("limit") || 10);
    const vocabulary = searchVocabulary(word, limit);
    send(res, 200, { vocabulary });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attempts") {
    await handleAttempt(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/vocabulary") {
    if (!isAdmin(authUser)) {
      forbidden(res);
      return;
    }
    const limit = Number(url.searchParams.get("limit") || 50);
    send(res, 200, { vocabulary: listVocabulary(limit) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/vocabulary/import") {
    if (!isAdmin(authUser)) {
      forbidden(res);
      return;
    }
    await handleImportVocabulary(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/questions") {
    if (!isAdmin(authUser)) {
      forbidden(res);
      return;
    }
    send(res, 200, {
      questions: listQuestions({
        module: url.searchParams.get("module"),
        status: url.searchParams.get("status"),
        limit: Number(url.searchParams.get("limit") || 50),
      }),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/questions") {
    if (!isAdmin(authUser)) {
      forbidden(res);
      return;
    }
    await handleCreateQuestion(req, res);
    return;
  }

  if (segments[0] === "api" && segments[1] === "students" && segments[2]) {
    const studentId = segments[2];
    const student = findStudent(studentId);

    if (!student) {
      badRequest(res, "studentId is invalid");
      return;
    }

    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }

    if (req.method === "GET" && segments[3] === "profile") {
      send(res, 200, {
        student,
        learningState: ensureStudentLearningState(studentId),
        progress: buildProgress(studentId),
        tasks: buildDailyTasks(studentId),
        summary: buildStudySummary(studentId),
      });
      return;
    }

    if (req.method === "GET" && segments[3] === "mistakes") {
      send(res, 200, {
        mistakes: getStudentMistakes(studentId, url.searchParams.get("due") === "1"),
      });
      return;
    }

    if (req.method === "GET" && segments[3] === "progress") {
      send(res, 200, { progress: buildProgress(studentId) });
      return;
    }

    if (req.method === "GET" && segments[3] === "study-summary") {
      send(res, 200, { summary: buildStudySummary(studentId) });
      return;
    }

    if (req.method === "GET" && segments[3] === "parent-report") {
      send(res, 200, { report: buildParentReport(studentId) });
      return;
    }
  }

  notFound(res);
}

export function createAppServer() {
  return createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      console.error(error);
      send(res, 500, { error: "Internal server error" });
    }
  });
}

export function startServer() {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`EnglishLearning backend listening on http://${HOST}:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
  return server;
}
