/**
 * T11-B(CoAlter) — CoAlter cue dev preview **fixture**（既存 projection fixture を再利用）。
 *
 * 役割: 既存 `FIXTURE_TRAVEL_PROJECTION`（dev-travel-projection）を base に、**実 helper**
 *   `deriveCoAlterProjectionCues` を通して `CoAlterProjectionCue[]` を得る。
 *   → preview は「CoAlter が projection から何を cue 化するか」を read-only で観測する（runtime 非実行）。
 *
 * 厳守: 入力は `PlanIntelligenceProjection` のみ（authoritative packet / raw FitResult / diagnostics 非使用）。
 *   cue は display-only（execute/book/schedule/send を含まない）。
 *
 * 全 5 cue action を網羅するため、既存 fixture（fitAdvisory=risk あり 1 件 → note_risk）に
 *   risk なし 1 件（→ explain_plan）を additive 追加する（既存 fixture は不変・spread コピー）。
 */

import { FIXTURE_TRAVEL_PROJECTION } from "../dev-travel-projection/fixture";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import type { CoAlterProjectionCue } from "@/lib/shared/travel/coalter-projection-consume-types";
import type { PlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection-types";

/** 既存 projection を base に explain_plan 用の risk なし fitAdvisory を 1 件足した cue 用 projection。 */
const PROJECTION_FOR_CUES: PlanIntelligenceProjection = {
  ...FIXTURE_TRAVEL_PROJECTION,
  fitAdvisory: [
    ...FIXTURE_TRAVEL_PROJECTION.fitAdvisory, // proposal:relaxed（riskCodes あり → note_risk）
    { candidateId: "proposal:culture", grade: "excellent", labelCap: null, labelStability: "stable", confidenceBand: "high", mismatchCount: 0, riskCodes: [], missingFields: [] }, // risk なし → explain_plan
  ],
};

/** 実 helper を通した fixture cues（preview が表示する read-only object）。 */
export const FIXTURE_COALTER_CUES: CoAlterProjectionCue[] = deriveCoAlterProjectionCues(PROJECTION_FOR_CUES);
