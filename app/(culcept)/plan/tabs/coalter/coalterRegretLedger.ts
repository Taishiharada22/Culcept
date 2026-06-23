/**
 * P3 — M6 後悔台帳（Correction Memory）（**pure・決定論・read-only・捏造ゼロ**）
 *
 * 役割: 過去の旅の「後悔」を **軸差分**（どの軸をどちらへ寄せたかったか）として持ち、
 *   **次回制約**に変換して今回プランに反映する。「移動が多すぎた → 今回は移動控えめ」。
 *   ChatGPT memory の「嗜好の蓄積」と違い、**判断原理の更新**として効く（競合が持たない構造）。
 *
 * 厳守（honesty・安全）:
 *   - **read-only**。台帳への**書込（永続化）は一切しない**（DB write 禁止＝#9/production 領域）。
 *     ここでは demo 台帳を読むだけ（S2 demo 軸・S4 公平台帳と同じ流儀）。
 *   - 後悔が無ければ次回制約は出さない（捏造しない）。raw 値は出さず、軸・向き・人間可読ラベルのみ。
 *   - 次回制約は **conservative な intent 寄せ**のみ（reduce 系）。新規 solver/エンジンは作らない。
 */

import type { CoAlterSolverIntentOverride } from "./coalterSolverPersonalization";

export type RegretAxis = "mobility" | "pace" | "budget" | "crowd" | "novelty";

export interface RegretEntry {
  axis: RegretAxis;
  /** reduce = 次回は控えめに / increase = 次回は増やしたい */
  direction: "reduce" | "increase";
  /** 後悔の一言（PII なし・正規化済み）。 */
  note: string;
  /** 固定 ISO（決定論）。 */
  decidedAt: string;
}

export interface NextTripConstraint {
  axis: RegretAxis;
  direction: "reduce" | "increase";
  /** 今回どう反映するかの人間可読ラベル。 */
  label: string;
}

/**
 * demo 後悔台帳（read-only）。前回は「移動が多すぎ」「詰め込みすぎ」で疲れた、を表す。
 *   → 次回制約: 移動控えめ・詰め込みすぎない（calm ペアの傾向を強化＝整合）。
 */
export const COALTER_DEMO_REGRET_LEDGER: RegretEntry[] = [
  { axis: "mobility", direction: "reduce", note: "前回は移動が多すぎて疲れた", decidedAt: "2026-05-25T00:00:00.000Z" },
  { axis: "pace", direction: "reduce", note: "前回は予定を詰め込みすぎた", decidedAt: "2026-06-05T00:00:00.000Z" },
];

const REDUCE_LABEL: Record<RegretAxis, string> = {
  mobility: "今回は移動を控えめに",
  pace: "今回は詰め込みすぎないように",
  budget: "今回は予算を抑えめに",
  crowd: "今回は人混みを避けめに",
  novelty: "今回は定番寄りに",
};
const INCREASE_LABEL: Record<RegretAxis, string> = {
  mobility: "今回はもう少し動いても",
  pace: "今回はもう少し詰めても",
  budget: "今回は少し奮発しても",
  crowd: "今回は賑わいも取り入れて",
  novelty: "今回は新しさも多めに",
};

/**
 * 後悔台帳 → 次回制約。軸ごとに最新の向きを採用（決定論）。空台帳 → []。
 */
export function deriveNextTripConstraints(ledger: RegretEntry[]): NextTripConstraint[] {
  // 軸ごと最新（decidedAt 昇順前提・後勝ち）。
  const latest = new Map<RegretAxis, RegretEntry>();
  for (const e of [...ledger].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))) {
    latest.set(e.axis, e);
  }
  return [...latest.values()].map((e) => ({
    axis: e.axis,
    direction: e.direction,
    label: e.direction === "reduce" ? REDUCE_LABEL[e.axis] : INCREASE_LABEL[e.axis],
  }));
}

/** 表示用ラベル列（「前回からの学び（今回反映）」）。 */
export function regretReflectionLabels(constraints: NextTripConstraint[]): string[] {
  return constraints.map((c) => c.label);
}

/**
 * 次回制約 → solver intent override（**reduce 系のみ・conservative**）。
 *   mobility/pace reduce → 低 fatigue + 低詰め込み上限。budget reduce → tight。
 *   増やす方向は plan を過激にしないため intent では強制しない（display のみ）。
 */
export function regretToIntentOverride(constraints: NextTripConstraint[]): CoAlterSolverIntentOverride {
  const out: CoAlterSolverIntentOverride = {};
  for (const c of constraints) {
    if (c.direction !== "reduce") continue;
    if (c.axis === "mobility" || c.axis === "pace") {
      out.fatigueSignals = { transitFatigue: 2, onSiteFatigue: 2, combined: 2 };
      out.cognitiveLoadCeilingPerDay = 3;
    }
    if (c.axis === "budget") out.budgetSignals = ["tight"];
  }
  return out;
}
