/**
 * lib/plan/compose/placeConditionAffinity.ts — Place Affinity P3: 条件付き場所相性（pure・未配線）
 *
 * ★目的（「今日のあなたなら どこが合うか」）: 既存観測（MobilityObservation の destKey + weekday/timeband/weatherKind）
 *   から「この条件の日に、この人がよく行く場所」を honest に導く。P2（無条件 revealed preference）の条件付き版。
 *   ★UI/決定/scorer に **未配線**（pure・read-only）。
 *
 * ★安全境界（CEO 方針）:
 *   - 新規データ保存なし（既存観測を read）。redacted（sensitive）除外。raw GPS/座標/住所なし。
 *   - 人格診断にしない（「あなたは雨の日カフェ好き」断定なし）→「雨の日に行くことが多い場所のようです」観測トーン。
 *   - 偽数値なし（status + 実カウント + skew bool + 定性 strength）。薄いデータで断定しない（sufficient gate）。
 *   - pure / Date 不使用 / DB・network なし / belief 非汚染。
 */
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import type { PlaceAffinityStatus, PlaceVisitStrength } from "@/lib/plan/compose/placeAffinityReadiness";

export type PlaceConditionDimension = "weekday" | "timeband" | "weather";

/** 条件（次元 + 値）。値は観測の該当 field と一致比較する。 */
export interface PlaceCondition {
  readonly dimension: PlaceConditionDimension;
  /** weekday: weekday|weekend / timeband: morning|… / weather: rain|… */
  readonly value: string;
}

export interface ConditionalPlaceProfile {
  readonly placeKey: string;
  /** 条件下の訪問回数（実カウント）。 */
  readonly underConditionCount: number;
  /** その place の総訪問回数（条件問わず）。 */
  readonly totalCount: number;
  /** その place が条件に偏っているか（underCondition/total ≥ skewThreshold）。 */
  readonly skewsToCondition: boolean;
  readonly strength: PlaceVisitStrength;
}

export interface PlaceConditionAffinity {
  readonly status: PlaceAffinityStatus;
  readonly condition: PlaceCondition;
  /** 条件下の目的地観測の総数。 */
  readonly underConditionTotal: number;
  /** underConditionCount 降順・sufficient のみ（ready のとき）。 */
  readonly profiles: readonly ConditionalPlaceProfile[];
}

export interface PlaceConditionConfig {
  /** 条件下で profile に載せる最小訪問数（薄いデータで断定しない）。 */
  readonly minUnderCondition: number;
  /** skewsToCondition の閾値（その place がほぼ条件下で選ばれている）。 */
  readonly skewThreshold: number;
  readonly frequentThreshold: number;
  readonly habitualThreshold: number;
}

export const DEFAULT_PLACE_CONDITION_CONFIG: PlaceConditionConfig = {
  minUnderCondition: 3,
  skewThreshold: 0.6,
  frequentThreshold: 4,
  habitualThreshold: 8,
};

function fieldFor(o: MobilityObservation, dim: PlaceConditionDimension): string | undefined {
  if (dim === "weekday") return o.weekday;
  if (dim === "timeband") return o.timeband;
  return o.weatherKind; // weather（未取得は undefined → 一致しない）
}

function strengthOf(count: number, config: PlaceConditionConfig): PlaceVisitStrength {
  if (count >= config.habitualThreshold) return "habitual";
  if (count >= config.frequentThreshold) return "frequent";
  return "occasional";
}

/**
 * ★P3 core: 条件下の場所相性を導く（pure・未配線）。
 *   redacted 除外。条件下の目的地訪問が薄ければ not_enough。各 place の under/total で skew 判定。
 */
export function buildPlaceConditionAffinity(
  observations: readonly MobilityObservation[],
  condition: PlaceCondition,
  config: PlaceConditionConfig = DEFAULT_PLACE_CONDITION_CONFIG,
): PlaceConditionAffinity {
  const totalByPlace = new Map<string, number>();
  const underByPlace = new Map<string, number>();
  let underConditionTotal = 0;

  for (const o of observations) {
    if (o.privacyClass === "redacted") continue; // ★sensitive 除外
    const key = o.destKey;
    if (key == null) continue;
    totalByPlace.set(key, (totalByPlace.get(key) ?? 0) + 1);
    if (fieldFor(o, condition.dimension) === condition.value) {
      underByPlace.set(key, (underByPlace.get(key) ?? 0) + 1);
      underConditionTotal += 1;
    }
  }

  if (underConditionTotal < config.minUnderCondition) {
    return { status: "not_enough", condition, underConditionTotal, profiles: [] };
  }

  const profiles = [...underByPlace.entries()]
    .filter(([, under]) => under >= config.minUnderCondition)
    .map(([placeKey, underConditionCount]) => {
      const totalCount = totalByPlace.get(placeKey) ?? underConditionCount;
      return {
        placeKey,
        underConditionCount,
        totalCount,
        skewsToCondition: underConditionCount / totalCount >= config.skewThreshold,
        strength: strengthOf(underConditionCount, config),
      };
    })
    .sort((a, b) => b.underConditionCount - a.underConditionCount);

  return { status: "ready", condition, underConditionTotal, profiles };
}

/** 条件 → 観測トーンの接頭辞（人格診断にしない）。 */
const CONDITION_LABEL: Record<string, string> = {
  weekday: "平日",
  weekend: "週末",
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
  night: "夜",
  rain: "雨の日",
  snow: "雪の日",
  storm: "荒天の日",
  heat: "暑い日",
  cold: "寒い日",
  normal: "",
};

/** ★条件 → 表示ラベル（rain→「雨の日」等・normal/未知は null）。P5.1 reason-only で再利用。 */
export function placeConditionLabel(condition: PlaceCondition): string | null {
  const label = CONDITION_LABEL[condition.value];
  return label ? label : null;
}

/**
 * ★条件下の place profile → 1 行（観測トーン・人格診断にしない・数字/place 名なし）。
 *   skew が無い/弱い/ラベル無し → null（沈黙）。
 */
export function placeConditionReasonLine(profile: ConditionalPlaceProfile, condition: PlaceCondition): string | null {
  const label = CONDITION_LABEL[condition.value];
  if (!label) return null; // normal 等・ラベル無しは沈黙
  if (profile.strength === "occasional") return null; // 弱い → 沈黙
  return `${label}に行くことが多い場所のようです。`;
}
