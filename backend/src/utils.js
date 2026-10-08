export function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function publicQuestion(question) {
  if (!question) return null;
  const { answer, ...safeQuestion } = question;
  if (question.type === "spelling") {
    const normalizedAnswer = normalizeText(answer);
    safeQuestion.answerLength = (normalizedAnswer.match(/[A-Za-z]/g) || []).length;
    safeQuestion.spellingPattern = normalizedAnswer.replace(/[A-Za-z]/g, "_");
  }
  return safeQuestion;
}

export function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
