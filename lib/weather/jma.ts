import { estimateDefaultTemp, type WeatherInput } from "@/lib/calendar/generator";

export type DailyWeatherIcon = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";

export interface WeatherDaily {
  weather_icon: DailyWeatherIcon;
  pop_max: number | null;
  temp_min: number | null;
  temp_max: number | null;
  pop_blocks: Array<{ start: string; end: string | null; pop: number }> | null;
  outfit_tag: "rain" | "normal" | null;
}

export interface WeatherOfficeOption {
  code: string;
  name: string;
}

interface JmaAreaMeta {
  name?: string;
  code?: string;
}

interface JmaForecastArea {
  area?: JmaAreaMeta;
  weatherCodes?: string[];
  weathers?: string[];
  pops?: string[];
  temps?: string[];
  tempsMin?: string[];
  tempsMax?: string[];
}

interface JmaTimeSeries {
  timeDefines?: string[];
  areas?: JmaForecastArea[];
}

interface JmaForecastBlock {
  timeSeries?: JmaTimeSeries[];
}

interface JmaAreaConstEntry {
  name?: string;
}

interface JmaAreaConstPayload {
  offices?: Record<string, JmaAreaConstEntry>;
}

interface MutableWeatherDaily {
  weather_icon: DailyWeatherIcon;
  pop_max: number | null;
  temp_min: number | null;
  temp_max: number | null;
  pop_blocks: Array<{ start: string; end: string | null; pop: number }> | null;
  outfit_tag: "rain" | "normal" | null;
}

const AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const FORECAST_URL = (officeCode: string) => `https://www.jma.go.jp/bosai/forecast/data/forecast/${officeCode}.json`;

function toDateKey(value: string): string {
  return value.slice(0, 10);
}

function parseInteger(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function weatherIconFromCode(code: unknown): DailyWeatherIcon {
  const normalized = String(code ?? "").trim();
  if (!normalized) return "unknown";
  if (normalized.startsWith("1")) return "sun";
  if (normalized.startsWith("2")) return "cloud";
  if (normalized.startsWith("3")) return "rain";
  if (normalized.startsWith("4")) return "snow";
  if (normalized.startsWith("5")) return "storm";
  return "unknown";
}

function weatherIconFromMeta(code: unknown, text: unknown): DailyWeatherIcon {
  const normalizedText = String(text ?? "").trim();
  if (normalizedText.includes("雷")) return "storm";
  if (normalizedText.includes("雪")) return "snow";
  if (normalizedText.includes("雨")) return "rain";
  if (normalizedText.includes("霧")) return "fog";
  if (normalizedText.includes("晴")) return "sun";
  if (normalizedText.includes("くもり") || normalizedText.includes("曇")) return "cloud";
  return weatherIconFromCode(code);
}

function ensureDaily(map: Map<string, MutableWeatherDaily>, date: string): MutableWeatherDaily {
  const existing = map.get(date);
  if (existing) return existing;
  const created: MutableWeatherDaily = {
    weather_icon: "unknown",
    pop_max: null,
    temp_min: null,
    temp_max: null,
    pop_blocks: null,
    outfit_tag: null,
  };
  map.set(date, created);
  return created;
}

function finalizeDaily(entry: MutableWeatherDaily): WeatherDaily {
  const rainLike = entry.weather_icon === "rain" || entry.weather_icon === "storm" || (entry.pop_max ?? 0) >= 40;
  return {
    weather_icon: entry.weather_icon,
    pop_max: entry.pop_max,
    temp_min: entry.temp_min,
    temp_max: entry.temp_max,
    pop_blocks: entry.pop_blocks,
    outfit_tag: rainLike ? "rain" : "normal",
  };
}

export function normalizeOfficeCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return /^[0-9]{6}$/.test(normalized) ? normalized : null;
}

export async function fetchWeatherOfficeOptions(): Promise<WeatherOfficeOption[]> {
  try {
    const response = await fetch(AREA_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as JmaAreaConstPayload;
    const offices = payload?.offices;
    if (!offices || typeof offices !== "object") return [];

    return Object.entries(offices)
      .filter(([code, value]) => /^[0-9]{6}$/.test(code) && typeof value?.name === "string" && value.name.trim().length > 0)
      .map(([code, value]) => ({ code, name: value.name!.trim() }))
      .sort((a, b) => a.code.localeCompare(b.code, "ja"));
  } catch {
    return [];
  }
}

export async function fetchJmaDailyForecast(officeCode: string): Promise<Map<string, WeatherDaily>> {
  const normalizedOfficeCode = normalizeOfficeCode(officeCode);
  if (!normalizedOfficeCode) return new Map();

  const response = await fetch(FORECAST_URL(normalizedOfficeCode), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`JMA forecast request failed: ${response.status}`);
  }

  const payload = (await response.json()) as JmaForecastBlock[];
  const blocks = Array.isArray(payload) ? payload : [];
  const dailyMap = new Map<string, MutableWeatherDaily>();

  const weeklyWeatherSeries = blocks[1]?.timeSeries?.find(
    (series) => Array.isArray(series?.timeDefines) && Array.isArray(series?.areas?.[0]?.weatherCodes),
  );
  const weeklyWeatherArea = weeklyWeatherSeries?.areas?.[0];
  const weeklyWeatherTimes = weeklyWeatherSeries?.timeDefines ?? [];
  for (let index = 0; index < weeklyWeatherTimes.length; index += 1) {
    const timeDefine = weeklyWeatherTimes[index];
    const date = toDateKey(timeDefine);
    const entry = ensureDaily(dailyMap, date);
    entry.weather_icon = weatherIconFromMeta(weeklyWeatherArea?.weatherCodes?.[index], undefined);
    const pop = parseInteger(weeklyWeatherArea?.pops?.[index]);
    if (pop != null) entry.pop_max = pop;
  }

  const weeklyTempSeries = blocks[1]?.timeSeries?.find(
    (series) => Array.isArray(series?.timeDefines) && Array.isArray(series?.areas?.[0]?.tempsMin),
  );
  const weeklyTempArea = weeklyTempSeries?.areas?.[0];
  const weeklyTempTimes = weeklyTempSeries?.timeDefines ?? [];
  for (let index = 0; index < weeklyTempTimes.length; index += 1) {
    const timeDefine = weeklyTempTimes[index];
    const date = toDateKey(timeDefine);
    const entry = ensureDaily(dailyMap, date);
    const tempMin = parseInteger(weeklyTempArea?.tempsMin?.[index]);
    const tempMax = parseInteger(weeklyTempArea?.tempsMax?.[index]);
    if (tempMin != null) entry.temp_min = tempMin;
    if (tempMax != null) entry.temp_max = tempMax;
  }

  const shortWeatherSeries = blocks[0]?.timeSeries?.find(
    (series) => Array.isArray(series?.timeDefines) && Array.isArray(series?.areas?.[0]?.weatherCodes),
  );
  const shortWeatherArea = shortWeatherSeries?.areas?.[0];
  const shortWeatherTimes = shortWeatherSeries?.timeDefines ?? [];
  for (let index = 0; index < shortWeatherTimes.length; index += 1) {
    const timeDefine = shortWeatherTimes[index];
    const date = toDateKey(timeDefine);
    const entry = ensureDaily(dailyMap, date);
    entry.weather_icon = weatherIconFromMeta(shortWeatherArea?.weatherCodes?.[index], shortWeatherArea?.weathers?.[index]);
  }

  const popSeries = blocks[0]?.timeSeries?.find(
    (series) => Array.isArray(series?.timeDefines) && Array.isArray(series?.areas?.[0]?.pops),
  );
  const popArea = popSeries?.areas?.[0];
  const popTimeDefines = popSeries?.timeDefines ?? [];
  for (let index = 0; index < popTimeDefines.length; index += 1) {
    const timeDefine = popTimeDefines[index];
    const pop = parseInteger(popArea?.pops?.[index]);
    if (pop == null) continue;
    const date = toDateKey(timeDefine);
    const entry = ensureDaily(dailyMap, date);
    entry.pop_max = entry.pop_max == null ? pop : Math.max(entry.pop_max, pop);
    const nextTime = popTimeDefines[index + 1] ?? null;
    const block = { start: timeDefine, end: nextTime, pop };
    entry.pop_blocks = [...(entry.pop_blocks ?? []), block];
  }

  const shortTempSeries = blocks[0]?.timeSeries?.find(
    (series) => Array.isArray(series?.timeDefines) && Array.isArray(series?.areas?.[0]?.temps),
  );
  const shortTempArea = shortTempSeries?.areas?.[0];
  const shortTempValues = shortTempArea?.temps ?? [];
  const shortTempTimeDefines = shortTempSeries?.timeDefines ?? [];
  if (shortTempValues.length >= 2 && shortTempTimeDefines.length >= 1) {
    const date = toDateKey(shortTempTimeDefines[0]);
    const entry = ensureDaily(dailyMap, date);
    const tempMin = parseInteger(shortTempValues[0]);
    const tempMax = parseInteger(shortTempValues[1]);
    if (tempMin != null) entry.temp_min = tempMin;
    if (tempMax != null) entry.temp_max = tempMax;
  }

  return new Map(
    Array.from(dailyMap.entries()).map(([date, entry]) => [date, finalizeDaily(entry)]),
  );
}

function dailyIconToCondition(icon: DailyWeatherIcon, popMax: number | null): WeatherInput["condition"] {
  if (icon === "rain" || icon === "storm" || (popMax ?? 0) >= 40) return "rainy";
  if (icon === "snow") return "snowy";
  if (icon === "cloud" || icon === "fog" || icon === "unknown") return "cloudy";
  return "sunny";
}

function deriveDailyTemp(daily: WeatherDaily | null): number | null {
  if (!daily) return null;
  if (daily.temp_min != null && daily.temp_max != null) {
    return Math.round((daily.temp_min + daily.temp_max) / 2);
  }
  if (daily.temp_max != null) return daily.temp_max;
  if (daily.temp_min != null) return daily.temp_min;
  return null;
}

export function weatherDailyFromStoredInput(value: unknown): WeatherDaily | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const temp = parseInteger(record.temp);
  const condition = String(record.condition ?? "").trim();
  if (temp == null && !condition) return null;

  const weatherIcon: DailyWeatherIcon =
    condition === "rainy" ? "rain"
      : condition === "snowy" ? "snow"
      : condition === "cloudy" ? "cloud"
      : condition === "windy" ? "cloud"
      : condition === "sunny" ? "sun"
      : "unknown";

  return {
    weather_icon: weatherIcon,
    pop_max: null,
    temp_min: null,
    temp_max: temp,
    pop_blocks: null,
    outfit_tag: weatherIcon === "rain" ? "rain" : "normal",
  };
}

export function toWeatherInput(date: Date, daily: WeatherDaily | null, fallback?: unknown): WeatherInput {
  const fallbackDaily = weatherDailyFromStoredInput(fallback);
  const source = daily ?? fallbackDaily;
  return {
    temp: deriveDailyTemp(source) ?? estimateDefaultTemp(date),
    condition: source ? dailyIconToCondition(source.weather_icon, source.pop_max) : "sunny",
  };
}
