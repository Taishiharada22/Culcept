/**
 * Life Ops L-3 — Candidate Engine（**pure 部分のみ**・no-DB・no-external-API・no-UI・barrel 非 export）
 *
 * 設計: docs/life-ops-l3-candidate-engine-mini-design.md（CEO 監査承認 2026-06-09）/ §4 統合契約 / category-model(L-1) / cadence-model(L-2)
 *
 * 役割: cadence observation（注入）→ L-2 経過段階 → **beyond_typical 以上**を `LifeOpsCandidate[]`（§4）に組む pure engine。
 *   ＝「そろそろ整えどきの候補」を周期由来で生成するだけ。candidate を **返す**（横 R2 が配置・suggestedWindow 確定・3 案化／R4 が trigger）。
 *
 * 厳守（CEO 承認スコープ）:
 *   - **pure・deterministic**: Date.now/argless Date 不使用・`nowISO` 注入。**新規データ収集なし**（observation は注入）。
 *   - 候補化は **beyond_typical / well_beyond のみ**（控えめ・CEO 承認）。unknown/within_typical/nearing は出さない（履歴なしで急かさない・断定しない）。
 *   - dueReason は **cycle のみ**（event 根拠は L-4・場所/移動/配置は横 R2）。dueReason は事実（経過/標準/phase）で「行け」を持たない。
 *   - **横エンジン（lib/plan/reality/*）非 import**。R2 への受け渡し API・実データ源は **本 slice で作らない**（別 slice/調整）。
 *   - `LifeOpsCandidate` は §4 の縦⇄横 seam 型（Life Ops 所有）。`permissionLevelHint`＝L-1 hint（確定は L-7・命名で非正本明示）。
 */

import { getCategorySpec, type LifeOpsCategoryId, type LifeOpsDefaultMaxLevelHint, type LifeOpsRiskFlag } from "./category-model";
import { getCadenceSpec, computeCadenceStatus, type BeautyMenu, type CadencePhase } from "./cadence-model";

/** L-3 入力（注入）。「前回いつ完了したか」。loose 入力耐性で categoryId は string。 */
export interface CadenceObservation {
  readonly categoryId: string;
  readonly menu?: BeautyMenu | null;
  readonly lastCompletedAtISO: string | null;
}

/** 周期由来の due 根拠（**事実のみ**・「行くべき」を持たない）。event 根拠は L-4 が別途付与。 */
export interface CycleDueReason {
  readonly kind: "cycle";
  readonly elapsedDays: number;
  readonly typicalIntervalDays: number;
  readonly phase: CadencePhase;
}

/** §4 candidate（縦⇄横 seam・横が配置/trigger/場所解決する入力）。 */
export interface LifeOpsCandidate {
  readonly category: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly dueReason: CycleDueReason;
  readonly suggestedWindow: null; // L-3 は決めない（横 R2 が予定/移動から）。契約のため型保持
  readonly placeQuery: string | null;
  readonly permissionLevelHint: LifeOpsDefaultMaxLevelHint; // L-1 hint・確定は L-7
  readonly riskFlags: readonly LifeOpsRiskFlag[];
}

/** 候補化対象 phase（CEO 承認: beyond_typical 以上・控えめ）。 */
const CANDIDATE_PHASES: ReadonlySet<CadencePhase> = new Set<CadencePhase>(["beyond_typical", "well_beyond"]);

/** 逼迫順位（well_beyond を先に）。 */
const PHASE_RANK: Record<string, number> = { well_beyond: 2, beyond_typical: 1 };

/** 経過比（ソート用・dueReason から再計算＝now を再利用しない）。 */
function urgencyRatio(c: LifeOpsCandidate): number {
  return c.dueReason.elapsedDays / c.dueReason.typicalIntervalDays;
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
      const r = (PHASE_RANK[b.c.dueReason.phase] ?? 0) - (PHASE_RANK[a.c.dueReason.phase] ?? 0);
      if (r !== 0) return r;
      const u = urgencyRatio(b.c) - urgencyRatio(a.c);
      return u !== 0 ? u : a.i - b.i; // 同点は元順（安定）
    })
    .map((x) => x.c);
}
