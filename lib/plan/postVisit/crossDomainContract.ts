/**
 * lib/plan/postVisit/crossDomainContract.ts
 *   — 評価OS / ②-6: cross-domain 一方向契約（判断原理は転移してよいが具体選好は転移しない・pure）
 *
 * ★狙い: 食/場所/旅行/購買などドメインをまたぐ転移で、**invariant core（ドメイン非依存の判断原理）だけ転移可**、
 *   **domain surface（具体選好）は転移不可** を型 + pure guard で固定。negative transfer を防ぐ。
 * ★persona prior（②-4）の軸をこの契約で分類し、ドメインをまたぐ時は domain-surface を **必ず落とす**。
 * ★pure・決定論。ranking/UI/DB に一切配線しない（読むだけ・順位を変えない）。
 */
import type { PersonaTendency } from "./personaPrior";

export type Domain = "place" | "food" | "travel" | "purchase" | "generic";

/**
 * 転移可否の契約（軸 → invariant core か domain surface か）。
 *   - invariant core: ドメイン非依存の判断原理（社会性・余裕/リスク許容・リズム）→ **転移可**。
 *   - domain surface: そのドメイン固有の具体選好（場所カテゴリ等）→ **転移不可**（混ぜると negative transfer）。
 */
export const AXIS_TRANSFERABILITY: Record<string, "invariant_core" | "domain_surface"> = {
  // invariant core（判断原理）= 転移可
  companion: "invariant_core",        // solo_vs_with_someone（社会性）
  gapBucket: "invariant_core",        // short_gap_safety_pref（余裕/リスク許容）
  timeOfDay: "invariant_core",        // 生活リズム
  dayType: "invariant_core",          // 平日/週末リズム
  // domain surface（具体選好）= 転移不可
  locationCategory: "domain_surface", // 場所カテゴリ＝place ドメイン固有の具体選好
  weatherKind: "domain_surface",
  fatigue: "invariant_core",          // 状態感受性は原理側（ただし現状 dormant）
  mobilityLoad: "domain_surface",
};

export function isTransferable(axis: string): boolean {
  return AXIS_TRANSFERABILITY[axis] === "invariant_core";
}

/**
 * ★一方向契約: source ドメインの persona tendency を target ドメインへ渡す時、**domain_surface を必ず落とす**（pure）。
 *   同一ドメイン（from===to）なら全て通す。クロス時は invariant_core のみ。
 *   これにより「source の具体選好が target の ranking に漏れる」を構造的に防ぐ（gap test で検証）。
 */
export function transferTendencies(
  tendencies: readonly PersonaTendency[],
  from: Domain,
  to: Domain,
): PersonaTendency[] {
  if (from === to) return [...tendencies];
  return tendencies.filter((t) => isTransferable(t.axis));
}

/**
 * gap test 用 assert: 転移結果に domain_surface 軸が **一切含まれない** ことを返す（pure）。
 *   true = 漏れなし（健全）。false = 具体選好が漏れた（契約違反）。
 */
export function assertNoSurfaceLeak(transferred: readonly PersonaTendency[]): boolean {
  return transferred.every((t) => isTransferable(t.axis));
}
