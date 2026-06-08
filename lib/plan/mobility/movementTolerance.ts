/**
 * lib/plan/mobility/movementTolerance.ts — PRG 軸: 移動耐性（Movement Tolerance・pure・未配線）
 *
 * ★目的: 「この人はどの条件で移動負荷の少ない手段を選びやすいか（＝負荷を避けやすいか）」を
 *   既存観測（MobilityObservation の mode × weather/timeband/weekday）から **断定せず観測ベース** で読む。
 *
 * ★personal pace との区別（CEO 明示）:
 *   - personal pace = 実移動**時間**の個人差（A1・movementEventStore）。
 *   - movement tolerance = 移動**負荷を受け入れる/避ける傾向**（本 module・mode の physical/exposure 負荷の条件別シフト）。
 *
 * ★安全境界（CEO 方針）:
 *   - trait にしない・人格化しない（「移動が苦手な人」と断定しない）→「この条件では移動負荷を避けやすい傾向が見えます」。
 *   - ★**本人 baseline 比**で条件別シフトを読む（普遍的交絡＝距離/天候は誰でも、を本人比で軽減）。
 *   - 新規データ保存なし（既存観測 read のみ）・sensitive(redacted) 除外・raw GPS/座標/住所 非扱い。
 *   - 偽数値を出さない（reason は定性・share は内部のみ・出力は boolean + 実カウント）。
 *   - 薄いデータで断定しない（sufficient gate）。pure / Date 不使用 / DB・network なし / belief 非汚染。
 *
 * ★v0 制約: mode-effort は proxy（距離/availability の交絡を本人比で軽減するが残る）。density は観測に無く対象外。
 *   A0 reason(tired/hurry) の明示的回避シグナルは次増分（corroboration）。
 */
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";

/** mode の physical/exposure 負荷レベル。flight/unknown は日常移動負荷の信号でない→null。 */
export type MovementEffort = "high" | "medium" | "low";

const MODE_EFFORT: Partial<Record<RouteTransportMode, MovementEffort>> = {
  walk: "high",
  bicycle: "high",
  train: "medium",
  bus: "medium",
  shinkansen: "medium",
  car: "low",
  taxi: "low",
  // flight / unknown → 除外（日常移動負荷の信号でない）
};

/** mode → 負荷レベル（flight/unknown は null）。 */
export function modeEffortLevel(mode: RouteTransportMode): MovementEffort | null {
  return MODE_EFFORT[mode] ?? null;
}

/** 「移動負荷の少ない手段」= effort が medium/low（high=walk/bike でない）。null は判定外。 */
function isLowLoadMode(mode: RouteTransportMode): boolean | null {
  const e = modeEffortLevel(mode);
  return e == null ? null : e !== "high";
}

export type ToleranceDimension = "weather" | "timeband" | "weekday";
export interface ToleranceCondition {
  readonly dimension: ToleranceDimension;
  readonly value: string;
}

/** 条件下で「移動負荷を避けやすい傾向」が見えるか（本人 baseline 比）。 */
export interface ConditionalToleranceSignal {
  readonly condition: ToleranceCondition;
  /** 条件下の判定対象観測数（実カウント）。 */
  readonly underCount: number;
  /** ★条件下で low-load 手段に偏る（本人 baseline より高い）か。 */
  readonly avoidsLoadUnderCondition: boolean;
}

export type MovementToleranceStatus = "not_enough" | "ready";
export interface MovementToleranceReadiness {
  readonly status: MovementToleranceStatus;
  /** effort 判定可能な観測の総数。 */
  readonly totalObserved: number;
  /** avoidsLoad が立った条件のみ。 */
  readonly signals: readonly ConditionalToleranceSignal[];
}

export interface MovementToleranceConfig {
  /** 全体でこの数の effort 判定可能観測が無ければ not_enough。 */
  readonly minTotalForReady: number;
  /** 条件下でこの数の観測が無ければ判定しない。 */
  readonly minUnderCondition: number;
  /** 条件下 low-load share − baseline share がこれ以上で「避けやすい」。 */
  readonly skewThreshold: number;
}
export const DEFAULT_MOVEMENT_TOLERANCE_CONFIG: MovementToleranceConfig = {
  minTotalForReady: 8,
  minUnderCondition: 4,
  skewThreshold: 0.2,
};

function fieldFor(o: MobilityObservation, dim: ToleranceDimension): string | undefined {
  if (dim === "weather") return o.weatherKind;
  if (dim === "timeband") return o.timeband;
  return o.weekday;
}

/** 評価する条件（weather=悪天候・timeband=夜/夕方・weekday=平日/週末）。 */
const TOLERANCE_CONDITIONS: readonly ToleranceCondition[] = [
  { dimension: "weather", value: "rain" },
  { dimension: "weather", value: "snow" },
  { dimension: "weather", value: "storm" },
  { dimension: "weather", value: "heat" },
  { dimension: "timeband", value: "evening" },
  { dimension: "timeband", value: "night" },
  { dimension: "weekday", value: "weekday" },
  { dimension: "weekday", value: "weekend" },
];

/**
 * ★core: 移動耐性を観測から読む（pure・未配線）。
 *   effort 判定可能（redacted 除外は不要＝mode は redacted でも残るが、ここは mode のみ使用）な観測で
 *   baseline low-load share を出し、各条件下の share が baseline より skewThreshold 以上高ければ「避けやすい」。
 */
export function buildMovementTolerance(
  observations: readonly MobilityObservation[],
  config: MovementToleranceConfig = DEFAULT_MOVEMENT_TOLERANCE_CONFIG,
): MovementToleranceReadiness {
  // effort 判定可能な観測（flight/unknown は除外）。★mode のみ使用（場所 key は扱わない）。
  const scored = observations
    .map((o) => ({ low: isLowLoadMode(o.mode), o }))
    .filter((x): x is { low: boolean; o: MobilityObservation } => x.low !== null);

  const totalObserved = scored.length;
  if (totalObserved < config.minTotalForReady) {
    return { status: "not_enough", totalObserved, signals: [] };
  }

  const baselineLow = scored.filter((x) => x.low).length / totalObserved;

  const signals: ConditionalToleranceSignal[] = [];
  for (const condition of TOLERANCE_CONDITIONS) {
    const under = scored.filter((x) => fieldFor(x.o, condition.dimension) === condition.value);
    if (under.length < config.minUnderCondition) continue;
    const underLow = under.filter((x) => x.low).length / under.length;
    const avoidsLoadUnderCondition = underLow - baselineLow >= config.skewThreshold;
    if (avoidsLoadUnderCondition) {
      signals.push({ condition, underCount: under.length, avoidsLoadUnderCondition: true });
    }
  }

  return { status: "ready", totalObserved, signals };
}

// ───────────────────────── reason builder（観測トーン・trait でない） ─────────────────────────

const CONDITION_LABEL: Record<string, string> = {
  rain: "雨の日",
  snow: "雪の日",
  storm: "荒天の日",
  heat: "暑い日",
  evening: "夕方",
  night: "夜",
  weekday: "平日",
  weekend: "週末",
};

/**
 * ★signal → 1 行（観測トーン・人格断定にしない・数字なし）。ラベル無し→null。
 */
export function movementToleranceReasonLine(signal: ConditionalToleranceSignal): string | null {
  const label = CONDITION_LABEL[signal.condition.value];
  if (!label) return null;
  return `${label}は移動負荷の少ない手段を選びやすい傾向が見えます。`;
}
