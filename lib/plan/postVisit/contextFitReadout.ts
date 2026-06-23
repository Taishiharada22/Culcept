/**
 * lib/plan/postVisit/contextFitReadout.ts
 *   — 評価OS / Stage 4-B（②-1）: 文脈条件付き Fit readout（pure・**shadow / UI 非配線**）
 *
 * ★狙い: 「この場所への適合」を **状態・文脈で条件付け**して読む（例: gap<30 ∧ 一人 のときの適合）。
 *   複合融合エンジンへ向かう最初の pure 層。新エンジン不要＝既存 buildFitArcReadout を condition で filter してラップ。
 * ★false-aliveness 封じ込め: これは **shadow（計算のみ）**。UI には配線しない。観測ゼロ/薄い条件は insufficient を返すだけ。
 *   weather/fatigue/mobilityLoad は live signal 未配線（buildContextSnapshotFromAnchor が null）→ それらの条件は永久 insufficient（捏造しない）。
 * ★pure: I/O なし・Date 不使用。ranking/推薦に一切影響しない（読むだけ・順位を変えない）。
 */
import type { PostVisitObservation } from "./postVisitObservation";
import { hasContextSnapshot } from "./postVisitObservation";
import type { PostVisitContextSnapshot } from "./postVisitContext";
import { buildFitArcReadout, type FitArcReadout } from "./fitArcReadout";

/** 条件 = contextSnapshot の部分集合（指定した bucket 軸だけ一致を要求・null/未指定は無視）。 */
export type ContextFitCondition = Partial<
  Pick<PostVisitContextSnapshot, "timeOfDay" | "dayType" | "gapBucket" | "weatherKind" | "fatigue" | "companion" | "mobilityLoad" | "locationCategory">
>;

/** 観測が condition に一致するか（contextSnapshot 必須・指定軸が全て一致）。 */
export function observationMatchesCondition(o: PostVisitObservation, condition: ContextFitCondition): boolean {
  if (!hasContextSnapshot(o)) return false; // 文脈なし観測は条件付けに使えない
  const cs = o.contextSnapshot;
  for (const k of Object.keys(condition) as (keyof ContextFitCondition)[]) {
    const want = condition[k];
    if (want == null) continue; // 未指定軸は無視
    if (cs[k] !== want) return false;
  }
  return true;
}

export interface ContextFitReadout {
  /** 評価した条件（空 = 無条件＝buildFitArcReadout 相当）。 */
  readonly condition: ContextFitCondition;
  /** 条件に一致した観測の readout（insufficient/tentative/observed）。 */
  readonly readout: FitArcReadout;
  /** 条件一致した観測総数（未回答含む）。 */
  readonly matchedCount: number;
}

/**
 * 文脈条件付き Fit readout（pure・shadow）。
 *   caller は placeKey で filter 済みの観測を渡す（または全観測）。condition で更に絞って readout を組む。
 *   薄い条件は readout.state=insufficient（断定しない）。
 */
export function buildContextFitReadout(
  observations: readonly PostVisitObservation[],
  condition: ContextFitCondition = {},
): ContextFitReadout {
  const matched = observations.filter((o) => observationMatchesCondition(o, condition));
  return {
    condition,
    readout: buildFitArcReadout(matched),
    matchedCount: matched.length,
  };
}

/** 条件付けに使える軸（live で populate される軸のみ＝意味を持つ条件セルの母集合）。 */
const LIVE_CONDITION_AXES = ["timeOfDay", "dayType", "gapBucket", "companion", "locationCategory"] as const;
/** weather/fatigue/mobilityLoad は signal 未配線で常時 null＝条件にしても永久 insufficient（dormant・誇張回避）。 */
export const DORMANT_CONDITION_AXES = ["weatherKind", "fatigue", "mobilityLoad"] as const;

export interface ContextFitCell {
  readonly axis: (typeof LIVE_CONDITION_AXES)[number];
  readonly value: string;
  readonly matchedCount: number;
  readonly state: FitArcReadout["state"];
}

/**
 * 観測群から「意味を持つ条件セル」を列挙（pure・shadow）。
 *   live 軸の値ごとに 1 軸条件で readout を組み、tentative 以上（観測あり）のセルだけ返す。
 *   ＝「どの状態のときに適合の手応えが出ているか」を shadow で可視化する素地（Stage 4-B UI/4-C 学習が将来 consume）。
 */
export function listContextFitCells(observations: readonly PostVisitObservation[]): ContextFitCell[] {
  const cells: ContextFitCell[] = [];
  for (const axis of LIVE_CONDITION_AXES) {
    const values = new Set<string>();
    for (const o of observations) {
      if (!hasContextSnapshot(o)) continue;
      const v = o.contextSnapshot[axis];
      if (v != null) values.add(v);
    }
    for (const value of values) {
      const r = buildContextFitReadout(observations, { [axis]: value } as ContextFitCondition);
      if (r.readout.state !== "insufficient") {
        cells.push({ axis, value, matchedCount: r.matchedCount, state: r.readout.state });
      }
    }
  }
  // observed を優先、その中で件数降順で安定
  return cells.sort((a, b) => {
    const rank = (s: FitArcReadout["state"]) => (s === "observed" ? 0 : 1);
    return rank(a.state) - rank(b.state) || b.matchedCount - a.matchedCount;
  });
}
