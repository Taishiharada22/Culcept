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
  RankedCandidate,
  RelationshipContext,
} from "./types";
import {
  buildProposalCandidates,
  buildPriorities,
  buildReasoning,
  buildSummary,
  buildClosing,
} from "./narrationBuilder";

export interface NarrationInput {
  ranked: RankedCandidate[];
  brief: ConversationBrief;
  profileA: CoAlterPersonProfile;
  profileB: CoAlterPersonProfile;
  relationship: RelationshipContext;
}

/**
 * Logic-only 完全 ProposalCard を組み立てる。
 *
 * narrationEnricher が呼ばれない / 失敗したときに最終品として返る。
 */
export function buildNarrationFromLogic(input: NarrationInput): ProposalCard {
  const { ranked, brief, profileA, profileB } = input;

  const candidates = buildProposalCandidates(ranked);
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
