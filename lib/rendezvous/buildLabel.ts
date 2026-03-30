import type { RendezvousCategory, ReasonCode } from "./types";

export function buildLabel(params: {
  category: RendezvousCategory;
  overallScore: number;
  reasonCodes: ReasonCode[];
}): string {
  const { category, overallScore, reasonCodes } = params;

  if (category === "romantic") {
    if (
      reasonCodes.includes("distance_preference_aligned") &&
      reasonCodes.includes("depth_speed_aligned")
    ) {
      return "静かに深まりやすい接続";
    }
    if (overallScore >= 0.78) {
      return "安心と刺激が共存する接続";
    }
    return "ゆっくり育ちやすい接続";
  }

  if (category === "friendship") {
    if (reasonCodes.includes("light_connection_potential")) {
      return "軽やかに広がる接続";
    }
    return "自然に続きやすい接続";
  }

  if (category === "cocreation") {
    if (reasonCodes.includes("complementary_roles")) {
      return "補完し合う共創接続";
    }
    return "視点を広げ合える接続";
  }

  if (category === "community") {
    return "自然に混ざりやすい接続";
  }

  // partner
  if (
    reasonCodes.includes("values_foundation_strong") &&
    reasonCodes.includes("life_rhythm_aligned")
  ) {
    return "人生を共に歩める接続";
  }
  if (overallScore >= 0.85) {
    return "深く信頼し合える接続";
  }
  if (reasonCodes.includes("stable_connection_potential")) {
    return "安心の土台がある接続";
  }
  return "穏やかに育ちやすい接続";
}

/**
 * 対称性を考慮した総合スコア
 *
 * 単純平均だと A→B=0.9, B→A=0.6 (avg=0.75) と
 * A→B=0.75, B→A=0.75 (avg=0.75) が同じスコアになる。
 *
 * 非対称なマッチは不安定（片方が熱く片方が冷めている）なので、
 * 対称性ペナルティを導入:
 *   penalty = (|AB - BA|)² × 0.15
 *
 * 例:
 *   0.9 & 0.6 → avg=0.75, penalty=0.0135 → 0.736
 *   0.75 & 0.75 → avg=0.75, penalty=0 → 0.75
 *   0.85 & 0.80 → avg=0.825, penalty=0.000375 → 0.824
 */
export function buildOverallScore(scoreAB: number, scoreBA: number): number {
  const avg = (scoreAB + scoreBA) / 2;
  const asymmetry = Math.abs(scoreAB - scoreBA);
  const penalty = asymmetry * asymmetry * 0.15;
  return Math.max(0, avg - penalty);
}

export function toSyncPercent(score: number): number {
  return Math.round(score * 100);
}
