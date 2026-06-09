/**
 * lib/plan/mobility/energyRhythm.ts — PRG 軸: Energy Rhythm / Time-of-Day Fit（pure・未配線）
 *
 * ★目的: 「この人はいつ活動しているか（どの時間帯で動きやすいか）」を、既存観測（MobilityObservation の
 *   timeband 分布）から **断定せず観測ベース** で読む。秘書 OS が「いつ提案すれば実際に動いてもらえるか」を
 *   知るための判断材料。
 *
 * ★3 軸の峻別（CEO 要求・冗長回避）:
 *   - personal pace = 移動に**かかる時間**（A1・duration）。
 *   - movement tolerance = **どう動くか/負荷回避**（mode-effort skew）。
 *   - energy rhythm（本 module）= **いつ活動するか**（timeband 別の観測**数分布**=presence）。
 *     → movement tolerance が触れない **presence 次元**。同じ timeband 軸の**別レンズ**で冗長でない。
 *
 * ★honesty（最重要）:
 *   - v0 は presence=**「活動の記録」**を読むのみ。physiological energy を測定したと**主張しない**。
 *     energy/movability への接続は秘書 OS 側の解釈に委ねる（reason は「記録」レベルで止める）。
 *   - ★**trait/人格化しない**（「朝型/夜型」禁止）→「{時間帯}は活動の記録が多い/少なめの時間帯のようです」。
 *   - ★**本人 baseline 比**: 各 timeband の share を**均等(1/4)と比較**し、本人がどこに活動を集中させるかを読む
 *     （within-person・population trait でない）。
 *   - ★**schedule 交絡**: presence は予定駆動で energy 駆動でない交絡が強い。v0 は「記録」レベルゆえ過剰主張に
 *     ならない。呼び側が **weekend 観測のみ**を渡せば裁量信号に近づく（schedule を剥がす・mini-design 参照）。
 *   - insufficient は沈黙（sufficient gate）・偽数値なし（出力は level enum + 実カウント）・timeband のみ使用
 *     （redacted でも timeband は非 location ゆえ可・OD/座標/住所 不扱い）・pure/Date 不使用/DB・network なし。
 *
 * ★v0 制約: fatigue/見送り/後回し by timeband は安全に取れない（A0 tired は timeband 無=join 不可=新データ /
 *   dismiss は Life Ops 近接）→ v0 除外。weekday/weekend は呼び側 scope（core は observations[] のみ）。
 */
import type { MobilityObservation, Timeband } from "@/lib/plan/mobility/mobilityObservationStore";

/** 評価対象の timeband（朝/昼/夕方/夜）。均等 baseline = 1/4。 */
const ACTIVE_TIMEBANDS: readonly Timeband[] = ["morning", "afternoon", "evening", "night"];

/** 活動 presence の水準（typical は沈黙ゆえ signal には high/low のみ載る）。 */
export type ActivityLevel = "high" | "typical" | "low";

/** timeband 別の活動水準 signal（本人の均等 baseline 比）。 */
export interface TimebandRhythmSignal {
  readonly timeband: Timeband;
  /** ★typical は emit しない（high/low のみ）。 */
  readonly level: Exclude<ActivityLevel, "typical">;
  /** その timeband の観測数（internal・実カウント・偽数値でない）。 */
  readonly count: number;
}

export type EnergyRhythmStatus = "not_enough" | "ready";
export interface EnergyRhythmReadiness {
  readonly status: EnergyRhythmStatus;
  /** timeband 判定可能な観測の総数。 */
  readonly totalObserved: number;
  /** high/low が立った timeband のみ（typical は沈黙）。 */
  readonly signals: readonly TimebandRhythmSignal[];
}

export interface EnergyRhythmConfig {
  /** 全体でこの数の観測が無ければ not_enough（分布を語るための floor・4 bucket ゆえ高め）。 */
  readonly minTotalForReady: number;
  /** share − 均等(1/4) がこれ以上で high（活動が集中）。 */
  readonly highSkew: number;
  /** 均等(1/4) − share がこれ以上で low（活動が少なめ）。 */
  readonly lowSkew: number;
}
export const DEFAULT_ENERGY_RHYTHM_CONFIG: EnergyRhythmConfig = {
  minTotalForReady: 12,
  highSkew: 0.15,
  lowSkew: 0.15,
};

/**
 * ★core: timeband 別の活動 presence を観測から読む（pure・未配線）。
 *   各 timeband の観測 share を**均等(1/4)**と比較し、本人が活動を集中/疎にしている timeband を high/low で返す。
 *   ★timeband のみ使用（場所 key 不扱い・redacted でも timeband は非 location ゆえ含める）。
 */
export function buildEnergyRhythm(
  observations: readonly MobilityObservation[],
  config: EnergyRhythmConfig = DEFAULT_ENERGY_RHYTHM_CONFIG,
): EnergyRhythmReadiness {
  const counts = new Map<Timeband, number>();
  for (const o of observations) counts.set(o.timeband, (counts.get(o.timeband) ?? 0) + 1);

  const totalObserved = ACTIVE_TIMEBANDS.reduce((sum, tb) => sum + (counts.get(tb) ?? 0), 0);
  if (totalObserved < config.minTotalForReady) {
    return { status: "not_enough", totalObserved, signals: [] };
  }

  const uniform = 1 / ACTIVE_TIMEBANDS.length; // 0.25
  const signals: TimebandRhythmSignal[] = [];
  for (const timeband of ACTIVE_TIMEBANDS) {
    const count = counts.get(timeband) ?? 0;
    const share = count / totalObserved;
    if (share - uniform >= config.highSkew) {
      signals.push({ timeband, level: "high", count });
    } else if (uniform - share >= config.lowSkew) {
      signals.push({ timeband, level: "low", count });
    }
  }

  return { status: "ready", totalObserved, signals };
}

// ───────────────────────── reason builder（観測トーン・trait でない） ─────────────────────────

const TIMEBAND_LABEL: Record<Timeband, string> = {
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
  night: "夜",
};

/**
 * ★signal → 1 行（観測トーン・人格化しない・数字/「型」なし）。ラベル無し→null。
 *   ★「活動の記録」レベルで止める（energy/movability を断定しない）。
 */
export function energyRhythmReasonLine(signal: TimebandRhythmSignal): string | null {
  const label = TIMEBAND_LABEL[signal.timeband];
  if (!label) return null;
  return signal.level === "high"
    ? `${label}は活動の記録が多い時間帯のようです。`
    : `${label}は活動の記録が少なめの時間帯のようです。`;
}
