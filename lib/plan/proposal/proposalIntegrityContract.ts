/**
 * Proposal Integrity Contract — Phase 3 invariant 37。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.6 Contract invariant 37 / §5 Proposal Integrity Contract
 *
 * 5 性質 (= 型 lock + compliance test の二重強制):
 *   1. neverMutatesAnchor          : proposal は ExternalAnchor を mutate しない
 *   2. userActionRequired          : user accept/modify/dismiss 三択 tap なしに confirm されない
 *   3. canBeIgnoredWithoutPenalty  : dismiss して不利益なし、 UI で nag に変換禁止
 *   4. sourceEvidenceRequired      : 提案は user 自身の観測 evidence を必ず保持
 *   5. sensitiveExcluded           : sensitive anchor は signal source / proposal target 両方除外
 *
 * 強制機構:
 *   - 型 lock: readonly true、 「型 level で書き換え不可」 を保証
 *   - compliance test: Phase 3-J-7 smoke で全 proposal が assertProposalCompliance を通過することを検証
 *   - 違反時 build fail (= test 段階で検出)
 *
 * 設計意図:
 *   将来の dev が 「anchor を mutate する proposal」 を実装しようとした瞬間に
 *   型エラー + test fail で気付く仕組み。 思想 drift 防止。
 */

import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract type + const
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Proposal Integrity Contract — 5 性質を型 level で lock する interface。
 *
 * 各 field は readonly true literal 型 (= 値 false への書き換え禁止)。
 * compliance test は const PROPOSAL_INTEGRITY_CONTRACT 経由で検証する。
 */
export interface ProposalIntegrityContract {
  /** proposal は ExternalAnchor を mutate しない (= 別 entity) */
  readonly neverMutatesAnchor: true;

  /** user accept/modify/dismiss 三択 tap なしに ExternalAnchor 化されない */
  readonly userActionRequired: true;

  /** dismiss しても UI / sentiment で不利益が発生しない */
  readonly canBeIgnoredWithoutPenalty: true;

  /** 提案は user 自身の観測 evidence (= ProposalSource) を必ず保持 */
  readonly sourceEvidenceRequired: true;

  /** sensitive anchor は signal / proposal 両方から完全除外 */
  readonly sensitiveExcluded: true;
}

/**
 * Proposal Integrity Contract の唯一の正本。
 *
 * Phase 3 の全 proposal 生成 path はこの const を参照して
 * assertProposalCompliance を呼ぶ。
 */
export const PROPOSAL_INTEGRITY_CONTRACT: ProposalIntegrityContract = {
  neverMutatesAnchor: true,
  userActionRequired: true,
  canBeIgnoredWithoutPenalty: true,
  sourceEvidenceRequired: true,
  sensitiveExcluded: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance assertion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Runtime compliance assertion — proposal が contract に準拠するか検証。
 *
 * Phase 3-J-7 smoke で全 proposal がこれを通過することを test 化。
 * 通過しない proposal は build fail。
 *
 * 検証項目:
 *   - sourceEvidenceRequired: proposal.source.evidenceCount > 0
 *   - sensitiveExcluded:      proposal.draft.sensitiveCategory が undefined
 *   - neverMutatesAnchor:     proposal.draft.id が undefined または "proposal_" prefix
 *
 * 検証されない項目 (= 設計上の不変原則、 runtime 検証対象外):
 *   - userActionRequired:           UI flow 設計、 J-2/J-4 で実現
 *   - canBeIgnoredWithoutPenalty:   UI 表現規約、 J-2 で実現 + lint で検証
 *
 * @throws Error 違反時。 error message に違反項目名を含む。
 */
export function assertProposalCompliance(
  proposal: ProposedAnchor,
  _contract: ProposalIntegrityContract,
): void {
  // sourceEvidenceRequired: evidence count > 0
  if (proposal.source.evidenceCount <= 0) {
    throw new Error(
      `[ProposalIntegrityContract] sourceEvidenceRequired violation: ` +
        `proposal id=${proposal.id} has evidenceCount=${proposal.source.evidenceCount}, must be > 0`,
    );
  }

  // sensitiveExcluded: draft に sensitiveCategory を含まない
  if (proposal.draft.sensitiveCategory != null) {
    throw new Error(
      `[ProposalIntegrityContract] sensitiveExcluded violation: ` +
        `proposal id=${proposal.id} draft contains sensitiveCategory=${proposal.draft.sensitiveCategory}`,
    );
  }

  // neverMutatesAnchor: draft.id が undefined または proposal_ prefix
  if (proposal.draft.id != null && !proposal.draft.id.startsWith("proposal_")) {
    throw new Error(
      `[ProposalIntegrityContract] neverMutatesAnchor violation: ` +
        `proposal id=${proposal.id} draft contains existing anchor id=${proposal.draft.id} (= not proposal-scoped)`,
    );
  }
}
