/**
 * lib/plan/dayRehearsal/whatIfMagnitude.ts — A3 What-if: 定性 magnitude 語彙（pure・foundation）
 *
 * ★目的: What-if 深化（inverse / comparison）が共有する **「影響の大きさ」を定性語で表す**語彙。
 *   既存 `EstimateLevel`（low/moderate/high/unknown）と outlook（holds/tight/breaks）から、
 *   **少し / 中程度 / 大きめ** 等の定性語へ写像するだけ。
 *
 * ★不変原則（CEO 制約）:
 *   - ★**偽の数値・係数・確率を一切出さない**（出力は定性語のみ・数字を含まない）。
 *   - unknown / 悪化していない / 無差 は **null（沈黙）**（捏造しない）。
 *   - 断定しない（hedge は consumer 側で付ける）。pure / Date 不使用 / DB・network なし。
 */
import type { EstimateLevel } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";

/** Day Rehearsal の viability outlook（再掲・型の局所利用）。 */
export type ViabilityOutlook = "holds" | "tight" | "breaks" | "unknown";

/**
 * ★EstimateLevel → 定性大きさ語（数字なし）。unknown → null（沈黙＝語らない）。
 *   low=少し / moderate=中程度 / high=大きめ。
 */
export function magnitudeWord(level: EstimateLevel): string | null {
  switch (level) {
    case "low":
      return "少し";
    case "moderate":
      return "中程度";
    case "high":
      return "大きめ";
    case "unknown":
      return null; // ★不明は語らない
  }
}

/** outlook の悪化方向の順位（holds < tight < breaks）。unknown は順位なし(null)。 */
const OUTLOOK_RANK: Record<ViabilityOutlook, number | null> = {
  holds: 0,
  tight: 1,
  breaks: 2,
  unknown: null,
};

/**
 * ★before→after の outlook **悪化幅**を定性語に（数字なし）。
 *   悪化していない（改善/同等）/ いずれか unknown → null（沈黙）。1 段悪化=中程度 / 2 段悪化=大きめ。
 */
export function outlookWorseningWord(before: ViabilityOutlook, after: ViabilityOutlook): string | null {
  const b = OUTLOOK_RANK[before];
  const a = OUTLOOK_RANK[after];
  if (b == null || a == null) return null; // unknown は語らない
  const delta = a - b;
  if (delta <= 0) return null; // ★悪化していなければ沈黙
  return delta >= 2 ? "大きめ" : "中程度";
}

/**
 * ★level が悪化方向に上がったか（before→after）。同等/改善/unknown は false。
 *   inverse what-if の coherence gate で「整合した悪化」を確かめる用。
 */
export function isLevelWorsened(before: EstimateLevel, after: EstimateLevel): boolean {
  const rank: Record<EstimateLevel, number | null> = { low: 0, moderate: 1, high: 2, unknown: null };
  const b = rank[before];
  const a = rank[after];
  if (b == null || a == null) return false;
  return a > b;
}
