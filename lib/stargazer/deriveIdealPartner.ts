// lib/stargazer/deriveIdealPartner.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stargazer 全軸 → 理想の相手プロファイル自動導出エンジン
//
// 心理学的根拠:
// - 類似性-引力仮説 (Byrne, 1971): 価値観・認知スタイルは類似性が重要
// - 相補性理論 (Winch, 1958): アプローチ・行動パターンは相補が機能する場合がある
// - 安全基地理論 (Bowlby, 1969): 安全性軸は常に高い方を好む
// - 認知的相性 (Sternberg, 1988): 知的スタイルの近さは関係満足度の予測因子
// - Gottman の Sound Relationship House: conflict style の相補 > 類似
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ── 型定義 ──

export interface DerivedIdealPartner {
  /** 軸ごとの理想値 + 重要度 */
  desiredTraits: Record<string, { preferred: number; importance: number }>;
  /** 6つの関係性の質 (0-1) */
  relationshipQualities: Record<string, number>;
  /** 価値観一致の重要度 (0-1) */
  valueAlignmentImportance: number;
  /** 導出元の軸数 */
  sourceAxisCount: number;
  /** 導出戦略のサマリー */
  derivationStrategy: string;
}

// ── 軸の導出戦略分類 ──

type Strategy = "similarity" | "complementary" | "safety_high" | "risk_low" | "cognitive_similar";

/** 各軸の導出戦略とカテゴリ依存の重要度 */
const AXIS_DERIVATION_RULES: Record<string, {
  strategy: Strategy;
  /** カテゴリ別の重要度 (0-1) */
  importanceByCategory: Partial<Record<RendezvousCategory, number>>;
  /** デフォルト重要度 */
  defaultImportance: number;
}> = {
  // ── 価値観軸（類似性が重要）──
  introvert_vs_extrovert: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.5, friendship: 0.4, cocreation: 0.3 },
    defaultImportance: 0.4,
  },
  individual_vs_social: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.5, friendship: 0.5, community: 0.4 },
    defaultImportance: 0.4,
  },
  analytical_vs_intuitive: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.7, friendship: 0.4, romantic: 0.4 },
    defaultImportance: 0.5,
  },
  change_embrace_vs_resist: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.5, cocreation: 0.6 },
    defaultImportance: 0.4,
  },
  tradition_vs_novelty: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.5, friendship: 0.3 },
    defaultImportance: 0.3,
  },
  independence_vs_harmony: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.7, friendship: 0.4 },
    defaultImportance: 0.5,
  },
  perfectionist_vs_pragmatic: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.6, romantic: 0.3 },
    defaultImportance: 0.3,
  },
  quality_vs_quantity: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.5, friendship: 0.3 },
    defaultImportance: 0.3,
  },
  classic_vs_trendy: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.2, friendship: 0.2 },
    defaultImportance: 0.15,
  },

  // ── アプローチ軸（相補性が機能する）──
  cautious_vs_bold: {
    strategy: "complementary",
    importanceByCategory: { romantic: 0.4, cocreation: 0.5 },
    defaultImportance: 0.35,
  },
  plan_vs_spontaneous: {
    strategy: "complementary",
    importanceByCategory: { romantic: 0.4, friendship: 0.3 },
    defaultImportance: 0.3,
  },
  direct_vs_diplomatic: {
    strategy: "complementary",
    importanceByCategory: { cocreation: 0.5, romantic: 0.4 },
    defaultImportance: 0.35,
  },
  stress_isolation_vs_social: {
    strategy: "similarity", // ストレス対処は類似性が重要（Gottman研究）
    importanceByCategory: { romantic: 0.6, friendship: 0.3 },
    defaultImportance: 0.4,
  },
  function_vs_expression: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.3, friendship: 0.2 },
    defaultImportance: 0.2,
  },
  minimal_vs_maximal: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.3, community: 0.2 },
    defaultImportance: 0.2,
  },

  // ── 関係性軸（Stage 1）──
  intimacy_pace: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.8, friendship: 0.5 },
    defaultImportance: 0.5,
  },
  reassurance_need: {
    strategy: "complementary", // 高い人は応答性の高い相手を好む
    importanceByCategory: { romantic: 0.6, friendship: 0.3 },
    defaultImportance: 0.4,
  },
  emotional_variability: {
    strategy: "complementary", // 安定した相手が補完
    importanceByCategory: { romantic: 0.5, friendship: 0.3 },
    defaultImportance: 0.3,
  },
  social_initiative: {
    strategy: "complementary",
    importanceByCategory: { friendship: 0.4, community: 0.4 },
    defaultImportance: 0.3,
  },
  boundary_awareness: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.6, friendship: 0.4 },
    defaultImportance: 0.5,
  },
  relationship_mode_split: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.3 },
    defaultImportance: 0.2,
  },

  // ── 安全性軸（Stage 2）─ 常に高い方を好む ──
  boundary_respect: {
    strategy: "safety_high",
    importanceByCategory: { romantic: 0.9, friendship: 0.6, cocreation: 0.5 },
    defaultImportance: 0.7,
  },
  consent_maturity: {
    strategy: "safety_high",
    importanceByCategory: { romantic: 0.9, friendship: 0.5 },
    defaultImportance: 0.7,
  },
  emotional_regulation: {
    strategy: "safety_high",
    importanceByCategory: { romantic: 0.8, cocreation: 0.6 },
    defaultImportance: 0.6,
  },
  rejection_response_maturity: {
    strategy: "safety_high",
    importanceByCategory: { romantic: 0.7, friendship: 0.4 },
    defaultImportance: 0.5,
  },
  intent_stability: {
    strategy: "safety_high",
    importanceByCategory: { romantic: 0.7, cocreation: 0.5 },
    defaultImportance: 0.5,
  },
  friend_mode_fit: {
    strategy: "safety_high",
    importanceByCategory: { friendship: 0.7, community: 0.5 },
    defaultImportance: 0.4,
  },

  // ── リスク軸 ─ 低い方を好む ──
  escalation_risk: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.8, friendship: 0.5 },
    defaultImportance: 0.6,
  },
  pressure_risk: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.8, friendship: 0.5 },
    defaultImportance: 0.6,
  },
  control_tendency: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.8, cocreation: 0.6 },
    defaultImportance: 0.6,
  },
  exclusivity_pressure: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.7 },
    defaultImportance: 0.4,
  },
  long_term_shift_risk: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.6 },
    defaultImportance: 0.3,
  },
  public_private_gap: {
    strategy: "risk_low",
    importanceByCategory: { romantic: 0.5, friendship: 0.3 },
    defaultImportance: 0.3,
  },

  // ── 深層心理軸（Stage 3）──
  attachment_style: {
    strategy: "complementary", // 不安定型は安定型の相手を好む（Hazan & Shaver）
    importanceByCategory: { romantic: 0.8, friendship: 0.4 },
    defaultImportance: 0.5,
  },
  locus_of_control: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.5, romantic: 0.3 },
    defaultImportance: 0.3,
  },
  growth_mindset: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.6, romantic: 0.5 },
    defaultImportance: 0.4,
  },
  shame_vs_guilt: {
    strategy: "similarity",
    importanceByCategory: { romantic: 0.4 },
    defaultImportance: 0.2,
  },
  rumination_tendency: {
    strategy: "complementary", // 反芻傾向が高い人は低い人の存在で安定する
    importanceByCategory: { romantic: 0.4 },
    defaultImportance: 0.2,
  },
  fairness_sensitivity: {
    strategy: "similarity",
    importanceByCategory: { cocreation: 0.6, romantic: 0.4 },
    defaultImportance: 0.3,
  },

  // ── 認知スタイル軸（CF）──
  abstract_structuring: {
    strategy: "cognitive_similar",
    importanceByCategory: { cocreation: 0.7, romantic: 0.4 },
    defaultImportance: 0.4,
  },
  decomposition: {
    strategy: "cognitive_similar",
    importanceByCategory: { cocreation: 0.6, romantic: 0.3 },
    defaultImportance: 0.3,
  },
  cognitive_updating: {
    strategy: "cognitive_similar",
    importanceByCategory: { cocreation: 0.5, romantic: 0.4 },
    defaultImportance: 0.35,
  },
  decision_tempo: {
    strategy: "complementary", // 即断型と熟考型の補完は生産的（チーム研究）
    importanceByCategory: { cocreation: 0.6, romantic: 0.3 },
    defaultImportance: 0.3,
  },
  social_modeling: {
    strategy: "cognitive_similar",
    importanceByCategory: { romantic: 0.5, friendship: 0.4 },
    defaultImportance: 0.35,
  },
  exploration_closure: {
    strategy: "complementary", // 探索型と収束型の補完
    importanceByCategory: { cocreation: 0.6, romantic: 0.2 },
    defaultImportance: 0.25,
  },
};

// ── メイン導出関数 ──

/**
 * Stargazer の全軸スコアから理想の相手プロファイルを自動導出する。
 *
 * @param axisScores ユーザーの全軸スコア (-1 to +1)
 * @param category   Rendezvous カテゴリ
 * @returns 導出された理想の相手プロファイル
 */
export function deriveIdealPartner(
  axisScores: Record<string, number>,
  category: RendezvousCategory,
): DerivedIdealPartner {
  const desiredTraits: Record<string, { preferred: number; importance: number }> = {};
  let sourceAxisCount = 0;

  for (const [axisId, rule] of Object.entries(AXIS_DERIVATION_RULES)) {
    const selfScore = axisScores[axisId];
    if (selfScore === undefined) continue;

    sourceAxisCount++;
    const importance = rule.importanceByCategory[category] ?? rule.defaultImportance;

    let preferred: number;
    switch (rule.strategy) {
      case "similarity":
      case "cognitive_similar":
        // 自分と似た値を好む
        preferred = selfScore;
        break;

      case "complementary":
        // 相補性: 自分の逆方向を好むが、極端にはしない
        // 心理学的には「穏やかな相補」が最適（Markey & Markey, 2007）
        preferred = selfScore * -0.4; // 弱い逆方向
        break;

      case "safety_high":
        // 安全性は常に高い方を好む（自分のスコアに関係なく）
        preferred = 0.8;
        break;

      case "risk_low":
        // リスク軸は低い方を好む
        preferred = -0.8;
        break;

      default:
        preferred = selfScore;
    }

    desiredTraits[axisId] = {
      preferred: Math.max(-1, Math.min(1, preferred)),
      importance,
    };
  }

  // ── relationship_qualities の導出 ──
  const norm = (key: string) => {
    const v = axisScores[key];
    return v !== undefined ? (v + 1) / 2 : 0.5;
  };

  const relationshipQualities: Record<string, number> = {
    intimacy: norm("intimacy_pace") * 0.5 + norm("reassurance_need") * 0.3 + norm("boundary_awareness") * 0.2,
    excitement: norm("cautious_vs_bold") * 0.4 + norm("change_embrace_vs_resist") * 0.3 + norm("plan_vs_spontaneous") * 0.3,
    independence: norm("independence_vs_harmony") * 0.6 + norm("individual_vs_social") * 0.4,
    depth: norm("analytical_vs_intuitive") * 0.3 + norm("abstract_structuring") * 0.3 + norm("social_modeling") * 0.4,
    playfulness: norm("plan_vs_spontaneous") * 0.4 + norm("social_initiative") * 0.3 + norm("tradition_vs_novelty") * 0.3,
    growth: norm("growth_mindset") * 0.5 + norm("cognitive_updating") * 0.3 + norm("change_embrace_vs_resist") * 0.2,
  };

  // ── カテゴリ補正 ──
  // 恋愛: intimacy + depth 重視
  // 友情: playfulness + independence 重視
  // 共創: depth + growth 重視
  // コミュニティ: playfulness + independence 重視
  const categoryBoosts: Partial<Record<RendezvousCategory, Record<string, number>>> = {
    romantic: { intimacy: 0.1, depth: 0.05 },
    friendship: { playfulness: 0.1, independence: 0.05 },
    cocreation: { depth: 0.1, growth: 0.1 },
    community: { playfulness: 0.05, independence: 0.1 },
  };
  const boosts = categoryBoosts[category];
  if (boosts) {
    for (const [key, boost] of Object.entries(boosts)) {
      relationshipQualities[key] = Math.min(1, (relationshipQualities[key] ?? 0.5) + boost);
    }
  }

  // ── 価値観一致の重要度 ──
  // 分析型・独立志向の人ほど価値観の一致を重視する傾向（研究ベース）
  const valueAlignmentImportance = Math.min(1, Math.max(0,
    0.5 +
    (axisScores.analytical_vs_intuitive ?? 0) * 0.15 +
    (axisScores.independence_vs_harmony ?? 0) * 0.1 +
    (axisScores.abstract_structuring ?? 0) * 0.1
  ));

  return {
    desiredTraits,
    relationshipQualities,
    valueAlignmentImportance,
    sourceAxisCount,
    derivationStrategy: `${sourceAxisCount}軸から導出（類似性/相補性/安全性ハイブリッド戦略）`,
  };
}

/**
 * 導出結果を rendezvous_ideal_partner_profiles テーブルに保存する形式に変換
 */
export function toIdealPartnerRow(
  userId: string,
  category: RendezvousCategory,
  derived: DerivedIdealPartner,
): Record<string, unknown> {
  return {
    user_id: userId,
    category,
    desired_traits: derived.desiredTraits,
    relationship_qualities: derived.relationshipQualities,
    value_alignment_importance: derived.valueAlignmentImportance,
    source: "stargazer_derived",
    updated_at: new Date().toISOString(),
  };
}
