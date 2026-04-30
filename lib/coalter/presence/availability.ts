/**
 * CoAlter Stage 2 — ExecutorAvailability 遷移 (L2-e)
 *
 * 正本:
 *   - master §5 起動・介入モデル (5 状態遷移図)
 *   - 統合契約 §2.1 / §2.4 (本節を正本として吸収、rev 1 整合)
 *   - runtime §3.4 disabled 下の挙動
 *
 * 5 状態 (master §5):
 *   inactive          : ペアで CoAlter 未有効化
 *   pending_consent   : 同意リクエスト表示中
 *   enabled           : ペアで有効化済 (S0 常駐のみ)
 *   active            : セッション実行中 (S1-S8 可動)
 *   disabled          : opt-out 済
 *
 * 不変規則 (master §5 / 統合契約 §2.1 rev 1):
 *   - disabled → enabled 直接遷移 禁止 (必ず pending_consent 経由、相手の再同意必須)
 *   - pending_consent → inactive: 拒否 / 72h 無応答
 *   - active 終了は enabled に戻る (10 分タイムアウト / 提案完了 / 明示終了)
 */

import type { ExecutorAvailability } from "./types";

/**
 * Availability 遷移 trigger event。master §5 状態遷移図を写像。
 */
export type AvailabilityEvent =
  | { type: "REQUEST_CONSENT" }   // inactive → pending_consent (片方が起動要求)
  | { type: "CONSENT_GRANTED" }   // pending_consent → enabled
  | { type: "CONSENT_REJECTED" }  // pending_consent → inactive (相手拒否 / 72h 無応答)
  | { type: "ACTIVATE" }          // enabled → active (button/mention でセッション開始)
  | { type: "SESSION_END" }       // active → enabled (提案完了 / 明示終了 / 10 分タイムアウト)
  | { type: "OPT_OUT" }           // enabled → disabled (設定 opt-out)
  | { type: "REENABLE_REQUEST" }; // disabled → pending_consent (再有効化要求、必ず再同意)

/**
 * Availability 遷移 reducer (純関数)。
 *
 * 不正遷移 (例: disabled → enabled 直接) は state 不変 (defensive)。
 */
export function availabilityReducer(
  current: ExecutorAvailability,
  event: AvailabilityEvent,
): ExecutorAvailability {
  switch (event.type) {
    case "REQUEST_CONSENT":
      return current === "inactive" ? "pending_consent" : current;
    case "CONSENT_GRANTED":
      return current === "pending_consent" ? "enabled" : current;
    case "CONSENT_REJECTED":
      return current === "pending_consent" ? "inactive" : current;
    case "ACTIVATE":
      return current === "enabled" ? "active" : current;
    case "SESSION_END":
      return current === "active" ? "enabled" : current;
    case "OPT_OUT":
      // master §5: enabled / active どちらからも opt-out 可
      return current === "enabled" || current === "active" ? "disabled" : current;
    case "REENABLE_REQUEST":
      // 不可侵: disabled → enabled 直接禁止、必ず pending_consent 経由 (master §5 / 統合契約 §2.1)
      return current === "disabled" ? "pending_consent" : current;
  }
}

/**
 * 現 availability で UI 表示が許可されるか (統合契約 §2.2)。
 *
 * - disabled / inactive : 上部レイヤー非表示 (UI 要素なし)
 * - pending_consent     : 同意フロー UI のみ表示 (CoAlter 本体非表示)
 * - enabled / active    : 上部レイヤー表示
 */
export function isUiVisible(av: ExecutorAvailability): boolean {
  return av === "enabled" || av === "active";
}

/**
 * Presence の可動域 (統合契約 §2.2)。
 *
 * - enabled  : S0 常駐のみ (S1-S8 不可)
 * - active   : S0-S8 全て可動
 * - 他 3 状態: 何も発火しない
 */
export function getPresenceMobility(
  av: ExecutorAvailability,
): "none" | "s0_only" | "all" {
  if (av === "active") return "all";
  if (av === "enabled") return "s0_only";
  return "none";
}

/**
 * 初期 availability (新ペア = inactive、master §5)。
 */
export function initialAvailability(): ExecutorAvailability {
  return "inactive";
}
