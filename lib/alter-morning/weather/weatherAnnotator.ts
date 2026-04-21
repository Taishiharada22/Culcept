/**
 * L2.5 Weather Annotator — Comprehension-First v1.3+ Wave 3 (W3-PR-2)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-design.md §5
 *
 * 責務:
 *   plan graph の event に対し、天気予報から「傘の必要性 / 寒暖 / 屋内推奨」等の
 *   注釈を **annotation** として添える。plan graph は書き換えない。
 *
 * 設計原則:
 *   1. plan graph 非破壊
 *   2. 天気予報 provider は interface で差し替え可能（本 PR では deterministic stub のみ）
 *   3. 実 JMA API 呼び出しは Wave 4+
 *   4. narration には自動注入しない（C-2 固定）
 *   5. forecast が取れない場合は forecast="unknown" で通す（error にしない）
 */

import type { Event } from "../comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ForecastCondition =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "snowy"
  | "unknown";

export type PrecipitationLevel = "none" | "low" | "medium" | "high";

export interface WeatherForecast {
  /** 日付 (YYYY-MM-DD) */
  date: string;
  condition: ForecastCondition;
  tempMin: number | null;
  tempMax: number | null;
  /** 降水確率 0-100（null は不明） */
  precipitationProb: number | null;
}

export interface WeatherContext {
  /** JMA office code（`lib/shared/location.ts` で既存） */
  officeCode: string | null;
  /** 予報対象日（YYYY-MM-DD） */
  targetDate: string;
}

/**
 * 天気予報 provider interface。
 * 本 PR では rule-based stub / 固定予報 provider のみ。
 * Wave 4+ で JMA 実 API provider を差し込む。
 */
export interface WeatherForecastProvider {
  forecast(ctx: WeatherContext): Promise<WeatherForecast | null>;
}

export interface WeatherAnnotation {
  event_id: string;
  condition: ForecastCondition;
  tempMin: number | null;
  tempMax: number | null;
  precipitation: PrecipitationLevel;
  /** ユーザーへの注意喚起候補（複数保持、断定しない） */
  warnings: string[];
  confidence: "low" | "medium" | "high";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function classifyPrecipitation(prob: number | null): PrecipitationLevel {
  if (prob === null) return "none";
  if (prob >= 70) return "high";
  if (prob >= 40) return "medium";
  if (prob >= 20) return "low";
  return "none";
}

function deriveWarnings(
  forecast: WeatherForecast,
  precipitation: PrecipitationLevel,
): string[] {
  const warnings: string[] = [];

  if (forecast.condition === "rainy" || precipitation === "high") {
    warnings.push("折りたたみ傘があると安心");
    warnings.push("屋内中心のルートが無難");
  } else if (precipitation === "medium") {
    warnings.push("傘があると安心");
  }

  if (forecast.condition === "snowy") {
    warnings.push("滑りにくい靴で");
    warnings.push("防寒を厚めに");
  }

  if (forecast.tempMax !== null && forecast.tempMax >= 30) {
    warnings.push("熱中症対策（水分・日差し）");
  }
  if (forecast.tempMin !== null && forecast.tempMin <= 5) {
    warnings.push("冷え込み対策（コート・手袋）");
  }

  return warnings;
}

function deriveConfidence(
  forecast: WeatherForecast | null,
  hasOfficeCode: boolean,
): WeatherAnnotation["confidence"] {
  if (!forecast) return "low";
  if (forecast.condition === "unknown" && !hasOfficeCode) return "low";
  if (forecast.condition === "unknown") return "low";
  if (!hasOfficeCode) return "medium";
  return "high";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stub provider (deterministic, 実 API 未使用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テスト / dev で使う deterministic stub provider。
 * 常に固定 forecast を返す（Wave 4+ で JMA 実 API provider を差し込む）。
 */
export function createStubForecastProvider(
  fixed: Partial<WeatherForecast> = {},
): WeatherForecastProvider {
  return {
    async forecast(ctx: WeatherContext): Promise<WeatherForecast> {
      return {
        date: ctx.targetDate,
        condition: "cloudy",
        tempMin: 15,
        tempMax: 22,
        precipitationProb: 20,
        ...fixed,
      };
    },
  };
}

/**
 * forecast が取れなかった / provider 未指定の fallback。
 * unknown 天気で annotation を埋める（event を落とさない）。
 */
function emptyForecast(date: string): WeatherForecast {
  return {
    date,
    condition: "unknown",
    tempMin: null,
    tempMax: null,
    precipitationProb: null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * events に対し Weather annotation を生成する。
 *
 * 契約:
 *   - events を書き換えない
 *   - provider から forecast が取れない場合も throw しない（condition="unknown"）
 *   - 本 PR では日全体に同一 forecast を適用（時間帯別は Wave 4+）
 */
export async function annotateWeather(
  events: Event[],
  ctx: WeatherContext,
  provider: WeatherForecastProvider | null,
): Promise<WeatherAnnotation[]> {
  let forecast: WeatherForecast | null = null;
  if (provider) {
    try {
      forecast = await provider.forecast(ctx);
    } catch {
      forecast = null;
    }
  }
  const effective = forecast ?? emptyForecast(ctx.targetDate);
  const precipitation = classifyPrecipitation(effective.precipitationProb);
  const warnings = deriveWarnings(effective, precipitation);
  const confidence = deriveConfidence(forecast, Boolean(ctx.officeCode));

  return events.map((ev) => ({
    event_id: ev.event_id,
    condition: effective.condition,
    tempMin: effective.tempMin,
    tempMax: effective.tempMax,
    precipitation,
    warnings: [...warnings],
    confidence,
  }));
}
