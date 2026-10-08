import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "../data/english-learning.db");
const backupDir = join(__dirname, "../data/backups");
const now = new Date().toISOString();

const splitPlans = [
  ["a/an", [["a", "一个；一"], ["an", "一个；一"]]],
  ["according(to)", [["according to", "根据；按照"]]],
  ["actor/actress", [["actor", "男演员"], ["actress", "女演员"]]],
  ["ad(=advertisement)", [["ad", "广告"], ["advertisement", "广告"]]],
  ["AI(=artificialintelligence)", [["AI", "人工智能"], ["artificial intelligence", "人工智能"]]],
  ["anybody/anyone", [["anybody", "任何人"], ["anyone", "任何人"]]],
  ["app(=application)", [["app", "应用程序"], ["application", "应用程序"]]],
  ["be(am,is,are)", [["be", "是；成为"], ["am", "是"], ["is", "是"], ["are", "是"]]],
  ["bike(=bicycle)", [["bike", "自行车"], ["bicycle", "自行车"]]],
  ["centre(AmEcenter)", [["centre", "中心；中央"], ["center", "中心；中央"]]],
  ["child(pl.children)", [["child", "孩子"], ["children", "孩子们"]]],
  ["colour(AmEcolor)", [["colour", "颜色"], ["color", "颜色"]]],
  ["dialogue(AmEdialog)", [["dialogue", "对话"], ["dialog", "对话"]]],
  ["emperor/empress", [["emperor", "皇帝"], ["empress", "皇后"]]],
  ["everybody/everyone", [["everybody", "每个人"], ["everyone", "每个人"]]],
  ["exam(=examination)", [["exam", "考试"], ["examination", "考试"]]],
  ["father(dad)", [["father", "父亲"], ["dad", "爸爸"]]],
  ["favourite(AmEfavorite)", [["favourite", "最喜欢的"], ["favorite", "最喜欢的"]]],
  ["fireman(pl.firemen)", [["fireman", "消防员"], ["firemen", "消防员"]]],
  ["foot(pl.feet)", [["foot", "脚；英尺"], ["feet", "脚；英尺"]]],
  ["fridge(=refrigerator)", [["fridge", "冰箱"], ["refrigerator", "冰箱"]]],
  ["gentleman(pl.gentlemen)", [["gentleman", "绅士；先生"], ["gentlemen", "绅士；先生"]]],
  ["goodbye(bye)", [["goodbye", "再见"], ["bye", "再见"]]],
  ["grandfather(grandpa)", [["grandfather", "祖父；爷爷"], ["grandpa", "爷爷"]]],
  ["grandmother(grandma)", [["grandmother", "祖母；奶奶"], ["grandma", "奶奶"]]],
  ["grey(AmEgray)", [["grey", "灰色；灰色的"], ["gray", "灰色；灰色的"]]],
  ["gym(=gymnasium)", [["gym", "体育馆；健身房"], ["gymnasium", "体育馆；健身房"]]],
  ["have(has)", [["have", "有；吃；进行"], ["has", "有；吃；进行"]]],
  ["honour(AmEhonor)", [["honour", "荣誉；尊敬"], ["honor", "荣誉；尊敬"]]],
  ["host/hostess", [["host", "主人"], ["hostess", "女主人"]]],
  ["humour(AmEhumor)", [["humour", "幽默"], ["humor", "幽默"]]],
  ["kilo(=kilogram)", [["kilo", "千克；公斤"], ["kilogram", "千克；公斤"]]],
  ["kilometre(AmEkilometer)", [["kilometre", "千米；公里"], ["kilometer", "千米；公里"]]],
  ["knife(pl.knives)", [["knife", "刀"], ["knives", "刀"]]],
  ["lab(=laboratory)", [["lab", "实验室"], ["laboratory", "实验室"]]],
  ["leaf(pl.leaves)", [["leaf", "叶子"], ["leaves", "叶子"]]],
  ["life(pl.lives)", [["life", "生活；生命"], ["lives", "生命；生活"]]],
  ["man(pl.men)", [["man", "男人；人类"], ["men", "男人们"]]],
  ["maths(=mathematics,AmEmath)", [["maths", "数学"], ["mathematics", "数学"], ["math", "数学"]]],
  ["medium(pl.media)", [["medium", "媒介；中等的"], ["media", "媒介；媒体"]]],
  ["metre(AmEmeter)", [["metre", "米"], ["meter", "米"]]],
  ["mother(mumAmEmom)", [["mother", "母亲"], ["mum", "妈妈"], ["mom", "妈妈"]]],
  ["mouse(pl.mice)", [["mouse", "老鼠；鼠标"], ["mice", "老鼠"]]],
  ["Mr(AmEMr.)", [["Mr", "先生"], ["Mr.", "先生"]]],
  ["Mrs(AmEMrs.)", [["Mrs", "夫人；太太"], ["Mrs.", "夫人；太太"]]],
  ["Ms(AmEMs.)", [["Ms", "女士"], ["Ms.", "女士"]]],
  ["neighbour(AmEneighbor)", [["neighbour", "邻居"], ["neighbor", "邻居"]]],
  ["organise(AmEorganize)", [["organise", "组织"], ["organize", "组织"]]],
  ["PE(=physicaleducation)", [["PE", "体育课"], ["physical education", "体育课"]]],
  ["percent(AmEpercent)", [["percent", "百分之……"]]],
  ["photo(=photograph)", [["photo", "照片"], ["photograph", "照片"]]],
  [
    "policeman/policewoman(pl.policemen/policewomen)",
    [["policeman", "男警察"], ["policewoman", "女警察"], ["policemen", "男警察"], ["policewomen", "女警察"]],
  ],
  ["postman(pl.postmen)", [["postman", "邮递员"], ["postmen", "邮递员"]]],
  ["prince/princess", [["prince", "王子"], ["princess", "公主"]]],
  ["programme(AmEprogram)", [["programme", "节目；程序"], ["program", "节目；程序"]]],
  ["realise(AmErealize)", [["realise", "意识到；实现"], ["realize", "意识到；实现"]]],
  ["recognise(AmErecognize)", [["recognise", "认出；承认"], ["recognize", "认出；承认"]]],
  ["sheep(pl.sheep)", [["sheep", "绵羊"]]],
  ["shelf(pl.shelves)", [["shelf", "架子"], ["shelves", "架子"]]],
  ["somebody/someone", [["somebody", "某人"], ["someone", "某人"]]],
  ["theatre(AmEtheater)", [["theatre", "剧院；戏剧"], ["theater", "剧院；戏剧"]]],
  ["tooth(pl.teeth)", [["tooth", "牙齿"], ["teeth", "牙齿"]]],
  ["towards(AmEtoward)", [["towards", "朝向；对于"], ["toward", "朝向；对于"]]],
  ["TV(=television)", [["TV", "电视"], ["television", "电视"]]],
  ["until(till)", [["until", "直到"], ["till", "直到"]]],
  ["wife(pl.wives)", [["wife", "妻子"], ["wives", "妻子"]]],
  ["wolf(pl.wolves)", [["wolf", "狼"], ["wolves", "狼"]]],
  ["woman(pl.women)", [["woman", "女人"], ["women", "女人"]]],
  ["yourself(pl.yourselves)", [["yourself", "你自己"], ["yourselves", "你们自己"]]],
];

await mkdir(backupDir, { recursive: true });
const backupPath = join(
  backupDir,
  `english-learning.db.before-split-combined-${now.replaceAll(":", "-").replaceAll(".", "-")}`,
);
await copyFile(dbPath, backupPath);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const selectVocabularyByWord = db.prepare(`
  SELECT * FROM vocabulary
  WHERE lower(word) = lower(?)
  ORDER BY CASE WHEN bnc > 0 OR frq > 0 THEN 0 ELSE 1 END,
           CASE WHEN source_book = 'ECDICT' THEN 0 ELSE 1 END,
           created_at DESC
  LIMIT 1
`);
const selectDictionary = db.prepare(`
  SELECT * FROM dictionary_entries
  WHERE lower(normalized_word) = lower(?)
  LIMIT 1
`);
const selectCombined = db.prepare("SELECT * FROM vocabulary WHERE word = ? LIMIT 1");
const insertVocabulary = db.prepare(`
  INSERT OR IGNORE INTO vocabulary (
    id, word, meaning, part_of_speech, phonetic, example, grade, semester,
    source_book, source_unit, difficulty, tag, bnc, frq, tags_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateExistingVocabulary = db.prepare(`
  UPDATE vocabulary
  SET phonetic = CASE WHEN COALESCE(phonetic, '') = '' THEN ? ELSE phonetic END,
      part_of_speech = CASE WHEN COALESCE(part_of_speech, '') = '' THEN ? ELSE part_of_speech END,
      tag = CASE WHEN COALESCE(tag, '') = '' THEN ? ELSE tag END,
      bnc = CASE WHEN COALESCE(bnc, 0) = 0 THEN ? ELSE bnc END,
      frq = CASE WHEN COALESCE(frq, 0) = 0 THEN ? ELSE frq END,
      difficulty = ?
  WHERE id = ?
`);
const insertQuestion = db.prepare(`
  INSERT OR IGNORE INTO questions (
    id, module, type, title, passage, vocabulary_json, prompt, options_json,
    answer, explain, grade, difficulty, knowledge_point, vocabulary_id,
    source_book, source_unit, source_type, status, fingerprint, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const distractorMeanings = db.prepare("SELECT meaning FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8");
const distractorWords = db.prepare("SELECT word FROM vocabulary WHERE id <> ? ORDER BY RANDOM() LIMIT 8");
const archiveOldQuestions = db.prepare(`
  UPDATE questions
  SET status = 'archived',
      vocabulary_id = NULL
  WHERE vocabulary_id = ?
`);
const deleteOldVocabulary = db.prepare("DELETE FROM vocabulary WHERE id = ?");

const summary = {
  backupPath,
  processedCombinedRows: 0,
  insertedVocabulary: 0,
  updatedExistingVocabulary: 0,
  reusedExistingVocabulary: 0,
  generatedQuestions: 0,
  archivedOldQuestions: 0,
  deletedCombinedRows: 0,
  missingCombinedRows: [],
};

db.exec("BEGIN");
try {
  for (const [combinedWord, variants] of splitPlans) {
    const combined = selectCombined.get(combinedWord);
    if (!combined) {
      summary.missingCombinedRows.push(combinedWord);
      continue;
    }

    summary.processedCombinedRows += 1;

    for (const [word, meaning] of variants) {
      const existing = selectVocabularyByWord.get(word);
      const dictionary = selectDictionary.get(word.toLowerCase());

      const vocab = existing
        ? updateExisting(existing, dictionary)
        : insertSplitVocabulary(combined, dictionary, word, meaning);

      for (const question of generateQuestions(vocab)) {
        const result = insertQuestion.run(...questionParams(question));
        if (result.changes > 0) summary.generatedQuestions += 1;
      }
    }

    const archived = archiveOldQuestions.run(combined.id);
    summary.archivedOldQuestions += archived.changes;
    const deleted = deleteOldVocabulary.run(combined.id);
    summary.deletedCombinedRows += deleted.changes;
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify(summary, null, 2));

function updateExisting(existing, dictionary) {
  const bnc = Number(existing.bnc || dictionary?.bnc || 0);
  const frq = Number(existing.frq || dictionary?.frq || 0);
  const difficulty = difficultyFromFrequency({ bnc, frq }, existing.difficulty || 1);
  const result = updateExistingVocabulary.run(
    dictionary?.phonetic || "",
    dictionary?.part_of_speech || "",
    dictionary?.tag || "",
    Number(dictionary?.bnc || 0),
    Number(dictionary?.frq || 0),
    difficulty,
    existing.id,
  );
  if (result.changes > 0) summary.updatedExistingVocabulary += 1;
  else summary.reusedExistingVocabulary += 1;

  return rowToVocabulary({
    ...existing,
    phonetic: existing.phonetic || dictionary?.phonetic || "",
    part_of_speech: existing.part_of_speech || dictionary?.part_of_speech || "",
    tag: existing.tag || dictionary?.tag || "",
    bnc,
    frq,
    difficulty,
  });
}

function insertSplitVocabulary(combined, dictionary, word, meaning) {
  const bnc = Number(dictionary?.bnc || 0);
  const frq = Number(dictionary?.frq || 0);
  const tag = dictionary?.tag || combined.tag || "";
  const tags = mergeTags(combined.tags_json, tag);
  const vocab = {
    id: randomUUID(),
    word,
    meaning,
    partOfSpeech: dictionary?.part_of_speech || combined.part_of_speech || "",
    phonetic: dictionary?.phonetic || "",
    example: combined.example || "",
    grade: combined.grade || "",
    semester: combined.semester || "",
    sourceBook: "组合词拆分",
    sourceUnit: combined.word,
    difficulty: difficultyFromFrequency({ bnc, frq }, combined.difficulty || 1),
    tag,
    bnc,
    frq,
    tags,
    createdAt: now,
  };

  const result = insertVocabulary.run(
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
    JSON.stringify(vocab.tags),
    vocab.createdAt,
  );
  if (result.changes > 0) summary.insertedVocabulary += 1;
  return vocab;
}

function rowToVocabulary(row) {
  return {
    id: row.id,
    word: row.word,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech || "",
    phonetic: row.phonetic || "",
    example: row.example || "",
    grade: row.grade || "",
    semester: row.semester || "",
    sourceBook: row.source_book || "",
    sourceUnit: row.source_unit || "",
    difficulty: Number(row.difficulty || 1),
    tag: row.tag || "",
    bnc: Number(row.bnc || 0),
    frq: Number(row.frq || 0),
    tags: parseTags(row.tags_json, row.tag),
    createdAt: row.created_at || now,
  };
}

function generateQuestions(vocab) {
  const baseDifficulty = difficultyFromFrequency(vocab, vocab.difficulty || 1);
  const common = {
    module: "words",
    grade: vocab.grade,
    knowledgePoint: vocab.word,
    vocabularyId: vocab.id,
    sourceBook: vocab.sourceBook,
    sourceUnit: vocab.sourceUnit,
    sourceType: "rule-generated",
    status: "published",
    createdAt: now,
  };

  return [
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-meaning-choice`,
      type: "meaning_choice",
      prompt: `Choose the meaning of "${vocab.word}".`,
      options: buildOptions(vocab.meaning, distractorMeanings.all(vocab.id).map((row) => row.meaning)),
      answer: vocab.meaning,
      explain: `${vocab.word} 表示“${vocab.meaning}”。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-word-choice`,
      type: "word_choice",
      prompt: `Which word means “${vocab.meaning}”?`,
      options: buildOptions(vocab.word, distractorWords.all(vocab.id).map((row) => row.word)),
      answer: vocab.word,
      explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
      difficulty: baseDifficulty,
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-sentence-blank`,
      type: "sentence_blank",
      prompt: `Choose the word that best fits the sentence: I need to use "${vocab.meaning}" in English: ____.`,
      options: buildOptions(vocab.word, distractorWords.all(vocab.id).map((row) => row.word)),
      answer: vocab.word,
      explain: `根据句意和词义，这里应填 ${vocab.word}。`,
      difficulty: clampDifficulty(baseDifficulty + 1),
    }),
    normalizeQuestion({
      ...common,
      id: `q-${vocab.id}-spelling`,
      type: "spelling",
      title: "拼写练习",
      vocabulary: [vocab.phonetic || ""],
      prompt: `根据中文意思拼写单词：${vocab.meaning}`,
      options: [],
      answer: vocab.word,
      explain: `“${vocab.meaning}”对应的英文是 ${vocab.word}。`,
      difficulty: baseDifficulty,
    }),
  ];
}

function normalizeQuestion(question) {
  const fingerprint = createHash("sha1")
    .update([question.module, question.type, question.prompt, question.answer, question.vocabularyId || ""].join("|"))
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

function buildOptions(answer, candidates) {
  const options = [answer];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value && value !== answer && !options.includes(value)) options.push(value);
    if (options.length === 4) break;
  }
  while (options.length < 4) options.push(`选项 ${options.length + 1}`);
  return options.sort((a, b) =>
    createHash("sha1").update(a).digest("hex").localeCompare(createHash("sha1").update(b).digest("hex")),
  );
}

function difficultyFromFrequency(entry, fallback = 1) {
  const ranks = [entry?.bnc, entry?.frq]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  const rank = ranks.length ? Math.min(...ranks) : 0;
  if (!rank) return clampDifficulty(fallback);
  if (rank <= 1000) return 1;
  if (rank <= 3000) return 2;
  if (rank <= 8000) return 3;
  if (rank <= 15000) return 4;
  return 5;
}

function clampDifficulty(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return 1;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function mergeTags(tagsJson, tag) {
  const values = [...parseTags(tagsJson), ...String(tag || "").split(/\s+/)]
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function parseTags(tagsJson, tag = "") {
  try {
    const parsed = JSON.parse(tagsJson || "[]");
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Ignore malformed imported tag data and fall back to the plain tag field.
  }
  return String(tag || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
