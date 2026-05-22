/**
 * Phase 3-L-4c-mapbridge (pure) — MapTab Geocode Result → coordsByAnchorId Bridge
 *
 * 役割:
 *   既存 MapTab geocode hook (= `_usePlanGeocode.resolutions`) の output shape
 *   `Map<anchor.id, AnchorResolution | null>` を L-4c-pure pipeline input
 *   `coordsByAnchorId: Map<anchor.id, {lat, lng}>` に変換する pure helper。
 *
 * 思想:
 *   - shape mismatch を **1 関数で埋める**、 それ以上のことをしない
 *   - 既存 `_usePlanGeocode.ts` を **改変しない** (= Phase 2-C 確立済、 触らない)
 *   - PII 最小化: `resolvedName` (= 「東京駅」 等の Places API 正規化名) を捨てる
 *   - null / NaN / Infinity は **一律 skip** (= 「unresolved として扱う」 で統一)
 *   - stale / race は hook 側で完結済 (= helper は気にしない)
 *
 * 危険境界 (= 絶対に触れない):
 *   - active geocode call (= 新規 fetch / endpoint 呼出)
 *   - MapTab / PlanClient / `_usePlanGeocode.ts` 改変
 *   - UI 変更
 *   - runtime telemetry sink
 *   - localStorage / Arrival Risk Memory
 *
 * L-4c-mapbridge-pure scope (= 2026-05-22 CEO + GPT 連続 GO 範囲):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / fetch 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase / L-1〜L-4c-pure 既存 file 変更 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4c-mapbridge-readiness-audit.md
 *   - app/(culcept)/plan/tabs/_usePlanGeocode.ts (= 入力源、 改変なし)
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c 出力先)
 *   - lib/plan/transport/movementDisplayPipeline.ts (= L-4c-pure 出力先)
 */

import type { AnchorResolution } from "@/app/(culcept)/plan/tabs/_usePlanGeocode";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Output type
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Bridge output coords (= L-3c overlay / L-4c-pure pipeline の入力に合致)。
 *
 * **PII 最小化**:
 *   - `lat` / `lng` のみを持つ
 *   - `confidence` (= "medium" 文字列、 内部 metadata) は含めない
 *   - `resolvedName` (= Places API 正規化名、 PII 可能性) は含めない
 */
export interface BridgedCoords {
  readonly lat: number;
  readonly lng: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 値が有効な lat/lng coords かを判定 (= 防御)。
 * - number でない
 * - NaN / Infinity / -Infinity
 * のいずれかは false。 これらは bridge output に含めない。
 */
function isValidCoordinatePair(
  lat: unknown,
  lng: unknown,
): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: buildCoordsByAnchorIdFromGeocodeResults
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * MapTab geocode hook の出力を L-4c-pure pipeline 入力に変換する pure helper。
 *
 * 変換ルール:
 *   - `null` value → skip (= unresolved として扱う)
 *   - `lat` / `lng` が NaN/Infinity/non-number → skip (= 防御、 server から不正値が来ても安全)
 *   - 正常 entry → `{lat, lng}` のみ抽出 (= confidence / resolvedName を捨てる)
 *
 * 純度保証:
 *   - 入力 mutation 0 (= 新規 Map を構築して返す)
 *   - 副作用 0 (= no fetch, no DB, no console, no localStorage)
 *   - 同一 input → 同一 output (= deterministic)
 *
 * @param resolutions  MapTab `_usePlanGeocode.resolutions` をそのまま渡せる
 * @returns L-3c overlay / L-4c-pure pipeline の `coordsByAnchorId` に直接渡せる Map
 */
export function buildCoordsByAnchorIdFromGeocodeResults(
  resolutions: ReadonlyMap<string, AnchorResolution | null>,
): ReadonlyMap<string, BridgedCoords> {
  const out = new Map<string, BridgedCoords>();

  for (const [anchorId, resolution] of resolutions.entries()) {
    // 防御: anchorId が string でない場合 skip (= 通常起こらないが)
    if (typeof anchorId !== "string" || anchorId.length === 0) continue;

    // null は unresolved として skip
    if (resolution === null || resolution === undefined) continue;

    // lat/lng 防御
    const { lat, lng } = resolution;
    if (!isValidCoordinatePair(lat, lng)) continue;

    // 正常 entry → {lat, lng} のみ抽出
    out.set(anchorId, { lat, lng });
  }

  return out;
}
