/**
 * CoAlter Stage 1 Understand — FairnessAdjustment
 *
 * RelationshipObservation × ConversationObservation → FairnessAdjustment の
 * 完全決定論 rule-based 算出。
 *
 * [CEO lock 2026-04-20 M0-3 #2] ledger 由来のみ:
 *   使用して良い観測は以下に限定する。
 *     - relationship.fairnessLedger
 *     - relationship.currentTemperature
 *     - relationship.interactionPattern
 *     - conversation.caringIntensity（非対称のみ、強度の意味解釈はしない）
 *   禁止: Alter の emotional state、stargazer の軸値、rupture summary 本文、
 *        narrative の心理推定、"優しさ" のような抽象ラベル。
 * [CEO lock 2026-04-20 M0-2 #1/#2] 決定論 / degrade:
 *   ledger が空 + caring 対称なら favorSide=null（無補正）を返す。
 */

import type {
  ConversationObservation,
  FairnessAdjustment,
  FairnessRecord,
  RelationshipObservation,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. 閾値定数
// ═══════════════════════════════════════════════════════════════════════════

/** 直近 N 件のみ採用（古すぎるエントリは影響を薄める）。 */
const LEDGER_WINDOW = 10;
/** 加重平均で採用する `|mean|` の下限。これ未満は ledger からは判定しない。 */
const LEDGER_SKEW_FLOOR = 0.2;
/** caring 非対称を fallback で使う下限。`|a - b|` がこれ以上で判定に採用。 */
const CARING_ASYMMETRY_FLOOR = 0.2;
/** temperature="cool" のとき strength に加算するブースト。 */
const COOL_TEMPERATURE_BOOST = 0.15;
/** strength の上限（絶対値）。 */
const STRENGTH_CAP = 1.0;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function deriveFairnessAdjustment(
  relationship: RelationshipObservation,
  conversation: ConversationObservation,
): FairnessAdjustment {
  // 決定論 sort: decidedAt 昇順、同時刻は sessionId 昇順。
  //
  // [M1 C3] sessionId は string | null (null = onboarding seed row)。
  //   null が混じっても比較子が安定して順序を返すよう、明示的に
  //   `?? ""` で空文字へ寄せる。空文字は任意の非空 string より
  //   lexicographically 小なので seed 行は同時刻グループ内で先頭に並ぶ。
  //   tiebreak 未決 (x === y) の場合は 0 を返して元順序を保持。
  const sortedLedger = [...relationship.fairnessLedger].sort((x, y) => {
    if (x.decidedAt !== y.decidedAt) return x.decidedAt < y.decidedAt ? -1 : 1;
    const sx = x.sessionId ?? "";
    const sy = y.sessionId ?? "";
    return sx < sy ? -1 : sx > sy ? 1 : 0;
  });
  // 直近 N 件（新しい側）を採用。
  const recent = sortedLedger.slice(-LEDGER_WINDOW);

  const weighted = computeWeightedMeanSkew(recent);
  const caringGap = conversation.caringIntensity.a - conversation.caringIntensity.b;
  const tempBoost =
    relationship.currentTemperature === "cool" ? COOL_TEMPERATURE_BOOST : 0;

  // 優先: ledger-driven signal
  if (weighted !== null && Math.abs(weighted) >= LEDGER_SKEW_FLOOR) {
    // skew < 0 = 過去に A に寄った決定が多い → B に favor して補正。
    const favorSide: "a" | "b" = weighted < 0 ? "b" : "a";
    const strength = clamp(Math.abs(weighted) + tempBoost, 0, STRENGTH_CAP);
    const rationale = buildLedgerRationale(recent, weighted, favorSide);
    return {
      favorSide,
      rationale,
      strength: round3(strength),
      basedOnSessionCount: recent.length,
    };
  }

  // Fallback: caring 非対称
  if (Math.abs(caringGap) >= CARING_ASYMMETRY_FLOOR) {
    // a が b より強く気を配っている (caringGap > 0) → b を見る側に寄せる補正。
    const favorSide: "a" | "b" = caringGap > 0 ? "b" : "a";
    const strength = clamp(Math.abs(caringGap) + tempBoost, 0, STRENGTH_CAP);
    return {
      favorSide,
      rationale: buildCaringRationale(conversation.caringIntensity, favorSide),
      strength: round3(strength),
      basedOnSessionCount: recent.length,
    };
  }

  // 無補正
  return {
    favorSide: null,
    rationale: null,
    strength: 0,
    basedOnSessionCount: recent.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ledger の加重平均 skew。直近エントリほど weight 大（linear）。
 * 空配列なら null を返す（判定不能）。
 */
function computeWeightedMeanSkew(ledger: FairnessRecord[]): number | null {
  if (ledger.length === 0) return null;
  // weights: 古 → 新 で 1..N の整数
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < ledger.length; i++) {
    const w = i + 1;
    numerator += w * ledger[i].skew;
    denominator += w;
  }
  return numerator / denominator;
}

function buildLedgerRationale(
  ledger: FairnessRecord[],
  weighted: number,
  favorSide: "a" | "b",
): string {
  // 文言は **観測数値から機械生成** のみ。心理推定語彙は含めない。
  const sideLabel = favorSide === "a" ? "A" : "B";
  const opposite = favorSide === "a" ? "B" : "A";
  return `過去 ${ledger.length} 回の決定で加重平均 skew = ${weighted.toFixed(
    2,
  )}（${opposite} 寄り）。今回は ${sideLabel} 寄りに補正。`;
}

function buildCaringRationale(
  caring: { a: number; b: number },
  favorSide: "a" | "b",
): string {
  const sideLabel = favorSide === "a" ? "A" : "B";
  return `caringIntensity A=${caring.a.toFixed(2)} / B=${caring.b.toFixed(
    2,
  )} の非対称。今回は ${sideLabel} 寄りに補正。`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
