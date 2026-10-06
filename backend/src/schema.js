export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      grade INTEGER NOT NULL,
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
      grade INTEGER NOT NULL,
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

  ensureColumn(db, "mistakes", "review_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "mistakes", "correct_review_streak", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "mistakes", "last_reviewed_at", "TEXT");
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
