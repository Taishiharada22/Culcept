"use client";

/**
 * ProposalChip — Memory Chip metaphor で表示する単一 proposal 提示 UI。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-2 / §7.3 Memory Chip spec / §10.5 Smoke 47-50
 *
 * 視覚 spec (= docs §7.3):
 *   - 境界線: dashed 1px slate-300 (= 「まだ実体ではない」)
 *   - 背景: 透過寄り (= 通知 感を避ける)
 *   - text: italic slate-500
 *   - 影: なし
 *   - hover: border 1px slate-400
 *   - 警告色禁止、 pulse / drop-shadow / banner 禁止
 *
 * a11y (= docs §7.10):
 *   - role="button" (= 操作可能時) or "group"
 *   - aria-label="提案: {title}" / "観測: {title}" (= intentional_break_observed)
 *   - keyboard: Enter / Space で活性化
 *   - prefers-reduced-motion: hover/transition は motion-reduce で抑制
 *
 * Phase 3-J-2 範囲制限:
 *   - accept path なし (= J-4)
 *   - modify path なし (= J-5)
 *   - dismiss は onDismiss callback を 提供 (= J-3 で path 実装、 ここは UI のみ)
 *   - DayGraph 接続なし (= K)
 *
 * 不変原則:
 *   - Invariant 10 anchor を mutate しない (= 本 UI は read-only + callback)
 *   - Invariant 39 No Penalty for Ignore (= dismiss 履歴の集計表示なし)
 *   - Invariant 42 Memory Chip Style (= 通知 metaphor 禁止)
 */

import { useMemo } from "react";

import { runtimeNoAiSubjectCheck } from "@/lib/plan/proposal/copy/noAiSubjectRuntimeCheck";
import {
  getProposalCopyTemplate,
  renderProposalCopy,
} from "@/lib/plan/proposal/copy/proposalCopy";
import type { ProposedAnchor } from "@/lib/plan/proposal/proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProposalChipProps {
  /** 表示対象 proposal */
  proposal: ProposedAnchor;
  /** Template placeholder 変数 (= 例: { title, location, weekday }) */
  variables: Readonly<Record<string, string>>;
  /** Chip 全体 tap (= J-4 accept / J-5 modify の起動点になる予定、 J-2 では caller hook のみ) */
  onTap?: (proposal: ProposedAnchor) => void;
  /** 「無視」 ボタン tap (= J-3 dismiss path の起動点) */
  onDismiss?: (proposal: ProposedAnchor) => void;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ProposalChip({
  proposal,
  variables,
  onTap,
  onDismiss,
  className,
}: ProposalChipProps) {
  const rendered = useMemo(() => {
    const template = getProposalCopyTemplate(proposal.reason, proposal.direction);
    if (!template) return { headline: "", subtext: null as string | null };
    const out = renderProposalCopy(template, variables);
    // dev mode runtime lint (= No-AI-Subject)
    runtimeNoAiSubjectCheck(out.headline, "ProposalChip.headline");
    if (out.subtext) runtimeNoAiSubjectCheck(out.subtext, "ProposalChip.subtext");
    return out;
  }, [proposal.reason, proposal.direction, variables]);

  // intentional_break_observed = 観測文 (= 提案ではない、 tap で action なし)
  const isObservation = proposal.direction === "intentional_break_observed";

  const titleForAria = variables["title"] ?? variables["location"] ?? proposal.id;
  const ariaLabel = isObservation
    ? `観測: ${titleForAria}`
    : `提案: ${titleForAria}`;

  const isInteractive = onTap != null && !isObservation;

  const handleKeyDown = isInteractive
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap?.(proposal);
        }
      }
    : undefined;

  const handleClick = isInteractive
    ? () => onTap?.(proposal)
    : undefined;

  return (
    <div
      className={[
        // base layout
        "inline-flex flex-col gap-1 rounded-2xl px-3 py-2",
        // Memory Chip spec
        "border border-dashed border-slate-300",
        "bg-white/50",
        // text style
        "text-slate-700",
        // interactive
        "transition-opacity duration-200 motion-reduce:transition-none",
        isInteractive
          ? "cursor-pointer hover:border-slate-400 focus:border-slate-400 focus:outline-none"
          : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={isInteractive ? "button" : "group"}
      aria-label={ariaLabel}
      tabIndex={isInteractive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={`plan-proposal-chip-${proposal.id}`}
    >
      <span className="text-sm italic text-slate-600">{rendered.headline}</span>
      {rendered.subtext && (
        <span className="text-xs text-slate-500">{rendered.subtext}</span>
      )}
      {onDismiss && (
        <button
          type="button"
          className="self-end text-xs text-slate-400 underline hover:text-slate-500 motion-reduce:transition-none"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(proposal);
          }}
          aria-label="無視"
          data-testid={`plan-proposal-chip-${proposal.id}-dismiss`}
        >
          無視
        </button>
      )}
    </div>
  );
}
