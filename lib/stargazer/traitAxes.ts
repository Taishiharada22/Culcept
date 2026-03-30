// lib/stargazer/traitAxes.ts
// Stargazer 45 trait axes — 観測の基礎軸
// スコア範囲: -1.0 〜 +1.0
// 既存15軸 + Stage1用6軸 + Stage2用12軸 + Stage3用6軸 + CognitiveFit用6軸

export const TRAIT_AXIS_KEYS = [
  // ── 既存15軸 ──
  "introvert_vs_extrovert",
  "individual_vs_social",
  "cautious_vs_bold",
  "analytical_vs_intuitive",
  "change_embrace_vs_resist",
  "plan_vs_spontaneous",
  "tradition_vs_novelty",
  "independence_vs_harmony",
  "direct_vs_diplomatic",
  "stress_isolation_vs_social",
  "function_vs_expression",
  "minimal_vs_maximal",
  "perfectionist_vs_pragmatic",
  "quality_vs_quantity",
  "classic_vs_trendy",

  // ── Stage 1 追加軸 ──
  "intimacy_pace",
  "reassurance_need",
  "emotional_variability",
  "social_initiative",
  "boundary_awareness",
  "relationship_mode_split",

  // ── Stage 2 追加軸 (safety / relational_deep) ──
  "boundary_respect",
  "consent_maturity",
  "pressure_risk",
  "escalation_risk",
  "friend_mode_fit",
  "intent_stability",
  "rejection_response_maturity",
  "control_tendency",
  "exclusivity_pressure",
  "long_term_shift_risk",
  "public_private_gap",
  "emotional_regulation",

  // ── Stage 3 追加軸 (深層心理 / 変容) ──
  "attachment_style",
  "locus_of_control",
  "growth_mindset",
  "shame_vs_guilt",
  "rumination_tendency",
  "fairness_sensitivity",

  // ── Cognitive Fit 軸 (認知スタイル) ──
  "abstract_structuring",
  "decomposition",
  "cognitive_updating",
  "decision_tempo",
  "social_modeling",
  "exploration_closure",
] as const;

export type TraitAxisKey = (typeof TRAIT_AXIS_KEYS)[number];

export type AxisCategory =
  | "core"
  | "relational"
  | "motion"
  | "aesthetic"
  | "emotional"
  | "safety"
  | "relational_deep"
  | "depth"
  | "cognitive";

export interface TraitAxisDef {
  id: TraitAxisKey;
  labelLeft: string;
  labelRight: string;
  category: AxisCategory;
  /** 心理測定学的検証データへの参照キー (validation/psychometrics.ts) */
  validationKey?: string;
}

/** 45軸の定義 — ラベルは日本語 */
export const TRAIT_AXES: TraitAxisDef[] = [
  // ── 既存15軸 ──
  {
    id: "introvert_vs_extrovert",
    labelLeft: "内向的",
    labelRight: "外向的",
    category: "core",
  },
  {
    id: "individual_vs_social",
    labelLeft: "個で深める",
    labelRight: "集団で広げる",
    category: "core",
  },
  {
    id: "cautious_vs_bold",
    labelLeft: "慎重",
    labelRight: "大胆",
    category: "core",
  },
  {
    id: "analytical_vs_intuitive",
    labelLeft: "分析的",
    labelRight: "直感的",
    category: "core",
  },
  {
    id: "change_embrace_vs_resist",
    labelLeft: "変化を歓迎",
    labelRight: "安定を維持",
    category: "emotional",
  },
  {
    id: "plan_vs_spontaneous",
    labelLeft: "計画的",
    labelRight: "即興的",
    category: "core",
  },
  {
    id: "tradition_vs_novelty",
    labelLeft: "伝統・既存",
    labelRight: "新規性・先進性",
    category: "aesthetic",
  },
  {
    id: "independence_vs_harmony",
    labelLeft: "独立",
    labelRight: "調和",
    category: "relational",
  },
  {
    id: "direct_vs_diplomatic",
    labelLeft: "率直",
    labelRight: "配慮・外交的",
    category: "relational",
  },
  {
    id: "stress_isolation_vs_social",
    labelLeft: "一人で整理",
    labelRight: "人と回復",
    category: "emotional",
  },
  {
    id: "function_vs_expression",
    labelLeft: "機能・合理",
    labelRight: "表現・情緒",
    category: "motion",
  },
  {
    id: "minimal_vs_maximal",
    labelLeft: "シンプル好き",
    labelRight: "こだわり好き",
    category: "motion",
  },
  {
    id: "perfectionist_vs_pragmatic",
    labelLeft: "完成度重視",
    labelRight: "実用・前進重視",
    category: "motion",
  },
  {
    id: "quality_vs_quantity",
    labelLeft: "質を深く",
    labelRight: "量・広がり",
    category: "aesthetic",
  },
  {
    id: "classic_vs_trendy",
    labelLeft: "定番派",
    labelRight: "流行派",
    category: "aesthetic",
  },

  // ── Stage 1 追加軸 ──
  {
    id: "intimacy_pace",
    labelLeft: "ゆっくり距離を縮める",
    labelRight: "早く距離を縮める",
    category: "relational",
  },
  {
    id: "reassurance_need",
    labelLeft: "安心確認を求めない",
    labelRight: "安心確認を必要とする",
    category: "emotional",
  },
  {
    id: "emotional_variability",
    labelLeft: "感情が安定的",
    labelRight: "感情が状況で変わりやすい",
    category: "emotional",
  },
  {
    id: "social_initiative",
    labelLeft: "受動的に待つ",
    labelRight: "自分から距離を縮める",
    category: "relational",
  },
  {
    id: "boundary_awareness",
    labelLeft: "境界を柔軟に扱う",
    labelRight: "境界を明確に意識",
    category: "relational",
  },
  {
    id: "relationship_mode_split",
    labelLeft: "関係モードが一貫",
    labelRight: "関係モードが文脈で変化",
    category: "relational_deep",
  },

  // ── Stage 2 追加軸 (safety / relational_deep) ──
  {
    id: "boundary_respect",
    labelLeft: "境界線を柔軟に扱う",
    labelRight: "境界線を明確に守る",
    category: "safety",
  },
  {
    id: "consent_maturity",
    labelLeft: "暗黙の同意に依存",
    labelRight: "明確な合意を重視",
    category: "safety",
  },
  {
    id: "pressure_risk",
    labelLeft: "圧をかけない",
    labelRight: "圧をかけやすい",
    category: "safety",
  },
  {
    id: "escalation_risk",
    labelLeft: "段階的変化が安定",
    labelRight: "エスカレーションしやすい",
    category: "safety",
  },
  {
    id: "friend_mode_fit",
    labelLeft: "友達モード不安定",
    labelRight: "友達モードで安定",
    category: "relational_deep",
  },
  {
    id: "intent_stability",
    labelLeft: "意図が状況で変わる",
    labelRight: "意図が一貫している",
    category: "relational_deep",
  },
  {
    id: "rejection_response_maturity",
    labelLeft: "拒否に未熟な反応",
    labelRight: "拒否を成熟に受容",
    category: "safety",
  },
  {
    id: "control_tendency",
    labelLeft: "コントロール欲低い",
    labelRight: "コントロール欲高い",
    category: "safety",
  },
  {
    id: "exclusivity_pressure",
    labelLeft: "排他的圧力なし",
    labelRight: "排他的圧力が出やすい",
    category: "safety",
  },
  {
    id: "long_term_shift_risk",
    labelLeft: "長期でも安定",
    labelRight: "長期で態度が変化しやすい",
    category: "relational_deep",
  },
  {
    id: "public_private_gap",
    labelLeft: "表裏が一致",
    labelRight: "表裏にギャップあり",
    category: "relational_deep",
  },
  {
    id: "emotional_regulation",
    labelLeft: "感情調整が難しい",
    labelRight: "感情を適切に調整",
    category: "emotional",
  },

  // ── Stage 3 追加軸 (深層心理 / 変容) ──
  {
    id: "attachment_style",
    labelLeft: "回避型（距離を取る）",
    labelRight: "不安型（しがみつく）",
    category: "relational",
    validationKey: "bowlby_1969_bartholomew_1991",
  },
  {
    id: "locus_of_control",
    labelLeft: "内的統制（自分次第）",
    labelRight: "外的統制（環境次第）",
    category: "core",
    validationKey: "rotter_1966",
  },
  {
    id: "growth_mindset",
    labelLeft: "成長志向（変われる）",
    labelRight: "固定志向（生まれつき）",
    category: "core",
    validationKey: "dweck_2006",
  },
  {
    id: "shame_vs_guilt",
    labelLeft: "恥（自分全体が悪い）",
    labelRight: "罪悪感（行動が悪い）",
    category: "emotional",
    validationKey: "tangney_dearing_2002",
  },
  {
    id: "rumination_tendency",
    labelLeft: "低反芻（切り替えが早い）",
    labelRight: "高反芻（考え続ける）",
    category: "emotional",
    validationKey: "nolen_hoeksema_1991",
  },
  {
    id: "fairness_sensitivity",
    labelLeft: "受益過敏（もらいすぎ不安）",
    labelRight: "加害過敏（不公平に敏感）",
    category: "relational",
    validationKey: "schmitt_2004",
  },

  // ── Cognitive Fit 軸 (認知スタイル) ──
  {
    id: "abstract_structuring",
    labelLeft: "具体から積む",
    labelRight: "抽象で掴む",
    category: "cognitive",
  },
  {
    id: "decomposition",
    labelLeft: "全体を一気に",
    labelRight: "分解して順に",
    category: "cognitive",
  },
  {
    id: "cognitive_updating",
    labelLeft: "判断を保持する",
    labelRight: "柔軟に更新する",
    category: "cognitive",
  },
  {
    id: "decision_tempo",
    labelLeft: "即断型",
    labelRight: "熟考型",
    category: "cognitive",
  },
  {
    id: "social_modeling",
    labelLeft: "行動から読む",
    labelRight: "意図から読む",
    category: "cognitive",
  },
  {
    id: "exploration_closure",
    labelLeft: "広く探索する",
    labelRight: "素早く絞る",
    category: "cognitive",
  },
];

/** 軸IDからラベルを取得 */
export function getAxisLabels(
  axisId: TraitAxisKey
): { left: string; right: string } | null {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  return def ? { left: def.labelLeft, right: def.labelRight } : null;
}

/** 空の45軸スコアマップを生成（全て0.0） */
export function createEmptyAxisScores(): Record<TraitAxisKey, number> {
  const scores = {} as Record<TraitAxisKey, number>;
  for (const key of TRAIT_AXIS_KEYS) {
    scores[key] = 0;
  }
  return scores;
}
