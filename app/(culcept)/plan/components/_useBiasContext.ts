"use client";

/**
 * Plan Phase 2-D — Bias Context hook (baseline-only v1)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md v2 §3 / §5.8
 *
 * 役割:
 *   PlaceCandidatesPanel が Places API に渡す locationBias を算出する hook。
 *   v1 では baseline-only (home > city > prefecture > none) で実装、
 *   same-day anchor / recent freq / geolocation は Phase 2-D+ 預け。
 *
 * 不変原則:
 *   - usePlanBaseline (Phase 2-C で実装済) を流用、touch なし
 *   - pure helper `determineBiasContextFromBaseline` で test 可能化
 *   - server / client 両方で型を export (server endpoint と client component で共有)
 */

import { useMemo } from "react";

import {
  usePlanBaseline,
  type BaselineCoords,
} from "../tabs/_usePlanBaseline";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BiasContext {
  /**
   * bias source の type:
   *   - baseline_home: user の home coord (10km radius)
   *   - baseline_city: 市区町村中心 (20km radius)
   *   - baseline_prefecture: 県中心 (50km radius)
   *   - none: bias なし (free search、Places API global 範囲)
   *
   * v1 scope: baseline-only。same-day / recent / geolocation は Phase 2-D+ で追加予定。
   */
  source: "baseline_home" | "baseline_city" | "baseline_prefecture" | "none";
  /** bias coord (none なら null) */
  coord: { lat: number; lng: number } | null;
  /** Places API locationBias.radius (meters)。none なら 0 */
  radiusMeters: number;
  /** user-facing label (PlaceCandidatesPanel header に表示)、none なら null */
  label: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helper (test 可能、hook 内で wrap される)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * baselineCoords から BiasContext を算出する pure 関数。
 *
 * 優先順位 (CEO 補正 Phase 2-C で確立済):
 *   1. baseline.source === "home"        → 10km radius
 *   2. baseline.source === "city"        → 20km radius
 *   3. baseline.source === "prefecture"  → 50km radius
 *   4. baseline === null                 → "none" (bias なし)
 *
 * radius は CEO 「明確な場所が近い」 「現在地の近く」 → 「baseline 周辺」 の段階で
 * 範囲を広げていく設計。CategoryGrid window と同様に user の地理的精度に応じて。
 *
 * label は §3.6 v2 mini design の文言 mapping を厳守。
 */
export function determineBiasContextFromBaseline(
  baselineCoords: BaselineCoords | null,
): BiasContext {
  if (!baselineCoords) {
    return { source: "none", coord: null, radiusMeters: 0, label: null };
  }

  const coord = { lat: baselineCoords.lat, lng: baselineCoords.lng };
  const labelArea = baselineCoords.label ?? "保存済の居住地";

  switch (baselineCoords.source) {
    case "home":
      return {
        source: "baseline_home",
        coord,
        radiusMeters: 10000,
        label: `あなたの自宅 (${labelArea}) の近くから探しています`,
      };
    case "city":
      return {
        source: "baseline_city",
        coord,
        radiusMeters: 20000,
        label: `あなたの居住地 (${labelArea}) 周辺から探しています`,
      };
    case "prefecture":
      return {
        source: "baseline_prefecture",
        coord,
        radiusMeters: 50000,
        label: `あなたの居住地 (${labelArea}) の範囲から探しています`,
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hook (usePlanBaseline + determineBiasContextFromBaseline の composition)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseBiasContextResult {
  biasContext: BiasContext;
  /** baseline 取得中 (usePlanBaseline の loading に直結) */
  loading: boolean;
}

/**
 * AnchorFormFields / PlaceCandidatesPanel で使う bias context hook。
 *
 * v1 baseline-only:
 *   - usePlanBaseline を 1 度だけ fetch
 *   - determineBiasContextFromBaseline で純 logic
 *   - hook 外部からは BiasContext + loading が見える
 */
export function useBiasContext(): UseBiasContextResult {
  const { baselineCoords, loading } = usePlanBaseline();
  const biasContext = useMemo(
    () => determineBiasContextFromBaseline(baselineCoords),
    [baselineCoords],
  );
  return { biasContext, loading };
}
