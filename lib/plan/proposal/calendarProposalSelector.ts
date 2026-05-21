/**
 * Calendar Proposal Selector — Phase 3-J-6c pure presentational helper。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §8.6 DayGraph Layer 配置
 *
 * 役割:
 *   CalendarTab が day cell ごとに proposal chip を表示するための
 *   presentational helper (= state 接続なし、 computeProposals 呼ばない)。
 *
 *   実 proposal 生成 + state 管理は J-6e (= PlanClient) で行い、
 *   ここでは渡された map から date 単位で 1 件選ぶだけの pure 関数。
 *
 * 不変原則:
 *   - Invariant 12 LLM 不使用
 *   - Invariant 4 sensitive 除外 (= computeProposals で上流 filter 済を信頼)
 *   - pure (= 副作用なし、 mutate なし)
 *   - CalendarTab を presentational 寄りに保つ (= J-6c 範囲限定)
 */

import type { ProposedAnchor } from "./proposalTypes";
import type { UndoRecord } from "./quietUndoWindow";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calendar tab に渡される proposal props 契約。
 *
 * J-6c 範囲では:
 *   - proposalsByDate / proposalTemplateVariables は **optional** (= 既存 CalendarTab 呼出側 unchanged)
 *   - callback も optional
 *   - 全 undefined なら CalendarTab は Phase 2 と完全同じ振る舞い (= backward compat)
 *
 * J-6e で PlanClient が computeProposals を呼んでこの prop に詰める。
 */
export interface CalendarProposalProps {
  /** ISO 日付 ("YYYY-MM-DD") → 当日の ProposedAnchor 配列 */
  proposalsByDate?: Readonly<Record<string, ReadonlyArray<ProposedAnchor>>>;
  /** ProposalId → template 変数 (= title / location / weekday 等) */
  proposalTemplateVariables?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Chip 全体 tap (= accept、 J-4 acceptProposal の caller) */
  onProposalAccept?: (proposal: ProposedAnchor) => void;
  /** 「教え直す」 tap (= modify、 J-5 EditAnchorModal / AddAnchorModal 起動の caller) */
  onProposalModify?: (proposal: ProposedAnchor) => void;
  /** 「無視」 tap (= dismiss、 J-3 recordDismissToStorage の caller) */
  onProposalDismiss?: (proposal: ProposedAnchor) => void;

  // ── Phase 3-J-6e-3: accept in-flight pending UI + Quiet Undo Window ──

  /**
   * Accept transaction in-flight 中の proposal id 集合。
   * CalendarTab / MapTab はこの set に含まれる proposal の chip を
   * subtle pending 表示 (= opacity-60 + pointer-events-none + aria-busy) する。
   *
   * 警告色 / pulse / drop-shadow 禁止 (= Memory Chip 思想維持)。
   */
  acceptingProposalIds?: ReadonlySet<string>;

  /**
   * active な undo record (= 5 分以内、 filterActiveUndos で抽出済) の配列。
   * CalendarTab / MapTab は selectActiveUndoForDate で該当 date の record を引いて
   * 「戻す」 link を render する。
   */
  recentUndoRecords?: ReadonlyArray<import("./quietUndoWindow").UndoRecord>;

  /**
   * 「戻す」 link tap callback (= undo action 起動)。
   * proposalId を渡し、 PlanClient 側で undoProposalAccept を call する。
   */
  onProposalUndo?: (proposalId: string) => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Selector helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 指定 ISO 日付の **最初の** proposal を返す (= max 1 chip / day 規約)。
 *
 * 規約:
 *   - map / array が空 / 未定義 → null
 *   - 先頭要素を返す (= caller 側で priority sort 済を想定、 computeProposals は confidence desc sort 済)
 *   - sensitive proposal は computeProposals で除外済 (= ここでは sensitive チェック しない、 安全境界は上流)
 */
export function selectFirstProposalForDate(
  proposalsByDate:
    | Readonly<Record<string, ReadonlyArray<ProposedAnchor>>>
    | undefined,
  dateIso: string,
): ProposedAnchor | null {
  if (!proposalsByDate) return null;
  const list = proposalsByDate[dateIso];
  if (!list || list.length === 0) return null;
  return list[0]!;
}

/**
 * 指定 ProposedAnchor の template 変数を返す。
 *
 * caller (= PlanClient) が proposalTemplateVariables map を pre-compute して渡す場合は
 * その map から lookup。 未指定なら proposal.draft から **fallback で自動補完**:
 *   - title: draft.title
 *   - location: draft.locationText
 *   - weekday: (= 未実装、 Phase 3-K で DayGraph 連動)
 *
 * 不変原則:
 *   - 副作用なし
 *   - mutate なし
 *   - sensitive 含めない (= draft.sensitiveCategory は ProposalIntegrityContract で禁止済)
 */
export function buildVariablesForProposal(
  proposal: ProposedAnchor,
  proposalTemplateVariables?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >,
): Readonly<Record<string, string>> {
  // 1. caller 提供 map 優先
  if (proposalTemplateVariables) {
    const explicit = proposalTemplateVariables[proposal.id];
    if (explicit) return explicit;
  }

  // 2. draft から fallback 補完
  const out: Record<string, string> = {};
  if (typeof proposal.draft.title === "string" && proposal.draft.title.length > 0) {
    out.title = proposal.draft.title;
  }
  if (
    typeof proposal.draft.locationText === "string" &&
    proposal.draft.locationText.length > 0
  ) {
    out.location = proposal.draft.locationText;
  }
  return out;
}
