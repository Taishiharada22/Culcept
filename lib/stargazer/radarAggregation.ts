// lib/stargazer/radarAggregation.ts
// 45軸→8レーダー次元に集約するロジック

import type { TraitAxisKey } from "./traitAxes";

export interface RadarDimension {
  key: string;
  label: string;
  score: number; // 0-100
  axisCount: number;
}

// 8次元へのマッピング — 各次元に関連する軸を集約
const RADAR_MAPPING: Record<string, TraitAxisKey[]> = {
  thinking: [
    "analytical_vs_intuitive",
    "plan_vs_spontaneous",
    "perfectionist_vs_pragmatic",
  ],
  action: [
    "cautious_vs_bold",
    "individual_vs_social",
    "introvert_vs_extrovert",
  ],
  sociality: [
    "independence_vs_harmony",
    "direct_vs_diplomatic",
    "social_initiative",
  ],
  distance: [
    "intimacy_pace",
    "boundary_awareness",
    "relationship_mode_split",
  ],
  emotion: [
    "emotional_variability",
    "reassurance_need",
    "emotional_regulation",
  ],
  recovery: [
    "stress_isolation_vs_social",
    "change_embrace_vs_resist",
  ],
  expression: [
    "function_vs_expression",
    "minimal_vs_maximal",
    "classic_vs_trendy",
  ],
  depth: [
    "quality_vs_quantity",
    "tradition_vs_novelty",
  ],
};

const RADAR_LABELS: Record<string, string> = {
  thinking: "思考",
  action: "行動",
  sociality: "社交",
  distance: "距離感",
  emotion: "感情",
  recovery: "回復",
  expression: "表現",
  depth: "深度",
};

/**
 * 45軸スコアを8次元レーダーに集約
 * 集約方法: 各グループの軸スコアの絶対値平均 × 100 (0-100スケール)
 */
export function aggregateRadarDimensions(
  axisScores: Partial<Record<TraitAxisKey, number>>
): RadarDimension[] {
  return Object.entries(RADAR_MAPPING).map(([key, axes]) => {
    const scores = axes
      .map((axisId) => axisScores[axisId])
      .filter((s): s is number => s !== undefined && s !== 0);

    const avgAbsScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + Math.abs(s), 0) / scores.length
        : 0;

    return {
      key,
      label: RADAR_LABELS[key] || key,
      score: Math.round(Math.min(avgAbsScore * 100, 100)),
      axisCount: scores.length,
    };
  });
}

/**
 * レーダー次元の短い説明を取得
 */
export function getRadarDimensionDescription(key: string): string {
  const descriptions: Record<string, string> = {
    thinking: "高い＝直感・感覚重視 ／ 低い＝論理・分析重視",
    action: "高い＝大胆・社交的 ／ 低い＝慎重・個人行動",
    sociality: "高い＝調和・協調重視 ／ 低い＝独立・自分軸",
    distance: "高い＝距離感に敏感 ／ 低い＝自然体・無頓着",
    emotion: "高い＝感情の波が大きい ／ 低い＝安定・穏やか",
    recovery: "高い＝変化を歓迎 ／ 低い＝安定・ルーティン重視",
    expression: "高い＝表現・華やか ／ 低い＝機能・シンプル",
    depth: "高い＝新しさ志向 ／ 低い＝伝統・深掘り志向",
  };
  return descriptions[key] || "";
}
