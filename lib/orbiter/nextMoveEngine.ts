// ============================================================
// Orbiter Next Move Engine
// 「次の観測実験」を提案する
//
// 結論ではなく実験。命令ではなく提案。
// "今回は、いつもと違うタイプを1人だけ深く見てみよう"
// "次の1人は、3回見てから決めてみよう"
// "考えるのは終わり。直感に従ってみよう"
// ============================================================

import type {
  OrbiterMaturity,
  CrossCandidatePattern,
  OrbiterDelta,
  OrbiterContext,
  OrbiterMemoryState,
  TemporalPulse,
  NextMoveSuggestion,
  NextMoveType,
} from "./types";

interface NextMoveParams {
  maturity: OrbiterMaturity;
  crossPatterns: CrossCandidatePattern[];
  delta: OrbiterDelta | null;
  context: OrbiterContext;
  memory: OrbiterMemoryState;
  temporal: TemporalPulse;
}

interface NextMoveCandidate {
  type: NextMoveType;
  suggestion: string;
  reason: string;
  experimentGoal: string;
  priority: number;
  condition: boolean;
}

/**
 * 現在のコンテキストに基づいて、次の行動実験を提案する。
 * witness 段階では提案しない (見守る)。
 * 1訪問につき最大1提案。
 */
export function computeNextMove(params: NextMoveParams): NextMoveSuggestion | null {
  const { maturity, crossPatterns, delta, context, memory, temporal } = params;

  // witness は提案しない
  if (maturity.stage === "witness") return null;

  const hasRepetition = crossPatterns.some((p) => p.type === "repetition_warning");
  const isIntuitiveType = crossPatterns.some(
    (p) => p.type === "decision_style" && p.narrative.includes("直感"),
  );
  const isDeliberateType = crossPatterns.some(
    (p) => p.type === "decision_style" && p.narrative.includes("じっくり"),
  );

  const candidates: NextMoveCandidate[] = [
    // 1. 期限切迫 → 今すぐ行動
    {
      type: "act_now",
      suggestion: "決める時間だ。",
      reason: "期限が迫っている",
      experimentGoal: "期限内に自分の意思で決断する",
      priority: 0.95,
      condition: temporal.urgency >= 0.7,
    },
    // 2. 繰り返し警告 → いつもと違うことを試す
    {
      type: "try_different",
      suggestion: "今回は、いつもと違うタイプを深く見てみよう。",
      reason: "同じパターンの繰り返しが検出されている",
      experimentGoal: "普段選ばないタイプに触れることで、自分の基準を再検証する",
      priority: 0.85,
      condition: hasRepetition && context.visitCount <= 2,
    },
    // 3. 直感型 → ペースを落とす
    {
      type: "slow_down",
      suggestion: "次の1人は、3回見てから決めてみよう。",
      reason: "直感で判断する傾向がある",
      experimentGoal: "慎重に見ることで、直感の精度を検証する",
      priority: 0.75,
      condition: isIntuitiveType && context.visitCount <= 1,
    },
    // 4. 熟考型 → 直感を試す
    {
      type: "act_now",
      suggestion: "考えるのは一旦やめて、直感で決めてみよう。",
      reason: "考えすぎる傾向がある",
      experimentGoal: "直感の判断と熟考の判断の差を確認する",
      priority: 0.7,
      condition: isDeliberateType && context.visitCount >= 3,
    },
    // 5. 変化中 → 立ち止まって考える
    {
      type: "reflect",
      suggestion: "自分の変化に気づいてみよう。",
      reason: "選び方が変化している",
      experimentGoal: "変化の方向性が意図的かどうかを確認する",
      priority: 0.65,
      condition: delta?.overallDirection === "shifting",
    },
    // 6. 長期滞留 → 行動を促す
    {
      type: "act_now",
      suggestion: "考えるのは終わり。直感に従ってみよう。",
      reason: `${context.visitCount}回見て決められていない`,
      experimentGoal: "長い迷いの後の決断が正しいかどうかを体験する",
      priority: 0.6,
      condition: context.visitCount >= 4 && context.candidateState === "seen",
    },
    // 7. guide → 比較してみる
    {
      type: "compare",
      suggestion: "3人のすれ違い予報を比べてみよう。",
      reason: "まだ判断の軸が定まっていない",
      experimentGoal: "複数の候補を並べることで、自分の基準を発見する",
      priority: 0.5,
      condition: maturity.stage === "guide" && context.visitCount <= 2,
    },
    // 8. coach → 前回との比較
    {
      type: "reflect",
      suggestion: "前回likeした人と、この人。何が違う？",
      reason: "十分なデータがある段階",
      experimentGoal: "自分の判断基準を言語化する",
      priority: 0.45,
      condition: maturity.stage === "coach" && (memory.latestHypothesis != null),
    },
    // 9. 成長シグナル → フォーカス
    {
      type: "focus_one",
      suggestion: "今一番気になる人に集中してみよう。",
      reason: "成長の兆候がある",
      experimentGoal: "選択を絞ることで判断の質を検証する",
      priority: 0.4,
      condition: crossPatterns.some((p) => p.type === "growth_signal"),
    },
  ];

  const matched = candidates
    .filter((c) => c.condition)
    .sort((a, b) => b.priority - a.priority);

  if (matched.length === 0) return null;

  const top = matched[0];
  return {
    type: top.type,
    suggestion: top.suggestion,
    reason: top.reason,
    experimentGoal: top.experimentGoal,
    priority: top.priority,
  };
}
