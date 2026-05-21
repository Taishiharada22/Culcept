/**
 * Accept Proposal — Phase 3-J-4 accept path。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-4 / §10.1 Smoke 4
 *
 * 役割:
 *   ProposedAnchor + 完成 anchor input から CreateSourceWithAnchorsInput を構築し、
 *   既存 createAnchorBundle (= POST /api/plan/anchors) を呼んで ExternalAnchor 化。
 *
 *   注意:
 *   - sourceType は "manual" (= migration 禁止のため新値追加不可、 既存 enum 流用)
 *   - notes に `"alter-proposal:${proposalId}"` prefix で trace 記録 (= 後 phase で識別可)
 *   - sourceId は server 生成 (= client 制御不可)
 *
 * 不変原則:
 *   - Invariant 10 データ汚染禁止: ProposedAnchor を直接 mutate しない (= 別 entity)
 *   - Invariant 37 Proposal Integrity Contract: assertProposalCompliance で 5 性質再検査
 *   - sensitiveExcluded は draft 上流で除外済を信頼 (= compliance assertion でも検査)
 *
 * 範囲外 (= 別 commit / phase):
 *   - Quiet Undo Window (= 同 J-4 別 file quietUndoWindow.ts)
 *   - modify path (= J-5)
 *   - tab integration (= J-6)
 */

import { createAnchorBundle } from "@/lib/plan/anchor-fetch";
import type { CreateAnchorBundleResult } from "@/lib/plan/anchor-fetch";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import type { CreateSourceWithAnchorsInput } from "@/lib/plan/external-anchor-repository";

import {
  PROPOSAL_INTEGRITY_CONTRACT,
  assertProposalCompliance,
} from "./proposalIntegrityContract";
import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source.notes に付加する trace prefix。
 *
 * 「Alter からの提案」 由来 anchor を識別するための機械可読 prefix。
 * 後 phase で UI が source.notes 検査 → 「Alter からの提案」 label 表示。
 */
export const PROPOSAL_NOTES_PREFIX = "alter-proposal:";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trace helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * proposalId から notes 文字列を構築。
 */
export function buildProposalNotes(proposalId: string): string {
  return `${PROPOSAL_NOTES_PREFIX}${proposalId}`;
}

/**
 * notes が proposal 由来か判定。
 */
export function isProposalNotes(notes?: string): boolean {
  if (typeof notes !== "string") return false;
  return notes.startsWith(PROPOSAL_NOTES_PREFIX);
}

/**
 * notes から proposalId を抽出 (= proposal 由来でなければ null)。
 */
export function extractProposalIdFromNotes(notes?: string): string | null {
  if (typeof notes !== "string") return null;
  if (!notes.startsWith(PROPOSAL_NOTES_PREFIX)) return null;
  return notes.slice(PROPOSAL_NOTES_PREFIX.length);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bundle builder (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ProposedAnchor + 完成 anchor input → CreateSourceWithAnchorsInput。
 *
 * 不変原則:
 *   - sensitive は事前に proposal 生成段階で除外されている (= ProposalIntegrityContract)
 *   - 本関数は副作用なし、 入力 mutate なし
 *   - assertProposalCompliance で 5 性質再検査
 *
 * caller 責任:
 *   - anchor (= CreateExternalAnchorInput) は validateCreateExternalAnchorInput を通したもの
 *   - proposal.draft の partial 形式 → anchor input への補完は caller (= UI tap handler) が行う
 */
export function buildAcceptBundleInput(
  proposal: ProposedAnchor,
  anchor: CreateExternalAnchorInput,
): CreateSourceWithAnchorsInput {
  assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT);

  return {
    source: {
      sourceType: "manual",
      notes: buildProposalNotes(proposal.id),
      rawRetention: "discarded",
    },
    anchors: [anchor],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Accept action (= API call)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Accept action — bundle build + API call。
 *
 * - 既存 createAnchorBundle (= cookie auth、 POST /api/plan/anchors) を呼ぶ
 * - 結果は discriminated union (= ok:true / ok:false)、 throw しない
 * - undo 用 record の保存は caller 責任 (= quietUndoWindow.ts の recordUndoToStorage を別途呼ぶ)
 */
export async function acceptProposal(
  proposal: ProposedAnchor,
  anchor: CreateExternalAnchorInput,
): Promise<CreateAnchorBundleResult> {
  const bundle = buildAcceptBundleInput(proposal, anchor);
  return createAnchorBundle(bundle);
}
