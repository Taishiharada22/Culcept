// lib/stargazer/validation/psychometrics.ts
// 45軸特性システムの学術的妥当性フレームワーク
// Big Five との対応、理論的根拠、行動的アンカーを定義

import type { TraitAxisKey } from "../traitAxes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Citation {
  key: string;
  author: string;
  year: number;
  title: string;
  journal: string;
}

export interface PsychometricValidation {
  bigFiveMapping: {
    factor:
      | "Openness"
      | "Conscientiousness"
      | "Extraversion"
      | "Agreeableness"
      | "Neuroticism"
      | "Cross-domain";
    facet: string;
    loadingDirection: number;
  };
  theoreticalBasis: string;
  citationKeys: string[];
  relatedConstructs: string[];
}

export interface BehavioralAnchor {
  score: number; // -1.0, -0.5, 0, 0.5, 1.0
  description: string;
}

// ---------------------------------------------------------------------------
// CITATION_LIBRARY
// ---------------------------------------------------------------------------

export const CITATION_LIBRARY: Citation[] = [
  {
    key: "costa_mccrae_1992",
    author: "Costa, P. T., Jr., & McCrae, R. R.",
    year: 1992,
    title:
      "Revised NEO Personality Inventory (NEO-PI-R) and NEO Five-Factor Inventory (NEO-FFI) professional manual",
    journal: "Psychological Assessment Resources",
  },
  {
    key: "goldberg_1990",
    author: "Goldberg, L. R.",
    year: 1990,
    title:
      "An alternative 'description of personality': The Big-Five factor structure",
    journal: "Journal of Personality and Social Psychology, 59(6), 1216-1229",
  },
  {
    key: "john_srivastava_1999",
    author: "John, O. P., & Srivastava, S.",
    year: 1999,
    title: "The Big Five trait taxonomy: History, measurement, and theoretical perspectives",
    journal:
      "Handbook of personality: Theory and research (2nd ed., pp. 102-138). Guilford Press",
  },
  {
    key: "deyoung_2006",
    author: "DeYoung, C. G., Quilty, L. C., & Peterson, J. B.",
    year: 2006,
    title:
      "Between facets and domains: 10 aspects of the Big Five",
    journal: "Journal of Personality and Social Psychology, 93(5), 880-896",
  },
  {
    key: "saucier_1994",
    author: "Saucier, G.",
    year: 1994,
    title:
      "Mini-markers: A brief version of Goldberg's unipolar Big-Five markers",
    journal:
      "Journal of Personality Assessment, 63(3), 506-516",
  },
  {
    key: "wiggins_1995",
    author: "Wiggins, J. S.",
    year: 1995,
    title:
      "Interpersonal Adjective Scales: Professional manual",
    journal: "Psychological Assessment Resources",
  },
  {
    key: "leary_1957",
    author: "Leary, T.",
    year: 1957,
    title:
      "Interpersonal diagnosis of personality: A functional theory and methodology for personality evaluation",
    journal: "Ronald Press",
  },
  {
    key: "bowlby_1969",
    author: "Bowlby, J.",
    year: 1969,
    title: "Attachment and loss: Vol. 1. Attachment",
    journal: "Basic Books",
  },
  {
    key: "ainsworth_1978",
    author: "Ainsworth, M. D. S., Blehar, M. C., Waters, E., & Wall, S.",
    year: 1978,
    title: "Patterns of attachment: A psychological study of the strange situation",
    journal: "Lawrence Erlbaum Associates",
  },
  {
    key: "bartholomew_1991",
    author: "Bartholomew, K., & Horowitz, L. M.",
    year: 1991,
    title:
      "Attachment styles among young adults: A test of a four-category model",
    journal:
      "Journal of Personality and Social Psychology, 61(2), 226-244",
  },
  {
    key: "gottman_1999",
    author: "Gottman, J. M.",
    year: 1999,
    title:
      "The marriage clinic: A scientifically-based marital therapy",
    journal: "W. W. Norton & Company",
  },
  {
    key: "gross_1998",
    author: "Gross, J. J.",
    year: 1998,
    title: "The emerging field of emotion regulation: An integrative review",
    journal: "Review of General Psychology, 2(3), 271-299",
  },
  {
    key: "cacioppo_1984",
    author: "Cacioppo, J. T., & Petty, R. E.",
    year: 1984,
    title:
      "The need for cognition: Relationship to attitudinal processes",
    journal:
      "Social perception in clinical and counseling psychology, 113-139",
  },
  {
    key: "snyder_1974",
    author: "Snyder, M.",
    year: 1974,
    title: "Self-monitoring of expressive behavior",
    journal:
      "Journal of Personality and Social Psychology, 30(4), 526-537",
  },
];

// ---------------------------------------------------------------------------
// AXIS_VALIDATION_MAP
// ---------------------------------------------------------------------------

export const AXIS_VALIDATION_MAP: Record<TraitAxisKey, PsychometricValidation> =
  {
    // ========================================================================
    // Core (5)
    // ========================================================================
    introvert_vs_extrovert: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Warmth / Gregariousness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Big Five Extraversion の主要ファセット。社交性・刺激希求の個人差を反映し、NEO-PI-R E1 Warmth および E2 Gregariousness に直接対応する。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990", "john_srivastava_1999"],
      relatedConstructs: [
        "NEO-PI-R Extraversion",
        "Eysenck Introversion-Extraversion",
        "Reward sensitivity",
      ],
    },

    individual_vs_social: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Gregariousness / Activity",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "単独での深化志向 vs 集団での拡張志向。Extraversion の Gregariousness ファセットと、DeYoung (2006) の Enthusiasm アスペクトに対応する。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006"],
      relatedConstructs: [
        "Enthusiasm (DeYoung)",
        "Need for Affiliation",
        "Collectivism-Individualism",
      ],
    },

    cautious_vs_bold: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Excitement-Seeking / Assertiveness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "リスク回避 vs リスク追求の個人差。Extraversion の Excitement-Seeking (E5) および Assertiveness (E3) ファセットに対応。慎重さは Neuroticism の Vulnerability とも部分的に関連する。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006", "saucier_1994"],
      relatedConstructs: [
        "Sensation Seeking (Zuckerman)",
        "Behavioral Inhibition/Activation System",
        "Risk tolerance",
      ],
    },

    analytical_vs_intuitive: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Ideas / Intellect",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "論理-分析的認知スタイル vs 直感-全体把握的認知スタイル。Openness の Ideas ファセット (O5) に関連し、Cacioppo の Need for Cognition とも対応する。直感側は Openness の Fantasy (O1) に近い。",
      citationKeys: ["costa_mccrae_1992", "cacioppo_1984", "deyoung_2006"],
      relatedConstructs: [
        "Need for Cognition",
        "Rational-Experiential Inventory",
        "Cognitive style",
      ],
    },

    plan_vs_spontaneous: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Order / Deliberation",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "計画性 vs 即興性の個人差。Conscientiousness の Order (C2) と Deliberation (C6) ファセットの逆転方向に対応する。計画的側は高い Conscientiousness を示す。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990", "saucier_1994"],
      relatedConstructs: [
        "NEO-PI-R Conscientiousness",
        "Self-regulation",
        "Impulsivity (reversed)",
      ],
    },

    // ========================================================================
    // Emotional (4)
    // ========================================================================
    change_embrace_vs_resist: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Actions / Values",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "変化への開放性 vs 安定志向。Openness の Actions (O4) および Values (O6) ファセットに対応する。変化歓迎側は高い Openness を示し、安定維持側は低い Openness および高い Conscientiousness と関連する。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006", "john_srivastava_1999"],
      relatedConstructs: [
        "Openness to Experience",
        "Tolerance of Ambiguity",
        "Need for Closure (reversed)",
      ],
    },

    stress_isolation_vs_social: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Gregariousness (stress-context)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "ストレス対処における社会的志向の個人差。Extraversion の Gregariousness ファセットがストレス文脈でどう発現するかを捉える。Bowlby のアタッチメント理論における安全基地の利用パターンとも関連する。",
      citationKeys: ["costa_mccrae_1992", "bowlby_1969", "ainsworth_1978"],
      relatedConstructs: [
        "Coping style (social support seeking)",
        "Attachment security",
        "Stress recovery orientation",
      ],
    },

    reassurance_need: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Anxiety / Self-Consciousness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "安心確認の必要性。Neuroticism の Anxiety (N1) と Self-Consciousness (N4) ファセットに対応する。Bowlby のアタッチメント理論における不安型アタッチメントの中核特徴でもある。",
      citationKeys: [
        "costa_mccrae_1992",
        "bowlby_1969",
        "ainsworth_1978",
        "bartholomew_1991",
      ],
      relatedConstructs: [
        "Anxious attachment",
        "Reassurance-seeking behavior",
        "Separation anxiety",
      ],
    },

    emotional_variability: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Vulnerability / Impulsiveness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "感情の変動性。Neuroticism の Vulnerability (N6) および Impulsiveness (N5) ファセットに対応する。感情安定側は低い Neuroticism を反映し、変動側は情動的反応性の高さを示す。",
      citationKeys: ["costa_mccrae_1992", "gross_1998", "deyoung_2006"],
      relatedConstructs: [
        "Affect intensity",
        "Emotional reactivity",
        "Mood variability",
      ],
    },

    emotional_regulation: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Impulsiveness (reversed) / Vulnerability (reversed)",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "感情調整能力。Gross (1998) の感情制御モデルに基づく。Neuroticism の逆転方向として、感情を適切に調整できる能力を測定する。高い emotional regulation は低い Neuroticism と対応する。",
      citationKeys: ["gross_1998", "costa_mccrae_1992", "deyoung_2006"],
      relatedConstructs: [
        "Emotion regulation (Gross)",
        "Emotional intelligence",
        "Affect regulation",
      ],
    },

    // ========================================================================
    // Relational (5)
    // ========================================================================
    independence_vs_harmony: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance / Modesty",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "独立 vs 調和の軸。Agreeableness の Compliance (A4) と Modesty (A5) ファセットに対応する。Wiggins の対人円環モデルにおける Dominance-Submission 次元とも関連する。",
      citationKeys: [
        "costa_mccrae_1992",
        "wiggins_1995",
        "leary_1957",
        "john_srivastava_1999",
      ],
      relatedConstructs: [
        "Interpersonal Circumplex (Agency)",
        "Autonomy vs. Relatedness",
        "Assertiveness",
      ],
    },

    direct_vs_diplomatic: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Straightforwardness (reversed) / Tender-Mindedness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "率直なコミュニケーション vs 外交的配慮。Agreeableness の Straightforwardness (A2、逆転) と Tender-Mindedness (A6) に対応する。配慮的側は高い Agreeableness を示す。",
      citationKeys: ["costa_mccrae_1992", "wiggins_1995", "gottman_1999"],
      relatedConstructs: [
        "Communication style",
        "Interpersonal Circumplex (Love)",
        "Tact",
      ],
    },

    social_initiative: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Assertiveness / Positive Emotions",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "社会的場面での能動性。Extraversion の Assertiveness (E3) および Positive Emotions (E6) ファセットに対応する。Leary の対人円環における Dominance 次元とも関連する。",
      citationKeys: ["costa_mccrae_1992", "leary_1957", "wiggins_1995"],
      relatedConstructs: [
        "Social proactivity",
        "Interpersonal Dominance",
        "Approach motivation",
      ],
    },

    intimacy_pace: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Extraversion (Warmth) x Neuroticism (Vulnerability)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "親密さの形成速度。Bowlby のアタッチメント理論における接近行動パターンを反映し、Extraversion の Warmth と Neuroticism の Vulnerability の交互作用として理解される。Bartholomew の 4 類型モデルにおける安全型・不安型の差異に対応する。",
      citationKeys: [
        "bowlby_1969",
        "ainsworth_1978",
        "bartholomew_1991",
        "costa_mccrae_1992",
      ],
      relatedConstructs: [
        "Attachment style",
        "Interpersonal trust",
        "Self-disclosure speed",
      ],
    },

    boundary_awareness: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Trust (reversed) / Compliance",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "対人境界の認識と維持。Agreeableness の Trust (A1、逆転方向で境界意識が高い) に関連する。Bowlby のアタッチメント理論における安全基地概念の発展的解釈とも対応する。",
      citationKeys: [
        "costa_mccrae_1992",
        "bowlby_1969",
        "bartholomew_1991",
        "wiggins_1995",
      ],
      relatedConstructs: [
        "Personal boundaries",
        "Attachment security",
        "Interpersonal distance regulation",
      ],
    },

    // ========================================================================
    // Relational Deep (4)
    // ========================================================================
    relationship_mode_split: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Agreeableness x Self-Monitoring",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "関係文脈による行動モードの分化度。Snyder (1974) のセルフモニタリング理論を基盤とし、高いセルフモニタリングは文脈依存的な行動変容を予測する。Agreeableness の Compliance と対人円環の統合的解釈。",
      citationKeys: ["snyder_1974", "wiggins_1995", "costa_mccrae_1992"],
      relatedConstructs: [
        "Self-monitoring",
        "Behavioral flexibility",
        "Context-dependent self-presentation",
      ],
    },

    friend_mode_fit: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Trust / Altruism",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "友人関係モードでの安定性。Agreeableness の Trust (A1) と Altruism (A3) ファセットに対応する。Gottman の関係研究における友情基盤の安定性概念とも関連する。",
      citationKeys: ["costa_mccrae_1992", "gottman_1999", "wiggins_1995"],
      relatedConstructs: [
        "Friendship quality",
        "Platonic relationship stability",
        "Communal orientation",
      ],
    },

    intent_stability: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Dutifulness / Self-Discipline",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "意図・目的の一貫性。Conscientiousness の Dutifulness (C3) と Self-Discipline (C5) ファセットに対応する。意図の一貫性は対人信頼の基盤であり、Gottman の関係研究における信頼構築メカニズムとも関連する。",
      citationKeys: ["costa_mccrae_1992", "gottman_1999", "john_srivastava_1999"],
      relatedConstructs: [
        "Behavioral consistency",
        "Trustworthiness",
        "Goal persistence",
      ],
    },

    public_private_gap: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism (Self-Consciousness) x Self-Monitoring",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "公的自己と私的自己の乖離度。Snyder (1974) のセルフモニタリング理論を基盤とし、Neuroticism の Self-Consciousness (N4) ファセットとの交互作用として理解される。高い乖離は対人関係におけるリスク要因となりうる。",
      citationKeys: ["snyder_1974", "costa_mccrae_1992", "gottman_1999"],
      relatedConstructs: [
        "Self-monitoring",
        "Public vs. private self-consciousness",
        "Authenticity",
      ],
    },

    long_term_shift_risk: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism (Vulnerability) x Agreeableness (reversed)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "長期的な態度変容リスク。Gottman の関係研究における「感情の浸食」概念に基づく。Neuroticism の Vulnerability (N6) が高く、Agreeableness が低い場合に長期的態度変化リスクが増大する。",
      citationKeys: ["gottman_1999", "costa_mccrae_1992", "bowlby_1969"],
      relatedConstructs: [
        "Relationship erosion (Gottman)",
        "Emotional flooding",
        "Attachment instability",
      ],
    },

    // ========================================================================
    // Motion (3)
    // ========================================================================
    function_vs_expression: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Aesthetics / Fantasy",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "機能合理性 vs 表現情緒性の志向。Openness の Aesthetics (O2) と Fantasy (O1) ファセットに対応する。表現側は高い Openness を反映し、審美的感受性の高さを示す。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006", "goldberg_1990"],
      relatedConstructs: [
        "Aesthetic sensitivity",
        "Openness to Aesthetics",
        "Utilitarian vs. hedonic orientation",
      ],
    },

    minimal_vs_maximal: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Aesthetics / Actions",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "ミニマルな選好 vs マキシマルな選好。Openness の Aesthetics (O2) の表現強度と関連する。マキシマル側は Extraversion の Excitement-Seeking (E5) とも部分的に関連する。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006"],
      relatedConstructs: [
        "Aesthetic maximalism",
        "Stimulation seeking",
        "Sensory sensitivity",
      ],
    },

    perfectionist_vs_pragmatic: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Achievement Striving / Competence",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "完成度重視 vs 実用主義。Conscientiousness の Achievement Striving (C4) と Competence (C1) ファセットに対応する。完成度重視側は高い Conscientiousness を示す。実用前進側は Openness の Actions (O4) とも関連する。",
      citationKeys: ["costa_mccrae_1992", "saucier_1994", "john_srivastava_1999"],
      relatedConstructs: [
        "Perfectionism",
        "Achievement motivation",
        "Satisficing vs. Maximizing",
      ],
    },

    // ========================================================================
    // Aesthetic (3)
    // ========================================================================
    tradition_vs_novelty: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Values / Actions",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "伝統志向 vs 新規性志向。Openness の Values (O6) と Actions (O4) ファセットに直接対応する。新規性側は高い Openness を反映し、慣習からの独立性を示す。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990", "deyoung_2006"],
      relatedConstructs: [
        "Openness to Values",
        "Novelty seeking",
        "Cultural conservatism (reversed)",
      ],
    },

    quality_vs_quantity: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Conscientiousness (Competence) x Openness (Aesthetics)",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "質の深化 vs 量の拡張の志向。Conscientiousness の Competence (C1) と Openness の Aesthetics (O2) の交互作用として理解される。質の深化側は高い Conscientiousness と選択的な Openness を示す。",
      citationKeys: ["costa_mccrae_1992", "deyoung_2006", "saucier_1994"],
      relatedConstructs: [
        "Depth vs. breadth orientation",
        "Quality consciousness",
        "Maximizing tendency",
      ],
    },

    classic_vs_trendy: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Aesthetics / Values",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "クラシック志向 vs トレンド志向。Openness の Aesthetics (O2) と Values (O6) ファセットに関連する。トレンド側は Openness の新規性への開放性と、Extraversion の社会的関与の高さを反映する。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990", "john_srivastava_1999"],
      relatedConstructs: [
        "Fashion consciousness",
        "Novelty preference",
        "Social conformity (reversed)",
      ],
    },

    // ========================================================================
    // Safety (7)
    // ========================================================================
    boundary_respect: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance / Trust",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "他者の境界線への尊重度。Agreeableness の Compliance (A4) ファセットに対応する。Bowlby のアタッチメント理論における安全基地の尊重と、Gottman の関係研究における「対抗回避」パターンに関連する。",
      citationKeys: [
        "costa_mccrae_1992",
        "bowlby_1969",
        "gottman_1999",
        "wiggins_1995",
      ],
      relatedConstructs: [
        "Boundary respect",
        "Interpersonal sensitivity",
        "Stonewalling (reversed, Gottman)",
      ],
    },

    consent_maturity: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Straightforwardness / Trust",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "合意形成の成熟度。Agreeableness の Straightforwardness (A2) と Trust (A1) ファセットに対応する。明確な合意を重視する側は高い成熟度を示し、Gottman の関係研究における健全なコミュニケーション基盤と対応する。",
      citationKeys: [
        "costa_mccrae_1992",
        "gottman_1999",
        "bartholomew_1991",
      ],
      relatedConstructs: [
        "Consent awareness",
        "Relational ethics",
        "Communication maturity",
      ],
    },

    pressure_risk: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance (reversed) / Modesty (reversed)",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "他者への圧力行使リスク。Agreeableness の Compliance (A4) と Modesty (A5) の逆転方向に対応する。対人円環モデルにおける高い Dominance と低い Love の組み合わせとして理解される。Gottman の「Four Horsemen」における Criticism に対応する。",
      citationKeys: [
        "costa_mccrae_1992",
        "wiggins_1995",
        "leary_1957",
        "gottman_1999",
      ],
      relatedConstructs: [
        "Interpersonal dominance",
        "Criticism (Gottman)",
        "Coercive behavior",
      ],
    },

    escalation_risk: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Angry Hostility / Impulsiveness",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "段階的変化の安定性 vs エスカレーション傾向。Neuroticism の Angry Hostility (N2) と Impulsiveness (N5) ファセットに対応する。Gottman の関係研究における「感情的洪水」(emotional flooding) 概念と、攻撃的エスカレーションパターンに直接関連する。",
      citationKeys: [
        "costa_mccrae_1992",
        "gottman_1999",
        "bowlby_1969",
      ],
      relatedConstructs: [
        "Emotional flooding (Gottman)",
        "Escalation pattern",
        "Anger regulation",
      ],
    },

    rejection_response_maturity: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism (Vulnerability, reversed) x Agreeableness (Compliance)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "拒否への対処成熟度。Neuroticism の Vulnerability (N6) の逆転方向と、Agreeableness の Compliance (A4) の組み合わせとして理解される。Bowlby のアタッチメント理論における安全型アタッチメントの拒否耐性と、Bartholomew の dismissing-fearful 次元に対応する。",
      citationKeys: [
        "bowlby_1969",
        "bartholomew_1991",
        "costa_mccrae_1992",
        "gottman_1999",
      ],
      relatedConstructs: [
        "Rejection sensitivity (reversed)",
        "Secure attachment response",
        "Emotional resilience",
      ],
    },

    control_tendency: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance (reversed) / Trust (reversed)",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "対人関係におけるコントロール欲求。Agreeableness の Compliance (A4) と Trust (A1) の逆転方向に対応する。Leary の対人円環における高い Dominance-低い Love の象限と、Gottman の関係研究における Contempt パターンに関連する。",
      citationKeys: [
        "leary_1957",
        "wiggins_1995",
        "gottman_1999",
        "costa_mccrae_1992",
      ],
      relatedConstructs: [
        "Interpersonal control",
        "Contempt (Gottman)",
        "Power motivation",
      ],
    },

    exclusivity_pressure: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism (Anxiety) x Agreeableness (Trust, reversed)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "排他的圧力の行使傾向。Neuroticism の Anxiety (N1) と Agreeableness の Trust (A1) の逆転の交互作用として理解される。不安型アタッチメントに起因する独占欲と、Gottman の関係研究における嫉妬・Defensiveness パターンに対応する。",
      citationKeys: [
        "bowlby_1969",
        "ainsworth_1978",
        "bartholomew_1991",
        "gottman_1999",
      ],
      relatedConstructs: [
        "Anxious attachment",
        "Jealousy",
        "Defensiveness (Gottman)",
        "Possessiveness",
      ],
    },

    // ========================================================================
    // Depth (Stage 3)
    // ========================================================================
    attachment_style: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism Anxiety (N1) x Agreeableness Trust (A1)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Bowlby のアタッチメント理論に基づく。安全型・不安型・回避型・混乱型の4スタイルを連続次元で測定。Bartholomew (1991) の2次元モデルに対応。",
      citationKeys: ["bowlby_1969", "ainsworth_1978", "bartholomew_1991"],
      relatedConstructs: ["Adult attachment", "Internal working model", "ECR-R"],
    },
    locus_of_control: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Conscientiousness Competence (C1) x Neuroticism Vulnerability (N6)",
        loadingDirection: -1,
      },
      theoreticalBasis:
        "Rotter (1966) の統制の所在理論。内的統制（自分の行動が結果を決める）vs 外的統制（運命・他者が結果を決める）の個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Self-efficacy", "Learned helplessness", "Attribution style"],
    },
    growth_mindset: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Ideas (O5) x Actions (O4)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Dweck (2006) のマインドセット理論。固定的知能観（能力は不変）vs 成長的知能観（努力で向上可能）。Openness の Ideas / Actions ファセットと正の相関。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990"],
      relatedConstructs: ["Implicit theories of intelligence", "Self-regulation", "Goal orientation"],
    },
    shame_vs_guilt: {
      bigFiveMapping: {
        factor: "Cross-domain",
        facet: "Neuroticism Self-consciousness (N4) x Agreeableness Compliance (A4)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Lewis (1971) / Tangney (1992) の恥と罪悪感の区別。恥は自己全体への否定的評価、罪悪感は特定行動への否定的評価。Neuroticism の Self-consciousness ファセットと強く関連。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["TOSCA", "Moral emotions", "Self-conscious emotions"],
    },
    rumination_tendency: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Depression (N3) x Anxiety (N1)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Nolen-Hoeksema (1991) の反芻理論。ネガティブな出来事や感情を繰り返し思い返す傾向。Neuroticism の Depression / Anxiety ファセットと強い正の相関。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Response Styles Questionnaire", "Brooding", "Reflection"],
    },
    fairness_sensitivity: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance (A4) x Straightforwardness (A2)",
        loadingDirection: 1,
      },
      theoreticalBasis:
        "Schmitt et al. (2010) の公正感受性理論。不公正に対する感受性の個人差（被害者・観察者・加害者の3視点）。Agreeableness の Compliance / Straightforwardness に関連。",
      citationKeys: ["costa_mccrae_1992", "goldberg_1990"],
      relatedConstructs: ["Justice sensitivity", "Equity theory", "Moral judgment"],
    },

    // ========================================================================
    // Cognitive Fit (6)
    // ========================================================================
    abstract_structuring: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Ideas (O5)",
        loadingDirection: 1,
      },
      theoreticalBasis: "抽象的思考 vs 具体的思考の傾向。Openness の Ideas ファセットと関連。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Abstract reasoning", "Concrete thinking"],
    },
    decomposition: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Order (C2)",
        loadingDirection: 1,
      },
      theoreticalBasis: "課題を分解して処理する vs 全体を一気に処理する傾向。Conscientiousness の Order に関連。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Analytical thinking", "Holistic processing"],
    },
    cognitive_updating: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Actions (O4)",
        loadingDirection: 1,
      },
      theoreticalBasis: "判断を柔軟に更新する vs 保持する傾向。認知的柔軟性に関連。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Cognitive flexibility", "Belief updating"],
    },
    decision_tempo: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Deliberation (C6)",
        loadingDirection: -1,
      },
      theoreticalBasis: "意思決定の速度。即断型 vs 熟考型。Conscientiousness の Deliberation と逆相関。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Decision speed", "Reflective thinking"],
    },
    social_modeling: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Tender-Mindedness (A6)",
        loadingDirection: 1,
      },
      theoreticalBasis: "他者の行動から読み取る vs 意図から読み取る傾向。社会的認知スタイル。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Theory of mind", "Social cognition"],
    },
    exploration_closure: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Actions (O4) x Ideas (O5)",
        loadingDirection: 1,
      },
      theoreticalBasis: "広く探索する vs 素早く絞る傾向。Need for Closure 尺度と関連。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Need for closure", "Exploration tendency"],
    },

    // ========================================================================
    // Expansion (6)
    // ========================================================================
    energy_rhythm: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Activity (E4)",
        loadingDirection: 1,
      },
      theoreticalBasis: "エネルギー充電パターン。静的回復 vs 活動的回復の個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Circadian preference", "Energy management"],
    },
    conflict_style: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Compliance (A4) x Tender-Mindedness (A6)",
        loadingDirection: -1,
      },
      theoreticalBasis: "対立場面での対処スタイル。回避・対決・協調の個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Thomas-Kilmann conflict modes", "Assertiveness"],
    },
    novelty_threshold: {
      bigFiveMapping: {
        factor: "Openness",
        facet: "Actions (O4)",
        loadingDirection: 1,
      },
      theoreticalBasis: "新奇刺激への閾値。慣れた範囲の安心 vs 未知への探索欲求。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Sensation seeking", "Novelty seeking"],
    },
    self_disclosure_depth: {
      bigFiveMapping: {
        factor: "Extraversion",
        facet: "Warmth (E1)",
        loadingDirection: 1,
      },
      theoreticalBasis: "自己開示の深さ。核心を見せない傾向 vs 深く開示する傾向。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Self-disclosure", "Intimacy regulation"],
    },
    decision_regret: {
      bigFiveMapping: {
        factor: "Neuroticism",
        facet: "Depression (N3) x Vulnerability (N6)",
        loadingDirection: 1,
      },
      theoreticalBasis: "決断後の後悔傾向。振り返らない vs 反芻的に後悔する個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Regret scale", "Maximizing tendency"],
    },
    relational_investment: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Altruism (A3) x Tender-Mindedness (A6)",
        loadingDirection: 1,
      },
      theoreticalBasis: "関係への投資パターン。広く薄く vs 狭く深くの個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Attachment breadth", "Social investment"],
    },
    rational_vs_emotional_decision: {
      bigFiveMapping: {
        factor: "Agreeableness",
        facet: "Tender-Mindedness (A6)",
        loadingDirection: -1,
      },
      theoreticalBasis: "判断における理性と感情の比重。論理優先 vs 感情優先の個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Rational-Experiential Inventory", "Cognitive-Affective processing"],
    },
    efficiency_vs_process: {
      bigFiveMapping: {
        factor: "Conscientiousness",
        facet: "Achievement Striving (C4) x Deliberation (C6)",
        loadingDirection: -1,
      },
      theoreticalBasis: "結果効率と過程充実の優先度。最短経路 vs 過程重視の個人差。",
      citationKeys: ["costa_mccrae_1992"],
      relatedConstructs: ["Process vs Outcome orientation", "Task efficiency"],
    },
  };

// ---------------------------------------------------------------------------
// AXIS_BEHAVIORAL_ANCHORS
// ---------------------------------------------------------------------------

export const AXIS_BEHAVIORAL_ANCHORS: Record<TraitAxisKey, BehavioralAnchor[]> =
  {
    // ========================================================================
    // Core
    // ========================================================================
    introvert_vs_extrovert: [
      { score: -1.0, description: "一人の時間が最も生産的で、大人数の場を避ける。長時間の社交の後は数日間の回復時間が必要になる。" },
      { score: -0.5, description: "少人数の親しい友人との交流を好み、大きなイベントでは途中で静かな場所に移動する。" },
      { score: 0, description: "状況に応じて一人の時間と社交を使い分ける。どちらも苦にならない。" },
      { score: 0.5, description: "人と一緒にいることでエネルギーが湧き、週末は友人との予定を入れたがる。" },
      { score: 1.0, description: "常に誰かと一緒にいたいと感じ、一人でいると落ち着かない。大人数のイベントで最も活き活きする。" },
    ],

    individual_vs_social: [
      { score: -1.0, description: "一人で長時間没頭する作業を好み、チームプロジェクトでは自分のパートを独立して進める。" },
      { score: -0.5, description: "基本は一人で考えを深めるが、行き詰まったときは相談する。" },
      { score: 0, description: "個人作業とグループワークの両方を状況で使い分ける。" },
      { score: 0.5, description: "グループでアイデアを出し合う場を好み、一人で考えるより議論で発想が広がる。" },
      { score: 1.0, description: "常にチームで動くことを好み、一人での作業は避ける。ブレスト会議を頻繁に設定する。" },
    ],

    cautious_vs_bold: [
      { score: -1.0, description: "新しい挑戦の前に入念にリスクを分析し、十分な準備なしには行動しない。" },
      { score: -0.5, description: "ある程度の情報収集をしてから行動に移る。明らかなリスクは避ける。" },
      { score: 0, description: "リスクと機会のバランスを見て判断する。過度な慎重さも無謀さもない。" },
      { score: 0.5, description: "不確実性があっても面白そうなら飛び込む。「やってみないとわからない」と考える。" },
      { score: 1.0, description: "リスクを楽しみ、前例のないことに真っ先に手を挙げる。失敗を恐れない。" },
    ],

    analytical_vs_intuitive: [
      { score: -1.0, description: "データや論理的根拠に基づいて判断する。直感的判断に不安を感じ、数字で確認したがる。" },
      { score: -0.5, description: "まず論理的に分析してから判断するが、最終的な微調整で直感を使うこともある。" },
      { score: 0, description: "論理的分析と直感的判断を場面に応じて使い分ける。" },
      { score: 0.5, description: "第一印象やフィーリングを重視し、「なんとなく良い」と感じた選択に自信を持つ。" },
      { score: 1.0, description: "直感で即断し、理由を後から考える。雰囲気や空気を読んで判断する。" },
    ],

    plan_vs_spontaneous: [
      { score: -1.0, description: "旅行の行程を時間刻みで計画し、予定外の出来事にストレスを感じる。ToDoリストなしでは不安になる。" },
      { score: -0.5, description: "大まかな計画は立てるが、細部は柔軟に対応する。主要な予定はカレンダーに入れる。" },
      { score: 0, description: "計画を立てることも即興で動くことも苦にならない。" },
      { score: 0.5, description: "大まかな方向だけ決めて出かける。予定が変わっても気にしない。" },
      { score: 1.0, description: "計画を立てること自体が窮屈に感じる。その場の流れで行動し、偶然の出会いを楽しむ。" },
    ],

    // ========================================================================
    // Emotional
    // ========================================================================
    change_embrace_vs_resist: [
      { score: -1.0, description: "変化に積極的に飛び込み、現状維持を退屈に感じる。転職や引っ越しを頻繁にする。" },
      { score: -0.5, description: "良い変化には前向きだが、変化のために変化することはしない。" },
      { score: 0, description: "変化と安定のどちらにも偏らず、状況で判断する。" },
      { score: 0.5, description: "変化に時間をかけて適応する。急な変更には準備期間がほしい。" },
      { score: 1.0, description: "慣れた環境やルーティンを強く好み、変化を脅威と感じる。引っ越しや転職を極力避ける。" },
    ],

    stress_isolation_vs_social: [
      { score: -1.0, description: "ストレス時は完全に一人になり、静かな環境で自分の考えを整理してから回復する。" },
      { score: -0.5, description: "まず一人で落ち着いてから、信頼できる人に相談する。" },
      { score: 0, description: "ストレスの種類や程度によって一人で処理するか人に頼るかを選ぶ。" },
      { score: 0.5, description: "ストレスを感じたら信頼できる人に話を聞いてもらいたくなる。" },
      { score: 1.0, description: "ストレス時はすぐ誰かに連絡し、話を聞いてもらわないと気持ちが収まらない。一人だと不安が増す。" },
    ],

    reassurance_need: [
      { score: -1.0, description: "相手の気持ちを確認する必要をほとんど感じない。信頼関係は行動で自然に確認される。" },
      { score: -0.5, description: "普段は確認しないが、大きな変化や不安があるときは相手の気持ちを聞きたくなる。" },
      { score: 0, description: "適度に相手の気持ちを確認するが、頻繁ではない。" },
      { score: 0.5, description: "定期的に相手からの「大丈夫だよ」という言葉を必要とする。既読無視が気になる。" },
      { score: 1.0, description: "頻繁に相手の気持ちを確認しないと不安になる。返信が遅いと最悪の事態を想像する。" },
    ],

    emotional_variability: [
      { score: -1.0, description: "感情がほぼ一定で、大きな出来事があっても冷静さを保つ。周囲から「動じない」と言われる。" },
      { score: -0.5, description: "感情の波は小さく、一時的に動揺しても短時間で元に戻る。" },
      { score: 0, description: "普通の範囲で感情が変化する。極端な感情の振れ幅はない。" },
      { score: 0.5, description: "状況によって気分が大きく変わる。良い出来事には高揚し、悪い出来事には落ち込む。" },
      { score: 1.0, description: "感情の波が激しく、短時間で気分が大きく変わる。感情に行動が引きずられやすい。" },
    ],

    emotional_regulation: [
      { score: -1.0, description: "感情に飲まれやすく、怒りや悲しみをコントロールできないことが多い。衝動的な発言をしがちである。" },
      { score: -0.5, description: "強い感情を感じるとコントロールが難しくなるが、時間をかければ落ち着ける。" },
      { score: 0, description: "一般的な範囲で感情を調整できる。強い感情でも時間があれば対処できる。" },
      { score: 0.5, description: "感情を適切に認識し、表現のタイミングと方法を選べる。ストレス下でも冷静さを保てる。" },
      { score: 1.0, description: "感情を正確に認識し、状況に応じた最適な表現を選択できる。激しい感情下でも建設的な対話を維持できる。" },
    ],

    // ========================================================================
    // Relational
    // ========================================================================
    independence_vs_harmony: [
      { score: -1.0, description: "自分の意見を優先し、周囲と異なる立場でも平気で主張する。協調を求められると窮屈に感じる。" },
      { score: -0.5, description: "基本は自分の考えで行動するが、重要な場面では周囲の意見も考慮する。" },
      { score: 0, description: "自分の意見を持ちつつ、グループの調和も大切にする。" },
      { score: 0.5, description: "グループの雰囲気を乱さないよう配慮し、対立を避ける方向で行動する。" },
      { score: 1.0, description: "常にグループの調和を最優先し、自分の意見を言うことに強い抵抗を感じる。場の空気を読むことに神経を使う。" },
    ],

    direct_vs_diplomatic: [
      { score: -1.0, description: "思ったことをそのまま伝え、遠回しな表現を使わない。フィードバックは具体的かつストレートに行う。" },
      { score: -0.5, description: "基本的に率直だが、相手の状態を見て伝え方を少し調整する。" },
      { score: 0, description: "状況や相手に応じて率直さと配慮を使い分ける。" },
      { score: 0.5, description: "相手の感情への配慮を優先し、言いにくいことはクッション言葉を挟んで伝える。" },
      { score: 1.0, description: "相手を傷つけないことを最優先し、ネガティブなフィードバックを避ける。遠回しな表現や暗示で伝えようとする。" },
    ],

    social_initiative: [
      { score: -1.0, description: "自分からは声をかけず、相手からの接触を待つ。誘われれば参加するが、自ら企画することはない。" },
      { score: -0.5, description: "親しい人には自分から連絡するが、新しい人間関係では受動的になる。" },
      { score: 0, description: "場面によって自分から動いたり、相手からの接触を待ったりする。" },
      { score: 0.5, description: "気になる人には自分から声をかけ、集まりを企画することが多い。" },
      { score: 1.0, description: "常に自分からアプローチし、新しい人間関係を積極的に開拓する。イベントの企画や声かけを頻繁に行う。" },
    ],

    intimacy_pace: [
      { score: -1.0, description: "信頼関係の構築に時間をかけ、長い期間を経てから深い話をする。急な親密さに不快感を覚える。" },
      { score: -0.5, description: "ある程度の時間をかけて距離を縮めるが、相性が良ければ比較的早く心を開く。" },
      { score: 0, description: "相手や状況に応じて自然なペースで距離を縮める。" },
      { score: 0.5, description: "気が合えばすぐに深い話をし、短期間で親密な関係を築こうとする。" },
      { score: 1.0, description: "初対面でも個人的な話を共有し、すぐに深い関係を求める。距離を置く態度を拒絶と解釈しがちである。" },
    ],

    boundary_awareness: [
      { score: -1.0, description: "境界を意識せず、相手の領域に自然に入り込む。プライベートな質問を気軽にする。" },
      { score: -0.5, description: "境界は認識しているが、関係が深まると曖昧になりがちである。" },
      { score: 0, description: "相手との関係性に応じて適度な境界を保つ。" },
      { score: 0.5, description: "自分と他者の境界を明確に意識し、踏み込む前に確認する習慣がある。" },
      { score: 1.0, description: "境界を非常に明確に設定し、自分の領域への侵入に敏感に反応する。他者の境界も慎重に尊重する。" },
    ],

    // ========================================================================
    // Relational Deep
    // ========================================================================
    relationship_mode_split: [
      { score: -1.0, description: "誰に対しても同じ態度で接する。職場でもプライベートでも自分のスタイルが一貫している。" },
      { score: -0.5, description: "基本は一貫しているが、フォーマルな場では少し態度を変える。" },
      { score: 0, description: "ある程度の文脈に応じた使い分けをするが、自然な範囲に収まる。" },
      { score: 0.5, description: "関係の種類（友人・恋人・仕事仲間）によって振る舞いが明確に変わる。" },
      { score: 1.0, description: "関係モードによって別人のように振る舞い、ある関係での自分を別の関係の人が見たら驚かれる。" },
    ],

    friend_mode_fit: [
      { score: -1.0, description: "友人関係の維持が苦手で、親しい関係でも不安定になりやすい。友人への期待が過大になる。" },
      { score: -0.5, description: "友人関係にやや不安を感じることがあり、関係の深さに迷うことがある。" },
      { score: 0, description: "友人関係を一般的な程度で維持できる。" },
      { score: 0.5, description: "友人関係を安定的に維持でき、適度な距離感を保てる。" },
      { score: 1.0, description: "友人関係が安定し、長期間にわたって信頼関係を維持できる。友人の境界線を自然に尊重できる。" },
    ],

    intent_stability: [
      { score: -1.0, description: "気分や状況で行動の方向性が頻繁に変わる。約束しても後から気が変わることが多い。" },
      { score: -0.5, description: "基本的な方向性はあるが、外部の影響で揺れることがある。" },
      { score: 0, description: "ある程度の一貫性を持つが、大きな変化には対応して方針を変える。" },
      { score: 0.5, description: "一度決めたことは基本的に貫き、変更する場合は理由を説明する。" },
      { score: 1.0, description: "言動が極めて一貫しており、表明した意図通りに行動する。予測可能で信頼される。" },
    ],

    public_private_gap: [
      { score: -1.0, description: "人前での自分と一人のときの自分がほぼ同じ。考えていることがそのまま表情や態度に表れる。" },
      { score: -0.5, description: "わずかな使い分けはあるが、基本的に表裏がない。" },
      { score: 0, description: "社会的な場面で多少の自己調整をするが、大きな乖離はない。" },
      { score: 0.5, description: "公的な場面と私的な場面で態度が明確に異なる。職場での自分と家での自分が違う。" },
      { score: 1.0, description: "人前では完全に異なるペルソナを使い、本当の感情や考えを見せることがほとんどない。" },
    ],

    long_term_shift_risk: [
      { score: -1.0, description: "長期にわたって関係性のスタイルが安定している。年単位で付き合いが変わっても態度が一貫している。" },
      { score: -0.5, description: "基本的に安定しているが、大きなライフイベントで多少変化する。" },
      { score: 0, description: "時間経過に伴い自然な変化はあるが、急激な態度変容はない。" },
      { score: 0.5, description: "関係が長くなると、最初の態度からの変化が見られる。慣れに伴い配慮が減ることがある。" },
      { score: 1.0, description: "関係が安定すると態度が大きく変わり、初期の丁寧さや配慮が失われやすい。親しき仲にも礼儀ありが苦手になる。" },
    ],

    // ========================================================================
    // Motion
    // ========================================================================
    function_vs_expression: [
      { score: -1.0, description: "すべてに機能性と合理性を求め、装飾的な要素を無駄と感じる。道具は性能だけで選ぶ。" },
      { score: -0.5, description: "機能性を重視しつつ、最低限の見た目の良さも考慮する。" },
      { score: 0, description: "機能性と表現性のバランスを取る。実用的かつ気分が上がるものを選ぶ。" },
      { score: 0.5, description: "見た目や雰囲気を重視し、多少の不便さは許容する。" },
      { score: 1.0, description: "表現や情緒的な価値を最優先し、機能性は二の次にする。美しさや世界観で選ぶ。" },
    ],

    minimal_vs_maximal: [
      { score: -1.0, description: "最小限のもので暮らし、持ち物を厳選する。シンプルなデザインを好み、装飾を排除する。" },
      { score: -0.5, description: "基本はシンプルだが、お気に入りの領域では少しこだわりを見せる。" },
      { score: 0, description: "過剰でもなく質素でもない、バランスの取れた選択をする。" },
      { score: 0.5, description: "豊かさや華やかさを好み、空間や選択に厚みを持たせる。" },
      { score: 1.0, description: "大胆で華やかなスタイルを好み、「やりすぎ」を恐れない。レイヤードや装飾を積極的に取り入れる。" },
    ],

    perfectionist_vs_pragmatic: [
      { score: -1.0, description: "細部まで完璧を求め、納得いくまで何度もやり直す。期限より質を優先する。" },
      { score: -0.5, description: "高い基準を持つが、時間制約がある場合は妥協点を見つけられる。" },
      { score: 0, description: "質と効率のバランスを意識して行動する。" },
      { score: 0.5, description: "8割の出来で次に進み、完璧を追求するより前進を優先する。" },
      { score: 1.0, description: "「完了は完璧に勝る」を信条とし、スピードと実用性を最優先する。細部にこだわらない。" },
    ],

    // ========================================================================
    // Aesthetic
    // ========================================================================
    tradition_vs_novelty: [
      { score: -1.0, description: "実績のある古典的なものを好み、新しいトレンドに懐疑的である。時代を超えて残るものに価値を見出す。" },
      { score: -0.5, description: "伝統を尊重しつつ、良いと思える新しいものは取り入れる。" },
      { score: 0, description: "伝統と新しさのどちらにも偏らず、良いものを選ぶ。" },
      { score: 0.5, description: "新しいものに興味を持ち、新しいアプローチや方法を試したがる。" },
      { score: 1.0, description: "常に最先端を追い求め、前例のないアプローチに惹かれる。既存のやり方に退屈を感じる。" },
    ],

    quality_vs_quantity: [
      { score: -1.0, description: "少数の高品質なものに投資し、一つ一つに深い理解と愛着を持つ。広く浅くを嫌う。" },
      { score: -0.5, description: "基本は質を重視するが、一部の領域では幅広く試すことも楽しむ。" },
      { score: 0, description: "質と量のバランスを取り、領域によって使い分ける。" },
      { score: 0.5, description: "多くの選択肢を持ちたがり、いろいろ試すことを楽しむ。" },
      { score: 1.0, description: "常に新しいものを探索し、幅広い経験を積むことを重視する。一つに固執しない。" },
    ],

    classic_vs_trendy: [
      { score: -1.0, description: "流行に左右されず、時代を超えた定番を選ぶ。同じブランド・スタイルを長年使い続ける。" },
      { score: -0.5, description: "基本は定番志向だが、トレンドの中から自分に合うものを少し取り入れる。" },
      { score: 0, description: "クラシックとトレンドを自然に組み合わせる。" },
      { score: 0.5, description: "トレンドに敏感で、新しいスタイルをいち早く取り入れる。" },
      { score: 1.0, description: "常に最新のトレンドを追い、流行を先取りすることに喜びを感じる。去年の流行はもう古い。" },
    ],

    // ========================================================================
    // Safety
    // ========================================================================
    boundary_respect: [
      { score: -1.0, description: "他者の境界線を柔軟に扱い、暗黙の了解で相手の領域に入ることがある。悪意はないが距離感が近い。" },
      { score: -0.5, description: "相手の反応を見ながら境界を調整するが、やや踏み込みすぎることがある。" },
      { score: 0, description: "一般的な境界線の感覚を持ち、相手に合わせて調整する。" },
      { score: 0.5, description: "他者の境界線を意識的に尊重し、踏み込む前に確認する。" },
      { score: 1.0, description: "他者の境界線を常に明確に守り、相手が不快でないか慎重に確認してから行動する。" },
    ],

    consent_maturity: [
      { score: -1.0, description: "暗黙の了解や雰囲気で物事を進め、明確な確認を省略しがちである。「言わなくてもわかるだろう」と考える。" },
      { score: -0.5, description: "重要な場面では確認するが、日常的な場面では暗黙の同意に頼ることがある。" },
      { score: 0, description: "場面に応じて確認の程度を調整する。" },
      { score: 0.5, description: "重要な決定には明確な合意を求め、曖昧な状態を避けようとする。" },
      { score: 1.0, description: "あらゆる場面で相手の意思を明確に確認し、合意のプロセスを丁寧に踏む。曖昧さを残さない。" },
    ],

    pressure_risk: [
      { score: -1.0, description: "相手に圧をかけることがなく、相手のペースを尊重して待てる。断られても追求しない。" },
      { score: -0.5, description: "基本的には圧をかけないが、重要な場面で少し粘ることがある。" },
      { score: 0, description: "適度な主張はするが、相手の反応を見て引くことができる。" },
      { score: 0.5, description: "自分の希望を通すために説得を続けることがある。相手の「いいえ」をすぐに受け入れにくい。" },
      { score: 1.0, description: "自分の意見を通すために繰り返し働きかけ、相手が折れるまで主張を続けることが多い。" },
    ],

    escalation_risk: [
      { score: -1.0, description: "感情が高ぶっても段階的に落ち着き、議論がエスカレートしそうになるとブレーキをかけられる。" },
      { score: -0.5, description: "通常は冷静だが、特定のトリガーで少しエスカレートすることがある。すぐに気づいて修正する。" },
      { score: 0, description: "対立場面で一般的な程度の感情的反応を示す。" },
      { score: 0.5, description: "対立が始まると感情が加速し、声が大きくなったり言葉が強くなったりする。" },
      { score: 1.0, description: "一度対立が始まると急速にエスカレートし、言い過ぎたり攻撃的な態度になったりする。後から後悔する。" },
    ],

    rejection_response_maturity: [
      { score: -1.0, description: "拒否されると強い感情的反応を示し、相手を責めたり自分を過度に責めたりする。拒否を個人攻撃と受け取る。" },
      { score: -0.5, description: "拒否に傷つくが、時間をかければ受け入れられる。一時的に距離を置くことがある。" },
      { score: 0, description: "拒否に多少の失望を感じるが、相手の立場を理解しようとする。" },
      { score: 0.5, description: "拒否を冷静に受け止め、相手の選択を尊重する。関係に影響させない。" },
      { score: 1.0, description: "拒否を成熟に受け入れ、相手の判断を完全に尊重する。拒否された後も関係を健全に維持できる。" },
    ],

    control_tendency: [
      { score: -1.0, description: "相手の自律性を尊重し、コントロールしようとしない。相手の判断に口を出さない。" },
      { score: -0.5, description: "基本的には任せるが、気になることがあるとアドバイスの形で介入することがある。" },
      { score: 0, description: "場面によって助言と放任を使い分ける。" },
      { score: 0.5, description: "相手の行動や選択に口を出すことが多く、自分のやり方を推奨しがちである。" },
      { score: 1.0, description: "相手の行動を細かく管理しようとし、自分の思い通りにならないと不満を感じる。相手の予定や交友関係を把握したがる。" },
    ],

    exclusivity_pressure: [
      { score: -1.0, description: "相手の交友関係に干渉せず、自分以外の人間関係を自由に持つことを尊重する。" },
      { score: -0.5, description: "基本的に寛容だが、特定の相手に対して少し嫉妬心が芽生えることがある。" },
      { score: 0, description: "適度な独占欲はあるが、相手の自由を大きく制限しようとしない。" },
      { score: 0.5, description: "相手が他の人と親しくすることに不安や嫉妬を感じ、態度や言葉に出ることがある。" },
      { score: 1.0, description: "相手の他の人間関係に強い嫉妬を感じ、排他的な関係を求める。相手の交友を制限しようとする言動が出る。" },
    ],

    // ========================================================================
    // Depth (Stage 3)
    // ========================================================================
    attachment_style: [
      { score: -1.0, description: "強い回避型。親密さを避け、自立を最優先する。感情的距離を保つことで安全を確保する。" },
      { score: -0.5, description: "やや回避傾向。親密な関係に不安を感じやすいが、信頼できる相手には少しずつ開く。" },
      { score: 0, description: "安定型。親密さと自律のバランスが取れている。信頼関係を自然に築ける。" },
      { score: 0.5, description: "やや不安型。相手からの承認を求め、関係性の変化に敏感。" },
      { score: 1.0, description: "強い不安型。見捨てられる恐怖が強く、過度に相手に依存する。関係性に常に不安を抱える。" },
    ],
    locus_of_control: [
      { score: -1.0, description: "強い外的統制。自分の人生は運命や環境に左右されると信じている。" },
      { score: -0.5, description: "やや外的統制寄り。努力の効果を認めつつも、運や環境の影響を大きく感じる。" },
      { score: 0, description: "内的・外的統制のバランスが取れている。状況に応じて使い分ける。" },
      { score: 0.5, description: "やや内的統制寄り。自分の行動で結果を変えられると考え、主体的に動く。" },
      { score: 1.0, description: "強い内的統制。すべての結果は自分の選択次第だと確信している。" },
    ],
    growth_mindset: [
      { score: -1.0, description: "強い固定的知能観。能力は生まれつき決まっていると信じ、失敗を避ける。" },
      { score: -0.5, description: "やや固定的。得意分野では成長を信じるが、苦手分野は「才能がない」と諦める。" },
      { score: 0, description: "状況によって成長可能性の信念が変わる。" },
      { score: 0.5, description: "やや成長志向。努力で能力が伸びると信じ、挑戦を歓迎する。" },
      { score: 1.0, description: "強い成長的知能観。失敗は学びの機会と捉え、困難な挑戦を積極的に求める。" },
    ],
    shame_vs_guilt: [
      { score: -1.0, description: "罪悪感優位。問題を特定の行動に帰属させ、修復行動に向かう。自己全体は否定しない。" },
      { score: -0.5, description: "やや罪悪感寄り。失敗時に自分を責めるが、回復が早い。" },
      { score: 0, description: "恥と罪悪感のバランスが取れている。" },
      { score: 0.5, description: "やや恥優位。失敗が自己価値全体への脅威に感じられやすい。" },
      { score: 1.0, description: "恥優位。失敗を自己全体の否定と結びつけ、回避行動が強くなる。" },
    ],
    rumination_tendency: [
      { score: -1.0, description: "ほとんど反芻しない。過去の出来事を自然に手放し、前に進む。" },
      { score: -0.5, description: "一時的に考え込むが、比較的早く切り替えられる。" },
      { score: 0, description: "適度な振り返り。必要な内省はするが、過度に囚われない。" },
      { score: 0.5, description: "反芻傾向あり。ネガティブな出来事を繰り返し思い出し、気分が沈む。" },
      { score: 1.0, description: "強い反芻傾向。過去の失敗や嫌な経験が頭から離れず、長期間思い悩む。" },
    ],
    fairness_sensitivity: [
      { score: -1.0, description: "不公正にほとんど反応しない。不平等を受け入れ、気にしない。" },
      { score: -0.5, description: "明らかな不公正には反応するが、小さな不平等は気にならない。" },
      { score: 0, description: "一般的な公正感覚。明確な不公正には声を上げるが、過度に敏感ではない。" },
      { score: 0.5, description: "公正感受性が高い。小さな不平等にも気づき、是正したいと感じる。" },
      { score: 1.0, description: "非常に高い公正感受性。あらゆる不公正に強く反応し、正義を追求する。" },
    ],

    // Cognitive Fit
    abstract_structuring: [
      { score: -1.0, description: "常に具体例から積み上げて理解する。抽象的な説明だけでは理解が進まない。" },
      { score: 0, description: "具体と抽象を状況に応じて使い分ける。" },
      { score: 1.0, description: "まず全体像を抽象的に掴み、そこから具体に落とす。概念思考が得意。" },
    ],
    decomposition: [
      { score: -1.0, description: "全体を一気に処理する。分割すると全体像を見失う。" },
      { score: 0, description: "課題の複雑さに応じて分解するかどうかを判断する。" },
      { score: 1.0, description: "複雑な課題を小さなステップに分解して順番に処理する。" },
    ],
    cognitive_updating: [
      { score: -1.0, description: "一度下した判断を簡単には変えない。信念を強く保持する。" },
      { score: 0, description: "新しい情報があれば判断を見直すが、安易には変えない。" },
      { score: 1.0, description: "新しい証拠に基づいて素早く判断を更新する。柔軟な思考。" },
    ],
    decision_tempo: [
      { score: -1.0, description: "即断即決。直感を信じてすぐに行動に移す。" },
      { score: 0, description: "判断の重要度に応じて速度を調整する。" },
      { score: 1.0, description: "十分に熟考してから結論を出す。拙速な判断を避ける。" },
    ],
    social_modeling: [
      { score: -1.0, description: "相手の行動パターンから性格や意図を推測する。" },
      { score: 0, description: "行動と発言の両方から相手を理解しようとする。" },
      { score: 1.0, description: "相手の発言や意図の背景にある動機から理解しようとする。" },
    ],
    exploration_closure: [
      { score: -1.0, description: "素早く結論に到達したい。選択肢を絞り込むことを好む。" },
      { score: 0, description: "探索と絞り込みのバランスを取る。" },
      { score: 1.0, description: "可能性を広く探索することを好む。早期の絞り込みを避ける。" },
    ],

    // ========================================================================
    // Expansion
    // ========================================================================
    energy_rhythm: [
      { score: -1.0, description: "静かに一人で充電する時間が不可欠。活動的な回復は疲れる。" },
      { score: 0, description: "静的回復と活動的回復を状況に応じて使い分ける。" },
      { score: 1.0, description: "動くことでエネルギーが回復する。じっとしていると逆に疲れる。" },
    ],
    conflict_style: [
      { score: -1.0, description: "対立を避け、距離を取ることで自分を守る。" },
      { score: 0, description: "状況に応じて対立と回避を使い分ける。" },
      { score: 1.0, description: "対立を恐れず正面から向き合い、解決を目指す。" },
    ],
    novelty_threshold: [
      { score: -1.0, description: "慣れた範囲が安心。新しいことへの挑戦は慎重に進める。" },
      { score: 0, description: "新しいことも慣れたことも状況次第で楽しめる。" },
      { score: 1.0, description: "未知の体験を積極的に求める。マンネリを強く嫌う。" },
    ],
    self_disclosure_depth: [
      { score: -1.0, description: "核心は見せない。表層的な会話で十分と感じる。" },
      { score: 0, description: "相手との関係性に応じて開示の深さを調整する。" },
      { score: 1.0, description: "深い話を好み、本音で語り合える関係を求める。" },
    ],
    decision_regret: [
      { score: -1.0, description: "決めたら振り返らない。過去の決断を後悔しない。" },
      { score: 0, description: "大きな決断は振り返るが、小さなことは気にしない。" },
      { score: 1.0, description: "決断後に別の選択肢を考え続ける。後悔しやすい。" },
    ],
    relational_investment: [
      { score: -1.0, description: "広く薄くつながる。多くの人と適度な距離を保つ。" },
      { score: 0, description: "広い付き合いと深い付き合いの両方を持つ。" },
      { score: 1.0, description: "少数の相手に深く投資する。狭く深い関係を好む。" },
    ],
    rational_vs_emotional_decision: [
      { score: -1.0, description: "判断は論理と根拠で行う。感情は意思決定から切り離す。" },
      { score: 0, description: "論理と感情の両方を考慮してバランスよく判断する。" },
      { score: 1.0, description: "直感や感情を信頼し、それに基づいて判断する。" },
    ],
    efficiency_vs_process: [
      { score: -1.0, description: "最短経路で結果を出すことを重視する。無駄を嫌う。" },
      { score: 0, description: "効率と過程のバランスを取る。状況に応じて使い分ける。" },
      { score: 1.0, description: "過程そのものに価値を見出す。プロセスを楽しむ。" },
    ],
  };
