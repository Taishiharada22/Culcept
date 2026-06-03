/**
 * Reality Control OS — Gap Meaning（Slice 2F / INV-17）
 *
 * 「空白は必ず埋めない。意味づけする」を保証する純粋分類器（live 実装前の契約）。
 * gap 長/次予定移動/食事窓/回復需要/エネルギー から空白の意味を返す。
 * free_time / recovery として「意図的に残す」ことも有効な分類。
 *
 * 制約: 純関数のみ。
 */

export type GapMeaning =
  | "dangerous_tight" // 移動で食われ足りない＝危険な詰まり
  | "travel_buffer" // 移動前の余白として確保
  | "meal" // 食事
  | "recovery" // 回復
  | "waiting" // 待機
  | "work" // 作業可能
  | "free_time"; // 意図的に空ける（埋めない）

export interface GapInput {
  readonly gapLengthMin: number;
  readonly nextTravelMin: number; // 次イベントまでの移動所要
  readonly isBeforeImportant: boolean;
  readonly inMealWindow: boolean;
  readonly recoveryNeed: number; // 0..1
  readonly energy: number; // 0..1
}

export function classifyGap(g: GapInput): GapMeaning {
  // 移動で食われて足りない → 危険な詰まり
  if (g.gapLengthMin < g.nextTravelMin) return "dangerous_tight";

  const free = g.gapLengthMin - g.nextTravelMin; // 移動を除いた自由分

  // 重要予定前は移動余白を確保（作業で埋めない＝INV-16/26）
  if (g.isBeforeImportant && free < 20) return "travel_buffer";

  // 食事窓 + 十分 → 食事
  if (g.inMealWindow && free >= 20) return "meal";

  // 回復需要が高い → 回復（短ければ待機）
  if (g.recoveryNeed >= 0.6) return free >= 30 ? "recovery" : "waiting";

  // 疲れている → 無理に埋めず free_time
  if (g.energy < 0.4) return "free_time";

  // 十分な自由 + エネルギーあり → 作業
  if (free >= 45 && g.energy >= 0.5) return "work";

  // 既定: 埋めない
  return "free_time";
}
