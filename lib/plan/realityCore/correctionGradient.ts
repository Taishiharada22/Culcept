/**
 * correctionGradient — RO-3 D4b（2026-06-20）: CorrectionGradientV0（別型隔離）+ decomposeCorrection（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §4-④・v0.1）
 * 思想: user 拒否/修正を「単なる好み」でなく、duration/energy/prep/route/deadline/cognitiveLoad の
 *   **どの軸を補正すべきか**に分解する。
 *
 * CEO 裁定（2026-06-20・RO-3 実装 GO）の厳守点（openDecision #2）:
 *   - `CorrectionGradientV0` は **別型隔離**で確定。`NextDayPriorAdjustment` を widen しない・再利用しない。
 *   - `NextDayPriorAdjustment` は **shape 参考のみ**（per-field+contextKey+direction+confidenceDelta の形）。
 *   - direction の値空間を**混ぜない**: level 系 axis の direction triad（'lower'|'match'|'higher'）は
 *     **net-new union**（値空間は UserCorrection.direction:99 と同形だが import 結合しない）。
 *     ※ NextDayPriorAdjustment.direction は 'raise'|'lower'（dayStateTypes.ts:139）であって triad ではない。
 *   - accept/reject 系 axis（route/deadline）は PRM `CorrectionVerdict` を verdict に載せる（import 流用）。
 *   - 過剰帰属禁止: 実 evidence のある axis にのみ confidenceDelta を載せる（basis に join 鍵 evidence 必須）。
 *
 * 不変条件: IO / RNG / now / Date / write を持たない。
 */
import type { CorrectionVerdict } from "@/lib/plan/reality/learning/memory-correction"; // type-only 流用（reinvent しない）

export const CORRECTION_GRADIENT_VERSION = 0;

/** 補正軸 6（duration/energy は既存に写像・残 4 は net-new vocab）。 */
export type CorrectionAxis = "duration" | "energy" | "prep" | "route" | "deadline" | "cognitiveLoad";

export const CORRECTION_AXES: ReadonlyArray<CorrectionAxis> = [
  "duration",
  "energy",
  "prep",
  "route",
  "deadline",
  "cognitiveLoad",
];

/**
 * level 系 axis 用 direction（**net-new union**・CEO #2: NextDayPriorAdjustment 'raise|lower' とは混ぜない）。
 * 値空間は UserCorrection.direction（dayStateTypes.ts:99）と同形だが、結合を避けるため RO-3 で独立定義。
 */
export type CorrectionDirection = "lower" | "match" | "higher";

/** level 系 axis = direction（triad）を使う / accept-reject 系 axis = verdict を使う。 */
const LEVEL_AXES: ReadonlySet<CorrectionAxis> = new Set<CorrectionAxis>(["duration", "energy", "cognitiveLoad", "prep"]);
const ACCEPT_REJECT_AXES: ReadonlySet<CorrectionAxis> = new Set<CorrectionAxis>(["route", "deadline"]);

export interface CorrectionGradientV0 {
  readonly axis: CorrectionAxis;
  /** scope（NextDayPriorAdjustment.contextKey:138 の shape 参考・'<shift>|<density>' pipe 形式）。 */
  readonly contextKey: string;
  /** level 系 axis の channel（triad）。accept/reject 系では中立 'match' を入れ verdict を主 channel にする。 */
  readonly direction: CorrectionDirection;
  /** gradient magnitude channel（NextDayPriorAdjustment.confidenceDelta の shape 参考）。 */
  readonly confidenceDelta: number;
  /** accept/reject 系 axis の channel（PRM CorrectionVerdict 流用）。level 系は null。 */
  readonly verdict: CorrectionVerdict | null;
  /** join 鍵 evidence（必須・捏造で全 axis に薄く撒かない＝過剰帰属防止）。 */
  readonly basis: ReadonlyArray<string>;
}

/**
 * mapToExistingAxis — energy/duration は既存 field に透明写像、残 4 は net-new（null）。
 *   energy ≈ energyLevel（DayState EstimateFieldKey）/ duration ≈ durationBucket（dry-run-aggregation.ts:30・PRM 正本ではない）。
 *   prep/route/deadline/cognitiveLoad は既存 correction 軸に無い net-new vocab（null を返し「既存軸」と偽らない）。
 */
export function mapToExistingAxis(axis: CorrectionAxis): string | null {
  switch (axis) {
    case "energy":
      return "energyLevel"; // DayStateEstimates の既存 field
    case "duration":
      return "durationBucket"; // dry-run-aggregation.ts:30 の ContextDimension（PRM 正本ではない）
    default:
      return null; // net-new vocab（既存軸と偽らない）
  }
}

/** 1 axis 分の補正証拠（evidence のある axis のみ caller が渡す＝過剰帰属を入力段で防ぐ）。 */
export interface AxisCorrectionEvidenceV0 {
  readonly axis: CorrectionAxis;
  /** level 系 axis 用。accept/reject 系では無視（'match' 既定）。 */
  readonly direction?: CorrectionDirection;
  /** accept/reject 系 axis 用。level 系では無視（null）。 */
  readonly verdict?: CorrectionVerdict;
  readonly magnitude: number; // confidenceDelta に載る量
  readonly evidenceRefs: ReadonlyArray<string>; // 空は不可（basis 必須）
}

export interface DecomposeCorrectionInputV0 {
  readonly contextKey: string; // '<shift>|<density>'
  readonly axisEvidence: ReadonlyArray<AxisCorrectionEvidenceV0>;
}

/**
 * decomposeCorrection — 拒否/修正を axis 別 CorrectionGradientV0 に分解（pure）。
 *   実 evidence のある axis にのみ confidenceDelta を載せる（evidenceRefs 空は skip＝捏造しない）。
 *   direction の値空間を axis 起源で分岐: level 系=triad / accept-reject 系=verdict（direction は中立 'match'）。
 */
export function decomposeCorrection(input: DecomposeCorrectionInputV0): CorrectionGradientV0[] {
  const out: CorrectionGradientV0[] = [];
  for (const e of input.axisEvidence) {
    if (e.evidenceRefs.length === 0) continue; // basis なし axis には触らない（過剰帰属禁止）
    const isLevel = LEVEL_AXES.has(e.axis);
    const isAcceptReject = ACCEPT_REJECT_AXES.has(e.axis);
    const direction: CorrectionDirection = isLevel ? e.direction ?? "match" : "match";
    const verdict: CorrectionVerdict | null = isAcceptReject ? e.verdict ?? null : null;
    out.push({
      axis: e.axis,
      contextKey: input.contextKey,
      direction,
      confidenceDelta: e.magnitude,
      verdict,
      basis: e.evidenceRefs,
    });
  }
  return out;
}

/** INV: CorrectionGradient の不変条件（空=適合・throw しない）。 */
export function correctionGradientViolations(g: CorrectionGradientV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`correctionGradient: ${m}`);
  if (!CORRECTION_AXES.includes(g.axis)) push(`未知の axis（"${g.axis}"）`);
  if (g.basis.length === 0) push("basis（join 鍵 evidence）が空＝過剰帰属（実 evidence なしに confidenceDelta を載せた疑い）");
  // axis 起源で direction/verdict の使い分けを検証（値空間を混ぜない）
  if (ACCEPT_REJECT_AXES.has(g.axis)) {
    if (g.verdict === null) push(`accept/reject 系 axis（${g.axis}）は verdict（CorrectionVerdict）を要する`);
  } else if (LEVEL_AXES.has(g.axis)) {
    if (g.verdict !== null) push(`level 系 axis（${g.axis}）は verdict を持たない（direction triad が channel）`);
  }
  return out;
}
