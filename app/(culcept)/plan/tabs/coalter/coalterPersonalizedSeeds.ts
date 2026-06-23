/**
 * C6-D — fit 選別を solver seeds に適用（**pure・決定論**）
 *
 * 役割: C6-C の性格 fit 選別（採用 placeId 集合）で、solver 入力 seeds の **experience / lodging を絞る**。
 *   → 行程に出る**場所そのもの**がペアの性格で変わる（calm→温泉/自然・bold→thrill）。
 *
 * 安全（feasibility 維持）:
 *   - destination は基盤構造として常に維持（fit 選別の対象外）。
 *   - lodging が全部落ちたら **base の lodging を維持**（overnight は宿が必須＝fail-safe）。
 *   - move は両端が survivor の時だけ残す（孤立 edge を作らない）。
 *   - 何も足さない・solver 無改修・外部 API/DB なし。
 */

import type { TravelItineraryGeneratorInput } from "@/lib/coalter/travel/itinerary";

/**
 * base seeds を fit 採用集合で絞る。intentOutput / destinationSeeds は不変（caller が別途 override）。
 *   @param fittingPlaceIds 採用された placeId（= TravelObjectState.placeRefId = seed.placeIdCode）。
 */
export function buildPersonalizedTravelSeeds(
  base: TravelItineraryGeneratorInput,
  fittingPlaceIds: ReadonlySet<string>,
): TravelItineraryGeneratorInput {
  const keptExperiences = (base.experienceSeeds ?? []).filter((s) => fittingPlaceIds.has(s.placeIdCode));

  const fitLodging = (base.lodgingSeeds ?? []).filter((s) => fittingPlaceIds.has(s.placeIdCode));
  // overnight は宿必須 → fit で全落ちなら base を維持（fail-safe）。
  const keptLodging = fitLodging.length > 0 ? fitLodging : (base.lodgingSeeds ?? []);

  // 生存 place 集合（origin + destination + 残った experience/lodging）。move 絞り用。
  const surviving = new Set<string>(["origin"]);
  for (const d of base.destinationSeeds ?? []) surviving.add(d.placeIdCode);
  for (const e of keptExperiences) surviving.add(e.placeIdCode);
  for (const l of keptLodging) surviving.add(l.placeIdCode);

  const keptMoves = (base.moveSeeds ?? []).filter(
    (m) => surviving.has(m.fromPlaceIdCode) && surviving.has(m.toPlaceIdCode),
  );

  return {
    ...base,
    experienceSeeds: keptExperiences,
    lodgingSeeds: keptLodging,
    moveSeeds: keptMoves,
  };
}
