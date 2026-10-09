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
	      tag TEXT,
	      bnc INTEGER NOT NULL DEFAULT 0,
	      frq INTEGER NOT NULL DEFAULT 0,
	      spelling_enabled INTEGER NOT NULL DEFAULT 1,
	      spelling_mode TEXT NOT NULL DEFAULT 'word',
	      spelling_answer TEXT,
	      accepted_answers_json TEXT NOT NULL DEFAULT '[]',
	      tags_json TEXT NOT NULL DEFAULT '[]',
	      created_at TEXT NOT NULL,
	      UNIQUE(word, meaning, source_book, source_unit)
	    );

	    CREATE TABLE IF NOT EXISTS dictionary_entries (
	      id TEXT PRIMARY KEY,
	      word TEXT NOT NULL,
	      normalized_word TEXT NOT NULL UNIQUE,
	      phonetic TEXT,
	      definition TEXT,
	      translation TEXT,
	      part_of_speech TEXT,
	      tag TEXT,
	      bnc INTEGER NOT NULL DEFAULT 0,
	      frq INTEGER NOT NULL DEFAULT 0,
	      exchange TEXT,
	      detail TEXT,
	      audio TEXT,
	      source TEXT NOT NULL DEFAULT 'ecdict',
	      created_at TEXT NOT NULL
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
      review_stage INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      next_review_at TEXT,
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

    CREATE TABLE IF NOT EXISTS student_memory_items (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('vocabulary', 'knowledge')),
      item_key TEXT NOT NULL,
      mastery_stage INTEGER NOT NULL DEFAULT 0,
      correct_streak INTEGER NOT NULL DEFAULT 0,
      lapse_count INTEGER NOT NULL DEFAULT 0,
      last_result TEXT CHECK(last_result IN ('correct', 'wrong')),
      last_practiced_at TEXT,
      next_review_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, item_type, item_key),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS student_learning_states (
      student_id TEXT PRIMARY KEY,
      frequency_frontier INTEGER NOT NULL DEFAULT 500,
      question_level INTEGER NOT NULL DEFAULT 1,
      diagnostic_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(diagnostic_status IN ('pending', 'in_progress', 'completed')),
      diagnostic_score INTEGER,
      vocabulary_score INTEGER,
      grammar_score INTEGER,
      reading_score INTEGER,
      last_evaluated_attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      diagnostic_completed_at TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS diagnostic_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'completed')),
      question_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS diagnostic_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      correct INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES diagnostic_sessions(id),
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(question_id) REFERENCES questions(id),
      UNIQUE(session_id, question_id)
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

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN (
        'daily', 'extra', 'mistakes', 'words', 'grammar', 'reading', 'spelling'
      )),
      session_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'completed')),
      target_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS session_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'new'
        CHECK(purpose IN ('review', 'reinforcement', 'new')),
      is_remediation INTEGER NOT NULL DEFAULT 0,
      memory_key TEXT,
      answered_at TEXT,
      correct INTEGER,
      FOREIGN KEY(session_id) REFERENCES practice_sessions(id),
      FOREIGN KEY(question_id) REFERENCES questions(id),
      UNIQUE(session_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_practice_sessions_student_date
      ON practice_sessions(student_id, session_date, mode, status);

    CREATE INDEX IF NOT EXISTS idx_session_questions_session_order
      ON session_questions(session_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_memory_items_due
      ON student_memory_items(student_id, next_review_at, mastery_stage);

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
    CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_student
      ON diagnostic_sessions(student_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_session
      ON diagnostic_attempts(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_mistakes_student
      ON mistakes(student_id, resolved_at);
	    CREATE INDEX IF NOT EXISTS idx_daily_plans_student_date
	      ON daily_plans(student_id, plan_date);
	    CREATE INDEX IF NOT EXISTS idx_dictionary_entries_normalized_word
	      ON dictionary_entries(normalized_word);
	    CREATE INDEX IF NOT EXISTS idx_dictionary_entries_tag
	      ON dictionary_entries(tag);
	    CREATE INDEX IF NOT EXISTS idx_parent_links_student
	      ON parent_student_links(student_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_group_members_student
      ON group_members(student_user_id, status);
  `);

	  ensureColumn(db, "mistakes", "review_count", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "mistakes", "correct_review_streak", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "mistakes", "review_stage", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "mistakes", "last_reviewed_at", "TEXT");
	  ensureColumn(db, "mistakes", "next_review_at", "TEXT");
	  ensureColumn(db, "session_questions", "purpose", "TEXT NOT NULL DEFAULT 'new'");
	  ensureColumn(db, "session_questions", "is_remediation", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "session_questions", "memory_key", "TEXT");
	  ensureColumn(db, "vocabulary", "tag", "TEXT");
	  ensureColumn(db, "vocabulary", "bnc", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "vocabulary", "frq", "INTEGER NOT NULL DEFAULT 0");
	  ensureColumn(db, "vocabulary", "spelling_enabled", "INTEGER NOT NULL DEFAULT 1");
	  ensureColumn(db, "vocabulary", "spelling_mode", "TEXT NOT NULL DEFAULT 'word'");
	  ensureColumn(db, "vocabulary", "spelling_answer", "TEXT");
	  ensureColumn(
	    db,
	    "vocabulary",
	    "accepted_answers_json",
	    "TEXT NOT NULL DEFAULT '[]'",
	  );
	}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
