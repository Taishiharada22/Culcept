/**
 * declined recovery decision helper (PR B-2d-d)
 *
 * CEO/GPT 2026-05-02 PR B-2d-d 規律:
 *   browser permission が granted/prompt に戻った時、Aneurasync 側の declined を
 *   解除する recovery を起動する判定 logic を pure 関数に切り出す。
 *
 * useAlterChat の recovery useEffect から呼ばれる。pure 関数化することで:
 *   1. test 容易性 (React hook test 不要、state machine simulation で十分)
 *   2. 仕様の固定 (3 trigger 統合の判定ロジックを 1 箇所に集約)
 *
 * Recovery 起動条件 (CEO/GPT 確定):
 *   effectiveOptInState === "declined" AND
 *   (permissionState === "granted" || permissionState === "prompt")
 *
 * 非 recovery (declined 維持):
 *   - permissionState === null         (まだ取得中)
 *   - permissionState === "denied"     (browser 側もまだ拒否)
 *   - permissionState === "unsupported" (環境問題)
 *   - permissionState === "unavailable" (一時的問題)
 *
 * 重要 (CEO/GPT 規律):
 *   - recovery しても自動で granted にしない (= ユーザー再 opt-in 必要)
 *   - recovery しても自動で getCurrentPosition を呼ばない
 *     (= 既存 auto-fetch useEffect の条件 effectiveOptInState === "granted" に依存して
 *      not_asked では発火しない構造的保証)
 *   - recovery 後は banner が再表示される (effectiveOptInState === "not_asked")
 */

import type { LocationOptInState } from "./locationOptIn";
import type { GeolocationPermissionState } from "./permissionState";

/**
 * declined recovery を起動すべきか判定する pure 関数。
 *
 * @param effectiveOptInState 現在の effective opt-in state (snoozed expiry 考慮済み)
 * @param permissionState 現在の browser permission state (= subscribe 経由の最新値)
 * @returns true なら markNotAsked() を呼ぶ (declined → not_asked 降格)
 */
export function shouldRecoverDeclined(
  effectiveOptInState: LocationOptInState,
  permissionState: GeolocationPermissionState | null,
): boolean {
  // permissionState がまだ取得できていない (= subscribe 初回 callback 前)
  if (permissionState === null) return false;
  // declined 以外は recovery 対象外
  // (granted / not_asked / snoozed は変えない)
  if (effectiveOptInState !== "declined") return false;
  // browser 側で許可 or リセットされたケースのみ recovery
  if (permissionState !== "granted" && permissionState !== "prompt") {
    return false;
  }
  return true;
}
