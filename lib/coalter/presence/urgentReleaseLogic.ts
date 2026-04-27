/**
 * CoAlter Stage 2 — Urgent Release Logic (L2-k)
 *
 * 正本: UI spec §8.5.4 解除条件 / §8.5.5 §6.8 非判定性継承
 *
 * 4 解除契機:
 *   - intervention_complete : 発話成立 → 応答取得 → fade-out
 *   - user_dismiss          : dismiss tap → fade-out + 責めない
 *   - timeout               : 具体値 §9 保留 → 静かに fade-out、履歴のみ残る
 *   - upper_priority_swap   : さらに強い urgent 発生 → 前 urgent 置換
 *
 * 不可侵 (§8.5.4 / §6.8 継承):
 *   - dismiss 後の追加挽留禁止 (別 urgent 自動発火不可)
 *   - timeout 後の沈黙ペナルティ禁止 (「無視した」とカウントしない)
 */

export type UrgentReleasePath =
  | "intervention_complete"
  | "user_dismiss"
  | "timeout"
  | "upper_priority_swap";

/**
 * 解除判定の入力 (各 trigger boolean、いずれか true で解除)。
 */
export interface ReleaseInput {
  /** 介入完了 (発話成立 → 応答取得) */
  interventionComplete?: boolean;
  /** ユーザー dismiss tap */
  userDismiss?: boolean;
  /** timeout 経過 */
  timeoutElapsed?: boolean;
  /** 上位 urgent (さらに強い critical) が発生 */
  upperPrioritySwap?: boolean;
}

/**
 * 解除判定結果。
 */
export interface ReleaseDecision {
  released: boolean;
  path: UrgentReleasePath | null;
  reason: string;
}

/**
 * 解除条件評価。
 *
 * 優先順位 (上位ほど早期解除):
 *   1. upper_priority_swap (上位 urgent で置換、§8.5.4)
 *   2. intervention_complete (発話成立 → 応答取得)
 *   3. user_dismiss
 *   4. timeout
 *
 * いずれも true でない時は released=false (urgent 維持)。
 */
export function decideRelease(input: ReleaseInput): ReleaseDecision {
  if (input.upperPrioritySwap) {
    return {
      released: true,
      path: "upper_priority_swap",
      reason: "上位 urgent 発生で置換 (§8.5.4)",
    };
  }
  if (input.interventionComplete) {
    return {
      released: true,
      path: "intervention_complete",
      reason: "介入完了 (発話成立 → 応答取得)",
    };
  }
  if (input.userDismiss) {
    return {
      released: true,
      path: "user_dismiss",
      reason: "ユーザー dismiss tap (§6.8 責めない継承)",
    };
  }
  if (input.timeoutElapsed) {
    return {
      released: true,
      path: "timeout",
      reason: "timeout 経過 (静かに fade-out、§8.5.4)",
    };
  }
  return {
    released: false,
    path: null,
    reason: "no release trigger active",
  };
}

/**
 * 解除直後の禁止事項 enforce (§8.5.4):
 *
 * 解除直後の "次 action" 候補をチェックし、追加挽留 (= 別 urgent 自動発火) を弾く。
 * dismiss / timeout 直後は同種の urgent を一定時間自動発火不可。
 *
 * 本関数は呼び出し側で「直後に urgent をまた発火しようとする」ケースで呼ぶ guard。
 */
export function isUrgentAutoRefireBlocked(
  releasedPath: UrgentReleasePath | null,
  msSinceRelease: number,
  blockMs: number = 60_000,
): boolean {
  // upper_priority_swap は次 urgent への遷移そのものなので block しない
  if (releasedPath === "upper_priority_swap") return false;
  if (releasedPath === "intervention_complete") return false;
  // dismiss / timeout 直後は自動再発火を block (追加挽留禁止 / 沈黙ペナルティ禁止)
  if (releasedPath === "user_dismiss" || releasedPath === "timeout") {
    return msSinceRelease < blockMs;
  }
  return false;
}
