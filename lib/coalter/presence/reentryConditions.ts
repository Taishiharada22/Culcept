/**
 * CoAlter Stage 2 — 再介入条件サマリ (L2-j)
 *
 * 正本: UI spec §6.7 再介入条件サマリ / §6.8 非判定性
 *
 * §6.7 表 (拒否種別 × 再介入可否):
 *
 * | 拒否種類                              | セッション内再試行 | 次セッション以降 | 明示呼び出し応答 |
 * |---|---|---|---|
 * | モード昇格拒否 (§6.6.1)              | 禁止 (同一セッション) | 通常通り閾値判定 | 可 (mode 切替 tap 常時) |
 * | 個別提案拒否 (§6.6.2)                | 同内容抑制、別 trigger は可 | 通常通り | 可 |
 * | 介入後退要求 (§6.6.3)                | 完全停止 (指定期間)        | 指定期間経過後復帰 | 可 (期間中も) |
 *
 * 不可侵原則 (§6.7-§6.8):
 *   - 3 種類は独立の cooldown / 信頼影響を持つ
 *   - 一括化禁止 (「拒否されたから何もしない」は信頼の過剰自己抑制)
 *   - 明示呼び出しは常にどの拒否状態でも応答可
 *
 * 本ファイルは §6.7 表の TypeScript 写像 + reentry 判定 helper。
 * 実 cooldown 判定は cooldownResolver (L2-e) が行い、本ファイルは記述・lookup のみ。
 */

export type RejectionCategory =
  | "mode_escalation"
  | "individual_proposal"
  | "coalter_retreat";

/**
 * §6.7 各拒否カテゴリの再介入条件記述。
 */
export interface ReentryDescription {
  category: RejectionCategory;
  /** §6.7 表 セッション内再試行 */
  sameSession: string;
  /** §6.7 表 次セッション以降 */
  nextSession: string;
  /** §6.7 表 明示呼び出し応答 */
  explicitCallAllowed: boolean;
}

/**
 * §6.7 表 の TypeScript 写像。3 カテゴリ独立。
 */
export const REENTRY_TABLE: Readonly<Record<RejectionCategory, ReentryDescription>> = {
  mode_escalation: {
    category: "mode_escalation",
    sameSession: "自動昇格再試行禁止 (当該セッション終了まで、§6.6.1)",
    nextSession: "通常通り閾値判定で判断",
    explicitCallAllowed: true, // mode 切替 tap は常時可
  },
  individual_proposal: {
    category: "individual_proposal",
    sameSession: "同内容は抑制、別 signal trigger は可",
    nextSession: "通常通り",
    explicitCallAllowed: true,
  },
  coalter_retreat: {
    category: "coalter_retreat",
    sameSession: "S0 → S1 自動遷移完全停止 (指定期間、§6.6.3)",
    nextSession: "指定期間経過後、通常の signal 検出フローに復帰",
    explicitCallAllowed: true, // 期間中も明示呼び出しは可 (§6.6.3)
  },
};

/**
 * 与えられたカテゴリで明示呼び出し応答が許可されているか (§6.7 表)。
 *
 * §6.7 不変原則: 明示呼び出しは常にどの拒否状態でも応答可 (= 全カテゴリ true)。
 * 本関数は将来 spec rev で例外が出た時の hook point。
 */
export function isExplicitCallAllowed(category: RejectionCategory): boolean {
  return REENTRY_TABLE[category].explicitCallAllowed;
}

/**
 * 与えられたカテゴリの "同セッション内再試行" が許可されているか。
 *
 * - mode_escalation: false (自動昇格再試行禁止、ただし手動切替は別経路で可)
 * - individual_proposal: 条件付き (同内容否、別 trigger 可) → 本関数は厳密には false
 *   (「同内容」判定は呼び出し側、cooldownResolver Tier 5 で実施)
 * - coalter_retreat: false (期間中完全停止、ただし明示呼び出しは別経路)
 */
export function isSameSessionRetryAllowed(category: RejectionCategory): boolean {
  // 厳密には個別提案も「別 trigger なら可」だが、デフォルトは抑制方向
  return false;
}
