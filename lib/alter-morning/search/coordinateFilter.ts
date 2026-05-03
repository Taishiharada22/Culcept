/**
 * Coordinate Filter — B-3c-2 Commit 1 (Layer A)
 *
 * CEO/GPT 2026-05-03 B-3c-2 設計提案 §5 Layer A:
 *   journey_origin promotion で「候補は presented されたが selection で blocked」
 *   という半壊 UX (= PR #69 で構造化禁止) を防ぐため、presentation 前に candidates
 *   から coordinates 不正なものを除外する。
 *
 * 責務:
 *   - 入力: ReadonlyArray<NormalizedPlaceCandidate>
 *   - 出力: { filtered, originalCount, invalidCount } (= 完全 pure)
 *   - 副作用: なし (= caller が telemetry emit / dispatch 制御)
 *
 * scope (B-3c-2):
 *   - journey_origin orchestrator のみで呼び出される (= journeyAnchorHandoffOrchestrator)
 *   - event_where 経路 (= placesHandoffOrchestrator) は呼ばない (= byte-diff zero、必須 #5)
 *
 * 不変条件:
 *   - 入力 array を mutate しない (= 完全 pure、新 array 返却)
 *   - filter 規律: `isValidCoordinate(lat, lng)` のみ (= journeyOriginPromotion と一貫)
 *   - 0,0 (= 赤道沖) は valid 扱い (= 既存 known_exact と対称)
 *   - 全候補 invalid → empty array 返却 (= caller が zero outcome に分岐)
 *
 * Layer B との関係:
 *   - 通常 Layer A で除去 → presentation には現れない → user は見えない
 *   - 稀に Layer A をすり抜けた場合、Layer B (= PlaceCandidatePicker disabled) で防御
 *   - 二層防御で半壊 UX を構造的禁止
 */

import type { NormalizedPlaceCandidate } from "./normalizedPlace";
import { isValidCoordinate } from "../dialog/journeyOriginPromotion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CoordinateFilterResult {
  /** filter 通過 candidates (= valid coordinates のみ、validCoordinates: true で marked) */
  filtered: ReadonlyArray<NormalizedPlaceCandidate>;
  /** 入力 candidate 総数 (= telemetry candidate_count_before_filter) */
  originalCount: number;
  /** filter 除外数 (= telemetry invalid_coordinate_count) */
  invalidCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Filter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * candidates から coordinates 不正なものを除外し、validCoordinates: true で marked する (pure)。
 *
 * 規律:
 *   - 入力配列を mutate しない
 *   - candidate.coordinates が `isValidCoordinate` を満たすものだけ通す
 *   - 通過した candidate は `validCoordinates: true` で明示 mark (= Layer B 連動)
 *   - 除外された candidate は filtered に含まれない (= UI に渡さない)
 *
 * @param candidates Places API 戻り値の生 candidates
 * @returns CoordinateFilterResult (= filtered / originalCount / invalidCount)
 */
export function filterCandidatesByValidCoordinates(
  candidates: ReadonlyArray<NormalizedPlaceCandidate>,
): CoordinateFilterResult {
  const originalCount = candidates.length;
  const filtered: NormalizedPlaceCandidate[] = [];

  for (const c of candidates) {
    const coords = c.coordinates;
    if (!coords || !isValidCoordinate(coords.lat, coords.lng)) {
      // skip — invalidCount で counted
      continue;
    }
    // mark validCoordinates: true (= Layer B が disabled 化しないことを明示)
    // 既に true なら spread 不要だが、defensive に常に明示 set
    filtered.push({ ...c, validCoordinates: true });
  }

  const invalidCount = originalCount - filtered.length;
  return { filtered, originalCount, invalidCount };
}
