"use client";

/**
 * CoAlterCardDispatcher (Phase 6.C, 2026-04-19)
 *
 * 役割:
 *  - CoAlter Phase 2 の discriminated union (CoAlterCard) を受け取り、
 *    card.mode で分岐して対応する UI コンポーネントを描画する。
 *
 * 設計原則 (CEO 6.C 条件 #4):
 *  - **1 カード内で decision UI と negotiate/clarify UI を混ぜない**
 *  - decision は既存 CoAlterCard (ProposalCard + refine/reroll/swipe) をそのまま使う
 *  - negotiate は CoAlterNegotiateCard (候補 0 件許容、pieExpansion 中心)
 *  - clarify は CoAlterClarifyCard (候補を持たない、言い換え + 質問 0/1 問)
 *
 * 参照: docs/coalter-phase2-3mode-design.md §4.4 (UI dispatch)
 */

import type {
  CoAlterCard as CoAlterCardUnion,
  ProposalCandidate,
  AxisKey,
  AxisDelta,
  PendingAxisDeltas,
} from "@/lib/coalter/types";
import CoAlterDecisionCardView from "@/components/coalter/CoAlterCard";
import CoAlterNegotiateCard from "@/components/coalter/CoAlterNegotiateCard";
import CoAlterClarifyCard from "@/components/coalter/CoAlterClarifyCard";
import type { HandoffLogPayload } from "@/components/coalter/CoAlterCandidateDetailSheet";

interface Props {
  card: CoAlterCardUnion;
  onDismiss: () => void;

  // ─ decision 専用 props（negotiate/clarify では無視される）─
  onAdopt?: (candidate: ProposalCandidate) => void;
  onRefine?: () => void;
  pendingAxisDeltas?: PendingAxisDeltas;
  onAxisToggle?: (key: AxisKey, direction: AxisDelta) => void;
  onReroll?: () => void;
  onCloseRefine?: () => void;
  awaitingAnswer?: string | null;
  onAnswerInChat?: (question: string) => void;
  onCancelAwaiting?: () => void;
  onHandoffEvent?: (payload: HandoffLogPayload) => void;
}

export default function CoAlterCardDispatcher(props: Props) {
  const { card, onDismiss } = props;

  // ── card.mode による分岐 (discriminated union) ──
  switch (card.mode) {
    case "decision": {
      // DecisionCard は ProposalCard & { mode: "decision" } なので
      // そのまま CoAlterCard に渡せる（mode タグは無視される）。
      return (
        <CoAlterDecisionCardView
          proposal={card}
          onDismiss={onDismiss}
          onAdopt={props.onAdopt}
          onRefine={props.onRefine}
          pendingAxisDeltas={props.pendingAxisDeltas}
          onAxisToggle={props.onAxisToggle}
          onReroll={props.onReroll}
          onCloseRefine={props.onCloseRefine}
          awaitingAnswer={props.awaitingAnswer}
          onAnswerInChat={props.onAnswerInChat}
          onCancelAwaiting={props.onCancelAwaiting}
          onHandoffEvent={props.onHandoffEvent}
        />
      );
    }
    case "negotiate": {
      return (
        <CoAlterNegotiateCard
          card={card}
          onDismiss={onDismiss}
          onAdopt={props.onAdopt}
        />
      );
    }
    case "clarify": {
      return (
        <CoAlterClarifyCard
          card={card}
          onDismiss={onDismiss}
          onAnswerInChat={props.onAnswerInChat}
        />
      );
    }
    default: {
      // TypeScript exhaustiveness check
      const _never: never = card;
      void _never;
      return null;
    }
  }
}
