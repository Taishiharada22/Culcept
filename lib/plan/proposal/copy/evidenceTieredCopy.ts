/**
 * Evidence Tiered Copy — Phase 3 Idea 27 (Self-Doubt Surface)。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1b / §10.5 Smoke 48 (Evidence Tiered Copy)
 *
 * 設計意図:
 *   AI は 100% 確信で語らない。 evidence 強度に応じて表現解像度を変える。
 *   既存 Calendar AI が見せる 「confidence %」 を 「文体」 に翻訳する。
 *
 * 3 tier 分岐:
 *   - 5+ 回反復、 乖離なし:           "confident"    (= 「先週も {action}」)
 *   - 3-4 回反復、 乖離なし:          "observation"  (= 「最近よく {action}」)
 *   - 3+ 回反復、 直近 1 回乖離:      "hedge"        (= 「もしかすると、 {action} かもしれません」)
 *   - 3 回未満:                       "silent"       (= 提案出さない)
 *
 * 不変原則:
 *   - Invariant 15 Confidence 非可視化: 数字を user に見せない、 文体のみ
 *   - Invariant 18 Reflection-triggering copy: 行動誘導禁止、 反射 trigger のみ
 *   - Invariant 24 Self-Contradiction → Observation: 直近乖離は提案ではなく観測扱い
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Thresholds (= docs spec)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MIN_REPETITION_FOR_PROPOSAL = 3;  // < 3 → silent
const CONFIDENT_REPETITION_THRESHOLD = 5;  // >= 5 + 乖離なし → confident
const HEDGE_DEVIATION_THRESHOLD = 1;  // 直近 1 回以上乖離 → hedge

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EvidenceTier = "confident" | "observation" | "hedge" | "silent";

export interface EvidenceTierContext {
  /** 反復回数 (= 直近 4 週) */
  readonly repetitionCount: number;
  /** 直近 1 回乖離数 (= 反復パターンと違った直近観測の回数、 0 なら乖離なし) */
  readonly recentDeviationCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Evidence context から tier を分類。
 *
 * 判定順:
 *   1. repetitionCount < 3              → silent
 *   2. recentDeviationCount >= 1         → hedge (= 反復はあるが直近乖延あり)
 *   3. repetitionCount >= 5              → confident
 *   4. それ以外 (= 3-4 反復 + 乖離なし)   → observation
 */
export function classifyEvidenceTier(ctx: EvidenceTierContext): EvidenceTier {
  if (ctx.repetitionCount < MIN_REPETITION_FOR_PROPOSAL) return "silent";
  if (ctx.recentDeviationCount >= HEDGE_DEVIATION_THRESHOLD) return "hedge";
  if (ctx.repetitionCount >= CONFIDENT_REPETITION_THRESHOLD) return "confident";
  return "observation";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tier → prefix mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Tier に対応する copy prefix を返す。
 *
 * silent tier は prefix を返さない (= caller 側で提案自体を出さない)。
 */
export function copyPrefixForTier(tier: EvidenceTier): string {
  switch (tier) {
    case "confident":
      return "先週も ";
    case "observation":
      return "最近よく ";
    case "hedge":
      return "もしかすると、 ";
    case "silent":
      return ""; // 呼ばれないが defensive
  }
}
