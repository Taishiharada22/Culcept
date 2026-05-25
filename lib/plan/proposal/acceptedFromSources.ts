/**
 * Accepted Proposal Suppression from Source Trace — Phase 3-J-6e-3 補正 2。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / J-6e-3 detailed plan §2 (CEO 補正 2: reload-safe suppression)
 *
 * 役割:
 *   accept 経由で作られた anchor の source.notes には `"alter-proposal:${proposalId}"` prefix が入る (= J-4 trace)。
 *   page reload 後、 PlanClient は fetchAnchors で sources を取得。 sources.notes から
 *   proposalId を抽出 → 「accept 済み proposal」 として suppression set 化 → filter で chip 抑制。
 *
 *   これにより:
 *   - 新 localStorage key 不要
 *   - DB migration 不要
 *   - J-4 trace を再利用
 *   - reload 後の同 proposal 重複表示 防止
 *
 * 不変原則:
 *   - pure (= 副作用 / mutate なし)
 *   - localStorage 直接 access しない (= sources は state 経由)
 *   - Invariant 17 Internal data disclosure only (= 抽出した proposalId は internal、 UI 露出禁止)
 */

import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";

import { extractProposalIdFromNotes } from "./acceptProposal";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Extractor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * sources の notes から alter-proposal: prefix を持つ proposalId 集合を抽出。
 *
 * 規約:
 *   - 同 proposalId が複数 source に存在しても 1 entry (= Set 性質)
 *   - notes 不在 / prefix 不一致の source は skip (= 「manual」 / 「pdf」 等の通常 source)
 *   - 抽出した proposalId は **internal only**、 UI 露出禁止 (= displayProposalAwareNotes 経由のみ表示)
 *
 * 戻り値:
 *   - sources 空 → 空 Set
 *   - 該当 source なし → 空 Set
 *   - 該当あり → 該当 proposalId の Set
 *
 * 計算量: O(N)、 N = sources 数 (通常 < 100、 軽量)
 */
export function extractAcceptedProposalIdsFromSources(
  sources: ReadonlyArray<ExternalAnchorSource>,
): Set<string> {
  const set = new Set<string>();
  for (const source of sources) {
    const id = extractProposalIdFromNotes(source.notes);
    if (id != null) set.add(id);
  }
  return set;
}
