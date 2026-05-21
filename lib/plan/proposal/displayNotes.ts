/**
 * Display Notes — Phase 3-J-6b。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §D source.notes 露出対策
 *
 * 役割:
 *   `source.notes` を user 表示用に整形する pure helper。
 *   `acceptProposal` で trace 用に注入された `"alter-proposal:${proposalId}"` prefix を
 *   user に **生で見せない** ための変換 layer。
 *
 *   proposalId は **絶対** user に露出させない (= privacy + UX)。
 *
 * 変換規約:
 *   - "alter-proposal:..." prefix → "提案から追加" (= 固定 label、 proposalId 完全 hide)
 *   - 通常 notes (= prefix なし) → そのまま (= 既存 UX 維持)
 *   - undefined / 空文字 → null (= 表示しない)
 *
 * 不変原則:
 *   - Invariant 17 Internal data disclosure only: proposalId は internal、 UI 非可視
 *   - Invariant 39 No Penalty for Ignore: sentiment 中立 (= 「提案から追加」 警告色なし)
 *   - Invariant 32 Minimal Memory: notes 自体は既存 source field、 新規 storage なし
 *
 * 将来の sourceType="proposal" 移行余地:
 *   - DB migration が許可された段階で ExternalAnchorSourceType に "proposal" 追加可
 *   - 既存 「alter-proposal:」 prefix の notes は backward compat で displayProposalAwareNotes 経由保持
 *   - 後方互換性問題なし
 */

import { isProposalNotes } from "./acceptProposal";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * proposal 由来 notes の user 表示 label。
 *
 * CEO 推奨文言 (= 2026-05-22): 「提案から追加」 (= 簡潔、 sentiment 中立)。
 * 文脈上必要なら呼出側で 「Alter からの提案」 等のバリエーション派生可。
 */
export const PROPOSAL_DISPLAY_LABEL = "提案から追加";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Converter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source.notes を user 表示用に変換。
 *
 * @param notes - 生 source.notes (= undefined / 空文字 / 通常 string / "alter-proposal:..." prefix)
 * @returns user 表示文字列 or null (= 表示しない)
 */
export function displayProposalAwareNotes(notes?: string): string | null {
  if (typeof notes !== "string") return null;
  if (notes.length === 0) return null;
  if (isProposalNotes(notes)) return PROPOSAL_DISPLAY_LABEL;
  return notes;
}
