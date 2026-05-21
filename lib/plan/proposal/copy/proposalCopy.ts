/**
 * Proposal Copy Templates — Phase 3-J-1b。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.2 表現 invariant 18 (Reflection-triggering copy)
 *   §2.5 補正 invariant 31 (Gentle Reflection)
 *   §2.5 補正 invariant 34 (No-AI-Subject Copy)
 *
 * 不変原則:
 *   - LLM 不使用 (= Invariant 12)、 template のみ
 *   - user 主語 or 無人称 (= Invariant 34、 No-AI-Subject)
 *   - 過去の自分の声 (= Invariant 29、 Past-Self Voice、 「いつもの」「先週も」「最近よく」)
 *   - 反射 trigger 文体 (= Invariant 18、 「〜しますか?」「〜が空いていますね」)
 *   - 警告色禁止、 「すべき」 禁止
 *   - 外部統計 / cohort 比較 / popularity 禁止 (= Invariant 17)
 *
 * 文字数規約: headline 14-25 char 推奨、 subtext optional (= 〜25 char)
 */

import type { ProposalDirection } from "../proposalDirection";
import type { ProposalReason } from "../proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Template structure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProposalCopyTemplate {
  /** Memory Chip 上の主文 (= headline、 14-25 char) */
  readonly headline: string;
  /** 補助文 (= subtext、 optional、 evidence の hint) */
  readonly subtext?: string;
}

/** template lookup key */
export type ProposalCopyKey = `${ProposalReason}__${ProposalDirection}`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Template table (= 4 reason × 3 direction = 12 templates)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PROPOSAL_COPY_TABLE: Record<ProposalCopyKey, ProposalCopyTemplate> = {
  // ── pattern_repeat ──
  "pattern_repeat__continue_pattern": {
    headline: "{title} の時間ですか?",
    subtext: "いつもの流れです",
  },
  "pattern_repeat__recover_pattern": {
    headline: "{title} に戻しますか?",
    subtext: "最近 空いていた時間です",
  },
  "pattern_repeat__intentional_break_observed": {
    headline: "{title} が最近 空いていますね",
    // intentional_break_observed は提案ではなく観測文、 subtext なし
  },

  // ── lived_geography_centroid ──
  "lived_geography_centroid__continue_pattern": {
    headline: "いつもの {location} にしますか?",
    subtext: "最近この辺りに行っています",
  },
  "lived_geography_centroid__recover_pattern": {
    headline: "{location} に戻しますか?",
    subtext: "以前よく行っていました",
  },
  "lived_geography_centroid__intentional_break_observed": {
    headline: "{location} から離れていますね",
  },

  // ── day_pattern ──
  "day_pattern__continue_pattern": {
    headline: "いつもの {weekday} の流れにしますか?",
    subtext: "先週も同じパターンでした",
  },
  "day_pattern__recover_pattern": {
    headline: "{weekday} の流れに戻しますか?",
    subtext: "以前のリズムです",
  },
  "day_pattern__intentional_break_observed": {
    headline: "{weekday} のパターンと違いますね",
  },

  // ── unconfirmed_place_hint ──
  "unconfirmed_place_hint__continue_pattern": {
    headline: "場所は {location} にしますか?",
    subtext: "最近 この場所に行っています",
  },
  "unconfirmed_place_hint__recover_pattern": {
    headline: "{location} に戻しますか?",
  },
  "unconfirmed_place_hint__intentional_break_observed": {
    headline: "場所が決まっていません",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Template lookup + render
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * key で template を取得。
 *
 * @returns template or null (= key 未登録)
 */
export function getProposalCopyTemplate(
  reason: ProposalReason,
  direction: ProposalDirection,
): ProposalCopyTemplate | null {
  const key: ProposalCopyKey = `${reason}__${direction}`;
  return PROPOSAL_COPY_TABLE[key] ?? null;
}

/**
 * Template の placeholder ({title} / {location} / {weekday} 等) を変数で置換。
 *
 * 未定義 placeholder は元の {key} のまま残す (= defensive、 silent fallback)。
 */
export function renderCopyTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    return value != null ? value : match;
  });
}

/**
 * Template + 変数から 完成 copy を render (= headline + subtext)。
 */
export function renderProposalCopy(
  template: ProposalCopyTemplate,
  variables: Readonly<Record<string, string>>,
): { headline: string; subtext: string | null } {
  return {
    headline: renderCopyTemplate(template.headline, variables),
    subtext: template.subtext ? renderCopyTemplate(template.subtext, variables) : null,
  };
}
