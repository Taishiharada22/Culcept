/**
 * Reality Control OS — Monitoring Economy（Slice 2F / INV-9）
 *
 * 「全予定を高頻度監視しない」を保証する純粋 cadence 関数（live 実装前の契約）。
 * stakes/confidence/actionability/receptivity/battery/geofence 予算 から監視強度を返す。
 *
 * 制約: 純関数のみ。位置 SDK・push 不要。
 */

export type MonitoringCadence =
  | "none" // 監視しない
  | "scheduled_once" // 単発の計算 wake（低 stakes・安定）
  | "low_frequency"
  | "high_frequency" // 高 stakes/低確度/接近 のみ昇格
  | "foreground_only"; // 位置確証が要るが geofence 枠なし

export interface MonitoringInput {
  readonly stakes: "low" | "medium" | "high" | "critical";
  readonly confidence: number; // 0..1
  readonly actionable: boolean;
  readonly timeToEventMin: number; // 次イベントまで
  readonly lowBattery?: boolean;
  readonly geofenceBudgetAvailable?: boolean; // 位置監視枠が残っているか
  readonly needsLocation?: boolean; // 位置確証が要るか
}

/**
 * 監視強度を決める。既定は控えめ（scheduled_once / low_frequency）。
 * high_frequency へ昇格するのは 高 stakes / 低確度 / 接近 のみ（経済性）。
 */
export function decideCadence(i: MonitoringInput): MonitoringCadence {
  const high = i.stakes === "high" || i.stakes === "critical";

  // 行動不能かつ低 stakes → 監視しても無意味
  if (!i.actionable && !high) return "none";

  // 位置確証が要るが geofence 枠なし → foreground のみ（背景監視しない）
  if (i.needsLocation && i.geofenceBudgetAvailable === false) return "foreground_only";

  // 低電力かつ低 stakes → 単発に下げる
  if (i.lowBattery && !high) return "scheduled_once";

  // 低 stakes・確度高・遠い → 単発計算 wake（大半の予定はここ）
  if (!high && i.confidence >= 0.7 && i.timeToEventMin > 120) return "scheduled_once";

  // 昇格条件: 高 stakes / 低確度 / 接近
  if (high || i.confidence < 0.5 || i.timeToEventMin <= 30) return "high_frequency";

  return "low_frequency";
}
