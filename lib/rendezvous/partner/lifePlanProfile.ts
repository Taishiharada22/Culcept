/**
 * Life Plan Profile — 35問の回答から人生観プロファイルを導出
 *
 * 8カテゴリの平均スコアから2軸のプロファイルラベルを生成。
 * API不要、クライアントサイドで即時計算。
 */

type AnswerMap = Record<string, { value: number; saved: boolean }>;
type Question = { id: string; category: string; scale: number };

export type LifePlanProfile = {
  /** メインラベル: e.g. "安定志向 × 自己成長重視型" */
  label: string;
  /** カテゴリ別スコア (0-1 正規化) */
  categoryScores: Record<string, number>;
  /** 最も特徴的なカテゴリ */
  strongestCategory: string;
  /** 最も低いカテゴリ */
  lowestCategory: string;
  /** 短い説明文 */
  description: string;
};

export const PROFILE_CATEGORY_LABELS: Record<string, string> = {
  financial: "金銭感覚",
  career: "仕事と家庭",
  family: "家族計画",
  kinship: "親族との距離",
  lifestyle: "生活水準",
  intimacy: "親密さ",
  health: "健康・習慣",
  culture: "文化・価値観",
};

// 各カテゴリの高スコア側の特性ラベル
const HIGH_TRAIT: Record<string, string> = {
  financial: "堅実型",
  career: "キャリア重視",
  family: "家族中心",
  kinship: "絆重視",
  lifestyle: "上質志向",
  intimacy: "深い結びつき型",
  health: "健康志向",
  culture: "多様性重視",
};

// 各カテゴリの低スコア側の特性ラベル
const LOW_TRAIT: Record<string, string> = {
  financial: "自由投資型",
  career: "ワークライフバランス型",
  family: "パートナー優先",
  kinship: "独立型",
  lifestyle: "シンプル志向",
  intimacy: "自律尊重型",
  health: "マイペース型",
  culture: "伝統重視",
};

export function deriveLifePlanProfile(
  answers: AnswerMap,
  questions: Question[],
): LifePlanProfile | null {
  if (Object.keys(answers).length < 10) return null; // 最低10問必要

  // カテゴリ別に正規化スコアを計算
  const categoryScores: Record<string, number> = {};
  const categoryGroups: Record<string, number[]> = {};

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer) continue;
    if (!categoryGroups[q.category]) categoryGroups[q.category] = [];
    // Normalize to 0-1 range
    categoryGroups[q.category].push(
      (answer.value - 1) / Math.max(q.scale - 1, 1),
    );
  }

  for (const [cat, scores] of Object.entries(categoryGroups)) {
    categoryScores[cat] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const entries = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
  if (entries.length < 2) return null;

  const strongest = entries[0];
  const lowest = entries[entries.length - 1];

  // Generate label: "trait1 × trait2"
  const trait1 =
    strongest[1] >= 0.6
      ? (HIGH_TRAIT[strongest[0]] || PROFILE_CATEGORY_LABELS[strongest[0]])
      : (LOW_TRAIT[strongest[0]] || PROFILE_CATEGORY_LABELS[strongest[0]]);

  // Second trait: use the second strongest
  const secondEntry = entries[1];
  const trait2 =
    secondEntry[1] >= 0.6
      ? (HIGH_TRAIT[secondEntry[0]] || PROFILE_CATEGORY_LABELS[secondEntry[0]])
      : (LOW_TRAIT[secondEntry[0]] || PROFILE_CATEGORY_LABELS[secondEntry[0]]);

  const label = `${trait1} × ${trait2}`;

  // Generate description
  const strongLabel = PROFILE_CATEGORY_LABELS[strongest[0]] || strongest[0];
  const lowLabel = PROFILE_CATEGORY_LABELS[lowest[0]] || lowest[0];
  const description = `${strongLabel}に対する意識が特に強く、${lowLabel}については柔軟な姿勢です。`;

  return {
    label,
    categoryScores,
    strongestCategory: strongest[0],
    lowestCategory: lowest[0],
    description,
  };
}
