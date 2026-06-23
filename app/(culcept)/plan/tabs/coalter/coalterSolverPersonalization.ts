/**
 * C6-B — ペア軸 → solver intent 導出（**pure・決定論・捏造ゼロ**）
 *
 * 役割: self / partner の観測軸（PersonalizationSnapshot）を derive し、既存 solver
 *   `generateTravelItineraries` の入力 `intentOutput` を **ペアの性格で上書き**する override を作る。
 *   これにより「完全パーソナライズ」＝**行程がペアの性格で変わる**を実現する。
 *
 * 集約原則（学術 least-misery・カップル研究）:
 *   - pace は **遅い側に合わせる**（疲れやすい側の床を守る＝両者ほどほどが満足を支配）。
 *   - 予算は **倹約側に寄せる**（金銭の不安側を守る）。
 *   - 同行密度は社交耐性から（両者社交的→終日一緒 / 両者内向→各自時間多め / 混在→主に一緒）。
 *
 * 厳守（honesty）:
 *   - **derived ∧ confidence≥floor の軸のみ**で override。非 confident → その項目は出さず base 維持。
 *   - 出力は **粗いカテゴリ/レベル**（fatigue level 1-5 / togetherness enum / budget hint）。
 *     raw axis score は出さない。solver 入力であり UI に raw 値を出さない。
 *   - DB / fetch / Date.now なし。入力 snapshot の demo/実データ区別は caller 管理。
 */

import { derivePlanParams } from "@/lib/shared/personalization/derive";
import type { DerivedValue, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type {
  TravelFatigueSignalSnapshot,
  TravelPairTogetherness,
  TravelBudgetHint,
} from "@/lib/coalter/travel/intent";
import type { TravelFatigueLevel } from "@/lib/coalter/travel/types";

const CONFIDENCE_FLOOR = 0.3;

export interface CoAlterSolverIntentOverride {
  /** 希望する負荷レベル（1-5・ペースから）。 */
  fatigueSignals?: TravelFatigueSignalSnapshot;
  /** 同行密度（社交耐性から）。 */
  pairTogethernessOverride?: TravelPairTogetherness;
  /** 予算ヒント（予算姿勢から）。 */
  budgetSignals?: TravelBudgetHint[];
  /** 1 日の詰め込み上限（低=ゆったり）。 */
  cognitiveLoadCeilingPerDay?: number;
}

type Pace = "slow" | "normal" | "intense";
const PACE_RANK: Record<Pace, number> = { slow: 0, normal: 1, intense: 2 };

function usableEnum<T extends string>(d: DerivedValue<T>): T | null {
  return d.source === "derived" && d.confidence >= CONFIDENCE_FLOOR ? d.value : null;
}
function usableUnit(d: DerivedValue<number>): number | null {
  return d.source === "derived" && d.confidence >= CONFIDENCE_FLOOR ? d.value : null;
}

/** 2 つの pace のうち**遅い側**（least-misery）。両方 null → null。 */
function slowerPace(a: Pace | null, b: Pace | null): Pace | null {
  if (a && b) return PACE_RANK[a] <= PACE_RANK[b] ? a : b;
  return a ?? b;
}

/**
 * self / partner snapshot → solver intent override。決定論・副作用なし。
 *   confident に語れる軸だけ override（他は undefined＝base 維持）。
 */
export function buildCoAlterSolverIntentOverride(
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
): CoAlterSolverIntentOverride {
  const sp = derivePlanParams(self);
  const pp = derivePlanParams(partner);
  const out: CoAlterSolverIntentOverride = {};

  // ── pace（遅い側に合わせる）→ fatigueLevel + cognitiveLoadCeiling ──
  const pace = slowerPace(usableEnum<Pace>(sp.paceDefault), usableEnum<Pace>(pp.paceDefault));
  if (pace) {
    const level: TravelFatigueLevel = pace === "slow" ? 2 : pace === "intense" ? 4 : 3;
    out.fatigueSignals = { transitFatigue: level, onSiteFatigue: level, combined: level };
    // ゆったり=詰め込み上限を下げる / 活動的=上げる（既定 5）。
    out.cognitiveLoadCeilingPerDay = pace === "slow" ? 3 : pace === "intense" ? 6 : 5;
  }

  // ── 社交耐性（both 高→終日一緒 / both 低→各自多め / 混在→主に一緒）──
  const ss = usableUnit(sp.socialLoadTolerance);
  const ps = usableUnit(pp.socialLoadTolerance);
  if (ss !== null && ps !== null) {
    if (ss >= 0.6 && ps >= 0.6) out.pairTogethernessOverride = "together_all_time";
    else if (ss < 0.4 && ps < 0.4) out.pairTogethernessOverride = "flexible_split";
    else out.pairTogethernessOverride = "together_main_separate_some";
  }

  // ── 予算姿勢（倹約側に寄せる）──
  const sb = usableEnum<"save" | "balanced" | "quality">(sp.budgetPosture);
  const pb = usableEnum<"save" | "balanced" | "quality">(pp.budgetPosture);
  if (sb || pb) {
    if (sb === "save" || pb === "save") out.budgetSignals = ["tight"];
    else if (sb === "quality" && pb === "quality") out.budgetSignals = ["ample"];
    else out.budgetSignals = ["moderate"];
  }

  return out;
}

/**
 * 2 つの intent override を **conservative に merge**（least-misery）。
 *   fatigue/ceiling は **低い方**（より控えめ）、budget は **tight 優先**、togetherness は a を優先。
 *   P3（後悔台帳）の reduce 系を personalization に重ねる用途。
 */
export function mergeIntentOverridesConservative(
  a: CoAlterSolverIntentOverride,
  b: CoAlterSolverIntentOverride,
): CoAlterSolverIntentOverride {
  const out: CoAlterSolverIntentOverride = {};

  const aFat = a.fatigueSignals?.combined;
  const bFat = b.fatigueSignals?.combined;
  // min of two TravelFatigueLevel is itself a valid level（TS は number へ widen するので cast）。
  const fat = (aFat !== undefined && bFat !== undefined ? Math.min(aFat, bFat) : (aFat ?? bFat)) as
    | TravelFatigueLevel
    | undefined;
  if (fat !== undefined) out.fatigueSignals = { transitFatigue: fat, onSiteFatigue: fat, combined: fat };

  const aCeil = a.cognitiveLoadCeilingPerDay;
  const bCeil = b.cognitiveLoadCeilingPerDay;
  const ceil = aCeil !== undefined && bCeil !== undefined ? Math.min(aCeil, bCeil) : (aCeil ?? bCeil);
  if (ceil !== undefined) out.cognitiveLoadCeilingPerDay = ceil;

  const budgets = [...(a.budgetSignals ?? []), ...(b.budgetSignals ?? [])];
  if (budgets.includes("tight")) out.budgetSignals = ["tight"];
  else if (budgets.length > 0) out.budgetSignals = a.budgetSignals ?? b.budgetSignals;

  if (a.pairTogethernessOverride) out.pairTogethernessOverride = a.pairTogethernessOverride;
  else if (b.pairTogethernessOverride) out.pairTogethernessOverride = b.pairTogethernessOverride;

  return out;
}
