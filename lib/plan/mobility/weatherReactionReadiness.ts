/**
 * lib/plan/mobility/weatherReactionReadiness.ts — Phase A2-11: 本人 weather reaction の readiness/overlay（pure・未配線）
 *
 * ★目的: A2-10 で貯め始めた weatherKind 付き観測から、「この人は天気 X の日に普段と違う mode を選ぶか」を
 *   honest に判定する **pure エンジン**。★これは **live 反映しない**（UI/決定に未配線）。実反映は実測データ + CEO 判断。
 *
 * ★安全境界（CEO 方針）:
 *   - 偽数値を出さない: 出力は status + 実カウント n + 定性（modal mode）のみ・確率/係数なし。
 *   - 薄いデータで断定しない: weather 下と baseline の双方が sufficient（n≥minObs）でなければ not_enough。
 *   - 一般則 fallback: personal signal が無ければ general（A2-8）に委ねる（personal を捏造しない）。
 *   - trait/人格ラベルにしない: 出力は OD 単位の **観測パターン**（leansToward = weather 下の modal mode）。
 *     「あなたは雨を避ける人」等の人格診断は **しない**（呼び出し側 UI も observed トーン厳守）。
 *   - belief を汚さない: 本 module は観測を read するだけ・store を write しない。redacted 観測は weatherKind を
 *     持たない（A2-10）ので自然に除外。pure / Date 不使用 / DB・network なし。
 */
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { WeatherKind } from "@/lib/plan/context/contextModifier";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";

export type WeatherReactionStatus = "not_enough" | "no_personal_signal" | "personal_reaction";

export interface WeatherReactionReadiness {
  readonly status: WeatherReactionStatus;
  readonly weather: WeatherKind;
  /** weather 下の観測数（実カウント・偽数値でない）。 */
  readonly nUnderWeather: number;
  /** baseline（その weather でない日）の観測数。 */
  readonly nBaseline: number;
  /** personal_reaction のみ: weather 下で多い mode（観測パターン・trait でない）。 */
  readonly leansToward?: RouteTransportMode;
  /** 比較用: baseline で多い mode。 */
  readonly usualMode?: RouteTransportMode;
}

export interface WeatherReactionConfig {
  /** weather 下 / baseline それぞれに必要な最小観測数（薄いデータで personalize しない）。 */
  readonly minObs: number;
}

export const DEFAULT_WEATHER_REACTION_CONFIG: WeatherReactionConfig = {
  minObs: 4,
};

/** mode の最頻（同率トップは null＝明確な最頻なし）。 */
function modalMode(obs: readonly MobilityObservation[]): RouteTransportMode | null {
  const counts = new Map<RouteTransportMode, number>();
  for (const o of obs) counts.set(o.mode, (counts.get(o.mode) ?? 0) + 1);
  let top: RouteTransportMode | null = null;
  let topCount = -1;
  let tie = false;
  for (const [mode, c] of counts) {
    if (c > topCount) {
      topCount = c;
      top = mode;
      tie = false;
    } else if (c === topCount) {
      tie = true;
    }
  }
  return tie ? null : top;
}

/**
 * ★A2-11 core: 1 OD 分の weatherKind 付き観測から、weather X の personal reaction readiness を判定（pure）。
 *   observations は **1 OD 分**（呼び出し側が odKey で絞る）想定。weatherKind 無し観測は baseline 集計から自然に除外。
 *   ★live 反映しない（status/カウント/定性のみを返す・UI/決定への配線は別ステップ・CEO 判断）。
 */
export function buildWeatherReactionReadiness(
  observations: readonly MobilityObservation[],
  weather: WeatherKind,
  config: WeatherReactionConfig = DEFAULT_WEATHER_REACTION_CONFIG,
): WeatherReactionReadiness {
  // weatherKind を持つ観測のみ対象（redacted は weatherKind 無し＝除外）。
  const tagged = observations.filter((o) => o.weatherKind !== undefined);
  const underWeather = tagged.filter((o) => o.weatherKind === weather);
  const baseline = tagged.filter((o) => o.weatherKind !== weather);

  const nUnderWeather = underWeather.length;
  const nBaseline = baseline.length;

  if (nUnderWeather < config.minObs || nBaseline < config.minObs) {
    return { status: "not_enough", weather, nUnderWeather, nBaseline };
  }

  const leansToward = modalMode(underWeather);
  const usualMode = modalMode(baseline);

  // 明確な最頻が双方にあり、weather 下で baseline と違う mode に寄る → personal reaction。
  if (leansToward !== null && usualMode !== null && leansToward !== usualMode) {
    return { status: "personal_reaction", weather, nUnderWeather, nBaseline, leansToward, usualMode };
  }

  return { status: "no_personal_signal", weather, nUnderWeather, nBaseline };
}
