/**
 * Current Location Inference Gating (PR B-2d-c)
 *
 * CEO/GPT 2026-05-02 PR B-2d-c 規律:
 *   取得した現在地を **正しい時のみ** origin 推論に使う。
 *   ユーザーが opt-in して取得した座標でも、以下のいずれかに該当する場合は採用しない:
 *     - lat/lng が NaN / Infinity / 範囲外 → invalid
 *     - 対象 plan の日付が「実際の今日 (JST)」でない → not_today
 *     - GPS 精度が 1000m 超 → low_accuracy
 *     - 取得から 30 分以上経過 → stale
 *
 * 重要な設計原則:
 *   - currentLat/Lng が **null** (= 未取得) の場合は invalid 扱いしない。
 *     caller (legacyAdapter) は coords が存在する場合のみ evaluate を呼ぶ責任を持つ。
 *     null は「不正」ではなく「無い」状態であり、registered_home / baseline fallback
 *     に進むのが正しい挙動。
 *
 *   - capturedAt は **pos.timestamp** 由来 ISO 8601 を必須とする。
 *     `new Date()` 由来だと cached position 時に stale 判定が破綻する。
 *     例: 別 tab で 9:00 取得 → 9:04 に Aneurasync で cache hit
 *         pos.timestamp = 9:00、new Date() = 9:04 → 4 分しか経ってないように見えて誤判定
 *     frontend (useAlterChat) で必ず new Date(pos.timestamp).toISOString() を使う。
 *
 *   - actualTodayYmdJst は **既存 `today` field と混同禁止**。
 *     legacyAdapter の `today` は target plan date (= currentPlanDate) であり、
 *     「実際の今日」とは別物。明日の plan 編集時は今日と異なる値が入る可能性があり、
 *     `today` を流用すると not_today 判定が壊れる。命名で前提を明示する。
 *
 *   - reject 時の挙動:
 *     1. log に rejectReason のみ出力 (lat/lng/住所/userId/plan は出さない、PII 規律)
 *     2. AnchorUnknownReason は新規追加しない (debug log のみ、no_baseline に集約)
 *     3. caller は registered_home / 既存 unknown reason 体系に fallback する
 *
 * scope (PR B-2d-c):
 *   - evaluateCurrentLocation 純関数 (本 file)
 *   - LegacyAdapterInput に accuracy / capturedAt / actualTodayYmdJst を追加
 *   - resolveHomeAnchor caller 前段で gate を適用
 *   - 新 AnchorUnknownReason は追加しない (debug log のみ)
 *   - declined 再 opt-in / reset UI は別 PR (B-2d-d)
 *   - user timezone / travel timezone / semantic date 解釈は B-4
 *   - watchPosition / location history / DB persistence は B-2f
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants (CEO 確定値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 採用許容する最大 accuracy (m)。これを超える低精度な値 (= IP-based GPS 等) は
 * 起点として信頼できないので reject する。
 *
 * 1000m = IP ベース判定の典型的下限値。GPS / WiFi はほぼこれより精度が良い。
 */
export const CURRENT_LOCATION_MAX_ACCURACY_M = 1000;

/**
 * 採用許容する最大経過時間 (ms)。これを超える古い座標は stale として reject する。
 *
 * 30 分 = 通勤・移動の典型時間。frontend の maximumAge は 5 分なので通常 5 分以内
 * だが、ユーザーが長時間 app を開いていた場合や cached position 経由で取得した
 * 場合に備える safety net。
 */
export const CURRENT_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Current location が origin 推論に **不採用** となった理由。
 *
 * - "low_accuracy": accuracy > CURRENT_LOCATION_MAX_ACCURACY_M
 * - "stale":        capturedAt が CURRENT_LOCATION_MAX_AGE_MS より古い
 * - "invalid":      lat/lng が NaN/Infinity/範囲外 OR capturedAt が parse 不能
 * - "not_today":    plan.date !== actualTodayYmdJst
 *                   (= 明日・明後日の plan に今の現在地を使わない)
 */
export type CurrentLocationRejectReason =
  | "low_accuracy"
  | "stale"
  | "invalid"
  | "not_today";

export type EvaluateCurrentLocationResult =
  | { usable: true }
  | { usable: false; rejectReason: CurrentLocationRejectReason };

export interface EvaluateCurrentLocationInput {
  /** GPS 由来の lat (caller が null check 済み) */
  currentLat: number;
  /** GPS 由来の lng (caller が null check 済み) */
  currentLng: number;
  /** GPS 精度 (m)。null/undefined なら check skip (legacy backward compat) */
  accuracy?: number | null;
  /** ISO 8601 timestamp (pos.timestamp 由来)。null/undefined なら check skip */
  capturedAt?: string | null;
  /** JST の「実際の今日」 (YYYY-MM-DD)。null/undefined なら not_today check skip */
  actualTodayYmdJst?: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluateCurrentLocation — 純関数 (副作用なし、テスト容易)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在地を origin 推論に採用してよいか判定する純関数。
 *
 * **Precondition (caller responsibility):**
 *   currentLat / currentLng が **存在する** こと。null/undefined の場合は本関数を
 *   呼ばずに registered_home / baseline fallback に進むこと。
 *   coords が無いだけの状態を invalid 扱いするのは誤り。
 *
 * 判定順序 (CEO/GPT 2026-05-02 確定):
 *   1. lat/lng の数学的健全性 (finite + 範囲) → invalid
 *   2. plan が今日でない (planDate !== actualTodayYmdJst) → not_today
 *      (actualTodayYmdJst が null なら check skip = backward compat)
 *   3. accuracy > 1000m → low_accuracy
 *      (accuracy が null なら check skip)
 *   4. capturedAt が parse 不能 → invalid
 *      capturedAt が 30 分超古い → stale
 *      (capturedAt が null なら check skip)
 *
 * @param input 評価対象 (coords 必須、その他 optional)
 * @param planDate 対象 plan の日付 (YYYY-MM-DD)。null なら not_today check は skip
 * @param nowMs 現在時刻 (ms epoch)。テスト時 inject 用。省略時は Date.now()。
 */
export function evaluateCurrentLocation(
  input: EvaluateCurrentLocationInput,
  planDate: string | null,
  nowMs: number = Date.now(),
): EvaluateCurrentLocationResult {
  const { currentLat, currentLng, accuracy, capturedAt, actualTodayYmdJst } =
    input;

  // 1. lat/lng が無効 (finite + 範囲) → invalid
  //    Note: caller が null check 済みの前提だが、防御的に NaN/Infinity も弾く
  if (
    typeof currentLat !== "number" ||
    typeof currentLng !== "number" ||
    !Number.isFinite(currentLat) ||
    !Number.isFinite(currentLng) ||
    currentLat < -90 ||
    currentLat > 90 ||
    currentLng < -180 ||
    currentLng > 180
  ) {
    return { usable: false, rejectReason: "invalid" };
  }

  // 2. plan の対象日が「実際の今日」でない (B-2d-c の核)
  //    actualTodayYmdJst が null = legacy caller、check skip (backward compat)
  if (actualTodayYmdJst != null) {
    if (planDate == null || planDate !== actualTodayYmdJst) {
      return { usable: false, rejectReason: "not_today" };
    }
  }

  // 3. accuracy が低すぎる (= 信頼できない) → low_accuracy
  //    accuracy が null = legacy caller、check skip
  if (accuracy != null) {
    if (
      typeof accuracy !== "number" ||
      !Number.isFinite(accuracy) ||
      accuracy > CURRENT_LOCATION_MAX_ACCURACY_M
    ) {
      // accuracy 自体が NaN/Infinity の場合も信頼できないので reject
      // ただし invalid ではなく low_accuracy として分類 (= 座標は有効、精度のみ問題)
      return { usable: false, rejectReason: "low_accuracy" };
    }
  }

  // 4. capturedAt の判定
  //    capturedAt が null = legacy caller、check skip
  if (capturedAt != null) {
    if (typeof capturedAt !== "string") {
      return { usable: false, rejectReason: "invalid" };
    }
    const parsedCapturedAt = Date.parse(capturedAt);
    if (Number.isNaN(parsedCapturedAt)) {
      return { usable: false, rejectReason: "invalid" };
    }
    if (nowMs - parsedCapturedAt > CURRENT_LOCATION_MAX_AGE_MS) {
      return { usable: false, rejectReason: "stale" };
    }
  }

  return { usable: true };
}
