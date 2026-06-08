/**
 * lib/plan/compose/placeAffinityReadiness.ts — Place Affinity P2: 本人固有の場所プロファイル（pure・未配線）
 *
 * ★目的（Personal Reality Graph の場所軸）: 既存の on-device 観測（MobilityObservation の destKey=正規化 place key）
 *   から「この人がよく選ぶ場所」を honest に導く。一般則 scorer（placeAffinity.ts: distance/type）とは **分離**した
 *   **本人固有（revealed preference）**の層。★これは UI/決定/scorer に **未配線**（pure・読み取りのみ）。
 *
 * ★安全境界（CEO 方針）:
 *   - 新規データ保存なし: 既存 MobilityObservation を read するだけ（store を write しない・belief 非汚染）。
 *   - sensitive 除外: privacyClass="redacted" は除外（redacted は destKey が null・二重防御）。
 *   - raw GPS / 座標 / 住所を扱わない: placeKey は正規化 locationText（既に derived・座標なし）。
 *   - 人格診断にしない: 出力は「よく行く場所のようです」等の **観測トーン**。「あなたはこういう場所が好き」断定はしない。
 *   - 偽数値を出さない: status + 実カウント + 定性 strength のみ。確率/スコアを作らない。
 *   - 薄いデータで断定しない: 全体が minTotal 未満 / 単発訪問は profile に載せない（sufficient gate）。
 *   - pure / Date 不使用 / DB・network なし。
 */
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";

export type PlaceVisitStrength = "occasional" | "frequent" | "habitual";

export interface PlaceVisitProfile {
  /** 正規化 place key（destKey）。座標/住所でない。 */
  readonly placeKey: string;
  /** 目的地としての訪問回数（実カウント・偽数値でない）。 */
  readonly visitCount: number;
  readonly strength: PlaceVisitStrength;
}

export type PlaceAffinityStatus = "not_enough" | "ready";

export interface PlaceAffinityReadiness {
  readonly status: PlaceAffinityStatus;
  /** 非 redacted の目的地観測の総数。 */
  readonly totalVisits: number;
  readonly distinctPlaces: number;
  /** visitCount 降順・minVisitsToList 以上のみ（ready のとき）。 */
  readonly profiles: readonly PlaceVisitProfile[];
}

export interface PlaceAffinityConfig {
  /** 全体でこの数の目的地観測が無ければ not_enough（薄いデータで語らない）。 */
  readonly minTotalForReady: number;
  /** profile に載せる最小訪問数（単発は preference でない）。 */
  readonly minVisitsToList: number;
  /** frequent の閾値。 */
  readonly frequentThreshold: number;
  /** habitual の閾値。 */
  readonly habitualThreshold: number;
}

/** ★固定初期値（較正 backlog・60日窓・目的地ベース）。 */
export const DEFAULT_PLACE_AFFINITY_CONFIG: PlaceAffinityConfig = {
  minTotalForReady: 8,
  minVisitsToList: 2,
  frequentThreshold: 4,
  habitualThreshold: 10,
};

function strengthOf(count: number, config: PlaceAffinityConfig): PlaceVisitStrength {
  if (count >= config.habitualThreshold) return "habitual";
  if (count >= config.frequentThreshold) return "frequent";
  return "occasional";
}

/**
 * ★P2 core: 観測から本人の場所プロファイルを導く（pure・未配線）。
 *   目的地（destKey）の訪問回数を集計。redacted（sensitive）は除外。薄いデータは not_enough。
 *   ★scorer/UI/決定に繋がない（読み取り → 構造化のみ）。
 */
export function buildPlaceAffinityReadiness(
  observations: readonly MobilityObservation[],
  config: PlaceAffinityConfig = DEFAULT_PLACE_AFFINITY_CONFIG,
): PlaceAffinityReadiness {
  const counts = new Map<string, number>();
  let totalVisits = 0;
  for (const o of observations) {
    if (o.privacyClass === "redacted") continue; // ★sensitive 除外（destKey も null だが二重防御）
    const key = o.destKey;
    if (key == null) continue; // 目的地不明は数えない
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalVisits += 1;
  }
  const distinctPlaces = counts.size;

  if (totalVisits < config.minTotalForReady) {
    return { status: "not_enough", totalVisits, distinctPlaces, profiles: [] };
  }

  const profiles = [...counts.entries()]
    .filter(([, c]) => c >= config.minVisitsToList) // 単発除外
    .map(([placeKey, visitCount]) => ({ placeKey, visitCount, strength: strengthOf(visitCount, config) }))
    .sort((a, b) => b.visitCount - a.visitCount);

  return { status: "ready", totalVisits, distinctPlaces, profiles };
}

/**
 * ★profile → 観測トーンの 1 行（人格診断にしない・数字なし・place 名を埋めない＝UI が pair する）。
 *   occasional は弱いので沈黙（null）。
 */
export function placeAffinityReasonLine(profile: PlaceVisitProfile): string | null {
  switch (profile.strength) {
    case "habitual":
      return "よく行く場所のようです。";
    case "frequent":
      return "ときどき行く場所のようです。";
    case "occasional":
      return null; // 弱い → 沈黙
  }
}
