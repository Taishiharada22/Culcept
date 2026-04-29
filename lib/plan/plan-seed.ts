/**
 * PlanSeed — 揺らぎの希望
 *
 * 「カフェで仕事したい」「ジム行きたい」「誰かと会いたい」等の
 * 確定予定ではない希望・兆候・揺らぎ。
 *
 * ExternalAnchor（動かせない外部制約）と混同してはならない（§2.0 不変原則）。
 *   - ExternalAnchor: 仕事 / 授業 / 通院 / 予約 / シフト
 *   - PlanSeed: 〜したい / 〜できたら / 〜たぶん / どこか
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.0, §2.2
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - migration / repository は後続 commit。
 *   - 会話キャプチャ抽出ロジックは Wave 2。
 */

import type { ActionShape } from "../stargazer/alterHomeAdapter";

/** 希望の時間帯ヒント */
export type PlanSeedTimeHint =
  | "morning"
  | "afternoon"
  | "evening"
  | "anytime";

/** Seed の入力経路 */
export type PlanSeedSource = "chat" | "manual";

/** Seed のライフサイクル状態 */
export type PlanSeedStatus =
  | "active"     // 利用可能、DraftPlan 配置候補
  | "consumed"   // DraftPlan に組み込まれた
  | "expired"    // 漠然な希望が時間経過で失効
  | "rejected";  // ユーザーが棄却

export interface PlanSeed {
  id: string;
  userId: string;

  /** 元発話 */
  signal: string;

  /** 構造化された希望（任意） */
  desiredAction?: string;

  /** 「明日」「来週水曜」等を解決した日付（YYYY-MM-DD） */
  desiredDate?: string;

  desiredTimeHint?: PlanSeedTimeHint;

  /** alterHomeAdapter の ActionShape を流用（§2.2） */
  actionShape?: ActionShape;

  /** 抽出時の自信度（0-1） */
  confidence: number;

  status: PlanSeedStatus;

  source: PlanSeedSource;

  /** Seed 取り込み時刻 */
  capturedAt: string;

  /** 漠然な希望は自動失効（§2.2） */
  expiresAt?: string;
}
