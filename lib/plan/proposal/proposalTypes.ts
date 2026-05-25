/**
 * Proposal Types — Phase 3-J-1a 基礎型定義。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1a / §4 DayGraph Data Structure / §5 Proposal Integrity Contract
 *
 * 役割:
 *   ProposedAnchor は Alter が提案する anchor の draft 形式。
 *   ExternalAnchor とは別 entity (= 採用までは ExternalAnchor 化しない、 mutate しない)。
 *
 * 不変原則 (= §2 Invariants):
 *   - Invariant 10 データ汚染禁止: ProposedAnchor は別 entity、 ExternalAnchor を mutate しない
 *   - Invariant 4  privacy first: sensitive anchor は signal / proposal 両方除外
 *   - Invariant 17 Internal data disclosure only: 提案 reason は user 自身のデータからのみ
 *   - Invariant 23 Reversibility >= 50: Phase 3-J 提案は safe 圏のみ
 *   - Invariant 37 Proposal Integrity Contract: 5 性質を型 lock + compliance test
 *
 * Phase 3-J-4 (= accept path) で sourceType="proposal" 経由で ExternalAnchor 化される。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ProposalDirection } from "./proposalDirection";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proposal Reason — 提案の起源を識別 (= debug + 観測用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Proposal Reason — どの signal から生成された提案か。
 *
 * - pattern_repeat:             直近 4 週で 3+ 回反復したパターン (= Invariant 24、 反復閾値)
 * - lived_geography_centroid:   Phase 2-G の重心 fallback (= 場所未確定 anchor の hint)
 * - day_pattern:                予定なしの日に直近同曜日パターンを観測
 * - unconfirmed_place_hint:     場所未確定 anchor への補完 hint
 */
export type ProposalReason =
  | "pattern_repeat"
  | "lived_geography_centroid"
  | "day_pattern"
  | "unconfirmed_place_hint";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proposal Confidence — internal only、 UI 非可視
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Proposal Confidence — 内部 confidence 段階。
 *
 * 不変原則 (= Invariant 15): user に % / score を見せない。
 * UI 表現は 「いつもの」 「最近の」 「先週の」 等の内側からの言葉のみ。
 *
 * - high:   反復 5+ 回、 直近乖離なし
 * - medium: 反復 3-4 回、 または直近 1 回乖離あり
 *
 * low は永久に存在しない (= 提案閾値 = 反復 3+ 回、 Invariant 24)。
 */
export type ProposalConfidence = "high" | "medium";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proposal Source — signal 由来の構造化 record
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Proposal Source — proposal を生成した signal の構造化記録。
 *
 * 不変原則 (= Invariant 21 Self-Evidence Trail):
 *   - 内部 evidence record として保持
 *   - UI 非可視 (= ProposedAnchor から user には source を見せない、 debug + 観測用)
 *
 * 不変原則 (= Invariant 37 Proposal Integrity Contract):
 *   - sourceEvidenceRequired: evidenceCount > 0 必須
 */
export interface ProposalSource {
  /** signal の種類 */
  readonly signalType: ProposalReason;
  /** 観測 evidence の件数 (= 反復回数、 sample 数 等) */
  readonly evidenceCount: number;
  /** signal 生成時刻 (= ISO 8601、 debug 用) */
  readonly generatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ProposedAnchor — Alter 提案 anchor の draft 形式
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ProposedAnchor — Alter 提案 anchor の draft 形式。
 *
 * 重要な不変原則:
 *   1. (Invariant 10) ExternalAnchor を mutate しない → 別 entity
 *   2. (Invariant 37) 採用までは ExternalAnchor 化しない → user accept 三択 tap が必須
 *   3. (Invariant 4)  sensitive anchor 由来の proposal は生成されない (= 上流 filter)
 *   4. (Invariant 21) 内部 evidence を必ず source field に保持
 *
 * id 命名: `proposal_${uuid}` (= 既存 anchor id と区別、 sourceType="proposal" trace 連動)
 */
export interface ProposedAnchor {
  /** "proposal_" prefix で始まる識別子 (= 既存 anchor id との衝突回避) */
  readonly id: string;

  /** 提案の起源 signal */
  readonly reason: ProposalReason;

  /** 提案の方向性 (= Self-Direction Triad、 Invariant 19) */
  readonly direction: ProposalDirection;

  /** 内部 confidence (= UI 非可視、 Invariant 15) */
  readonly confidence: ProposalConfidence;

  /**
   * 提案 anchor の draft (= ExternalAnchor の部分形)。
   *
   * 採用時に Phase 3-J-4 で sourceType="proposal" 経由で完全な ExternalAnchor に変換。
   * 採用までは ExternalAnchor として保存されない (= データ汚染禁止)。
   *
   * 制約:
   *   - draft.id が既存 ExternalAnchor の id を指してはならない
   *     (= 採用は 「新規作成」、 mutate ではない)
   *   - draft.sensitiveCategory は permitted されない
   *     (= sensitive 由来 signal で生成された proposal は上流で除外、 ProposalIntegrityContract sensitiveExcluded)
   */
  readonly draft: Partial<ExternalAnchor>;

  /** signal 由来の内部 evidence record */
  readonly source: ProposalSource;

  /** proposal 生成時刻 (= ISO 8601) */
  readonly createdAt: string;
}
