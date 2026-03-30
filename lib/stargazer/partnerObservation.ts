// lib/stargazer/partnerObservation.ts
// 相手タブ — 深層観測テーマ質問
// 特定の相手に対する自分の反応・感じ方を観測し、関係性の軸スコアに変換

import type { TraitAxisKey } from "./traitAxes";
import type { PartnerCategory } from "./partnerTypes";

// ── テーマ定義 ──

export type PartnerObservationTheme =
  | "comfort"        // 心地よさ — この人といて楽か？
  | "honesty"        // 本音 — 本音を言えるか？
  | "distance"       // 距離感 — 近さ/遠さの感覚
  | "dependency"     // 甘え — 頼れるか/甘えられるか
  | "trust"          // 信頼 — 信用できるか
  | "energy"         // エネルギー — 一緒にいると元気になるか消耗するか
  | "conflict"       // 衝突 — ぶつかった時どうなるか
  | "silence"        // 沈黙 — 黙っていても平気か
  | "change"         // 変化 — この人の前で自分が変わるか
  | "future";        // 未来 — この関係の先が見えるか

export interface PartnerObservationQuestion {
  id: string;
  theme: PartnerObservationTheme;
  /** 質問テキスト（ロボが聞くような語調） */
  prompt: string;
  /** 選択肢（4-5択） */
  options: PartnerObservationOption[];
  /** どのカテゴリの相手に特に有効か (空なら全カテゴリ) */
  relevantCategories?: PartnerCategory[];
  /** 深掘り質問 */
  followUp?: {
    triggeredBy: string; // option id
    prompt: string;
    options: PartnerObservationOption[];
  }[];
}

export interface PartnerObservationOption {
  id: string;
  text: string;
  /** 軸スコアへの影響 */
  axisMappings: { key: TraitAxisKey; weight: number }[];
  /** 関係性レーダーへの影響 (温かさ/距離感/信頼/圧/読みやすさ/柔らかさ/近寄りやすさ/強さ) */
  relationshipRadarEffect?: { axis: string; delta: number }[];
}

// ── テーマメタデータ ──

export const PARTNER_THEME_META: Record<
  PartnerObservationTheme,
  { label: string; icon: string; sublabel: string; color: string }
> = {
  comfort:    { label: "心地よさ",   icon: "☁️",  sublabel: "COMFORT",    color: "rgba(134,239,172,0.6)" },
  honesty:    { label: "本音",       icon: "💬",  sublabel: "HONESTY",    color: "rgba(251,191,36,0.6)" },
  distance:   { label: "距離感",     icon: "📏",  sublabel: "DISTANCE",   color: "rgba(147,197,253,0.6)" },
  dependency: { label: "頼りかた",   icon: "🤲",  sublabel: "DEPENDENCY", color: "rgba(249,168,212,0.6)" },
  trust:      { label: "信頼",       icon: "🔒",  sublabel: "TRUST",      color: "rgba(196,181,253,0.6)" },
  energy:     { label: "エネルギー", icon: "⚡",  sublabel: "ENERGY",     color: "rgba(253,186,116,0.6)" },
  conflict:   { label: "衝突",       icon: "🌊",  sublabel: "CONFLICT",   color: "rgba(248,113,113,0.6)" },
  silence:    { label: "沈黙",       icon: "🌙",  sublabel: "SILENCE",    color: "rgba(165,180,252,0.6)" },
  change:     { label: "変化",       icon: "🦋",  sublabel: "CHANGE",     color: "rgba(167,243,208,0.6)" },
  future:     { label: "未来",       icon: "🔮",  sublabel: "FUTURE",     color: "rgba(216,180,254,0.6)" },
};

// ── 深層観測テーマ質問 ──

export const PARTNER_OBSERVATION_QUESTIONS: PartnerObservationQuestion[] = [
  // ═══════════════════════════════════════════
  // 1. 心地よさ — この人と話してて楽か？
  // ═══════════════════════════════════════════
  {
    id: "po_comfort_01",
    theme: "comfort",
    prompt: "この人と一緒にいるとき、あなたはどんな感じ？",
    options: [
      {
        id: "po_c01_a",
        text: "自然体でいられる。何も飾らなくていい",
        axisMappings: [
          { key: "public_private_gap", weight: -0.4 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 15 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "po_c01_b",
        text: "楽だけど、少し気を使っている部分もある",
        axisMappings: [
          { key: "public_private_gap", weight: 0.2 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "po_c01_c",
        text: "楽しいけど、エネルギーは使う",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.2 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 3 },
          { axis: "pressure", delta: 5 },
        ],
      },
      {
        id: "po_c01_d",
        text: "正直、少し疲れることもある",
        axisMappings: [
          { key: "emotional_variability", weight: 0.2 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "warmth", delta: -5 },
        ],
      },
    ],
    followUp: [
      {
        triggeredBy: "po_c01_b",
        prompt: "気を使っている部分、具体的にどんな時？",
        options: [
          {
            id: "po_c01_b_fu1",
            text: "相手の機嫌が読みにくいとき",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "emotional_variability", weight: 0.2 },
            ],
          },
          {
            id: "po_c01_b_fu2",
            text: "自分の本音を出していいか分からないとき",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "direct_vs_diplomatic", weight: 0.2 },
            ],
          },
          {
            id: "po_c01_b_fu3",
            text: "沈黙が続いたとき",
            axisMappings: [
              { key: "social_initiative", weight: 0.2 },
              { key: "reassurance_need", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 2. 本音 — この人に本音を言えるか？
  // ═══════════════════════════════════════════
  {
    id: "po_honesty_01",
    theme: "honesty",
    prompt: "この人に、本当に思っていることを伝えられる？",
    options: [
      {
        id: "po_h01_a",
        text: "ほぼ全部言える。それで関係が壊れないと思ってる",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.4 },
          { key: "public_private_gap", weight: -0.4 },
          { key: "consent_maturity", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 15 },
          { axis: "readability", delta: 10 },
        ],
      },
      {
        id: "po_h01_b",
        text: "言いたいけど、傷つけそうなことは避ける",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 5 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "po_h01_c",
        text: "大事なことほど言えない。後悔することもある",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_regulation", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -10 },
          { axis: "distance", delta: 10 },
        ],
      },
      {
        id: "po_h01_d",
        text: "相手の反応次第で出し方を変えてる",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "approachability", delta: 5 },
        ],
      },
    ],
    followUp: [
      {
        triggeredBy: "po_h01_c",
        prompt: "言えなかった時、どうしてる？",
        options: [
          {
            id: "po_h01_c_fu1",
            text: "自分の中で消化する。時間が解決してくれる",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: -0.3 },
              { key: "emotional_regulation", weight: 0.2 },
            ],
          },
          {
            id: "po_h01_c_fu2",
            text: "別の人に話して整理する",
            axisMappings: [
              { key: "stress_isolation_vs_social", weight: 0.3 },
              { key: "individual_vs_social", weight: 0.2 },
            ],
          },
          {
            id: "po_h01_c_fu3",
            text: "態度に出てしまうことがある",
            axisMappings: [
              { key: "emotional_regulation", weight: -0.3 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 3. 距離感 — ちょうどいい距離は？
  // ═══════════════════════════════════════════
  {
    id: "po_distance_01",
    theme: "distance",
    prompt: "この人との「ちょうどいい距離」って、どのあたり？",
    options: [
      {
        id: "po_d01_a",
        text: "かなり近い。毎日連絡取りたいくらい",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.5 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "exclusivity_pressure", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: -15 },
          { axis: "warmth", delta: 10 },
        ],
      },
      {
        id: "po_d01_b",
        text: "適度に。会った時に濃い時間を過ごせればいい",
        axisMappings: [
          { key: "quality_vs_quantity", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 0 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "po_d01_c",
        text: "自分のペースを保ちたい。近すぎると息苦しい",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "po_d01_d",
        text: "正直、もう少し距離が欲しいかもしれない",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.3 },
          { key: "stress_isolation_vs_social", weight: -0.3 },
          { key: "exclusivity_pressure", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 15 },
          { axis: "pressure", delta: 5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 4. 甘え — 頼れるか？
  // ═══════════════════════════════════════════
  {
    id: "po_dependency_01",
    theme: "dependency",
    prompt: "この人に甘えたり、頼ったりできる？",
    options: [
      {
        id: "po_dep01_a",
        text: "自然に頼れる。向こうも頼ってくれる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.2 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "consent_maturity", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "trust", delta: 10 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "po_dep01_b",
        text: "頼りたいけど、迷惑かなと思ってしまう",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "public_private_gap", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 5 },
          { axis: "approachability", delta: -5 },
        ],
      },
      {
        id: "po_dep01_c",
        text: "あまり頼らない。自分で解決したい派",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "individual_vs_social", weight: -0.3 },
          { key: "stress_isolation_vs_social", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 10 },
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "po_dep01_d",
        text: "頼るのは苦手。でもこの人なら少しずつ",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.2 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 5 },
          { axis: "approachability", delta: 5 },
        ],
      },
    ],
    relevantCategories: ["romantic", "spouse", "family", "friend"],
  },

  // ═══════════════════════════════════════════
  // 5. 信頼 — この人を信頼できるか？
  // ═══════════════════════════════════════════
  {
    id: "po_trust_01",
    theme: "trust",
    prompt: "この人のこと、どれくらい信頼してる？",
    options: [
      {
        id: "po_t01_a",
        text: "深く信頼している。裏切らないと確信がある",
        axisMappings: [
          { key: "consent_maturity", weight: 0.4 },
          { key: "long_term_shift_risk", weight: -0.3 },
          { key: "intent_stability", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 20 },
          { axis: "warmth", delta: 5 },
        ],
      },
      {
        id: "po_t01_b",
        text: "信頼してるけど、全部は見せていない",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "cautious_vs_bold", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "readability", delta: -5 },
        ],
      },
      {
        id: "po_t01_c",
        text: "まだ様子見。信頼は時間が必要",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "cautious_vs_bold", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 0 },
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "po_t01_d",
        text: "正直、少し不安がある",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_variability", weight: 0.2 },
          { key: "control_tendency", weight: 0.1 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: -5 },
          { axis: "pressure", delta: 5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 6. エネルギー — 一緒にいると元気？消耗？
  // ═══════════════════════════════════════════
  {
    id: "po_energy_01",
    theme: "energy",
    prompt: "この人と過ごした後、あなたのエネルギーはどうなる？",
    options: [
      {
        id: "po_e01_a",
        text: "元気になる。また会いたいと思える",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: 0.3 },
          { key: "introvert_vs_extrovert", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "approachability", delta: 10 },
        ],
      },
      {
        id: "po_e01_b",
        text: "楽しいけど、その後は一人の時間が必要",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.3 },
          { key: "stress_isolation_vs_social", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "distance", delta: 5 },
        ],
      },
      {
        id: "po_e01_c",
        text: "相手次第。向こうのテンションに引っ張られがち",
        axisMappings: [
          { key: "emotional_variability", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: -5 },
          { axis: "softness", delta: 5 },
        ],
      },
      {
        id: "po_e01_d",
        text: "少し消耗する。気を張ってる自分がいる",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "emotional_regulation", weight: -0.2 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "approachability", delta: -5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 7. 衝突 — ぶつかったらどうなる？
  // ═══════════════════════════════════════════
  {
    id: "po_conflict_01",
    theme: "conflict",
    prompt: "もしこの人と意見がぶつかったら、あなたはどうなる？",
    options: [
      {
        id: "po_cf01_a",
        text: "冷静に話し合える。お互い大人だから",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: -0.2 },
          { key: "rejection_response_maturity", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 10 },
          { axis: "trust", delta: 5 },
        ],
      },
      {
        id: "po_cf01_b",
        text: "自分が折れることが多い。波風立てたくない",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "direct_vs_diplomatic", weight: 0.4 },
          { key: "pressure_risk", weight: -0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 10 },
          { axis: "strength", delta: -5 },
        ],
      },
      {
        id: "po_cf01_c",
        text: "つい感情的になってしまう",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.4 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "escalation_risk", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 10 },
          { axis: "readability", delta: 5 },
        ],
      },
      {
        id: "po_cf01_d",
        text: "距離を置く。しばらく連絡しないかも",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.3 },
          { key: "rejection_response_maturity", weight: -0.1 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 10 },
          { axis: "approachability", delta: -5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 8. 沈黙 — 黙っていても平気？
  // ═══════════════════════════════════════════
  {
    id: "po_silence_01",
    theme: "silence",
    prompt: "この人と一緒にいて、沈黙が続いたらどう感じる？",
    options: [
      {
        id: "po_s01_a",
        text: "全然平気。むしろ心地いい",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.3 },
          { key: "reassurance_need", weight: -0.4 },
          { key: "intimacy_pace", weight: 0.1 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "softness", delta: 10 },
        ],
      },
      {
        id: "po_s01_b",
        text: "少しそわそわする。何か話したくなる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "social_initiative", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "approachability", delta: 5 },
          { axis: "readability", delta: 5 },
        ],
      },
      {
        id: "po_s01_c",
        text: "場の空気を読んで、自分から何か振る",
        axisMappings: [
          { key: "social_initiative", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "approachability", delta: 5 },
          { axis: "warmth", delta: 3 },
        ],
      },
      {
        id: "po_s01_d",
        text: "不安になる。嫌われてるかもと思ってしまう",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "pressure", delta: 5 },
          { axis: "readability", delta: -5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 9. 変化 — この人の前で自分は変わるか？
  // ═══════════════════════════════════════════
  {
    id: "po_change_01",
    theme: "change",
    prompt: "この人といると、普段の自分と違う自分が出てくる？",
    options: [
      {
        id: "po_ch01_a",
        text: "いつもの自分のまま。変わらない",
        axisMappings: [
          { key: "relationship_mode_split", weight: -0.4 },
          { key: "public_private_gap", weight: -0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "readability", delta: 10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "po_ch01_b",
        text: "少し明るくなる。素が出やすい",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.2 },
          { key: "introvert_vs_extrovert", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 5 },
          { axis: "approachability", delta: 5 },
        ],
      },
      {
        id: "po_ch01_c",
        text: "少し控えめになる。相手に合わせてる自分がいる",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.3 },
          { key: "public_private_gap", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "softness", delta: 5 },
          { axis: "readability", delta: -5 },
        ],
      },
      {
        id: "po_ch01_d",
        text: "強くなる。この人の前だと自信が出る",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "cautious_vs_bold", weight: 0.2 },
          { key: "social_initiative", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "strength", delta: 10 },
          { axis: "trust", delta: 5 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 10. 未来 — この関係の先は？
  // ═══════════════════════════════════════════
  {
    id: "po_future_01",
    theme: "future",
    prompt: "この人との関係、先のことを考えたりする？",
    options: [
      {
        id: "po_f01_a",
        text: "自然に続いていくと思ってる。特に心配してない",
        axisMappings: [
          { key: "long_term_shift_risk", weight: -0.3 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "intent_stability", weight: 0.3 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: 10 },
          { axis: "strength", delta: 5 },
        ],
      },
      {
        id: "po_f01_b",
        text: "もっと深い関係になりたい",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.3 },
          { key: "quality_vs_quantity", weight: -0.2 },
          { key: "social_initiative", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "warmth", delta: 10 },
          { axis: "distance", delta: -5 },
        ],
      },
      {
        id: "po_f01_c",
        text: "今のままでいい。変に変わらないでほしい",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "distance", delta: 0 },
          { axis: "strength", delta: 3 },
        ],
      },
      {
        id: "po_f01_d",
        text: "少し不安がある。この関係がいつまで続くか",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "long_term_shift_risk", weight: 0.3 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        relationshipRadarEffect: [
          { axis: "trust", delta: -5 },
          { axis: "pressure", delta: 5 },
        ],
      },
    ],
    relevantCategories: ["romantic", "spouse", "friend"],
  },
];

// ── ユーティリティ ──

/**
 * パートナーカテゴリと過去の回答を考慮して、今日の深層観測テーマを選択
 */
export function selectPartnerThemes(
  category: PartnerCategory,
  answeredThemeIds: string[] = [],
  count = 3
): PartnerObservationQuestion[] {
  // カテゴリに関連する質問をフィルタ
  const relevant = PARTNER_OBSERVATION_QUESTIONS.filter((q) => {
    if (q.relevantCategories && !q.relevantCategories.includes(category)) {
      return false;
    }
    return !answeredThemeIds.includes(q.id);
  });

  if (relevant.length === 0) {
    // 全部回答済みなら2周目
    return PARTNER_OBSERVATION_QUESTIONS.filter(
      (q) => !q.relevantCategories || q.relevantCategories.includes(category)
    ).slice(0, count);
  }

  // 日付ベースシードでシャッフル
  const today = new Date().toISOString().slice(0, 10);
  const seed = hashStr(today + category);
  const shuffled = [...relevant].sort((a, b) => {
    return (hashStr(a.id + today) % 1000) - (hashStr(b.id + today) % 1000);
  });

  return shuffled.slice(0, count);
}

/**
 * 全テーマ一覧を返す（テーマ選択UIで使用）
 */
export function getAllThemes(): {
  theme: PartnerObservationTheme;
  meta: (typeof PARTNER_THEME_META)[PartnerObservationTheme];
  questionCount: number;
}[] {
  const themes = Object.keys(PARTNER_THEME_META) as PartnerObservationTheme[];
  return themes.map((theme) => ({
    theme,
    meta: PARTNER_THEME_META[theme],
    questionCount: PARTNER_OBSERVATION_QUESTIONS.filter(
      (q) => q.theme === theme
    ).length,
  }));
}

/**
 * テーマを指定して質問を取得
 * category が指定された場合、カテゴリ専用質問を優先して返す
 */
export function getQuestionsByTheme(
  theme: PartnerObservationTheme,
  category?: PartnerCategory
): PartnerObservationQuestion[] {
  if (category) {
    // カテゴリ別質問を優先
    const { getCategoryQuestionsByTheme } = require("./partnerCategoryQuestions");
    const categoryQs = getCategoryQuestionsByTheme(category, theme);
    if (categoryQs.length > 0) {
      // カテゴリ別質問を PartnerObservationQuestion 形式で返す
      return categoryQs.map((cq: { id: string; theme: PartnerObservationTheme; prompt: string; options: PartnerObservationOption[]; followUp?: { triggeredBy: string; prompt: string; options: PartnerObservationOption[] }[] }) => ({
        id: cq.id,
        theme: cq.theme,
        prompt: cq.prompt,
        options: cq.options,
        followUp: cq.followUp,
      }));
    }
  }
  // フォールバック: 汎用質問
  return PARTNER_OBSERVATION_QUESTIONS.filter((q) => q.theme === theme);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
