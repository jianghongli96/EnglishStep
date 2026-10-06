import { createServer } from "node:http";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SEED_PATH = join(DATA_DIR, "seed.json");
loadEnvFile(join(__dirname, "..", ".env"));

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const DB_PATH = resolveBackendPath(
  process.env.DB_PATH,
  join(DATA_DIR, "english-learning.db"),
);
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "127.0.0.1";
const AUTH_SECRET = requireConfig("AUTH_SECRET");
const CORS_ORIGIN = requireConfig("CORS_ORIGIN");
const ALLOW_LEGACY_STUDENTS = process.env.ALLOW_LEGACY_STUDENTS === "true";
const ALLOW_LEGACY_LOGIN = process.env.ALLOW_LEGACY_LOGIN === "true";
const AUTO_SEED_DATABASE = process.env.AUTO_SEED_DATABASE !== "false";
const AUTO_SUPPLEMENTAL_QUESTIONS =
  process.env.AUTO_SUPPLEMENTAL_QUESTIONS !== "false";
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": CORS_ORIGIN,
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const fallbackMeanings = ["归还", "购买", "丢失", "携带", "打开", "关闭"];
const fallbackWords = ["learn", "review", "write", "listen", "speak", "read"];
const dailyTaskPlan = [
  { id: "daily-words", module: "words", title: "核心词汇", target: 8 },
  { id: "daily-grammar", module: "grammar", title: "基础语法", target: 6 },
  { id: "daily-reading", module: "reading", title: "短文阅读", target: 1 },
];

await mkdir(DATA_DIR, { recursive: true });
const isNewDatabase = !existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
initSchema();
if (AUTO_SEED_DATABASE && (isNewDatabase || countRows("questions") === 0)) {
  await seedDatabase();
}
if (AUTO_SUPPLEMENTAL_QUESTIONS) {
  ensureSupplementalQuestionBank();
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireConfig(name) {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    throw new Error(`${name} must be configured when NODE_ENV=production`);
  }

  if (name === "AUTH_SECRET") {
    return "local-development-auth-secret";
  }
  if (name === "CORS_ORIGIN") {
    return "http://localhost:3001";
  }

  throw new Error(`${name} is required`);
}

function resolveBackendPath(value, fallback) {
  if (!value) return fallback;
  return isAbsolute(value) ? value : join(__dirname, "..", value);
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      grade TEXT NOT NULL,
      level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(normalized_name, grade)
    );

    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      meaning TEXT NOT NULL,
      part_of_speech TEXT,
      phonetic TEXT,
      example TEXT,
      grade TEXT,
      semester TEXT,
      source_book TEXT,
      source_unit TEXT,
      difficulty INTEGER NOT NULL DEFAULT 1,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(word, meaning, source_book, source_unit)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      passage TEXT,
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      answer TEXT NOT NULL,
      explain TEXT NOT NULL,
      grade TEXT,
      difficulty INTEGER NOT NULL DEFAULT 1,
      knowledge_point TEXT NOT NULL,
      vocabulary_id TEXT,
      source_book TEXT,
      source_unit TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'published',
      fingerprint TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(vocabulary_id) REFERENCES vocabulary(id)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      module TEXT NOT NULL,
      knowledge_point TEXT NOT NULL,
      answer TEXT NOT NULL,
      correct INTEGER NOT NULL,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      module TEXT NOT NULL,
      knowledge_point TEXT NOT NULL,
      wrong_answer TEXT NOT NULL,
      review_count INTEGER NOT NULL DEFAULT 0,
      correct_review_streak INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS student_knowledge (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      knowledge_point TEXT NOT NULL,
      mastery_level INTEGER NOT NULL DEFAULT 0,
      correct_streak INTEGER NOT NULL DEFAULT 0,
      wrong_streak INTEGER NOT NULL DEFAULT 0,
      last_practiced_at TEXT,
      next_review_at TEXT,
      UNIQUE(student_id, knowledge_point),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS daily_plans (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(student_id, plan_date),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      normalized_username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'parent', 'teacher', 'admin')),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id TEXT PRIMARY KEY,
      grade TEXT NOT NULL,
      level TEXT NOT NULL,
      current_book TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS parent_student_links (
      id TEXT PRIMARY KEY,
      parent_user_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE(parent_user_id, student_user_id),
      FOREIGN KEY(parent_user_id) REFERENCES users(id),
      FOREIGN KEY(student_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS teacher_groups (
      id TEXT PRIMARY KEY,
      teacher_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      share_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(teacher_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      joined_at TEXT NOT NULL,
      UNIQUE(group_id, student_user_id),
      FOREIGN KEY(group_id) REFERENCES teacher_groups(id),
      FOREIGN KEY(student_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_questions_module_status
      ON questions(module, status, difficulty);
    CREATE INDEX IF NOT EXISTS idx_attempts_student
      ON attempts(student_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mistakes_student
      ON mistakes(student_id, resolved_at);
    CREATE INDEX IF NOT EXISTS idx_daily_plans_student_date
      ON daily_plans(student_id, plan_date);
    CREATE INDEX IF NOT EXISTS idx_parent_links_student
      ON parent_student_links(student_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_group_members_student
      ON group_members(student_user_id, status);
  `);

  ensureColumn("mistakes", "review_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("mistakes", "correct_review_streak", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("mistakes", "last_reviewed_at", "TEXT");
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

function send(res, status, payload) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  send(res, 404, { error: "Not found" });
}

function badRequest(res, message) {
  send(res, 400, { error: message });
}

function unauthorized(res, message = "Authentication required") {
  send(res, 401, { error: message });
}

function forbidden(res, message = "Permission denied") {
  send(res, 403, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body must be valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function rowToStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    grade: row.grade,
    level: row.level,
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
    grade: row.grade,
    level: row.level,
    currentBook: row.current_book,
    createdAt: row.created_at,
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
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function publicQuestion(question) {
  if (!question) return null;
  const { answer, ...safeQuestion } = question;
  return safeQuestion;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeUsername(value) {
  return normalizeText(value).toLowerCase();
}

function signAuthToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac("sha256", AUTH_SECRET)
    .update(encodedPayload)
    .digest("base64url");
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.userId || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getAuthUser(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const payload = verifyAuthToken(match[1]);
  if (!payload) return null;

  return findUser(payload.userId);
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  return user;
}

function isTeacherOrAdmin(user) {
  return user?.role === "teacher" || user?.role === "admin";
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

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password || ""), salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function findUser(userId) {
  return rowToUser(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

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

function accountPayload(user, { includeToken = false } = {}) {
  const payload = { user };
  if (includeToken && user) {
    payload.token = signAuthToken(user);
  }
  if (user?.role === "student") {
    const profile = findStudentProfile(user.id);
    payload.profile = profile;
    payload.student = ensureStudentRecordForUser(user, profile);
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

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

function getStudentMistakes(studentId) {
  const rows = db
    .prepare(
      `SELECT * FROM mistakes
       WHERE student_id = ? AND resolved_at IS NULL
       ORDER BY correct_review_streak ASC, created_at DESC`,
    )
    .all(studentId);

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

function buildDailyTasks(studentId) {
  const plan = getOrCreateDailyPlan(studentId);
  if (!plan) {
    return dailyTaskPlan.map((task) => ({
      ...task,
      completed: 0,
      progress: 0,
      mistakeCount: 0,
    }));
  }

  const questionIdsByModule = new Map(
    dailyTaskPlan.map((task) => [
      task.module,
      plan.questions
        .filter((question) => question.module === task.module)
        .map((question) => question.id),
    ]),
  );

  const mistakes = db
    .prepare(
      `SELECT module, COUNT(*) AS total FROM mistakes
       WHERE student_id = ? AND resolved_at IS NULL
       GROUP BY module`,
    )
    .all(studentId);

  const mistakeCount = new Map(mistakes.map((row) => [row.module, Number(row.total)]));

  return dailyTaskPlan.map((task) => {
    const plannedIds = questionIdsByModule.get(task.module) || [];
    const completed = countCompletedPlannedQuestions(
      studentId,
      plannedIds,
      plan.createdAt,
    );

    return {
      ...task,
      completed,
      progress: Math.min(100, Math.round((completed / task.target) * 100)),
      mistakeCount: mistakeCount.get(task.module) || 0,
    };
  });
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

function getOrCreateDailyPlan(studentId, planDate = getTodayKey()) {
  const student = findStudent(studentId);
  if (!student) return null;

  const existing = db
    .prepare(
      `SELECT * FROM daily_plans
       WHERE student_id = ? AND plan_date = ?`,
    )
    .get(studentId, planDate);

  if (existing) {
    return rowToDailyPlan(existing);
  }

  const now = new Date().toISOString();
  const questionIds = [];

  for (const task of dailyTaskPlan) {
    const rows = selectRecommendedQuestionRows(studentId, task.module, task.target);
    for (const row of rows) {
      if (!questionIds.includes(row.id)) {
        questionIds.push(row.id);
      }
    }
  }

  const shuffledIds = shuffleArray(questionIds);
  const plan = {
    id: randomUUID(),
    studentId,
    planDate,
    questionIds: shuffledIds,
    createdAt: now,
  };

  db.prepare(
    `INSERT INTO daily_plans (
      id, student_id, plan_date, question_ids_json, created_at
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    plan.id,
    plan.studentId,
    plan.planDate,
    JSON.stringify(plan.questionIds),
    plan.createdAt,
  );

  return {
    ...plan,
    questions: getQuestionsByIds(plan.questionIds).map((question) =>
      publicQuestion(question),
    ),
  };
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

  return questionIds.map((id) => byId.get(id)).filter(Boolean);
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

function recommendQuestions(studentId, module, limit = 5) {
  return selectRecommendedQuestionRows(studentId, module, limit).map((row) =>
    publicQuestion(rowToQuestion(row, false)),
  );
}

function selectRecommendedQuestionRows(studentId, module, limit = 5) {
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
      LEFT JOIN mistakes m
        ON m.question_id = q.id
        AND m.student_id = ?
        AND m.resolved_at IS NULL
      LEFT JOIN (
        SELECT question_id, MAX(created_at) AS last_attempt_at
        FROM attempts
        WHERE student_id = ?
        GROUP BY question_id
      ) a ON a.question_id = q.id
      WHERE q.status = 'published'
        AND (? IS NULL OR q.module = ?)
      ORDER BY priority ASC, q.difficulty ASC, RANDOM()
      LIMIT ?
    `,
    )
    .all(recentCutoff, studentId, studentId, module || null, module || null, limit);
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
          grade: normalizeText(body.grade),
          level: normalizeText(body.level),
          currentBook: normalizeText(body.currentBook || ""),
        }
      : null;
  if (studentProfile && (!studentProfile.grade || !studentProfile.level)) {
    badRequest(res, "student grade and level are required");
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
  const grade = normalizeText(body.grade);
  const level = normalizeText(body.level);

  if (!name || !grade || !level) {
    badRequest(res, "name, grade and level are required");
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

async function handleAttempt(req, res) {
  const body = await parseBody(req);
  const student = findStudent(body.studentId);
  const question = getQuestion(body.questionId);

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

  const answer = normalizeText(body.answer || "");
  const correct = normalizeAnswer(answer) === normalizeAnswer(question.answer);
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
          review_count, correct_review_streak, last_reviewed_at, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL)`,
      ).run(
        randomUUID(),
        student.id,
        question.id,
        question.module,
        question.knowledgePoint,
        answer,
        now,
        now,
      );
    }

    if (!correct && existingMistake) {
      db.prepare(
        `UPDATE mistakes
         SET wrong_answer = ?, review_count = review_count + 1,
             correct_review_streak = 0, last_reviewed_at = ?
         WHERE id = ?`,
      ).run(answer, now, existingMistake.id);
    }

    if (correct && existingMistake) {
      const nextCorrectReviewStreak =
        Number(existingMistake.correct_review_streak || 0) + 1;
      const resolvedAt = nextCorrectReviewStreak >= 2 ? now : null;
      db.prepare(
        `UPDATE mistakes
         SET review_count = review_count + 1,
             correct_review_streak = ?,
             last_reviewed_at = ?,
             resolved_at = COALESCE(?, resolved_at)
         WHERE id = ?`,
      ).run(nextCorrectReviewStreak, now, resolvedAt, existingMistake.id);
    }

    updateStudentKnowledge(student.id, question.knowledgePoint, correct, now);
  });

  send(res, 201, {
    attempt,
    result: {
      correct,
      correctAnswer: question.answer,
      explain: question.explain,
    },
    progress: buildProgress(student.id),
    mistakes: getStudentMistakes(student.id),
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
  return normalizeText(value).replace(/\s+$/g, "");
}

function nextReviewAt(masteryLevel, correct) {
  const days = correct ? [1, 3, 7, 15, 30][Math.min(masteryLevel, 4)] : 1;
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
  const id =
    item.id ||
    `vocab-${slugify(sourceBook || "book")}-${slugify(sourceUnit || "unit")}-${slugify(word)}`;

  return {
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
    difficulty: Number(item.difficulty || 1),
    tags: normalizeTags(item.tags),
    createdAt: item.createdAt || now,
  };
}

function cleanVocabularyWord(value) {
  return normalizeText(value).replaceAll("*", "").replace(/\s+/g, "").trim();
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(normalizeText).filter(Boolean);
  return String(tags || "")
    .split(/[|,，、]/)
    .map(normalizeText)
    .filter(Boolean);
}

function insertVocabulary(vocab) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO vocabulary (
        id, word, meaning, part_of_speech, phonetic, example, grade, semester,
        source_book, source_unit, difficulty, tags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(vocab.tags),
      vocab.createdAt,
    );
  return result.changes > 0;
}

function generateVocabularyQuestions(vocab, status) {
  const createdAt = new Date().toISOString();
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

  return [
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-meaning-choice`,
      type: "meaning_choice",
      prompt: `Choose the meaning of "${vocab.word}".`,
      options: buildOptions(vocab.meaning, meaningDistractors(vocab)),
      answer: vocab.meaning,
      explain: `${vocab.word} 表示“${vocab.meaning}”。`,
      difficulty: Math.max(1, vocab.difficulty),
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-word-choice`,
      type: "word_choice",
      prompt: `Which word means “${vocab.meaning}”?`,
      options: buildOptions(vocab.word, wordDistractors(vocab)),
      answer: vocab.word,
      explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
      difficulty: Math.max(1, vocab.difficulty),
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-sentence-blank`,
      type: "sentence_blank",
      prompt: sentenceBlankPrompt(vocab),
      options: buildOptions(vocab.word, wordDistractors(vocab)),
      answer: vocab.word,
      explain: `根据句意和词义，这里应填 ${vocab.word}。`,
      difficulty: Math.max(2, vocab.difficulty + 1),
    }),
  ];
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

function parseCsv(csv) {
  const lines = String(csv || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function listVocabulary(limit = 50) {
  return db
    .prepare("SELECT * FROM vocabulary ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map(rowToVocabulary);
}

function listStudyVocabulary(studentId, limit = 12) {
  const rows = db
    .prepare(
      `SELECT v.*, COALESCE(sk.mastery_level, 0) AS mastery_level,
              sk.last_practiced_at
       FROM vocabulary v
       LEFT JOIN student_knowledge sk
         ON sk.knowledge_point = v.word
         AND sk.student_id = ?
       ORDER BY COALESCE(sk.mastery_level, 0) ASC,
                sk.last_practiced_at IS NOT NULL ASC,
                RANDOM()
       LIMIT ?`,
    )
    .all(studentId, limit);

  return rows.map((row) => ({
    ...rowToVocabulary(row),
    masteryLevel: Number(row.mastery_level || 0),
    lastPracticedAt: row.last_practiced_at,
  }));
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
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    send(res, 200, { questions: recommendQuestions(studentId, module, limit) });
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

  if (req.method === "GET" && url.pathname === "/api/daily-plan") {
    const studentId = url.searchParams.get("studentId") || "";
    if (!canAccessStudent(authUser, studentId)) {
      forbidden(res);
      return;
    }
    const plan = getOrCreateDailyPlan(studentId);
    if (!plan) {
      badRequest(res, "studentId is invalid");
      return;
    }

    send(res, 200, {
      plan: {
        id: plan.id,
        date: plan.planDate,
        createdAt: plan.createdAt,
        questions: plan.questions,
        tasks: buildDailyTasks(studentId),
      },
    });
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

  if (req.method === "POST" && url.pathname === "/api/attempts") {
    await handleAttempt(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/vocabulary") {
    if (!isTeacherOrAdmin(authUser)) {
      forbidden(res);
      return;
    }
    const limit = Number(url.searchParams.get("limit") || 50);
    send(res, 200, { vocabulary: listVocabulary(limit) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/vocabulary/import") {
    if (!isTeacherOrAdmin(authUser)) {
      forbidden(res);
      return;
    }
    await handleImportVocabulary(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/questions") {
    if (!isTeacherOrAdmin(authUser)) {
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
    if (!isTeacherOrAdmin(authUser)) {
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
        progress: buildProgress(studentId),
        tasks: buildDailyTasks(studentId),
        summary: buildStudySummary(studentId),
      });
      return;
    }

    if (req.method === "GET" && segments[3] === "mistakes") {
      send(res, 200, { mistakes: getStudentMistakes(studentId) });
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

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`EnglishLearning backend listening on http://${HOST}:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
