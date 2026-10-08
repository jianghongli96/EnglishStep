import { createReadStream } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { initSchema } from "../src/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const dataDir = join(backendDir, "data");
const defaultDbPath = join(dataDir, "english-learning.db");
const defaultCsvPath = join(dataDir, "imports", "ecdict.csv");

const csvPath = resolvePath(process.argv[2] || process.env.ECDICT_CSV_PATH || defaultCsvPath);
const dbPath = resolvePath(process.env.DB_PATH || defaultDbPath);
const batchSize = Number(process.env.ECDICT_BATCH_SIZE || 3000);
const now = new Date().toISOString();

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
initSchema(db);

const insertDictionary = db.prepare(`
  INSERT INTO dictionary_entries (
    id, word, normalized_word, phonetic, definition, translation,
    part_of_speech, tag, bnc, frq, exchange, detail, audio, source, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ecdict', ?)
  ON CONFLICT(normalized_word) DO UPDATE SET
    word = excluded.word,
    phonetic = excluded.phonetic,
    definition = excluded.definition,
    translation = excluded.translation,
    part_of_speech = excluded.part_of_speech,
    tag = excluded.tag,
    bnc = excluded.bnc,
    frq = excluded.frq,
    exchange = excluded.exchange,
    detail = excluded.detail,
    audio = excluded.audio
`);

const findVocabularyByWord = db.prepare(`
  SELECT * FROM vocabulary
  WHERE lower(word) = lower(?)
  ORDER BY created_at ASC
  LIMIT 1
`);

const findVocabularyByUnique = db.prepare(`
  SELECT * FROM vocabulary
  WHERE word = ? AND meaning = ?
    AND COALESCE(source_book, '') = COALESCE(?, '')
    AND COALESCE(source_unit, '') = COALESCE(?, '')
  LIMIT 1
`);

const insertVocabulary = db.prepare(`
  INSERT OR IGNORE INTO vocabulary (
    id, word, meaning, part_of_speech, phonetic, example, grade, semester,
    source_book, source_unit, difficulty, tag, bnc, frq, spelling_enabled,
    spelling_mode, spelling_answer, accepted_answers_json, tags_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateVocabularyFromDictionary = db.prepare(`
  UPDATE vocabulary
  SET phonetic = CASE WHEN COALESCE(phonetic, '') = '' THEN ? ELSE phonetic END,
      part_of_speech = CASE WHEN COALESCE(part_of_speech, '') = '' THEN ? ELSE part_of_speech END,
      tag = CASE WHEN COALESCE(tag, '') = '' THEN ? ELSE tag END,
      bnc = CASE WHEN COALESCE(bnc, 0) = 0 THEN ? ELSE bnc END,
      frq = CASE WHEN COALESCE(frq, 0) = 0 THEN ? ELSE frq END,
      tags_json = CASE WHEN COALESCE(tags_json, '[]') = '[]' THEN ? ELSE tags_json END
  WHERE lower(word) = lower(?)
`);

const updateVocabularySpelling = db.prepare(`
  UPDATE vocabulary
  SET spelling_enabled = ?, spelling_mode = ?, spelling_answer = ?
  WHERE lower(word) = lower(?)
`);

const insertQuestion = db.prepare(`
  INSERT OR IGNORE INTO questions (
    id, module, type, title, passage, vocabulary_json, prompt, options_json,
    answer, explain, grade, difficulty, knowledge_point, vocabulary_id,
    source_book, source_unit, source_type, status, fingerprint, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const archiveSpellingQuestions = db.prepare(`
  UPDATE questions SET status = 'archived'
  WHERE vocabulary_id = ? AND type = 'spelling' AND status = 'published'
`);

const meaningDistractors = db.prepare(
  "SELECT meaning FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8",
);
const wordDistractors = db.prepare(
  "SELECT word FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8",
);

const summary = {
  dictionaryImported: 0,
  dictionarySkipped: 0,
  vocabularyInserted: 0,
  vocabularyUpdated: 0,
  vocabularySkipped: 0,
  questionsGenerated: 0,
  questionsSkipped: 0,
};

let batchCount = 0;
db.exec("BEGIN");
try {
  for await (const record of parseCsvRecords(csvPath)) {
    const entry = normalizeDictionaryEntry(record);
    if (!entry) {
      summary.dictionarySkipped += 1;
      continue;
    }

    insertDictionary.run(
      entry.id,
      entry.word,
      entry.normalizedWord,
      entry.phonetic,
      entry.definition,
      entry.translation,
      entry.partOfSpeech,
      entry.tag,
      entry.bnc,
      entry.frq,
      entry.exchange,
      entry.detail,
      entry.audio,
      now,
    );
    summary.dictionaryImported += 1;

    const updateResult = updateVocabularyFromDictionary.run(
      entry.phonetic,
      entry.partOfSpeech,
      entry.tag,
      entry.bnc,
      entry.frq,
      JSON.stringify(entry.tags),
      entry.word,
    );
    summary.vocabularyUpdated += updateResult.changes;

    if (shouldImportToVocabulary(entry)) {
      const vocab = dictionaryEntryToVocabulary(entry);
      updateVocabularySpelling.run(
        vocab.spellingEnabled ? 1 : 0,
        vocab.spellingMode,
        vocab.spellingAnswer,
        vocab.word,
      );
      const insertResult = insertVocabulary.run(
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

      const savedVocabulary =
        findVocabularyByUnique.get(
          vocab.word,
          vocab.meaning,
          vocab.sourceBook,
          vocab.sourceUnit,
        ) || findVocabularyByWord.get(vocab.word);

      if (insertResult.changes > 0) {
        summary.vocabularyInserted += 1;
      } else {
        summary.vocabularySkipped += 1;
      }

      if (savedVocabulary) {
        if (!vocab.spellingEnabled) archiveSpellingQuestions.run(savedVocabulary.id);
        for (const question of generateVocabularyQuestions(rowToVocabulary(savedVocabulary))) {
          const result = insertQuestion.run(...questionParams(question));
          if (result.changes > 0) {
            summary.questionsGenerated += 1;
          } else {
            summary.questionsSkipped += 1;
          }
        }
      }
    }

    batchCount += 1;
    if (batchCount >= batchSize) {
      db.exec("COMMIT");
      db.exec("BEGIN");
      batchCount = 0;
      console.log(
        `imported dictionary=${summary.dictionaryImported}, vocabulary=${summary.vocabularyInserted}, questions=${summary.questionsGenerated}`,
      );
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify(summary, null, 2));

function resolvePath(value) {
  return isAbsolute(value) ? value : join(process.cwd(), value);
}

async function* parseCsvRecords(path) {
  const stream = createReadStream(path, { encoding: "utf8" });
  let headers = null;
  let field = "";
  let record = [];
  let quoted = false;

  for await (const chunk of stream) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      const next = chunk[index + 1];

      if (char === '"' && quoted && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        record.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        record.push(field);
        field = "";
        if (record.some((value) => value !== "")) {
          if (!headers) {
            headers = record.map((item) => item.trim());
          } else {
            yield Object.fromEntries(
              headers.map((header, itemIndex) => [header, record[itemIndex] || ""]),
            );
          }
        }
        record = [];
      } else {
        field += char;
      }
    }
  }

  if (field || record.length) {
    record.push(field);
    if (headers) {
      yield Object.fromEntries(
        headers.map((header, itemIndex) => [header, record[itemIndex] || ""]),
      );
    }
  }
}

function normalizeDictionaryEntry(row) {
  const word = cleanWord(row.word);
  if (!word || word.startsWith("-") || word.startsWith("'")) return null;

  const normalizedWord = word.toLowerCase();
  const translation = normalizeText(row.translation);
  const definition = normalizeText(row.definition);
  const tag = normalizeText(row.tag);
  const tags = normalizeTags(tag);

  return {
    id: randomUUID(),
    word,
    normalizedWord,
    phonetic: normalizeText(row.phonetic),
    definition,
    translation,
    partOfSpeech: normalizeText(row.pos) || inferPartOfSpeech(translation),
    tag,
    tags,
    bnc: Number(row.bnc || 0),
    frq: Number(row.frq || 0),
    exchange: normalizeText(row.exchange),
    detail: normalizeText(row.detail),
    audio: normalizeText(row.audio),
  };
}

function dictionaryEntryToVocabulary(entry) {
  const vocabulary = {
    id: randomUUID(),
    word: entry.word,
    meaning: firstChineseMeaning(entry.translation),
    partOfSpeech: entry.partOfSpeech,
    phonetic: entry.phonetic,
    example: "",
    grade: entry.tags.includes("zk") ? "初中" : "高中",
    semester: "",
    sourceBook: "ECDICT",
    sourceUnit: entry.tags.includes("zk") ? "zk" : "gk",
    difficulty: difficultyFromFrequency(entry),
    tag: entry.tag,
    bnc: entry.bnc,
    frq: entry.frq,
    tags: entry.tags,
    acceptedAnswers: [],
    createdAt: now,
  };
  const spelling = spellingSettingsForVocabulary(vocabulary);
  return {
    ...vocabulary,
    spellingEnabled: spelling.enabled,
    spellingMode: spelling.mode,
    spellingAnswer: spelling.answer,
  };
}

function shouldImportToVocabulary(entry) {
  return (
    (entry.tags.includes("zk") || entry.tags.includes("gk")) &&
    entry.translation &&
    /^[A-Za-z][A-Za-z-]*$/.test(entry.word)
  );
}

function generateVocabularyQuestions(vocab) {
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
    status: "published",
    createdAt,
  };

  const questions = [
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-meaning-choice`,
      type: "meaning_choice",
      prompt: `Choose the meaning of "${vocab.word}".`,
      options: buildOptions(
        vocab.meaning,
        meaningDistractors.all(vocab.id).map((row) => row.meaning),
      ),
      answer: vocab.meaning,
      explain: `${vocab.word} 表示“${vocab.meaning}”。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-word-choice`,
      type: "word_choice",
      prompt: `Which word means “${vocab.meaning}”?`,
      options: buildOptions(
        vocab.word,
        wordDistractors.all(vocab.id).map((row) => row.word),
      ),
      answer: vocab.word,
      explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-sentence-blank`,
      type: "sentence_blank",
      prompt: `Choose the word that best fits the sentence: I need to use "${vocab.meaning}" in English: ____.`,
      options: buildOptions(
        vocab.word,
        wordDistractors.all(vocab.id).map((row) => row.word),
      ),
      answer: vocab.word,
      explain: `根据句意和词义，这里应填 ${vocab.word}。`,
      difficulty: questionDifficultyForVocabulary(vocab, 1),
    }),
  ];
  const spelling = spellingSettingsForVocabulary(vocab);
  if (spelling.enabled) {
    questions.push(
      normalizeQuestion({
        ...common,
        id: `q-${vocab.id}-spelling`,
        type: "spelling",
        title: "拼写练习",
        vocabulary: [vocab.phonetic || ""],
        prompt: `根据中文意思拼写单词：${vocab.meaning}`,
        options: [],
        answer: vocab.spellingAnswer || spelling.answer,
        explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
        difficulty: baseDifficulty,
      }),
    );
  }
  return questions;
}

function normalizeQuestion(question) {
  const fingerprint = createHash("sha1")
    .update(
      [
        question.module,
        question.type,
        question.prompt,
        question.answer,
        question.vocabularyId || "",
      ].join("|"),
    )
    .digest("hex");

  return {
    ...question,
    title: question.title || "",
    passage: question.passage || "",
    vocabulary: question.vocabulary || [],
    fingerprint,
  };
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
    question.grade || "",
    question.difficulty || 1,
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

function rowToVocabulary(row) {
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
    difficulty: Number(row.difficulty || 1),
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

function normalizeText(value) {
  return String(value || "").trim();
}

function cleanWord(value) {
  return normalizeText(value).replaceAll("*", "").trim();
}

function spellingSettingsForVocabulary(entry) {
  const word = normalizeText(entry?.word || "");
  const partOfSpeech = normalizeText(
    entry?.partOfSpeech || entry?.part_of_speech || "",
  ).toLowerCase();

  if (!word) return { enabled: false, mode: "unsupported", answer: "" };
  if (/\s/.test(word)) return { enabled: false, mode: "phrase", answer: word };
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

function normalizeTags(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstChineseMeaning(value) {
  const lines = normalizeText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[网络]") && !line.startsWith("[医]"));
  const first = lines[0] || normalizeText(value);
  return first
    .replace(/^[a-z]+\.\s*/i, "")
    .split(/[;；]/)[0]
    .slice(0, 80)
    .trim();
}

function inferPartOfSpeech(translation) {
  const match = normalizeText(translation).match(/^([a-z]+\.)/i);
  return match?.[1] || "";
}

function difficultyFromFrequency(entry) {
  const rank = frequencyRank(entry);
  if (!rank) return clampDifficulty(entry?.difficulty || 1);
  if (rank <= 1000) return 1;
  if (rank <= 3000) return 2;
  if (rank <= 8000) return 3;
  if (rank <= 15000) return 4;
  return 5;
}

function frequencyRank(entry) {
  const ranks = [entry?.bnc, entry?.frq]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  return ranks.length ? Math.min(...ranks) : 0;
}

function questionDifficultyForVocabulary(vocab, offset = 0) {
  return clampDifficulty(difficultyFromFrequency(vocab) + offset);
}

function clampDifficulty(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return 1;
  return Math.min(5, Math.max(1, Math.round(number)));
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

  while (options.length < 4) {
    options.push(`选项 ${options.length + 1}`);
  }

  return options.sort((a, b) =>
    createHash("sha1").update(a).digest("hex").localeCompare(
      createHash("sha1").update(b).digest("hex"),
    ),
  );
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
