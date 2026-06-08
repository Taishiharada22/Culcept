/**
 * Reality Control OS — R5-1 Permission Level 0–5 Model（**pure・R5 内部 contract**・barrel 非 export）
 *
 * 設計: docs/r5-permission-asset-audit-and-boundary.md（R5-0）/ CEO R5 設計原則
 *
 * 役割: 秘書の自律度勾配（Level 0–5）と、action × risk の分類を **R5 内部 pure contract** として定義する。
 *   canonical shared schema 化はまだしない（Plan/Life Ops への正式正本化は後続合流 gate）。
 *
 * 厳守: 実介入しない（判定の材料を定義するだけ）・**高リスクは必ず confirm/blocked**（autonomous にしない）・
 *   正本型を作らない（R5 内部）・pure。
 */

/** 秘書の自律度（0=記録のみ … 5=許可済み条件内で自動）。EmptyDayPermissionLevel(R2 placeholder) と構造互換。 */
export type PermissionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const PERMISSION_LEVEL_CAPABILITY: Record<PermissionLevel, string> = {
  0: "記録のみ",
  1: "そろそろの時期を通知",
  2: "候補を提案",
  3: "実行ページまで誘導・1タップ確認で更新",
  4: "入力補助・軽微調整を自動・最終確定はユーザー",
  5: "許可済み条件内で自動実行",
};

/** 秘書が取りうる action 種別（gate の対象）。 */
export type ActionKind =
  | "observe" // 記録するだけ
  | "notify" // 通知（hint を出す）
  | "propose" // 候補を提案
  | "draft" // 下書き/入力補助（適用しない）
  | "adjust_plan" // 予定の軽微な移動/短縮
  | "book" // 予約確定
  | "purchase" // 購入
  | "contact" // 連絡送信
  | "long_travel"; // 長距離移動の確定

export type RiskCategory = "low" | "elevated" | "high";

/** 高リスク flag（CEO 指定の「必ず confirm/blocked」領域）。 */
export type RiskFlag =
  | "first_time_place" // 初回店舗
  | "high_cost" // 高額
  | "personal_info" // 個人情報入力
  | "involves_others" // 他人を巻き込む
  | "sends_message" // 連絡送信
  | "confirms_booking" // 予約確定
  | "purchase" // 購入
  | "long_distance"; // 長距離移動

/** 自律実行に必要な最小 level（low risk 時）。 */
export const AUTONOMY_FLOOR: Record<ActionKind, PermissionLevel> = {
  observe: 0,
  notify: 1,
  propose: 2,
  draft: 3,
  adjust_plan: 4,
  book: 5,
  purchase: 5,
  contact: 5,
  long_travel: 5,
};

/** action の基底 risk（adjust_plan=elevated・book/purchase/contact/long_travel=high）。 */
export const ACTION_BASE_RISK: Record<ActionKind, RiskCategory> = {
  observe: "low",
  notify: "low",
  propose: "low",
  draft: "low",
  adjust_plan: "elevated",
  book: "high",
  purchase: "high",
  contact: "high",
  long_travel: "high",
};

/** 高リスク flag（**いずれか 1 つでも high**）。CEO の必須 confirm/blocked 領域に一致。 */
export const HIGH_RISK_FLAGS: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  "first_time_place",
  "high_cost",
  "personal_info",
  "involves_others",
  "sends_message",
  "confirms_booking",
  "purchase",
  "long_distance",
]);

/** 高リスクで「確認を提示できる」最小 level（これ未満は blocked）。 */
export const HIGH_RISK_CONFIRM_FLOOR: PermissionLevel = 3;

/** action × flags → risk（flag が 1 つでも高リスクなら high・他は action 基底）。 */
export function classifyRisk(action: ActionKind, flags: readonly RiskFlag[]): RiskCategory {
  if (flags.some((f) => HIGH_RISK_FLAGS.has(f))) return "high";
  return ACTION_BASE_RISK[action];
}
