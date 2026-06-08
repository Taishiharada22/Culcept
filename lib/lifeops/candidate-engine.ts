/**
 * Life Ops L-3 — Candidate Engine（**pure 部分のみ**・no-DB・no-external-API・no-UI・barrel 非 export）
 *
 * 設計: docs/life-ops-l3-candidate-engine-mini-design.md（CEO 監査承認 2026-06-09）/ §4 統合契約 / category-model(L-1) / cadence-model(L-2)
 *
 * 役割: cadence observation（注入）→ L-2 経過段階 → **beyond_typical 以上**を `LifeOpsCandidate[]`（§4）に組む pure engine。
 *   ＝周期由来の「そろそろ整えどきの候補」を生成し **返す**だけ（横 R2 が配置・window 確定・3 案化／R4 が trigger）。
 *   共通候補型は `candidate-types.ts` に集約（L-4 と共有・循環回避）。本 file はそれを re-export（既存 import 後方互換）。
 *
 * 厳守（CEO 承認スコープ）:
 *   - **pure・deterministic**: Date.now/argless Date 不使用・`nowISO` 注入。**新規データ収集なし**（observation は注入）。
 *   - 候補化は **beyond_typical / well_beyond のみ**（控えめ・CEO 承認）。unknown/within_typical/nearing は出さない（断定しない）。
 *     ※ nearing のイベント前倒しは L-4（event-preparation）の領分。
 *   - dueReason は **cycle のみ**（event 根拠は L-4・場所/配置は横 R2）。「行け」を持たない。
 *   - **横エンジン（lib/plan/reality/*）非 import**。R2 受け渡し・実データ源は別 slice。
 */

import { getCategorySpec } from "./category-model";
import { getCadenceSpec, computeCadenceStatus, type CadencePhase } from "./cadence-model";
import { dueReasonPhase, type CadenceObservation, type LifeOpsCandidate } from "./candidate-types";

// 共通候補型を re-export（既存 import の後方互換・§4 seam 型は candidate-types が正本）
export type {
  CadenceObservation,
  CycleDueReason,
  EventPrepDueReason,
  DueReason,
  LifeOpsCandidate,
  EventKind,
} from "./candidate-types";

/** 候補化対象 phase（CEO 承認: beyond_typical 以上・控えめ）。 */
const CANDIDATE_PHASES: ReadonlySet<CadencePhase> = new Set<CadencePhase>(["beyond_typical", "well_beyond"]);

/** 逼迫順位（well_beyond を先に）。 */
const PHASE_RANK: Record<string, number> = { well_beyond: 2, beyond_typical: 1 };

/** 経過比（ソート用・dueReason から再計算＝now を再利用しない）。cycle 以外は 0。 */
function urgencyRatio(c: LifeOpsCandidate): number {
  return c.dueReason.kind === "cycle" ? c.dueReason.elapsedDays / c.dueReason.typicalIntervalDays : 0;
}

/**
 * L-3: cadence observation[] → LifeOpsCandidate[]（pure・nowISO 注入）。
 *   beyond_typical 以上のみ候補化。MVP 外 cadence / L-1 未定義カテゴリ / unknown 段階 は skip。
 *   出力は逼迫順（well_beyond 先 → 同段階は経過比 降順・安定）。横 R2/R4 への受け渡しは別 slice。
 */
export function generateLifeOpsCandidates(
  observations: readonly CadenceObservation[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  const out: LifeOpsCandidate[] = [];
  for (const obs of observations) {
    const menu = obs.menu ?? null;
    const cadence = getCadenceSpec(obs.categoryId, menu);
    if (!cadence) continue; // MVP 外 cadence は出さない
    const status = computeCadenceStatus(cadence, obs.lastCompletedAtISO, nowISO);
    if (!CANDIDATE_PHASES.has(status.phase)) continue; // unknown/within/nearing は出さない（断定しない）
    if (status.elapsedDays === null) continue; // 防御（beyond なら non-null）
    const cat = getCategorySpec(obs.categoryId);
    if (!cat) continue; // L-1 未定義（防御）
    out.push({
      category: cat.id,
      menu,
      dueReason: { kind: "cycle", elapsedDays: status.elapsedDays, typicalIntervalDays: status.typicalIntervalDays, phase: status.phase },
      suggestedWindow: null,
      placeQuery: cat.placeQueryHint,
      permissionLevelHint: cat.defaultMaxLevelHint,
      riskFlags: cat.typicalRiskFlags,
    });
  }
  // 逼迫順（決定的・安定）: phase rank 降順 → 経過比 降順
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const r = (PHASE_RANK[dueReasonPhase(b.c.dueReason)] ?? 0) - (PHASE_RANK[dueReasonPhase(a.c.dueReason)] ?? 0);
      if (r !== 0) return r;
      const u = urgencyRatio(b.c) - urgencyRatio(a.c);
      return u !== 0 ? u : a.i - b.i; // 同点は元順（安定）
    })
    .map((x) => x.c);
}
