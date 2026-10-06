export const gradeOptions = [
  { value: 7, label: "初一" },
  { value: 8, label: "初二" },
  { value: 9, label: "初三" },
  { value: 10, label: "高一" },
  { value: 11, label: "高二" },
  { value: 12, label: "高三" },
] as const;

export const levelOptions = [
  { value: "low", label: "低" },
  { value: "middle", label: "中" },
  { value: "high", label: "高" },
] as const;

export type GradeValue = (typeof gradeOptions)[number]["value"];
export type LevelValue = (typeof levelOptions)[number]["value"];

const gradeLabels = new Map<string, string>(
  gradeOptions.map((option) => [String(option.value), option.label]),
);
const levelLabels = new Map<string, string>(
  levelOptions.map((option) => [option.value, option.label]),
);

export function gradeLabel(value: string | number | undefined) {
  if (value === undefined || value === "") return "";
  return gradeLabels.get(String(value)) || String(value);
}

export function levelLabel(value: string | undefined) {
  if (!value) return "";
  return levelLabels.get(value) || value;
}
