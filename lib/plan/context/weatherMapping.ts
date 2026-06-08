/**
 * lib/plan/context/weatherMapping.ts — Phase A2-6a: JMA WeatherDaily → A2 WeatherKind（pure）
 *
 * ★目的: 既存 JMA 予報（`WeatherDaily`）を A2 context modifier の `WeatherKind`(rain/heat/cold/normal) に
 *   honest にマッピングする。sourcing（route/fetch）に依らず必要な純粋変換。
 *
 * ★安全境界:
 *   - 誤ラベルしない: snow は「雨」と言わず cold 扱い（A2-1 で cold は tilt なし＝under-claim・保守的）。
 *   - 捏造しない: データが無い（icon unknown ∧ pop/temp 全 null）→ null（weather factor を出させない）。
 *   - 偽数値を作らない・閾値は固定（較正は backlog）。pure / Date 不使用 / IO なし。
 *   - 入力は構造的（jma.ts に依存しない＝server-only コードを引き込まない）。
 */
import type { WeatherKind } from "@/lib/plan/context/contextModifier";

/** WeatherDaily の必要 field のみ（jma.ts の WeatherDaily と構造互換・server import 回避）。 */
export interface WeatherDailyLike {
  readonly weather_icon: "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";
  readonly pop_max: number | null;
  readonly temp_min: number | null;
  readonly temp_max: number | null;
}

export interface WeatherMappingConfig {
  /** これ以上の降水確率(%)で rain 扱い（icon が rain/storm でなくても）。 */
  readonly popRainThreshold: number;
  /** これ以上の最高気温(℃)で heat。 */
  readonly heatMaxC: number;
  /** これ以下の最低気温(℃)で cold。 */
  readonly coldMinC: number;
}

/** ★固定初期値（較正 backlog）。保守的（明確な日のみ rain/heat/cold）。 */
export const DEFAULT_WEATHER_MAPPING_CONFIG: WeatherMappingConfig = {
  popRainThreshold: 60,
  heatMaxC: 30,
  coldMinC: 3,
};

/**
 * JMA WeatherDaily → WeatherKind（pure）。優先: rain（降水）> heat > cold > normal。
 * ★データ皆無（icon unknown ∧ pop/temp 全 null）→ null（捏造しない）。snow→cold（誤ラベル回避）。
 */
export function weatherDailyToWeatherKind(
  daily: WeatherDailyLike | null | undefined,
  config: WeatherMappingConfig = DEFAULT_WEATHER_MAPPING_CONFIG,
): WeatherKind | null {
  if (!daily) return null;
  const { weather_icon, pop_max, temp_min, temp_max } = daily;

  // データ皆無 → null（捏造しない）
  if (weather_icon === "unknown" && pop_max === null && temp_min === null && temp_max === null) {
    return null;
  }

  // rain（降水優先・移動負担が最も意味を持つ）
  if (weather_icon === "rain" || weather_icon === "storm") return "rain";
  if (pop_max !== null && pop_max >= config.popRainThreshold) return "rain";

  // heat
  if (temp_max !== null && temp_max >= config.heatMaxC) return "heat";

  // cold（snow は cold 扱い＝「雨」と誤ラベルしない・A2-1 では tilt なし）
  if (weather_icon === "snow") return "cold";
  if (temp_min !== null && temp_min <= config.coldMinC) return "cold";

  // それ以外（sun/cloud/fog や穏やかな気温）→ normal
  return "normal";
}
