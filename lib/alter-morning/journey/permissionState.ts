/**
 * GeolocationPermissionState — frontend permission state contract (PR B-2d-a)
 *
 * CEO/GPT 2026-05-02 PR B-2d-a 規律:
 *   permissionState は origin を決める主役ではない。
 *   currentLat/Lng も baseline home も解決できず、最終的に origin が unknown に
 *   なる時の **理由説明** として使う。
 *
 * 優先順位 (CEO 補正規律):
 *   1. currentLat/Lng がある
 *      → permissionState 不問で current location 採用
 *   2. currentLat/Lng なし、userHomeLat/Lng あり
 *      → registered_home 採用、AnchorUnknownReason 不要
 *   3. current/baseline 両方なし
 *      → permissionState から AnchorUnknownReason を決定
 *
 * scope (PR B-2d-a):
 *   - 型定義 + frontend helper (本 file)
 *   - useAlterChat への注入は Commit 2
 *   - backend route での受け取りは Commit 3
 *   - legacyAdapter での reason 決定は Commit 4
 *   - test は Commit 5
 *   - getCurrentPosition の新規呼び出しは追加しない (既存 mount 時自動取得は維持)
 *   - opt-in UI / 履歴保存 / DB persistence は別 PR (B-2d-b / B-2f)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GeolocationPermissionState — 5 値 (CEO/GPT 2026-05-02 規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// browser Permissions API (`navigator.permissions.query`) の 3 値 + 我々の error
// state 2 値 = 計 5 値。
//
//   - "granted":     user 既に許可、currentLat/Lng が来る前提
//   - "denied":      user 明示拒否
//   - "prompt":      まだ user に聞いていない
//   - "unsupported": navigator.permissions API 非対応 (古いブラウザ等)
//   - "unavailable": query 自体が失敗 (例外 throw、ネットワーク等)
//
// 設計原則 (CEO/GPT 補強):
//   raw 5 値は LegacyAdapterInput / debug log で **必ず保持** する。
//   AnchorUnknownReason への変換時は集約してよい (prompt/unsupported/unavailable
//   → unrequested) が、raw 値を失うと後で「なぜ位置情報が使えなかったのか」 を
//   trace できなくなる。

export type GeolocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unavailable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getGeolocationPermissionState — frontend helper (browser only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// `navigator.permissions.query({ name: "geolocation" })` で permission state を取得。
// 環境差を吸収して 5 値で返す。
//
// 不変条件:
//   - SSR / Node 環境では "unsupported" を返す (= navigator 不在)
//   - navigator.permissions が undefined → "unsupported"
//   - query が throw → "unavailable"
//   - 結果が "granted" / "denied" / "prompt" のいずれかなら、そのまま返す
//   - 結果が想定外の値 → "unavailable" (defensive)
//
// 副作用なし (純粋に query するだけ)。getCurrentPosition は呼ばない (CEO 規律)。

export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  // SSR / Node 環境
  if (typeof navigator === "undefined") return "unsupported";
  // 古いブラウザで Permissions API 非対応
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
    return "unsupported";
  }
  try {
    const result = await navigator.permissions.query({
      name: "geolocation",
    } as PermissionDescriptor);
    const state = result.state;
    if (state === "granted" || state === "denied" || state === "prompt") {
      return state;
    }
    // 想定外の値 (defensive)
    return "unavailable";
  } catch {
    // query が throw (ネットワーク / 権限 / その他)
    return "unavailable";
  }
}
