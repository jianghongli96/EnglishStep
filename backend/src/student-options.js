const gradeAliases = new Map([
  ["7", 7],
  ["8", 8],
  ["9", 9],
  ["10", 10],
  ["11", 11],
  ["12", 12],
]);

const allowedStudentGrades = new Set([7, 8, 9, 10, 11, 12]);
const levelAliases = new Map([
  ["low", "low"],
  ["middle", "middle"],
  ["high", "high"],
]);

export function normalizeStudentGrade(value) {
  const text = normalizeOptionText(value);
  if (!text) return null;
  const direct = gradeAliases.get(text.toLowerCase()) ?? gradeAliases.get(text);
  if (direct) return direct;

  const grade = Number(text);
  return allowedStudentGrades.has(grade) ? grade : null;
}

export function normalizeStudentLevel(value) {
  const text = normalizeOptionText(value);
  if (!text) return "";
  return levelAliases.get(text.toLowerCase()) || levelAliases.get(text) || "";
}

export function studentGradeForResponse(value) {
  return normalizeStudentGrade(value) ?? value;
}

export function studentLevelForResponse(value) {
  return normalizeStudentLevel(value) || value;
}

function normalizeOptionText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
