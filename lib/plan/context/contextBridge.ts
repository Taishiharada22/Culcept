/**
 * lib/plan/context/contextBridge.ts — Phase A2-2: Context Modifier の pure connection layer
 *
 * ★目的: A2-1 の pure core（contextModifier.ts）を /plan の決定路と繋ぐ **純粋な glue**。
 *   belief / UI render / DB / API / localStorage に一切触れない。配線（render）は A2-3（UI stop gate）。
 *
 * 3 つの pure 関数:
 *   1. buildDayContextSnapshot — /plan の一次情報（density / energy / travel 分）から **day-level** snapshot を組む。
 *      ★point-level 信号（timeBand / positionInDay）は day-level に乗せない（過剰主張回避・leg 用は将来）。
 *   2. contextToDecisionContext — snapshot.weather を mobilityHypothesis の DecisionContext へ投影（既存路の供給）。
 *   3. buildContextOutlook — modifier → UI 向け view-model（reason 行 + 確信弱め flag）。
 *      ★copy を弱めるだけで DayRehearsal の数値（viability/strain）は **一切変えない**。
 *
 * pure / Date 不使用 / 副作用なし。
 */
import type { DecisionContext } from "@/lib/plan/mobility/mobilityHypothesis";
import {
  contextReasonLine,
  type ContextModifier,
  type ContextSnapshot,
  type ContextSource,
  type DensityLevel,
  type TravelLoadLevel,
} from "@/lib/plan/context/contextModifier";

// ───────────────────────── travelLoad 閾値（固定・較正 backlog） ─────────────────────────

/** 既知 travel 分合計の light/moderate/heavy 境界（min）。較正は実データ後。 */
const TRAVEL_LOAD_LIGHT_MAX_MIN = 30;
const TRAVEL_LOAD_HEAVY_MIN_MIN = 90;

function classifyTravelLoad(totalKnownMin: number): TravelLoadLevel {
  if (totalKnownMin < TRAVEL_LOAD_LIGHT_MAX_MIN) return "light";
  if (totalKnownMin >= TRAVEL_LOAD_HEAVY_MIN_MIN) return "heavy";
  return "moderate";
}

// ───────────────────────── 1. day-level snapshot builder ─────────────────────────

export interface DayContextPrimitives {
  /** dayGraph の予定密度（観測）。 */
  readonly density: DensityLevel;
  /** InnerWeather 由来 0..1 正規化 energy（derived）。null なら energy を載せない。 */
  readonly baseEnergyLevel: number | null;
  /** 当日 transition の travel 分（null=unknown・捏造しない）。既知のみ合計して travelLoad を出す。 */
  readonly travelMinutes: readonly (number | null)[];
}

/**
 * /plan の一次情報から **day-level** ContextSnapshot を組む（pure）。
 * ★source タグは事実に即して付ける（density/travelLoad=observed・energy=derived）。
 * ★既知 travel が 0 件なら travelLoad を載せない（捏造しない）。
 * ★A2-6: weather は任意（source 既知の WeatherKind・A2-6b の useTodayWeather から供給）。不在→載せない。
 */
export function buildDayContextSnapshot(
  input: DayContextPrimitives,
  weather?: ContextSnapshot["weather"],
): ContextSnapshot {
  const observed: ContextSource = "observed";

  const snapshot: {
    -readonly [K in keyof ContextSnapshot]: ContextSnapshot[K];
  } = {
    density: { value: input.density, source: observed },
  };

  if (input.baseEnergyLevel !== null) {
    snapshot.energy = { value: input.baseEnergyLevel, source: "derived" };
  }

  const knownTravel = input.travelMinutes.filter((m): m is number => m !== null);
  if (knownTravel.length > 0) {
    const total = knownTravel.reduce((a, b) => a + b, 0);
    snapshot.travelLoad = { value: classifyTravelLoad(total), source: observed };
  }

  if (weather) snapshot.weather = weather; // ★A2-6: 今日の天気（あれば）

  return snapshot;
}

// ───────────────────────── 2. mobility DecisionContext へ投影 ─────────────────────────

/**
 * snapshot.weather を mobilityHypothesis の DecisionContext に投影（pure）。
 * ★既存 guardrail を保持: weather は contextNote（注意）のみで、todayLikelyMode を変えない（mobilityHypothesis 側）。
 * ★source 不明な weather は渡さない（断定回避）。cold は DecisionContext に無いので normal 扱い。
 */
export function contextToDecisionContext(snapshot: ContextSnapshot): DecisionContext {
  const w = snapshot.weather;
  if (!w || (w.source !== "observed" && w.source !== "user" && w.source !== "derived")) {
    return {}; // 出所不明/欠落 → weather を渡さない
  }
  if (w.value === "rain" || w.value === "heat") return { weather: w.value };
  return { weather: "normal" }; // cold/normal → normal（mobility 側は屋外負担 note を出さない）
}

// ───────────────────────── 3. UI 向け view-model（render は A2-3） ─────────────────────────

export interface ContextOutlook {
  /** 表示する 1 行（仮説トーン・数字フリー・sensitive-free）。null=沈黙。 */
  readonly reasonLine: string | null;
  /** ★確信を弱める合図（copy を控えめにするだけ・DayRehearsal の数値は変えない）。 */
  readonly softenConfidence: boolean;
  /** 透明性: 出所のある条件数。 */
  readonly knownSignalCount: number;
}

/**
 * modifier → UI 向け view-model（pure・presentation-prep）。
 * ★softenConfidence は copy を控えめにするだけ。viability/strain など DayRehearsal の数値には触れない。
 */
export function buildContextOutlook(modifier: ContextModifier): ContextOutlook {
  return {
    reasonLine: contextReasonLine(modifier),
    softenConfidence: modifier.widenUncertainty,
    knownSignalCount: modifier.knownSignalCount,
  };
}
