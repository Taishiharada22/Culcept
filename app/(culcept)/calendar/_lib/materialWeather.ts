/**
 * 素材 × 天候マトリクス + 湿度/風速考慮
 *
 * リネン + 高湿度 → 快適, ウール + 雨 → NG,
 * ポリエステル + 猛暑 → 蒸れ, コットン + 寒風 → 防風性不足
 * 体感温度補正: 湿度・風速から実効温度を算出
 */

import type { WeatherDaily } from "./types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";

/* ── 素材カテゴリ ── */
export type MaterialCategory =
  | "cotton" | "linen" | "wool" | "cashmere" | "silk"
  | "polyester" | "nylon" | "rayon" | "denim"
  | "leather" | "suede" | "down" | "fleece"
  | "gore-tex" | "mesh" | "knit" | "tweed"
  | "unknown";

/* ── 天候条件 ── */
export type WeatherCondition = "hot" | "warm" | "mild" | "cool" | "cold" | "freezing";
export type HumidityLevel = "dry" | "normal" | "humid" | "very_humid";
export type WindLevel = "calm" | "breezy" | "windy" | "strong";
export type PrecipType = "none" | "light_rain" | "heavy_rain" | "snow";

/* ── 拡張天気コンテキスト ── */
export interface ExtendedWeatherContext {
  condition: WeatherCondition;
  humidity: HumidityLevel;
  wind: WindLevel;
  precip: PrecipType;
  feltTemp: number;       // 体感温度 (°C)
  rawTempMax: number | null;
  rawTempMin: number | null;
}

/* ── 素材推定 (アイテム名/属性から) ── */
export function inferMaterial(item: WardrobeItem): MaterialCategory {
  const name = (item.name ?? "").toLowerCase();
  const attrs = (item.attributes ?? {}) as Record<string, unknown>;

  // 明示的素材属性
  if (attrs.material) {
    const m = String(attrs.material).toLowerCase();
    if (m.includes("cotton") || m.includes("コットン") || m.includes("綿")) return "cotton";
    if (m.includes("linen") || m.includes("リネン") || m.includes("麻")) return "linen";
    if (m.includes("wool") || m.includes("ウール") || m.includes("毛")) return "wool";
    if (m.includes("cashmere") || m.includes("カシミヤ")) return "cashmere";
    if (m.includes("silk") || m.includes("シルク") || m.includes("絹")) return "silk";
    if (m.includes("polyester") || m.includes("ポリエステル")) return "polyester";
    if (m.includes("nylon") || m.includes("ナイロン")) return "nylon";
    if (m.includes("rayon") || m.includes("レーヨン")) return "rayon";
    if (m.includes("denim") || m.includes("デニム")) return "denim";
    if (m.includes("leather") || m.includes("レザー") || m.includes("革")) return "leather";
    if (m.includes("suede") || m.includes("スエード")) return "suede";
    if (m.includes("down") || m.includes("ダウン")) return "down";
    if (m.includes("fleece") || m.includes("フリース")) return "fleece";
    if (m.includes("gore") || m.includes("ゴアテックス")) return "gore-tex";
    if (m.includes("mesh") || m.includes("メッシュ")) return "mesh";
    if (m.includes("knit") || m.includes("ニット")) return "knit";
    if (m.includes("tweed") || m.includes("ツイード")) return "tweed";
  }

  // 名前からの推定
  if (name.includes("デニム") || name.includes("ジーンズ")) return "denim";
  if (name.includes("ニット") || name.includes("セーター")) return "knit";
  if (name.includes("ダウン")) return "down";
  if (name.includes("フリース")) return "fleece";
  if (name.includes("レザー") || name.includes("革")) return "leather";
  if (name.includes("リネン") || name.includes("麻")) return "linen";
  if (name.includes("シルク")) return "silk";

  return "unknown";
}

/* ── 体感温度算出 (ミスナール改良式 簡易版) ── */
export function computeFeltTemperature(
  tempC: number,
  humidityPct: number, // 0-100
  windMps: number,     // m/s
): number {
  // 夏の蒸し暑さ: 湿度による不快度上昇
  const humidityEffect = tempC >= 20
    ? (humidityPct - 50) * 0.05 // 湿度50%基準で±0.05°C/1%
    : (humidityPct - 50) * 0.02; // 冬は湿度の影響小さい

  // 風による体感低下 (風速冷却効果)
  const windChill = windMps >= 1
    ? -1.5 * Math.sqrt(windMps) // √風速に比例
    : 0;

  return Math.round((tempC + humidityEffect + windChill) * 10) / 10;
}

/* ── 天気データから拡張コンテキスト生成 ── */
export function buildExtendedWeatherContext(
  weather: WeatherDaily | null,
  humidityPct?: number | null,
  windMps?: number | null,
): ExtendedWeatherContext {
  const tempMax = weather?.temp_max ?? 20;
  const tempMin = weather?.temp_min ?? 10;
  const avgTemp = (tempMax + tempMin) / 2;

  const humidity = humidityPct ?? 50;
  const wind = windMps ?? 2;
  const feltTemp = computeFeltTemperature(avgTemp, humidity, wind);

  // 条件分類
  const condition: WeatherCondition =
    feltTemp >= 30 ? "hot" :
    feltTemp >= 25 ? "warm" :
    feltTemp >= 18 ? "mild" :
    feltTemp >= 10 ? "cool" :
    feltTemp >= 0 ? "cold" : "freezing";

  const humidityLevel: HumidityLevel =
    humidity >= 80 ? "very_humid" :
    humidity >= 65 ? "humid" :
    humidity >= 35 ? "normal" : "dry";

  const windLevel: WindLevel =
    wind >= 10 ? "strong" :
    wind >= 5 ? "windy" :
    wind >= 2 ? "breezy" : "calm";

  const icon = weather?.weather_icon ?? "unknown";
  const precip: PrecipType =
    icon === "snow" ? "snow" :
    icon === "storm" ? "heavy_rain" :
    icon === "rain" ? (weather?.pop_max && weather.pop_max >= 60 ? "heavy_rain" : "light_rain") :
    "none";

  return {
    condition, humidity: humidityLevel, wind: windLevel, precip,
    feltTemp, rawTempMax: weather?.temp_max ?? null, rawTempMin: weather?.temp_min ?? null,
  };
}

/* ── 素材 × 天候 相性マトリクス ── */
// 返り値: -3 (最悪) 〜 +3 (最適)
const MATERIAL_WEATHER_MATRIX: Record<MaterialCategory, Partial<Record<string, number>>> = {
  cotton:    { hot: 1, warm: 2, mild: 2, cool: 0, cold: -1, freezing: -2, humid: -1, very_humid: -2, heavy_rain: -2, light_rain: -1 },
  linen:     { hot: 3, warm: 3, mild: 1, cool: -2, cold: -3, freezing: -3, humid: 2, very_humid: 2, heavy_rain: -2, light_rain: -1 },
  wool:      { hot: -3, warm: -2, mild: 0, cool: 3, cold: 3, freezing: 2, humid: -1, very_humid: -2, heavy_rain: -3, light_rain: -1 },
  cashmere:  { hot: -3, warm: -2, mild: 0, cool: 3, cold: 3, freezing: 3, humid: -1, very_humid: -2, heavy_rain: -3, light_rain: -2 },
  silk:      { hot: 2, warm: 2, mild: 1, cool: -1, cold: -2, freezing: -3, humid: 1, very_humid: 0, heavy_rain: -3, light_rain: -2 },
  polyester: { hot: -1, warm: 0, mild: 1, cool: 1, cold: 0, freezing: -1, humid: -2, very_humid: -3, heavy_rain: 1, light_rain: 2, windy: 1, strong: 2 },
  nylon:     { hot: -1, warm: 0, mild: 1, cool: 1, cold: 0, freezing: -1, heavy_rain: 2, light_rain: 2, windy: 2, strong: 2 },
  rayon:     { hot: 2, warm: 1, mild: 1, cool: -1, cold: -2, freezing: -3, humid: 0, heavy_rain: -2, light_rain: -1 },
  denim:     { hot: -2, warm: -1, mild: 2, cool: 2, cold: 0, freezing: -1, humid: -1, heavy_rain: -2, windy: 1 },
  leather:   { hot: -3, warm: -2, mild: 1, cool: 2, cold: 2, freezing: 1, heavy_rain: -2, light_rain: 0, windy: 3, strong: 3 },
  suede:     { hot: -3, warm: -1, mild: 1, cool: 2, cold: 1, freezing: 0, heavy_rain: -3, light_rain: -3, humid: -2 },
  down:      { hot: -3, warm: -3, mild: -2, cool: 1, cold: 3, freezing: 3, heavy_rain: -1, windy: 2, strong: 2 },
  fleece:    { hot: -3, warm: -2, mild: -1, cool: 2, cold: 3, freezing: 2, heavy_rain: -2, humid: -1 },
  "gore-tex":{ hot: -1, warm: 0, mild: 1, cool: 2, cold: 2, freezing: 2, heavy_rain: 3, light_rain: 3, windy: 3, strong: 3, humid: 0 },
  mesh:      { hot: 3, warm: 2, mild: 0, cool: -2, cold: -3, freezing: -3, humid: 2, very_humid: 3, windy: -2, strong: -3 },
  knit:      { hot: -2, warm: -1, mild: 1, cool: 2, cold: 2, freezing: 1, heavy_rain: -2, humid: -1 },
  tweed:     { hot: -3, warm: -2, mild: 0, cool: 2, cold: 3, freezing: 2, heavy_rain: -2, humid: -1 },
  unknown:   {},
};

/* ── 素材×天候のスコア ── */
export function scoreMaterialWeather(
  material: MaterialCategory,
  ctx: ExtendedWeatherContext,
): { score: number; reasons: string[] } {
  const matrix = MATERIAL_WEATHER_MATRIX[material];
  if (!matrix || Object.keys(matrix).length === 0) return { score: 0, reasons: [] };

  const factors: number[] = [];
  const reasons: string[] = [];

  // 温度条件
  const tempScore = matrix[ctx.condition];
  if (tempScore != null) {
    factors.push(tempScore);
    if (tempScore <= -2) reasons.push(material === "wool" && ctx.condition === "hot"
      ? "ウールは暑い日に不向き"
      : `${materialJa(material)}は${conditionJa(ctx.condition)}に合わない`);
    if (tempScore >= 2) reasons.push(`${materialJa(material)}は${conditionJa(ctx.condition)}に最適`);
  }

  // 湿度
  const humidScore = matrix[ctx.humidity];
  if (humidScore != null) {
    factors.push(humidScore);
    if (humidScore <= -2) reasons.push(`${materialJa(material)}は高湿度で蒸れやすい`);
  }

  // 風
  const windScore = matrix[ctx.wind];
  if (windScore != null) {
    factors.push(windScore);
    if (windScore <= -2) reasons.push(`${materialJa(material)}は強風に弱い`);
    if (windScore >= 2) reasons.push(`${materialJa(material)}は防風性が高い`);
  }

  // 降水
  const precipScore = matrix[ctx.precip];
  if (precipScore != null) {
    factors.push(precipScore);
    if (precipScore <= -2) reasons.push(`${materialJa(material)}は雨に弱い`);
    if (precipScore >= 2) reasons.push(`${materialJa(material)}は雨に強い`);
  }

  if (factors.length === 0) return { score: 0, reasons: [] };

  const avg = factors.reduce((a, b) => a + b, 0) / factors.length;
  return { score: Math.round(avg * 10) / 10, reasons: reasons.slice(0, 2) };
}

/* ── アウトフィット全体の素材スコア ── */
export function scoreOutfitMaterials(
  items: WardrobeItem[],
  ctx: ExtendedWeatherContext,
): { totalScore: number; itemScores: Array<{ name: string; material: MaterialCategory; score: number; reasons: string[] }> } {
  const itemScores = items.map(item => {
    const material = inferMaterial(item);
    const { score, reasons } = scoreMaterialWeather(material, ctx);
    return { name: item.name ?? item.category, material, score, reasons };
  });

  const total = itemScores.length > 0
    ? itemScores.reduce((a, i) => a + i.score, 0) / itemScores.length
    : 0;

  return { totalScore: Math.round(total * 10) / 10, itemScores };
}

/* ── 日本語変換 ── */
function materialJa(m: MaterialCategory): string {
  const map: Record<MaterialCategory, string> = {
    cotton: "コットン", linen: "リネン", wool: "ウール", cashmere: "カシミヤ",
    silk: "シルク", polyester: "ポリエステル", nylon: "ナイロン", rayon: "レーヨン",
    denim: "デニム", leather: "レザー", suede: "スエード", down: "ダウン",
    fleece: "フリース", "gore-tex": "ゴアテックス", mesh: "メッシュ",
    knit: "ニット", tweed: "ツイード", unknown: "不明",
  };
  return map[m] ?? m;
}

function conditionJa(c: WeatherCondition): string {
  const map: Record<WeatherCondition, string> = {
    hot: "猛暑", warm: "暑い日", mild: "穏やかな日", cool: "涼しい日", cold: "寒い日", freezing: "極寒",
  };
  return map[c] ?? c;
}

/* ── 体感温度から推奨厚み（constants.tsの拡張版） ── */
export function getRecommendedThicknessFromFelt(feltTemp: number): {
  thickness: "thin" | "mid" | "thick";
  needsOuter: boolean;
  preferredMaterials: MaterialCategory[];
} {
  if (feltTemp >= 28) return { thickness: "thin", needsOuter: false, preferredMaterials: ["linen", "mesh", "cotton", "rayon"] };
  if (feltTemp >= 22) return { thickness: "thin", needsOuter: false, preferredMaterials: ["cotton", "linen", "silk", "rayon"] };
  if (feltTemp >= 15) return { thickness: "mid", needsOuter: false, preferredMaterials: ["cotton", "denim", "polyester", "knit"] };
  if (feltTemp >= 8)  return { thickness: "mid", needsOuter: true, preferredMaterials: ["knit", "denim", "wool", "fleece"] };
  if (feltTemp >= 0)  return { thickness: "thick", needsOuter: true, preferredMaterials: ["wool", "cashmere", "down", "fleece", "tweed"] };
  return { thickness: "thick", needsOuter: true, preferredMaterials: ["down", "cashmere", "wool", "gore-tex"] };
}
