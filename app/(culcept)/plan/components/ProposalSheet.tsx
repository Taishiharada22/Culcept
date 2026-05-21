"use client";

/**
 * ProposalSheet — 複数 proposal を Memory Chip スタイルで縦並びに表示する container。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-2 / §10.1 Smoke 2
 *
 * 視覚 spec:
 *   - 縦並び flex、 gap 8px
 *   - 通知 banner ではなく 「Memory 群」 として subtle 背景
 *   - 警告色 / drop-shadow 禁止
 *
 * a11y:
 *   - role="region" aria-label="提案"
 *   - 各 ProposalChip が独立 navigable
 *
 * Phase 3-J-2 範囲制限:
 *   - 並び順は caller 制御 (= sheet は順序を変えない)
 *   - 採用 / 修正は J-4 / J-5
 *   - 無視は onProposalDismiss callback を J-3 で接続
 *
 * 不変原則:
 *   - Invariant 42 Memory Chip Style (= 通知 metaphor 禁止)
 *   - Invariant 49 DayGraph Layer Integration (= 既存 component を mutate しない)
 */

import { ProposalChip } from "./ProposalChip";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProposalSheetProps {
  /** 表示 proposal 配列 (= 順序は caller 責任) */
  proposals: ReadonlyArray<ProposedAnchor>;
  /** ProposalId → template variables map */
  variablesByProposal: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Chip tap (= J-4 accept / J-5 modify 接続点) */
  onProposalTap?: (proposal: ProposedAnchor) => void;
  /** Chip 「無視」 tap (= J-3 dismiss path) */
  onProposalDismiss?: (proposal: ProposedAnchor) => void;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ProposalSheet({
  proposals,
  variablesByProposal,
  onProposalTap,
  onProposalDismiss,
  className,
}: ProposalSheetProps) {
  if (proposals.length === 0) return null;

  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-2xl bg-white/30 p-3",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label="提案"
      data-testid="plan-proposal-sheet"
    >
      {proposals.map((p) => (
        <ProposalChip
          key={p.id}
          proposal={p}
          variables={variablesByProposal[p.id] ?? {}}
          onTap={onProposalTap}
          onDismiss={onProposalDismiss}
        />
      ))}
    </div>
  );
}
