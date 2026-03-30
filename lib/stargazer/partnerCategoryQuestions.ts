// lib/stargazer/partnerCategoryQuestions.ts
// カテゴリ別（関係性別）の深層質問セット
// 友達/恋人/配偶者/家族/仕事仲間 — それぞれに固有の観測視点を持つ

import type { TraitAxisKey } from "./traitAxes";
import type { PartnerCategory } from "./partnerTypes";
import type {
  PartnerObservationTheme,
  PartnerObservationOption,
} from "./partnerObservation";

export interface CategoryQuestion {
  id: string;
  category: PartnerCategory;
  theme: PartnerObservationTheme;
  prompt: string;
  options: PartnerObservationOption[];
  /** 通常観測テーマとのクロスリファレンス用 */
  crossReferenceTheme?: string;
  followUp?: {
    triggeredBy: string;
    prompt: string;
    options: PartnerObservationOption[];
  }[];
}

// ═══════════════════════════════════════════
// 友達 (friend)
// グループ内の距離感、沈黙の質、助け方、依存度
// ═══════════════════════════════════════════

const FRIEND_QUESTIONS: CategoryQuestion[] = [
  {
    id: "cat_friend_01",
    category: "friend",
    theme: "distance",
    prompt: "この友達とのグループでの距離感、あなたはどう？",
    crossReferenceTheme: "social_dynamics",
    options: [
      {
        id: "cf01_a",
        text: "この人がいるとグループの中心にいやすい",
        axisMappings: [
          { key: "social_initiative", weight: 0.3 },
          { key: "introvert_vs_extrovert", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "cf01_b",
        text: "二人だと話せるけど、グループだと少し控えめになる",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.3 },
          { key: "relationship_mode_split", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "readability", delta: -5 },
        ],
      },
      {
        id: "cf01_c",
        text: "グループでも二人でも、あまり変わらない",
        axisMappings: [
          { key: "relationship_mode_split", weight: -0.3 },
          { key: "public_private_gap", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: 10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "cf01_d",
        text: "実は二人で会うことがほとんどない",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.2 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 10 },
        ],
      },
    ],
  },
  {
    id: "cat_friend_02",
    category: "friend",
    theme: "silence",
    prompt: "この友達との沈黙、どんな感じ？",
    crossReferenceTheme: "intimacy_pattern",
    options: [
      {
        id: "cf02_a",
        text: "沈黙でも全然気まずくない。それが居心地いい",
        axisMappings: [
          { key: "reassurance_need", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "cf02_b",
        text: "少し気まずい。何か話さなきゃと思う",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "social_initiative", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 5 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "cf02_c",
        text: "スマホを見始める。お互い自然にそうなる",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.2 },
          { key: "independence_vs_harmony", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "cf02_d",
        text: "相手が不機嫌なのか心配になる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "readability", delta: -5 },
        ],
      },
    ],
  },
  {
    id: "cat_friend_03",
    category: "friend",
    theme: "dependency",
    prompt: "この友達が助けを求めてきたら？",
    crossReferenceTheme: "trust_building",
    options: [
      {
        id: "cf03_a",
        text: "すぐ動く。自分にできることは何でもする",
        axisMappings: [
          { key: "social_initiative", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "consent_maturity", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 15 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "cf03_b",
        text: "話を聞いてあげる。でもアドバイスより共感を優先する",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 10 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cf03_c",
        text: "どこまで踏み込んでいいか、少し迷う",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "intimacy_pace", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "readability", delta: -3 },
        ],
      },
      {
        id: "cf03_d",
        text: "正直、負担に感じることもある",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "stress_isolation_vs_social", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "distance", delta: 5 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════
// 恋人 (romantic)
// 嫉妬の感じ方、将来の話、安心の伝え方、身体的距離感
// ═══════════════════════════════════════════

const ROMANTIC_QUESTIONS: CategoryQuestion[] = [
  {
    id: "cat_romantic_01",
    category: "romantic",
    theme: "trust",
    prompt: "この人が異性の友達と仲良くしてるとき、正直どう感じる？",
    crossReferenceTheme: "emotional_processing",
    options: [
      {
        id: "cr01_a",
        text: "気にならない。信頼してるから",
        axisMappings: [
          { key: "consent_maturity", weight: 0.4 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "exclusivity_pressure", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 15 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "cr01_b",
        text: "少しモヤっとする。でも口には出さない",
        axisMappings: [
          { key: "exclusivity_pressure", weight: 0.2 },
          { key: "public_private_gap", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "pressure", delta: 5 },
        ],
      },
      {
        id: "cr01_c",
        text: "不安を感じる。つい確認したくなる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "exclusivity_pressure", weight: 0.4 },
          { key: "control_tendency", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 15 },
          { axis: "trust", delta: -5 },
        ],
      },
      {
        id: "cr01_d",
        text: "自分も同じように他の人と仲良くするタイプ",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "exclusivity_pressure", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "strength", delta: 5 },
        ],
      },
    ],
    followUp: [
      {
        triggeredBy: "cr01_c",
        prompt: "確認したくなった時、実際にどうする？",
        options: [
          {
            id: "cr01_c_fu1",
            text: "素直に「ちょっと不安」と伝える",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "emotional_regulation", weight: -0.1 },
            ],
          },
          {
            id: "cr01_c_fu2",
            text: "SNSをチェックしたり、予定を探ったりする",
            axisMappings: [
              { key: "control_tendency", weight: 0.4 },
              { key: "escalation_risk", weight: 0.2 },
            ],
          },
          {
            id: "cr01_c_fu3",
            text: "我慢して、自分の中で処理しようとする",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "stress_isolation_vs_social", weight: -0.3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "cat_romantic_02",
    category: "romantic",
    theme: "future",
    prompt: "この人との将来の話、どのくらいしてる？",
    crossReferenceTheme: "change_adaptation",
    options: [
      {
        id: "cr02_a",
        text: "よく話す。自然にそういう話題になる",
        axisMappings: [
          { key: "intent_stability", weight: 0.4 },
          { key: "long_term_shift_risk", weight: -0.3 },
          { key: "intimacy_pace", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cr02_b",
        text: "たまに触れるけど、深くは話さない",
        axisMappings: [
          { key: "cautious_vs_bold", weight: -0.2 },
          { key: "intimacy_pace", weight: -0.1 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 3 },
        ],
      },
      {
        id: "cr02_c",
        text: "自分からは切り出しにくい。相手が話してくれたら嬉しい",
        axisMappings: [
          { key: "social_initiative", weight: -0.3 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "softness", delta: 5 },
        ],
      },
      {
        id: "cr02_d",
        text: "今を大事にしたい。先のことはあまり考えたくない",
        axisMappings: [
          { key: "long_term_shift_risk", weight: 0.3 },
          { key: "change_embrace_vs_resist", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "pressure", delta: -5 },
        ],
      },
    ],
  },
  {
    id: "cat_romantic_03",
    category: "romantic",
    theme: "comfort",
    prompt: "この人に安心してもらいたい時、あなたはどうする？",
    crossReferenceTheme: "self_expression",
    options: [
      {
        id: "cr03_a",
        text: "言葉で「大丈夫だよ」と伝える",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.2 },
          { key: "social_initiative", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "readability", delta: 10 },
        ],
      },
      {
        id: "cr03_b",
        text: "そばにいる。言葉よりも存在で示す",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: 0.2 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 10 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cr03_c",
        text: "具体的な行動で示す。問題を解決しようとする",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "social_initiative", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 10 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "cr03_d",
        text: "どう安心させればいいか分からない時がある",
        axisMappings: [
          { key: "reassurance_need", weight: 0.2 },
          { key: "emotional_variability", weight: 0.2 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "distance", delta: 5 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════
// 配偶者 (spouse)
// 日常の中の信頼、家事分担の感じ方、価値観のすり合わせ
// ═══════════════════════════════════════════

const SPOUSE_QUESTIONS: CategoryQuestion[] = [
  {
    id: "cat_spouse_01",
    category: "spouse",
    theme: "trust",
    prompt: "パートナーとの「言わなくても伝わっている」と思うこと、ある？",
    crossReferenceTheme: "intimacy_pattern",
    options: [
      {
        id: "cs01_a",
        text: "たくさんある。阿吽の呼吸がある",
        axisMappings: [
          { key: "consent_maturity", weight: 0.3 },
          { key: "public_private_gap", weight: -0.3 },
          { key: "long_term_shift_risk", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 15 },
          { axis: "warmth", delta: 10 },
        ],
      },
      {
        id: "cs01_b",
        text: "あると思ってたけど、実はすれ違っていたこともある",
        axisMappings: [
          { key: "reassurance_need", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "cs01_c",
        text: "大事なことほど、きちんと言葉にするようにしている",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "consent_maturity", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "readability", delta: 10 },
        ],
      },
      {
        id: "cs01_d",
        text: "正直、何を考えているか分からない時がある",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -10 },
          { axis: "pressure", delta: 5 },
        ],
      },
    ],
  },
  {
    id: "cat_spouse_02",
    category: "spouse",
    theme: "conflict",
    prompt: "家事や育児の分担について、モヤッとすることある？",
    crossReferenceTheme: "boundary_navigation",
    options: [
      {
        id: "cs02_a",
        text: "特にない。お互いうまくやれている",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "trust", delta: 5 },
        ],
      },
      {
        id: "cs02_b",
        text: "ある。でも言い出すと喧嘩になりそうで我慢してる",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "pressure_risk", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "readability", delta: -5 },
        ],
      },
      {
        id: "cs02_c",
        text: "定期的に話し合って調整している",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "consent_maturity", weight: 0.4 },
          { key: "rejection_response_maturity", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "cs02_d",
        text: "自分がやった方が早いと思ってしまう",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "control_tendency", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 5 },
          { axis: "pressure", delta: 5 },
        ],
      },
    ],
  },
  {
    id: "cat_spouse_03",
    category: "spouse",
    theme: "change",
    prompt: "パートナーの「変わった部分」と「変わらない部分」、どっちが気になる？",
    crossReferenceTheme: "change_adaptation",
    options: [
      {
        id: "cs03_a",
        text: "変わらない安心感がいい。根っこが同じなのが嬉しい",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "intent_stability", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cs03_b",
        text: "成長や変化を見るのが楽しい",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "tradition_vs_novelty", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "cs03_c",
        text: "変わったことに少し寂しさを感じることがある",
        axisMappings: [
          { key: "long_term_shift_risk", weight: 0.3 },
          { key: "reassurance_need", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "pressure", delta: 3 },
        ],
      },
      {
        id: "cs03_d",
        text: "自分自身も変わっているから、お互い様だと思う",
        axisMappings: [
          { key: "consent_maturity", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 5 },
          { axis: "readability", delta: 5 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════
// 家族 (family)
// 無条件の甘え、世代間ギャップ、距離の取り方
// ═══════════════════════════════════════════

const FAMILY_QUESTIONS: CategoryQuestion[] = [
  {
    id: "cat_family_01",
    category: "family",
    theme: "dependency",
    prompt: "この家族に弱みを見せられる？",
    crossReferenceTheme: "self_expression",
    options: [
      {
        id: "cfm01_a",
        text: "見せられる。家族だから安心して甘えられる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.2 },
          { key: "public_private_gap", weight: -0.4 },
          { key: "independence_vs_harmony", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 15 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "cfm01_b",
        text: "家族だからこそ、心配かけたくなくて見せない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "cfm01_c",
        text: "弱みは見せるけど、相手の反応で後悔することもある",
        axisMappings: [
          { key: "emotional_variability", weight: 0.3 },
          { key: "reassurance_need", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 5 },
          { axis: "warmth", delta: 3 },
        ],
      },
      {
        id: "cfm01_d",
        text: "家族より友達の方が話しやすい",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.4 },
          { key: "friend_mode_fit", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 10 },
          { axis: "readability", delta: -5 },
        ],
      },
    ],
  },
  {
    id: "cat_family_02",
    category: "family",
    theme: "distance",
    prompt: "この家族との「ちょうどいい距離」、今取れてる？",
    crossReferenceTheme: "boundary_navigation",
    options: [
      {
        id: "cfm02_a",
        text: "ちょうどいい。近すぎず遠すぎず",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 5 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cfm02_b",
        text: "もう少し離れたい。干渉が気になる時がある",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "exclusivity_pressure", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "distance", delta: 10 },
        ],
      },
      {
        id: "cfm02_c",
        text: "もっと近くにいたい。寂しさを感じることがある",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.3 },
          { key: "reassurance_need", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "distance", delta: -10 },
        ],
      },
      {
        id: "cfm02_d",
        text: "物理的な距離と心の距離が一致していない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "relationship_mode_split", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "distance", delta: 5 },
        ],
      },
    ],
  },
  {
    id: "cat_family_03",
    category: "family",
    theme: "honesty",
    prompt: "この家族と価値観が合わないとき、あなたはどうする？",
    crossReferenceTheme: "conflict_response",
    options: [
      {
        id: "cfm03_a",
        text: "自分の意見を伝える。分かり合えなくても",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "rejection_response_maturity", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: 10 },
          { axis: "strength", delta: 10 },
        ],
      },
      {
        id: "cfm03_b",
        text: "表面的に合わせて、心の中では距離を置く",
        axisMappings: [
          { key: "public_private_gap", weight: 0.5 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -10 },
          { axis: "distance", delta: 10 },
        ],
      },
      {
        id: "cfm03_c",
        text: "世代が違うから仕方ないと思う",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.3 },
          { key: "consent_maturity", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 5 },
          { axis: "distance", delta: 3 },
        ],
      },
      {
        id: "cfm03_d",
        text: "話し合いたいけど、感情的になってしまう",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.3 },
          { key: "escalation_risk", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "readability", delta: 5 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════
// 仕事仲間 (colleague)
// 仕事上の信頼、上下関係の感じ方、プライベートの境界
// ═══════════════════════════════════════════

const COLLEAGUE_QUESTIONS: CategoryQuestion[] = [
  {
    id: "cat_colleague_01",
    category: "colleague",
    theme: "trust",
    prompt: "この仕事仲間に、仕事を安心して任せられる？",
    crossReferenceTheme: "decision_making",
    options: [
      {
        id: "cc01_a",
        text: "完全に任せられる。信頼している",
        axisMappings: [
          { key: "consent_maturity", weight: 0.3 },
          { key: "control_tendency", weight: -0.3 },
          { key: "intent_stability", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 15 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "cc01_b",
        text: "任せるけど、進捗は確認したい",
        axisMappings: [
          { key: "control_tendency", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 5 },
          { axis: "pressure", delta: 5 },
        ],
      },
      {
        id: "cc01_c",
        text: "自分でやった方が早いと思ってしまう",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "control_tendency", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "pressure", delta: 5 },
        ],
      },
      {
        id: "cc01_d",
        text: "相手次第。この人には任せたくない部分もある",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: -3 },
          { axis: "readability", delta: 5 },
        ],
      },
    ],
  },
  {
    id: "cat_colleague_02",
    category: "colleague",
    theme: "distance",
    prompt: "この仕事仲間とプライベートの話、どこまでする？",
    crossReferenceTheme: "boundary_navigation",
    options: [
      {
        id: "cc02_a",
        text: "結構する。仕事仲間だけど友達みたいな感覚",
        axisMappings: [
          { key: "public_private_gap", weight: -0.3 },
          { key: "friend_mode_fit", weight: 0.3 },
          { key: "intimacy_pace", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "distance", delta: -10 },
        ],
      },
      {
        id: "cc02_b",
        text: "仕事の話が中心。プライベートは少しだけ",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "readability", delta: -3 },
        ],
      },
      {
        id: "cc02_c",
        text: "仕事とプライベートは完全に分けたい",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.5 },
          { key: "public_private_gap", weight: 0.4 },
          { key: "relationship_mode_split", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 15 },
          { axis: "readability", delta: -10 },
        ],
      },
      {
        id: "cc02_d",
        text: "相手から聞かれたら答えるけど、自分からは話さない",
        axisMappings: [
          { key: "social_initiative", weight: -0.2 },
          { key: "cautious_vs_bold", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "softness", delta: 3 },
        ],
      },
    ],
  },
  {
    id: "cat_colleague_03",
    category: "colleague",
    theme: "conflict",
    prompt: "この仕事仲間と意見が対立したとき、どうなる？",
    crossReferenceTheme: "conflict_response",
    options: [
      {
        id: "cc03_a",
        text: "論理的に議論できる。仕事だから感情は入れない",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 10 },
          { axis: "readability", delta: 5 },
        ],
      },
      {
        id: "cc03_b",
        text: "相手の立場を考えて、折り合いをつける",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 10 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "cc03_c",
        text: "立場の力関係で決まりがち。本音は言えない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "pressure_risk", weight: -0.2 },
          { key: "independence_vs_harmony", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "readability", delta: -10 },
        ],
      },
      {
        id: "cc03_d",
        text: "後からモヤモヤする。その場では言えなかったことを思い出す",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.2 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
          { key: "public_private_gap", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 5 },
          { axis: "distance", delta: 5 },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════
// 全カテゴリ統合
// ═══════════════════════════════════════════

export const CATEGORY_QUESTIONS: Record<PartnerCategory, CategoryQuestion[]> = {
  friend: FRIEND_QUESTIONS,
  romantic: ROMANTIC_QUESTIONS,
  spouse: SPOUSE_QUESTIONS,
  family: FAMILY_QUESTIONS,
  colleague: COLLEAGUE_QUESTIONS,
};

/**
 * カテゴリ別の質問を取得
 */
export function getCategoryQuestions(
  category: PartnerCategory,
  answeredIds: string[] = []
): CategoryQuestion[] {
  const questions = CATEGORY_QUESTIONS[category] || [];
  const unanswered = questions.filter((q) => !answeredIds.includes(q.id));
  return unanswered.length > 0 ? unanswered : questions;
}

/**
 * カテゴリ別の質問を特定テーマでフィルタ
 */
export function getCategoryQuestionsByTheme(
  category: PartnerCategory,
  theme: PartnerObservationTheme
): CategoryQuestion[] {
  return (CATEGORY_QUESTIONS[category] || []).filter((q) => q.theme === theme);
}
