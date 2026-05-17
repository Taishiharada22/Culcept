/**
 * AlterConfirmation — 確認契約と状態
 *
 * PDF 取り込み / 会話キャプチャ / DraftPlan 確認の 3 シーンで
 * 共通の操作契約・状態管理を持つ。UI は表現層でシーン別に分岐する：
 *   - PDF / 画像 = 編集可能テーブル（複数件まとめて確認）
 *   - 会話キャプチャ = 小カード（1 件単位の即時確認）
 *   - DraftPlan = Flow 内 inline（時間軸上で確認）
 *
 * 設計書: docs/alter-plan-foundation-design.md §4
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - state machine / hook 実装は W1-7。
 *   - UI 実装は各シーンの実装フェーズで個別。
 */

/** ユーザーが取れる操作（共通契約） */
export type AlterConfirmationAction =
  | "accept"
  | "edit"
  | "reject"
  | "snooze";

/** 状態遷移（3 シーン共通） */
export type AlterConfirmationState =
  | "pending"
  | "editing"
  | "confirmed"
  | "rejected"
  | "snoozed";

/** 確認の発生源 */
export type AlterConfirmationSource =
  | "pdf"
  | "image"
  | "chat"
  | "draft"
  | "manual";

/** 確認に紐づくメタ情報 */
export interface AlterConfirmationMeta {
  source: AlterConfirmationSource;

  /** Alter 側の自信度（0-1） */
  confidence: number;

  /** Alter がなぜそう判断したかの理由（任意） */
  reason?: string;

  /**
   * 必ず true。未確認 AI 推測の confirmed 化禁止原則を
   * 型レベルで強制する（§10 永久 OUT）。
   */
  requiresUserApproval: true;
}
