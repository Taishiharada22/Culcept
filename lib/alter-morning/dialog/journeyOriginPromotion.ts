/**
 * Journey Origin Promotion (B-3c-1 Commit 1) — pure helper
 *
 * CEO/GPT 2026-05-03 B-3c-1 設計提案 §5 Commit 1 (= 2nd 補正反映済):
 *   journey_origin candidate selection 時の昇格判定。**pure 関数**で副作用なし。
 *
 * 責務:
 *   - 入力: 現在の `JourneyAnchorState` (= known_label_only 期待) +
 *           ユーザーが選択した `NormalizedPlaceCandidate`
 *   - 出力: `{ kind: "promoted"; state: ... }` または `{ kind: "blocked"; reason: ... }`
 *   - 副作用: なし (= caller が dispatch / log / reject response 制御)
 *
 * GPT 2nd 補正の核心 (= 半壊 UX 防止):
 *   candidate.coordinates が無い (= 不正値) 場合、known_label_only を維持する
 *   だけでは「選んだのに何も変わらない」UX になる (= PR #69 で禁止した半壊 UX)。
 *   本 helper は **明示 reject** を返し、caller は activePresentation を
 *   clear せず reject response で client に伝える契約。
 *
 * 不変条件 (= test で固定):
 *   - 入力 state を mutate しない (= 完全 pure)
 *   - candidate.coordinates 不在 → blocked (= reason: "missing_coordinates")
 *   - state.kind !== "known_label_only" → blocked (= reason: "invalid_state"、
 *     idempotent 防御。known_exact / unknown には適用しない)
 *   - 成功時の source は "user_override" (= GPT 1st 判断、Q1 確定)
 *
 * scope:
 *   - journey_origin 専用 (= journey_end は B-3e で別 helper)
 *   - cache / log / reducer dispatch は caller (= selection route + applyPlaceSelectionByTarget)
 *   - travel synthesize は caller (= legacyAdapter rebuild path)
 */

import type {
  JourneyAnchorState,
  AnchorSource,
} from "../journey/anchorState";
import type { NormalizedPlaceCandidate } from "../search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PromotionResult — discriminated union
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * journey_origin promotion の結果。
 *
 * - `kind: "promoted"` → caller は `state` を新しい journeyOrigin に反映、
 *   travel synthesize を起動、activePresentation を clear する。
 * - `kind: "blocked"` → caller は **journeyOrigin を変更せず**、
 *   activePresentation を clear せず、reject response (= accepted=false) を返す。
 */
export type JourneyOriginPromotionResult =
  | {
      kind: "promoted";
      state: JourneyAnchorState & { kind: "known_exact" };
    }
  | {
      kind: "blocked";
      reason: JourneyOriginPromotionBlockReason;
    };

/**
 * 昇格が blocked される理由。
 *
 * - `missing_coordinates`: candidate.coordinates が不正 (= NaN / 範囲外 / null)
 *   → GPT 2nd 補正の主対象。明示 reject で半壊 UX を防止。
 * - `invalid_state`: 入力 state が known_label_only でない (= 既に known_exact、
 *   または unknown)。idempotent 防御。本来 caller が前段で防ぐべき。
 */
export type JourneyOriginPromotionBlockReason =
  | "missing_coordinates"
  | "invalid_state";

/**
 * 昇格時に固定される source 値 (= GPT 1st 判断、Q1 確定)。
 *
 * 根拠 (anchorState.ts L163-182):
 *   user_override は「clarify に対するユーザー回答で確定した anchor」 →
 *   candidate 選択も「ユーザーが明示的に選んだ確定」 → 同じ semantics。
 *   STRONG_PRIOR_ORIGIN_SOURCES に含まれ、同 plan 内で守られる。
 *
 * 注意:
 *   candidate 選択の詳細 trace (rawAnswer / selectedPlace / selectedAt /
 *   targetKind) は **derivedFrom field** で表現 (= B-3d 範囲、本 PR scope 外)。
 */
export const PROMOTION_SOURCE: AnchorSource = "user_override";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Coordinate validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 緯度経度の妥当性判定。
 *
 * GeoCoordinates 型は `{ lat: number; lng: number }` を強制するが、runtime では:
 *   - JSON deserialization で NaN / Infinity / null が混入する可能性
 *   - 外部 API (Places API) が稀に範囲外値を返す可能性
 *   - 0,0 は赤道沖 (= 海上) なので valid だが、placeholder として使われがち
 *
 * 規律:
 *   - 0,0 を invalid 扱いしない (= 真に sea-coordinate のケースを破壊しない)。
 *     既存 known_exact 経路でも 0,0 を弾いていないので対称。
 *   - finite + range check のみ。詳細な anomaly detection は別レイヤー。
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Promote
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * journey_origin promotion 判定 (pure)。
 *
 * 入力 state を mutate せず、新しい state object を返す。caller は戻り値
 * の kind に応じて以下を行う:
 *   - "promoted" → morningSession.plan.journeyOrigin に反映 + travel rebuild
 *   - "blocked"  → journeyOrigin を変更せず、reject response 返却
 *                  (activePresentation を clear しない = 半壊 UX 防止)
 *
 * @param current 現在の journeyOrigin state (= morningSession.plan.journeyOrigin)
 * @param candidate ユーザーが選択した candidate (= prevActive.candidates から find 済み)
 * @returns PromotionResult (= 完全 pure、副作用なし)
 */
export function promoteJourneyOrigin(
  current: JourneyAnchorState | undefined,
  candidate: NormalizedPlaceCandidate,
): JourneyOriginPromotionResult {
  // Gate 1: 入力 state validation (= idempotent 防御)
  //   B-3c-1 では known_label_only からの昇格のみ扱う。
  //   known_exact (= 既に確定) や unknown (= label すらない) は本 path 対象外。
  //   caller (= selection route) が前段で防ぐべきだが、defensive に check。
  if (!current || current.kind !== "known_label_only") {
    return { kind: "blocked", reason: "invalid_state" };
  }

  // Gate 2: candidate coordinates validation (= GPT 2nd 補正の主対象)
  //   candidate の lat/lng が不正 → 明示 blocked。
  //   caller は activePresentation を clear せず、reject response を返す。
  const coords = candidate.coordinates;
  if (!coords || !isValidCoordinate(coords.lat, coords.lng)) {
    return { kind: "blocked", reason: "missing_coordinates" };
  }

  // 昇格成功:
  //   - label は candidate.displayName (= 「東京駅丸の内口」 等の店舗名)
  //   - lat / lng は validated coordinates
  //   - source は user_override 固定 (= Q1 確定)
  //
  // 既存 current.label / current.source は **意図的に捨てる**:
  //   - label: candidate.displayName の方が具体的 (= 旧 "東京駅" → 新 "東京駅丸の内口")
  //   - source: user_override に上書き (= clarify と同じ強権、STRONG_PRIOR_ORIGIN_SOURCES)
  return {
    kind: "promoted",
    state: {
      kind: "known_exact",
      label: candidate.displayName,
      lat: coords.lat,
      lng: coords.lng,
      source: PROMOTION_SOURCE,
    },
  };
}
