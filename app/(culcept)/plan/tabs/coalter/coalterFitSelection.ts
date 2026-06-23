/**
 * C6-C — 性格 fit による entity 選別（**pure・既存 evaluateFit を使用・無改修**）
 *
 * 役割: demo entity catalog（TravelObjectState[]）を T11 `evaluateFitBatch` でペアの性格に対して
 *   スコアし、**不適合（poor/blocked）を落として fit 順に並べる**。結果は「性格→どの場所が合うか」。
 *   この出力を後段（C6-D）で solver seeds へ変換する。
 *
 * honesty:
 *   - 判定は既存 evaluateFit（無改修）。閾値（既定 stretch 以上＝poor/blocked 除外）は非 opaque。
 *   - raw score は出さず EntityFitGrade（excellent/good/stretch）と placeRefId のみ。
 */

import { evaluateFitBatch } from "@/lib/shared/travel/fit-core";
import type { EntityFitGrade, FitContext, FitSubject, TravelObjectState } from "@/lib/shared/travel/fit-types";

const GRADE_RANK: Record<EntityFitGrade, number> = {
  excellent: 4,
  good: 3,
  stretch: 2,
  poor: 1,
  blocked: 0,
};

export interface FittingEntity {
  placeRefId: string;
  grade: EntityFitGrade;
  entity: TravelObjectState;
}

/**
 * catalog をペア性格で評価し、minGrade 以上を fit 降順で返す。
 *   @param minGrade 既定 "stretch"（poor/blocked を除外＝明確に合わないものだけ落とす）。
 */
export function selectFittingEntities(
  entities: TravelObjectState[],
  subject: FitSubject,
  context: FitContext,
  minGrade: EntityFitGrade = "stretch",
): FittingEntity[] {
  const floor = GRADE_RANK[minGrade];
  const results = evaluateFitBatch(entities, subject, context);
  const byId = new Map(entities.map((e) => [e.placeRefId, e]));
  return results
    .map((r) => ({ placeRefId: r.placeRefId, grade: r.fitLabel, entity: byId.get(r.placeRefId)! }))
    .filter((x) => x.entity && GRADE_RANK[x.grade] >= floor)
    .sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade]);
}
