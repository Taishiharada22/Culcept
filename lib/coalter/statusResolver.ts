/**
 * CoAlter status resolver (Phase 6.D, 2026-04-19)
 *
 * coalter_messages.metadata を入力として、status API / realtime 復元で
 * クライアントに返す `activeProposal` (legacy) と `activeCard` (Phase 2
 * discriminated union) の組を決定する純関数。
 *
 * CEO 6.D 条件:
 *  1. 後方互換優先 — `activeProposal` を壊さず、`activeCard` を加算で返す
 *  2. source of truth は `metadata.card` — 再合成は fallback に留める
 *  3. mode 非依存で返す — decision / negotiate / clarify をそのまま返す
 *
 * ポリシー:
 *  - `metadata.card` がある → `activeCard` はそれを採用（mode は card 側で決まる）
 *  - `metadata.card` が欠損 && `metadata.proposalCard` がある →
 *    DecisionCard に再合成（legacy session 互換、fallback 扱い）
 *  - 両方欠損 → null / null
 */

import type { CoAlterCard, ProposalCard } from "./types";

export interface StoredCoAlterMessageMetadata {
  proposalCard?: unknown;
  card?: unknown;
  // routerTrace / gateResult / executorFallbackReason は status では返さない
  // （関係性支援 OS の体験に影響しないため）
  [key: string]: unknown;
}

export interface ResolveActiveResult {
  /**
   * Phase 1 互換の ProposalCard（decision 相当）。
   * - `card.mode === "decision"` のときのみ実際の提案を持つ
   * - negotiate/clarify のときは null（候補を持たないため legacy client 側では
   *   「カードなし」と同等の振る舞い。Phase 2 対応クライアントは `activeCard` で復元する）
   */
  activeProposal: ProposalCard | null;
  /**
   * Phase 2 discriminated union。
   * - 存在すれば最新 card をそのまま返す（mode 非依存）
   * - `metadata.card` 欠損時は `metadata.proposalCard` からの再合成を試みる（fallback）
   */
  activeCard: CoAlterCard | null;
  /**
   * 再合成が走ったかどうか（監査・テスト用）。
   * - true: metadata.card 欠損だったため proposalCard から DecisionCard を合成した
   * - false: metadata.card を採用したか、両方欠損
   */
  usedFallback: boolean;
}

function isProposalCard(value: unknown): value is ProposalCard {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  // 最小限のチェック: summary + candidates 配列
  return typeof v.summary === "string" && Array.isArray(v.candidates);
}

function isCoAlterCard(value: unknown): value is CoAlterCard {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.mode === "decision" || v.mode === "negotiate" || v.mode === "clarify"
  );
}

/**
 * metadata.card を優先し、無ければ proposalCard から DecisionCard に再合成する。
 * mode ごとの差別ロジックは入れない（CEO 条件 #3）。
 */
export function resolveActiveFromMetadata(
  metadata: StoredCoAlterMessageMetadata | null | undefined,
): ResolveActiveResult {
  if (!metadata) {
    return { activeProposal: null, activeCard: null, usedFallback: false };
  }

  const storedCard = metadata.card;
  const storedProposal = metadata.proposalCard;

  // ── 1) metadata.card を最優先（source of truth）──
  if (isCoAlterCard(storedCard)) {
    const card = storedCard;
    // legacy client 向け activeProposal は decision のときのみ返す
    // （negotiate/clarify は候補を持たない → legacy UI では表示しない）
    let activeProposal: ProposalCard | null = null;
    if (card.mode === "decision") {
      // DecisionCard は ProposalCard & { mode: "decision" } なので
      // そのまま ProposalCard として使える。mode タグが混ざっていても
      // JSON シリアライゼーションで透過するため legacy client を壊さない。
      activeProposal = card;
    } else if (isProposalCard(storedProposal)) {
      // 念のため: 同一メタデータに proposalCard も残っている場合は互換用に返す
      // （engine.ts は Phase 6.C から card + proposalCard の両方を常に書き込む）
      activeProposal = storedProposal;
    }
    return {
      activeProposal,
      activeCard: card,
      usedFallback: false,
    };
  }

  // ── 2) metadata.card 欠損 → proposalCard から DecisionCard を再合成（fallback）──
  if (isProposalCard(storedProposal)) {
    const proposal = storedProposal;
    const synthesized: CoAlterCard = { ...proposal, mode: "decision" };
    return {
      activeProposal: proposal,
      activeCard: synthesized,
      usedFallback: true,
    };
  }

  // ── 3) 両方欠損 ──
  return { activeProposal: null, activeCard: null, usedFallback: false };
}
