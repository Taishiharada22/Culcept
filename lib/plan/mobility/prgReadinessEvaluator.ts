/**
 * lib/plan/mobility/prgReadinessEvaluator.ts
 *   — PRG 横断: Dogfood Readiness / Safety Evaluator（pure・未配線）
 *
 * ★目的: PRG 各軸（movement tolerance / energy rhythm / place affinity / personal pace …）の
 *   「今どの状態か」を **横断的に 1 つの基準で判定** する meta 層。各軸を作り込んだ後、
 *   「どの軸がデータ不足か / dogfood 中か / activation 候補か / 沈黙すべきか / 懸念ありか」を一望する。
 *
 * ★非 speculative: 入力＝各エンジンの readiness は **今存在する**（薄ければ accumulating と正しく報告）。
 *   データ量に関係なく **今日意味ある status を返す**（status aggregator であって予測器でない）。
 *
 * ★状態モデル（5 値・CEO の 4 bucket + safety 拡張）:
 *   - `dormant`              … flag OFF（エンジンは在るが surface していない）。
 *   - `accumulating`         … flag ON ∧ data 不足（dogfood 中だが薄くて沈黙＝正常）。CEO「データ不足」「沈黙すべき」。
 *   - `dogfooding`           … flag ON ∧ ready ∧ stability 信号なし（観測中・未検証）。CEO「dogfood 中」。
 *   - `needs_attention`      … flag ON ∧ ready ∧ **concern 検出**（unstable）。★safety: activation せず review。
 *   - `activation_candidate` … flag ON ∧ ready ∧ stable_safe。CEO「activation 候補」。
 *
 * ★honesty: stability 信号を持つのは現状 place affinity(safety journal)のみ。他軸は stable=null →
 *   ready でも `dogfooding` 止まり（**stability 証拠なしに activation 候補と呼ばない**）。他軸の stability
 *   journal は次設計。raw 値を出さない（status + boolean + 件数のみ）・pure / Date 不使用 / DB・network なし。
 */
import type { MobilityObservation } from "@/lib/plan/mobility/mobilityObservationStore";
import { buildMovementTolerance } from "@/lib/plan/mobility/movementTolerance";
import { buildEnergyRhythm } from "@/lib/plan/mobility/energyRhythm";
import { buildPlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";

export type PrgAxisKey = "movement_tolerance" | "energy_rhythm" | "place_affinity" | "personal_pace" | "context";

export type PrgReadinessState =
  | "dormant"
  | "accumulating"
  | "dogfooding"
  | "needs_attention"
  | "activation_candidate";

/** 各軸の正規化入力（エンジン API に結合しないため core は input-driven）。 */
export interface PrgAxisInput {
  readonly axis: PrgAxisKey;
  /** dogfood flag の実効値（呼び側が `isXEnabled()` 等で決める）。 */
  readonly flagOn: boolean;
  /** エンジン status === "ready"。 */
  readonly dataReady: boolean;
  /** stability 証拠: true=stable_safe / false=concern(unstable) / null=stability 信号なし。 */
  readonly stable: boolean | null;
  /** sample size（internal・実カウント・偽数値でない）。 */
  readonly observed: number;
}

export interface PrgAxisReadiness extends PrgAxisInput {
  readonly state: PrgReadinessState;
}

export interface PrgReadinessReport {
  readonly axes: readonly PrgAxisReadiness[];
  /** 状態別の軸数（一望用）。 */
  readonly counts: Record<PrgReadinessState, number>;
}

/** ★状態導出（pure・決定論）。 */
export function derivePrgAxisState(input: PrgAxisInput): PrgReadinessState {
  if (!input.flagOn) return "dormant";
  if (!input.dataReady) return "accumulating";
  if (input.stable === true) return "activation_candidate";
  if (input.stable === false) return "needs_attention"; // ★concern → activation せず review
  return "dogfooding"; // stable === null（stability 信号なし）
}

const EMPTY_COUNTS: () => Record<PrgReadinessState, number> = () => ({
  dormant: 0,
  accumulating: 0,
  dogfooding: 0,
  needs_attention: 0,
  activation_candidate: 0,
});

/**
 * ★core: 正規化入力から横断 readiness report を作る（pure）。
 */
export function evaluatePrgReadiness(inputs: readonly PrgAxisInput[]): PrgReadinessReport {
  const axes = inputs.map((input) => ({ ...input, state: derivePrgAxisState(input) }));
  const counts = EMPTY_COUNTS();
  for (const a of axes) counts[a.state] += 1;
  return { axes, counts };
}

// ───────────── collector: MobilityObservation 系 3 軸（pure・loaded data を受ける） ─────────────

export interface MobilityAxisFlags {
  readonly movementTolerance: boolean;
  readonly energyRhythm: boolean;
  readonly placeAffinity: boolean;
}

/**
 * ★MobilityObservation を共有する 3 軸の正規化入力を作る（pure・既存エンジン再利用＝DRY）。
 *   personal pace（movementEvent 系・独自 readiness stack）は generic input 経路で別途（次設計）。
 */
export function collectMobilityObservationAxes(args: {
  readonly observations: readonly MobilityObservation[];
  readonly flags: MobilityAxisFlags;
  /** place affinity safety journal の結果（true=stable_safe / false=unstable / null=insufficient or 未評価）。 */
  readonly placeAffinityStable?: boolean | null;
}): PrgAxisInput[] {
  const mt = buildMovementTolerance(args.observations);
  const er = buildEnergyRhythm(args.observations);
  const pa = buildPlaceAffinityReadiness(args.observations);
  return [
    { axis: "movement_tolerance", flagOn: args.flags.movementTolerance, dataReady: mt.status === "ready", stable: null, observed: mt.totalObserved },
    { axis: "energy_rhythm", flagOn: args.flags.energyRhythm, dataReady: er.status === "ready", stable: null, observed: er.totalObserved },
    { axis: "place_affinity", flagOn: args.flags.placeAffinity, dataReady: pa.status === "ready", stable: args.placeAffinityStable ?? null, observed: pa.totalVisits },
  ];
}
