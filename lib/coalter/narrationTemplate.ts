/**
 * CoAlter Layer 3c: Narration Template (logic-only full card)
 *
 * LLM が失敗 / タイムアウトしたときでも **品質を落とさず** 提案カードを返す路線。
 * narrationBuilder の各 builder を統合するだけの薄い層だが、
 * 「LLM 無しでも完全に成立する」ことを契約として明示する。
 *
 * CEO 方針: 「品質は絶対に落としません」
 * → template = degraded ではない。事実ベースの本文を logic で直接組み立てる。
 */

import type {
  ConversationBrief,
  CoAlterPersonProfile,
  ProposalCard,
  RankedAlternative,
  RankedCandidate,
  RelationshipContext,
  SearchCandidate,
} from "./types";
import {
  buildProposalCandidates,
  buildPriorities,
  buildReasoning,
  buildSummary,
  buildClosing,
  buildCandidateDetail,
} from "./narrationBuilder";

export interface NarrationInput {
  ranked: RankedCandidate[];
  brief: ConversationBrief;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  relationship: RelationshipContext;
  /** Phase A: bottom sheet 用の alternatives プール (上限 2) */
  alternatives?: RankedAlternative[];
  /** Phase A: URL / booking / sources 解決用の生 search 結果 */
  searchCandidates?: SearchCandidate[];
}

/**
 * Logic-only 完全 ProposalCard を組み立てる。
 *
 * narrationEnricher が呼ばれない / 失敗したときに最終品として返る。
 */
export function buildNarrationFromLogic(input: NarrationInput): ProposalCard {
  const { ranked, brief, profileA, profileB } = input;
  const alternatives = input.alternatives ?? [];
  const searchCandidates = input.searchCandidates ?? [];

  const baseCandidates = buildProposalCandidates(ranked);

  // Phase A (2026-04-18): 各 candidate に detail (bottom sheet 用) を attach
  const candidates = baseCandidates.map((cand, i) => {
    const rc = ranked[i];
    if (!rc) return cand;
    const detail = buildCandidateDetail({
      candidate: rc,
      alternatives,
      searchCandidates,
      brief,
    });
    return { ...cand, detail };
  });

  const summary = buildSummary(brief, ranked);
  const priorities = buildPriorities(ranked, brief, profileA, profileB);
  const reasoning = buildReasoning(ranked, brief);
  const closing = buildClosing();

  return {
    summary,
    priorities,
    candidates,
    reasoning,
    closing,
    theme: "movie",
  };
}
