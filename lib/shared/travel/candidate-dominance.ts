/**
 * B2-B — Candidate Dominance helper（pure・Pareto 半順序・advisory・未配線）
 *
 * 設計正本: docs/t11-travel-candidate-display-closeout-bundle2-design.md（PART2 §2.3/§2.6）
 *
 * 役割: `CandidateCollectionDraft` の core-types TravelCandidate.tradeoff から
 *   **Pareto 半順序 dominance** を計算し advisory overlay を返す。
 *
 * 厳守:
 *   - 入力 collection を **mutate / reorder しない**（entries は入力順）。
 *   - tradeoff（cost/distance/fatigue/experienceVariety）**のみ**使用。itinerary/route/cost から導出しない。
 *   - fitSummary / raw FitResult / private rationale(forParticipant) / forced_by_private_constraint を**読まない**。
 *   - CoAlter Pareto / compareProposals / decide / engine / evaluateFit / display を**呼ばない**。
 *   - **scalar score / rank 番号 / totalOrder を作らない**・accepted/final/権限を作らない。
 */

import type { CandidateCollectionDraft } from "./candidate-collection-draft-types";
import type { TradeoffProfile } from "./core-types";
import type {
  CandidateDominanceEntry,
  CandidateDominanceOverlay,
  TradeoffAxisDelta,
  TradeoffAxisRelation,
} from "./candidate-dominance-types";

/**
 * A が B を支配 ⟺ 全軸で A が no worse かつ 1 軸以上で strictly better。
 *   cost/distance/fatigue: 低い方が良い・experienceVariety: 高い方が良い。
 */
function dominates(a: TradeoffProfile, b: TradeoffProfile): boolean {
  const noWorse =
    a.cost <= b.cost && a.distance <= b.distance && a.fatigue <= b.fatigue && a.experienceVariety >= b.experienceVariety;
  if (!noWorse) return false;
  const strict =
    a.cost < b.cost || a.distance < b.distance || a.fatigue < b.fatigue || a.experienceVariety > b.experienceVariety;
  return strict;
}

/** self から見た 1 軸の関係（dir=lower は低い方が better・higher は高い方が better）。 */
function rel(self: number, other: number, dir: "lower" | "higher"): TradeoffAxisRelation {
  if (self === other) return "equal";
  const selfBetter = dir === "lower" ? self < other : self > other;
  return selfBetter ? "better" : "worse";
}

/**
 * CandidateCollectionDraft → CandidateDominanceOverlay（Pareto 半順序・advisory）。
 *   ★ reorder しない・scalar/rank を作らない・collection を変更しない。
 *   0 候補 → 空 overlay。1 候補 → frontier（paretoOptimal）。
 */
export function computeCandidateDominance(draft: CandidateCollectionDraft): CandidateDominanceOverlay {
  const candidates = draft && Array.isArray(draft.candidates) ? draft.candidates : [];

  const entries: CandidateDominanceEntry[] = candidates.map((c, i) => {
    // 自分を支配する候補（自分自身は除外・同値は支配でない）
    const dominators = candidates.filter((o, j) => j !== i && dominates(o.tradeoff, c.tradeoff));
    const dominatedBy = dominators.map((o) => o.candidateId);
    const axisDeltas: TradeoffAxisDelta[] = dominators.map((o) => ({
      versusCandidateId: o.candidateId,
      axes: {
        cost: rel(c.tradeoff.cost, o.tradeoff.cost, "lower"),
        distance: rel(c.tradeoff.distance, o.tradeoff.distance, "lower"),
        fatigue: rel(c.tradeoff.fatigue, o.tradeoff.fatigue, "lower"),
        experienceVariety: rel(c.tradeoff.experienceVariety, o.tradeoff.experienceVariety, "higher"),
      },
    }));
    const entry: CandidateDominanceEntry = {
      candidateId: c.candidateId,
      dominatedBy,
      paretoOptimal: dominatedBy.length === 0,
      ...(axisDeltas.length > 0 ? { axisDeltas } : {}),
    };
    return entry;
  });

  const paretoOptimalIds = entries.filter((e) => e.paretoOptimal).map((e) => e.candidateId);

  return {
    outcome: "candidate_dominance_overlay",
    serverOnly: true,
    authoritative: false,
    advisory: true,
    entries, // 入力順保持
    paretoOptimalIds,
  };
}
