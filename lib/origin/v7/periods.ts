import type { PeriodDef } from "./types";

export const PERIOD_DEFS: PeriodDef[] = [
  { id: "early_childhood", label: "幼少期", icon: "🌱", ageHint: "0〜6歳" },
  { id: "elementary", label: "小学生の頃", icon: "🎒", ageHint: "7〜12歳" },
  { id: "middle_school", label: "中学生の頃", icon: "🏫", ageHint: "13〜15歳" },
  { id: "high_school", label: "高校生の頃", icon: "⚡", ageHint: "16〜18歳" },
  { id: "late_teens", label: "18〜20歳頃", icon: "🔀", ageHint: "18〜20歳" },
  { id: "early_twenties", label: "20代前半", icon: "🎓", ageHint: "21〜25歳" },
  { id: "mid_twenties", label: "20代後半", icon: "💼", ageHint: "26〜29歳" },
  { id: "thirties", label: "30代", icon: "🏢", ageHint: "30〜39歳" },
  { id: "forties_plus", label: "40代以降", icon: "🌳", ageHint: "40歳〜" },
  { id: "special_period", label: "大きく変わった時期", icon: "🌊", ageHint: "特別な時" },
];

export function getPeriodLabel(id: string): string {
  return PERIOD_DEFS.find((p) => p.id === id)?.label ?? id;
}
