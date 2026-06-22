/**
 * lib/plan/postVisit/fitArcReadout.ts
 *   — 評価OS / Stage 1: Fit-Arc(Aneura-star) の readout を **観測から** 組む pure helper（dormant）
 *
 * ★これは「他者の平均品質(Q_p)」でなく「この人・この目的・この状態への適合(I_{u,p})」の readout。
 * ★観測がある時だけ意味を持つ。**観測ゼロでは断定しない**（empty・「推測しません」）。少数は dashed・仮説。
 * ★confidence を **アークの形** で表す: solid=観測あり / dashed=仮説 / empty=観測不足。evidence 件数は常に同伴。
 * ★ranking/推薦には一切影響しない（表示専用の readout）。
 * ★pure: Date/network/DB なし。入力は Stage 0 の local 観測のみ。
 */
import type { PostVisitObservation, PostVisitResponse } from "./postVisitObservation";

/** ★flag（dormant・default OFF・production hard block）。OFF で UI は null＝DOM 不変。 */
export const FIT_ARC_READOUT_ENABLED = false;
export function isFitArcReadoutEnabled(): boolean {
  return FIT_ARC_READOUT_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

export type FitArcState = "insufficient" | "tentative" | "observed";
export type FitArcStyle = "empty" | "dashed" | "solid";

/** 1-2 件 = tentative(dashed)、>=3 件 = observed(solid)。0 件 = insufficient(empty)。 */
export const FIT_ARC_TENTATIVE_MIN = 1;
export const FIT_ARC_OBSERVED_MIN = 3;

/** 回答 → 適合値（0..1）。★これは「あなたの答え合わせ」由来であり、他者評価でない。 */
const RESPONSE_FIT: Record<PostVisitResponse, number> = {
  keep: 1.0,
  conditional: 0.6,
  not_today: 0.35,
  no_more: 0.0,
};

export interface FitArcReadout {
  readonly state: FitArcState;
  readonly arcStyle: FitArcStyle;
  /** 0..1 の適合。**観測不足では null（値を出さない＝断定しない）**。 */
  readonly fillRatio: number | null;
  /** round(fillRatio*100)。観測不足では null。 */
  readonly fillPercent: number | null;
  /** ★evidence 件数（= 回答済み観測数）。常に同伴・UI から削れない。 */
  readonly observationCount: number;
  /** state ごとの honest 文（断定しない）。 */
  readonly label: string;
  /** 何の適合かの一言（他者平均でなく本人適合であることを明示）。 */
  readonly subtitle: string;
  /** observed 以外は常に仮説。 */
  readonly tentative: boolean;
}

/**
 * 観測群 → Fit-Arc readout（pure）。caller は対象（placeKey/lens/state）で filter 済みの観測を渡す。
 *   - 回答済み観測 0 → insufficient（empty・値なし・「推測しません」）
 *   - 1-2 → tentative（dashed・値は出すが「まだ仮説」）
 *   - >=3 → observed（solid・「あなたの観測 N 件から」）
 *   - fillRatio は回答済みのみで平均（未回答=null は適合に寄与させない）
 */
export function buildFitArcReadout(observations: readonly PostVisitObservation[]): FitArcReadout {
  const answered = observations.filter(
    (o): o is PostVisitObservation & { response: PostVisitResponse } => o.response != null,
  );
  const count = answered.length;
  const subtitle = "あなたへの適合"; // ★他者平均でなく本人適合

  if (count < FIT_ARC_TENTATIVE_MIN) {
    return {
      state: "insufficient", arcStyle: "empty",
      fillRatio: null, fillPercent: null, observationCount: count,
      label: "まだ観測不足（推測しません）", subtitle, tentative: true,
    };
  }

  const fillRatio = answered.reduce((s, o) => s + RESPONSE_FIT[o.response], 0) / count;
  const fillPercent = Math.round(fillRatio * 100);

  if (count < FIT_ARC_OBSERVED_MIN) {
    return {
      state: "tentative", arcStyle: "dashed",
      fillRatio, fillPercent, observationCount: count,
      label: `観測 ${count} 件・まだ仮説です`, subtitle, tentative: true,
    };
  }
  return {
    state: "observed", arcStyle: "solid",
    fillRatio, fillPercent, observationCount: count,
    label: `あなたの観測 ${count} 件から`, subtitle, tentative: false,
  };
}
