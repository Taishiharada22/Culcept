// lib/stargazer/rendezvousInitialQuestions.ts
// ランデブー導入質問 V2 — 全面改善版
// 6コンテキスト: general / romantic / friendship / cocreation / family / spouse
// 66基本問 + 約28深掘り問 = 最大94問（実際は66 + 10-18深掘り = 76-84問）

import type { TraitAxisKey } from "./traitAxes";

// ════════════════════════════════════════════════════════════════════
// 型定義
// ════════════════════════════════════════════════════════════════════

export type RendezvousContext =
  | "romantic"
  | "friendship"
  | "cocreation"
  | "family"
  | "spouse"
  | "general";

export type RendezvousChapterKeyV2 =
  | "rv_distance_trust"       // 距離感と信頼 (全般)
  | "rv_boundary_safety"      // 境界と安全性 (全般)
  | "rv_romantic_depth"       // 恋愛の深層
  | "rv_friendship_texture"   // 友達の質感
  | "rv_cocreation_dynamic"   // 共創のダイナミクス
  | "rv_family_bond"          // 家族の絆と距離
  | "rv_spouse_daily"         // 結婚相手との日常
  | "rv_safety_maturity"      // 安全性と成熟度
  | "rv_context_shift"        // モードの変化
  | "rv_partner_preference";  // 相手に求めるもの（ミラー質問）

export interface RendezvousFollowUp {
  /** 1(強く左) or 5(強く右) の時にトリガー */
  triggerValue: 1 | 5;
  /** 深掘り質問定義（followUpsは持たない=1階層のみ） */
  question: Omit<RendezvousQuestionV2, "followUps">;
}

export interface RendezvousQuestionV2 {
  id: string;
  chapter: RendezvousChapterKeyV2;
  /** 明確な質問文（カード上で主役として表示） */
  questionText: string;
  /** セマンティック・ディファレンシャル プロンプト（旧来互換） */
  prompt: string;
  /** 左端アンカー（補助情報） */
  labelLeft: string;
  /** 右端アンカー（補助情報） */
  labelRight: string;
  /** 対象コンテキスト */
  context: RendezvousContext;
  /** 影響する軸 */
  axes: { key: TraitAxisKey; weight: number; invert?: boolean }[];
  /** 補足テキスト（オプション） */
  note?: string;
  /** 強い回答に対する深掘り質問 */
  followUps?: RendezvousFollowUp[];
}

// ════════════════════════════════════════════════════════════════════
// コンテキスト表示マッピング
// ════════════════════════════════════════════════════════════════════

export const CONTEXT_DISPLAY: Record<
  RendezvousContext,
  { emoji: string; label: string; color: string }
> = {
  romantic: {
    emoji: "💕",
    label: "恋愛",
    color: "rgba(255,107,157,0.8)",
  },
  friendship: {
    emoji: "🤝",
    label: "友達",
    color: "rgba(74,234,255,0.8)",
  },
  cocreation: {
    emoji: "🛠️",
    label: "共創",
    color: "rgba(212,160,23,0.8)",
  },
  family: {
    emoji: "🏠",
    label: "家族",
    color: "rgba(134,239,172,0.8)",
  },
  spouse: {
    emoji: "💍",
    label: "結婚相手",
    color: "rgba(251,191,36,0.8)",
  },
  general: {
    emoji: "✦",
    label: "全般",
    color: "rgba(180,140,255,0.8)",
  },
};

// ════════════════════════════════════════════════════════════════════
// チャプター定義 V2
// ════════════════════════════════════════════════════════════════════

export interface RendezvousChapterInfoV2 {
  key: RendezvousChapterKeyV2;
  label: string;
  sublabel: string;
  description: string;
  emoji: string;
}

export const RENDEZVOUS_CHAPTERS_V2: RendezvousChapterInfoV2[] = [
  {
    key: "rv_distance_trust",
    label: "距離感と信頼",
    sublabel: "DISTANCE & TRUST",
    description: "人との距離のとり方。自然な振る舞いを観測します。",
    emoji: "🔭",
  },
  {
    key: "rv_boundary_safety",
    label: "境界と安全性",
    sublabel: "BOUNDARY & SAFETY",
    description: "守るもの、委ねるもの。境界線の形を観測します。",
    emoji: "🫧",
  },
  {
    key: "rv_romantic_depth",
    label: "恋愛の深層",
    sublabel: "ROMANTIC DEPTH",
    description: "恋愛関係での距離感・温度・求めるものを観測します。",
    emoji: "💕",
  },
  {
    key: "rv_friendship_texture",
    label: "友達の質感",
    sublabel: "FRIENDSHIP TEXTURE",
    description: "友人関係の心地よい形。何を共有し、何を守るか。",
    emoji: "🤝",
  },
  {
    key: "rv_cocreation_dynamic",
    label: "共創のダイナミクス",
    sublabel: "COCREATION DYNAMIC",
    description: "一緒に何かを作る関係。役割分担とスタイルを観測します。",
    emoji: "🛠️",
  },
  {
    key: "rv_family_bond",
    label: "家族の絆と距離",
    sublabel: "FAMILY BOND",
    description: "家族という特別な距離感。甘えと自立のバランスを観測します。",
    emoji: "🏠",
  },
  {
    key: "rv_spouse_daily",
    label: "結婚相手との日常",
    sublabel: "SPOUSE & DAILY LIFE",
    description: "生活を共にするパートナー。日常の中の信頼と調整を観測します。",
    emoji: "💍",
  },
  {
    key: "rv_safety_maturity",
    label: "安全性と成熟度",
    sublabel: "SAFETY & MATURITY",
    description: "深層の反応パターンを観測します。",
    emoji: "🛡️",
  },
  {
    key: "rv_context_shift",
    label: "関係モードの変化",
    sublabel: "MODE SHIFT",
    description: "相手や場面で変わる自分。揺らぎの中に本質がある。",
    emoji: "🔄",
  },
  {
    key: "rv_partner_preference",
    label: "相手に求めるもの",
    sublabel: "PARTNER PREFERENCE",
    description: "自分がどうかだけでなく、相手にどうあってほしいか。ミラーの視点で観測します。",
    emoji: "🪞",
  },
];

// ════════════════════════════════════════════════════════════════════
// 全質問定義 (66基本問 + 約28深掘り問)
// ════════════════════════════════════════════════════════════════════

export const RENDEZVOUS_QUESTIONS_V2: RendezvousQuestionV2[] = [
  // ═══════════════════════════════════════════════════════════════
  // Chapter 1: rv_distance_trust — 距離感と信頼 (全般 ×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_01",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "新しい人と出会った時、距離を縮めるスピードは？",
    prompt: "距離を縮めるスピード",
    labelLeft: "じっくり様子を見る",
    labelRight: "すぐに打ち解ける",
    axes: [
      { key: "intimacy_pace", weight: 1.0 },
      { key: "social_initiative", weight: 0.6 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_01",
          chapter: "rv_distance_trust",
          context: "general",
          questionText: "慎重になるのは、過去に傷ついた経験が影響している？",
          prompt: "過去の経験が今の距離感に影響している度合い",
          labelLeft: "特に関係ない",
          labelRight: "かなり影響している",
          axes: [
            { key: "rejection_response_maturity", weight: 0.5 },
            { key: "boundary_awareness", weight: 0.5 },
          ],
        },
      },
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_02",
          chapter: "rv_distance_trust",
          context: "general",
          questionText: "すぐ打ち解けた後、距離が近すぎて困った経験は？",
          prompt: "距離が近くなりすぎるリスク認識",
          labelLeft: "ほぼない",
          labelRight: "よくある",
          axes: [
            { key: "boundary_awareness", weight: 0.6, invert: true },
            { key: "intimacy_pace", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_02",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "相手が自分をどう思っているか、確認したくなる方？",
    prompt: "相手の評価への関心",
    labelLeft: "特に気にならない",
    labelRight: "よく確認したくなる",
    axes: [
      { key: "reassurance_need", weight: 1.0 },
      { key: "emotional_variability", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_03",
          chapter: "rv_distance_trust",
          context: "general",
          questionText: "確認したいとき、実際にはどう行動する？直接聞く？探る？",
          prompt: "確認行動のスタイル",
          labelLeft: "直接聞く",
          labelRight: "間接的に探る",
          axes: [
            { key: "direct_vs_diplomatic", weight: 0.6 },
            { key: "social_initiative", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_03",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "親しい人に対して、自分から連絡を取る頻度は？",
    prompt: "連絡のイニシアチブ",
    labelLeft: "相手からの連絡を待つ",
    labelRight: "自分から積極的に連絡する",
    axes: [
      { key: "social_initiative", weight: 1.0 },
      { key: "introvert_vs_extrovert", weight: 0.3 },
    ],
  },
  {
    id: "rv_04",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "感情の波は、日や状況によって大きく変わる方？",
    prompt: "感情の変動幅",
    labelLeft: "いつも安定している",
    labelRight: "状況でかなり変わる",
    axes: [
      { key: "emotional_variability", weight: 1.0 },
      { key: "emotional_regulation", weight: -0.5, invert: true },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_04",
          chapter: "rv_distance_trust",
          context: "general",
          questionText: "感情が大きく揺れたとき、回復にどのくらいかかる？",
          prompt: "感情回復のスピード",
          labelLeft: "すぐ回復する",
          labelRight: "数日かかることも",
          axes: [
            { key: "emotional_regulation", weight: 0.6, invert: true },
            { key: "reassurance_need", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_17",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "信頼できると感じるまでに、何回くらい会う必要がある？",
    prompt: "信頼形成のペース",
    labelLeft: "1〜2回で信頼できる",
    labelRight: "何度も重ねて初めて",
    axes: [
      { key: "intimacy_pace", weight: 0.7, invert: true },
      { key: "boundary_awareness", weight: 0.4 },
    ],
  },
  {
    id: "rv_18",
    chapter: "rv_distance_trust",
    context: "general",
    questionText: "初対面での沈黙は、苦手な方？",
    prompt: "初対面での沈黙への耐性",
    labelLeft: "全く平気",
    labelRight: "かなり落ち着かない",
    axes: [
      { key: "social_initiative", weight: 0.6 },
      { key: "introvert_vs_extrovert", weight: 0.4 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 2: rv_boundary_safety — 境界と安全性 (全般 ×5)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_05",
    chapter: "rv_boundary_safety",
    context: "general",
    questionText: "自分のプライベートな領域に、人を入れることについてどう思う？",
    prompt: "プライベート領域への開放度",
    labelLeft: "慎重に見極めてから",
    labelRight: "わりと気軽に入れる",
    axes: [
      { key: "boundary_awareness", weight: 1.0, invert: true },
      { key: "intimacy_pace", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_05",
          chapter: "rv_boundary_safety",
          context: "general",
          questionText: "慎重なのは、一度入れたら距離を取りにくくなるから？",
          prompt: "慎重さの理由",
          labelLeft: "特にそうではない",
          labelRight: "まさにそう",
          axes: [
            { key: "boundary_respect", weight: 0.5 },
            { key: "control_tendency", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_06",
    chapter: "rv_boundary_safety",
    context: "general",
    questionText: "「ここから先は踏み込まないで」という線引きは、はっきりしている方？",
    prompt: "境界線の明確さ",
    labelLeft: "あまり意識しない",
    labelRight: "明確に持っている",
    axes: [
      { key: "boundary_respect", weight: 1.0 },
      { key: "boundary_awareness", weight: 0.8 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_06",
          chapter: "rv_boundary_safety",
          context: "general",
          questionText: "その線を越えられたとき、あなたはどう反応する？",
          prompt: "境界侵害時の反応",
          labelLeft: "黙って距離を取る",
          labelRight: "はっきり伝える",
          axes: [
            { key: "escalation_risk", weight: 0.5 },
            { key: "emotional_regulation", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_07",
    chapter: "rv_boundary_safety",
    context: "general",
    questionText: "相手の気持ちを確かめる前に行動してしまうことはある？",
    prompt: "合意前行動の頻度",
    labelLeft: "ほとんどない",
    labelRight: "よくある",
    axes: [
      { key: "consent_maturity", weight: -1.0, invert: true },
      { key: "social_initiative", weight: 0.3 },
    ],
  },
  {
    id: "rv_08",
    chapter: "rv_boundary_safety",
    context: "general",
    questionText: "信頼は、時間をかけて少しずつ育てる方？",
    prompt: "信頼構築のスタイル",
    labelLeft: "直感で信頼する方",
    labelRight: "時間をかけてじっくり",
    axes: [
      { key: "cautious_vs_bold", weight: -0.6 },
      { key: "boundary_awareness", weight: 0.5 },
      { key: "intent_stability", weight: 0.4 },
    ],
  },
  {
    id: "rv_19",
    chapter: "rv_boundary_safety",
    context: "general",
    questionText: "自分の弱さを見せることに抵抗はある？",
    prompt: "脆弱性の開示抵抗",
    labelLeft: "ほとんどない",
    labelRight: "かなりある",
    axes: [
      { key: "public_private_gap", weight: 0.7 },
      { key: "emotional_regulation", weight: 0.3, invert: true },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_07",
          chapter: "rv_boundary_safety",
          context: "general",
          questionText: "弱さを見せないのは、心配させたくないから？自分が傷つくのが怖いから？",
          prompt: "弱さ回避の動機",
          labelLeft: "相手への配慮",
          labelRight: "自己防衛",
          axes: [
            { key: "independence_vs_harmony", weight: 0.5 },
            { key: "rejection_response_maturity", weight: 0.5, invert: true },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 3: rv_romantic_depth — 恋愛の深層 (×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_20",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "恋愛で、相手との連絡頻度はどのくらいがちょうどいい？",
    prompt: "恋愛での理想的な連絡頻度",
    labelLeft: "週に1〜2回で十分",
    labelRight: "毎日欠かさず",
    axes: [
      { key: "reassurance_need", weight: 0.6 },
      { key: "social_initiative", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_08",
          chapter: "rv_romantic_depth",
          context: "romantic",
          questionText: "毎日連絡が来ないと不安になる方？",
          prompt: "連絡途絶時の不安度",
          labelLeft: "全く不安にならない",
          labelRight: "かなり不安になる",
          axes: [
            { key: "reassurance_need", weight: 0.8 },
            { key: "control_tendency", weight: 0.3 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_21",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "恋愛で不安になったとき、相手にすぐ伝える方？",
    prompt: "恋愛の不安表現スタイル",
    labelLeft: "自分で処理する",
    labelRight: "すぐ相手に言う",
    axes: [
      { key: "emotional_variability", weight: 0.5 },
      { key: "direct_vs_diplomatic", weight: 0.5, invert: true },
    ],
  },
  {
    id: "rv_22",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "恋人に求めるのは、安心感と刺激のどちら？",
    prompt: "パートナーに求める質",
    labelLeft: "安心感が最優先",
    labelRight: "刺激と新鮮さ",
    axes: [
      { key: "change_embrace_vs_resist", weight: 0.6, invert: true },
      { key: "intimacy_pace", weight: 0.3 },
    ],
  },
  {
    id: "rv_23",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "「束縛」と「愛情表現」の境界はどこにあると思う？",
    prompt: "束縛と愛情表現の境界感覚",
    labelLeft: "自由に任せる方が愛",
    labelRight: "確認し合う方が愛",
    axes: [
      { key: "exclusivity_pressure", weight: 0.7 },
      { key: "control_tendency", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_09",
          chapter: "rv_romantic_depth",
          context: "romantic",
          questionText: "確認し合いたいのは、相手を信じきれないから？安心の儀式として？",
          prompt: "確認欲求の動機",
          labelLeft: "信頼の不足",
          labelRight: "愛情確認の儀式",
          axes: [
            { key: "control_tendency", weight: 0.5 },
            { key: "consent_maturity", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_24",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "過去の恋愛の失敗から、学びを次に活かせている方？",
    prompt: "恋愛学習能力",
    labelLeft: "同じパターンを繰り返しがち",
    labelRight: "毎回改善できている",
    axes: [
      { key: "rejection_response_maturity", weight: 0.6 },
      { key: "emotional_regulation", weight: 0.4 },
    ],
  },
  {
    id: "rv_25",
    chapter: "rv_romantic_depth",
    context: "romantic",
    questionText: "将来のパートナーとの生活イメージは明確にある？",
    prompt: "将来像の明確さ",
    labelLeft: "特に考えていない",
    labelRight: "かなり具体的にある",
    axes: [
      { key: "intent_stability", weight: 0.7 },
      { key: "plan_vs_spontaneous", weight: 0.3, invert: true },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 4: rv_friendship_texture — 友達の質感 (×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_26",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "友達にドタキャンされたら、どう感じる？",
    prompt: "ドタキャンへの反応",
    labelLeft: "全く気にならない",
    labelRight: "かなりショック",
    axes: [
      { key: "reassurance_need", weight: 0.5 },
      { key: "emotional_variability", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_10",
          chapter: "rv_friendship_texture",
          context: "friendship",
          questionText: "ショックなのは、自分の優先度が低いと感じるから？",
          prompt: "ドタキャンのショック要因",
          labelLeft: "そうではない",
          labelRight: "まさにそう",
          axes: [
            { key: "reassurance_need", weight: 0.7 },
            { key: "exclusivity_pressure", weight: 0.3 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_27",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "友達に本音の相談をするのは、どのくらい親しくなってから？",
    prompt: "友達への本音開示のペース",
    labelLeft: "すぐにでも",
    labelRight: "何年も経ってから",
    axes: [
      { key: "intimacy_pace", weight: 0.6, invert: true },
      { key: "boundary_awareness", weight: 0.4 },
    ],
  },
  {
    id: "rv_28",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "友達グループで意見が割れたとき、自分はどう動く？",
    prompt: "グループ内での意見対立時の行動",
    labelLeft: "自分の意見を主張",
    labelRight: "全体の調和を優先",
    axes: [
      { key: "independence_vs_harmony", weight: 0.7 },
      { key: "direct_vs_diplomatic", weight: 0.3 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_11",
          chapter: "rv_friendship_texture",
          context: "friendship",
          questionText: "自分の意見を通した後、関係が悪化した経験は？",
          prompt: "主張後の関係への影響",
          labelLeft: "ほぼない",
          labelRight: "何度もある",
          axes: [
            { key: "escalation_risk", weight: 0.6 },
            { key: "emotional_regulation", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_29",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "友達の成功を心から喜べる方？",
    prompt: "友人の成功への反応",
    labelLeft: "正直、複雑になることも",
    labelRight: "いつも純粋に嬉しい",
    axes: [
      { key: "emotional_regulation", weight: 0.5 },
      { key: "friend_mode_fit", weight: 0.5 },
    ],
  },
  {
    id: "rv_30",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "趣味や価値観が違っても、友達関係を続けられる？",
    prompt: "価値観の相違への許容度",
    labelLeft: "共通点がないと難しい",
    labelRight: "違いがあっても全然OK",
    axes: [
      { key: "independence_vs_harmony", weight: 0.4 },
      { key: "friend_mode_fit", weight: 0.6 },
    ],
  },
  {
    id: "rv_31",
    chapter: "rv_friendship_texture",
    context: "friendship",
    questionText: "友達にお金を貸すことに抵抗はある？",
    prompt: "金銭的境界の厳格さ",
    labelLeft: "全く抵抗ない",
    labelRight: "かなり抵抗がある",
    axes: [
      { key: "boundary_respect", weight: 0.6 },
      { key: "boundary_awareness", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_12",
          chapter: "rv_friendship_texture",
          context: "friendship",
          questionText: "抵抗がないのは、断りにくい性格だから？",
          prompt: "金銭境界の柔軟さの動機",
          labelLeft: "そうではない",
          labelRight: "断れない面がある",
          axes: [
            { key: "pressure_risk", weight: 0.6 },
            { key: "consent_maturity", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 5: rv_cocreation_dynamic — 共創のダイナミクス (×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_32",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "共同作業で、リーダー役を引き受ける方？任せる方？",
    prompt: "共創でのリーダーシップ傾向",
    labelLeft: "自分がリードしたい",
    labelRight: "任せて支える方",
    axes: [
      { key: "social_initiative", weight: 0.6 },
      { key: "independence_vs_harmony", weight: 0.4 },
    ],
  },
  {
    id: "rv_33",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "一緒に作業する相手の仕事のクオリティに、口を出す方？",
    prompt: "共創パートナーへのフィードバック傾向",
    labelLeft: "任せて見守る",
    labelRight: "気になったら必ず言う",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.6, invert: true },
      { key: "perfectionist_vs_pragmatic", weight: 0.4, invert: true },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_13",
          chapter: "rv_cocreation_dynamic",
          context: "cocreation",
          questionText: "指摘して関係がぎくしゃくした経験は？",
          prompt: "フィードバック後の関係への影響",
          labelLeft: "ほぼない",
          labelRight: "何度もある",
          axes: [
            { key: "escalation_risk", weight: 0.5 },
            { key: "direct_vs_diplomatic", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_34",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "共創パートナーとの意見の対立は、どう捉える？",
    prompt: "共創での意見対立への態度",
    labelLeft: "避けたい",
    labelRight: "むしろ歓迎",
    axes: [
      { key: "escalation_risk", weight: 0.5, invert: true },
      { key: "independence_vs_harmony", weight: 0.5, invert: true },
    ],
  },
  {
    id: "rv_35",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "プロジェクトが行き詰まった時、最初にすることは？",
    prompt: "行き詰まり時の初動",
    labelLeft: "一人で考え直す",
    labelRight: "すぐ相談する",
    axes: [
      { key: "stress_isolation_vs_social", weight: 0.7 },
      { key: "social_initiative", weight: 0.3 },
    ],
  },
  {
    id: "rv_36",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "締め切りへのプレッシャーは、パフォーマンスに良い影響がある？",
    prompt: "プレッシャー下のパフォーマンス",
    labelLeft: "むしろ下がる",
    labelRight: "上がる",
    axes: [
      { key: "emotional_regulation", weight: 0.5 },
      { key: "cautious_vs_bold", weight: 0.5 },
    ],
  },
  {
    id: "rv_37",
    chapter: "rv_cocreation_dynamic",
    context: "cocreation",
    questionText: "成果の功績を分け合うことに、こだわりはある？",
    prompt: "功績分配へのこだわり",
    labelLeft: "公平に分けたい",
    labelRight: "あまり気にしない",
    axes: [
      { key: "independence_vs_harmony", weight: 0.5 },
      { key: "consent_maturity", weight: 0.3 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_14",
          chapter: "rv_cocreation_dynamic",
          context: "cocreation",
          questionText: "公平にこだわるのは、過去に不公平を経験したから？",
          prompt: "公平さへの動機",
          labelLeft: "特にそうではない",
          labelRight: "かなり影響している",
          axes: [
            { key: "boundary_respect", weight: 0.5 },
            { key: "rejection_response_maturity", weight: 0.5 },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 6: rv_family_bond — 家族の絆と距離 (×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_38",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族に甘えることに抵抗はある？",
    prompt: "家族への甘えの度合い",
    labelLeft: "自然に甘えられる",
    labelRight: "甘えるのが苦手",
    axes: [
      { key: "independence_vs_harmony", weight: 0.5, invert: true },
      { key: "public_private_gap", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_15",
          chapter: "rv_family_bond",
          context: "family",
          questionText: "甘えられないのは、迷惑をかけたくないから？弱さを見せたくないから？",
          prompt: "甘え回避の動機",
          labelLeft: "迷惑への配慮",
          labelRight: "弱さを隠したい",
          axes: [
            { key: "independence_vs_harmony", weight: 0.4, invert: true },
            { key: "rejection_response_maturity", weight: 0.5, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_39",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族との連絡頻度に、自分からのイニシアチブはある？",
    prompt: "家族への連絡の能動性",
    labelLeft: "必要な時だけ",
    labelRight: "こまめに連絡する",
    axes: [
      { key: "social_initiative", weight: 0.5 },
      { key: "reassurance_need", weight: 0.3 },
    ],
  },
  {
    id: "rv_40",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族に「言いたいのに言えないこと」はある？",
    prompt: "家族への本音抑制度",
    labelLeft: "ほとんどない",
    labelRight: "かなりある",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.5, invert: true },
      { key: "public_private_gap", weight: 0.6 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_16",
          chapter: "rv_family_bond",
          context: "family",
          questionText: "言えないのは、関係が壊れるのが怖いから？相手が傷つくのが怖いから？",
          prompt: "家族への本音回避の動機",
          labelLeft: "関係を守るため",
          labelRight: "相手を守るため",
          axes: [
            { key: "escalation_risk", weight: 0.4, invert: true },
            { key: "emotional_regulation", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_41",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族との価値観の違いに、どう対処する？",
    prompt: "家族との価値観ギャップへの対応",
    labelLeft: "合わせる努力をする",
    labelRight: "違いはそのまま受容",
    axes: [
      { key: "independence_vs_harmony", weight: 0.6 },
      { key: "change_embrace_vs_resist", weight: 0.3, invert: true },
    ],
  },
  {
    id: "rv_42",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族のために自分を犠牲にすることへの抵抗は？",
    prompt: "家族のための自己犠牲度",
    labelLeft: "当然のことだと思う",
    labelRight: "自分も大切にしたい",
    axes: [
      { key: "independence_vs_harmony", weight: 0.6, invert: true },
      { key: "boundary_respect", weight: 0.5 },
    ],
  },
  {
    id: "rv_43",
    chapter: "rv_family_bond",
    context: "family",
    questionText: "家族との適切な距離感は、近い方がいい？適度な距離がいい？",
    prompt: "家族との理想の距離感",
    labelLeft: "できるだけ近く",
    labelRight: "適度な距離を保ちたい",
    axes: [
      { key: "intimacy_pace", weight: 0.4, invert: true },
      { key: "boundary_awareness", weight: 0.5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 7: rv_spouse_daily — 結婚相手との日常 (×6)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_44",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "一緒に暮らすパートナーに、生活リズムを合わせることへの抵抗は？",
    prompt: "生活リズムの調整許容度",
    labelLeft: "自然に合わせられる",
    labelRight: "自分のリズムを守りたい",
    axes: [
      { key: "independence_vs_harmony", weight: 0.6, invert: true },
      { key: "plan_vs_spontaneous", weight: 0.3 },
    ],
  },
  {
    id: "rv_45",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "パートナーとの家事・生活タスクの分担について、どう思う？",
    prompt: "生活タスクの分担への態度",
    labelLeft: "きっちり分けたい",
    labelRight: "その時の状況で柔軟に",
    axes: [
      { key: "perfectionist_vs_pragmatic", weight: 0.5 },
      { key: "consent_maturity", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_17",
          chapter: "rv_spouse_daily",
          context: "spouse",
          questionText: "きっちり分けたいのは、不公平を感じたくないから？効率のため？",
          prompt: "分担厳格化の動機",
          labelLeft: "公平性を重視",
          labelRight: "効率を重視",
          axes: [
            { key: "boundary_respect", weight: 0.5 },
            { key: "analytical_vs_intuitive", weight: 0.3, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_46",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "パートナーの小さな不満、自分はどのくらい気づける？",
    prompt: "パートナーの不満への感度",
    labelLeft: "言ってもらわないと気づかない",
    labelRight: "表情や態度で察する",
    axes: [
      { key: "analytical_vs_intuitive", weight: 0.5 },
      { key: "emotional_regulation", weight: 0.4 },
    ],
  },
  {
    id: "rv_47",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "パートナーと「一人の時間」のバランスは？",
    prompt: "パートナーとの一人時間のバランス",
    labelLeft: "いつも一緒がいい",
    labelRight: "一人の時間も大切",
    axes: [
      { key: "introvert_vs_extrovert", weight: 0.4, invert: true },
      { key: "independence_vs_harmony", weight: 0.5, invert: true },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_18",
          chapter: "rv_spouse_daily",
          context: "spouse",
          questionText: "いつも一緒にいたいのは、離れると不安だから？一緒が純粋に楽しいから？",
          prompt: "密着欲求の動機",
          labelLeft: "不安の回避",
          labelRight: "純粋な楽しさ",
          axes: [
            { key: "reassurance_need", weight: 0.6, invert: true },
            { key: "exclusivity_pressure", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_48",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "結婚相手のお金の使い方が自分と違ったら、どう対応する？",
    prompt: "金銭感覚の不一致への対応",
    labelLeft: "話し合って擦り合わせる",
    labelRight: "お互い自由に管理する",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.4, invert: true },
      { key: "independence_vs_harmony", weight: 0.4, invert: true },
      { key: "boundary_respect", weight: 0.3 },
    ],
  },
  {
    id: "rv_49",
    chapter: "rv_spouse_daily",
    context: "spouse",
    questionText: "長年一緒にいるパートナーに、感謝を言葉で伝えている？",
    prompt: "長期パートナーへの感謝表現",
    labelLeft: "言葉より態度で示す",
    labelRight: "こまめに言葉にする",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.4, invert: true },
      { key: "emotional_regulation", weight: 0.4 },
      { key: "public_private_gap", weight: 0.3, invert: true },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_19",
          chapter: "rv_spouse_daily",
          context: "spouse",
          questionText: "言葉にしにくいのは、照れくさいから？言わなくても伝わると思うから？",
          prompt: "感謝非言語化の理由",
          labelLeft: "照れくささ",
          labelRight: "言わなくても伝わる",
          axes: [
            { key: "public_private_gap", weight: 0.5 },
            { key: "consent_maturity", weight: 0.3, invert: true },
          ],
        },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 8: rv_safety_maturity — 安全性と成熟度 (全般 ×4)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_09",
    chapter: "rv_safety_maturity",
    context: "general",
    questionText: "断られた後の気持ちの切り替えは早い方？",
    prompt: "拒否後の回復速度",
    labelLeft: "しばらく引きずる",
    labelRight: "すぐ切り替えられる",
    axes: [
      { key: "rejection_response_maturity", weight: 1.0 },
      { key: "emotional_regulation", weight: 0.6 },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_20",
          chapter: "rv_safety_maturity",
          context: "general",
          questionText: "引きずるとき、相手への態度は変わる？",
          prompt: "拒否後の行動変化",
          labelLeft: "態度は変わらない",
          labelRight: "距離を取ったり冷たくなる",
          axes: [
            { key: "rejection_response_maturity", weight: 0.7, invert: true },
            { key: "escalation_risk", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_10",
    chapter: "rv_safety_maturity",
    context: "general",
    questionText: "相手の行動を把握していたいと思う気持ちは？",
    prompt: "相手の行動把握欲",
    labelLeft: "あまり思わない",
    labelRight: "かなり把握したい",
    axes: [
      { key: "control_tendency", weight: 1.0 },
      { key: "exclusivity_pressure", weight: 0.6 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_21",
          chapter: "rv_safety_maturity",
          context: "general",
          questionText: "把握したいのは、不安があるから？計画を立てたいから？",
          prompt: "行動把握欲の動機",
          labelLeft: "不安の解消",
          labelRight: "合理的な計画のため",
          axes: [
            { key: "control_tendency", weight: 0.5 },
            { key: "reassurance_need", weight: 0.5 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_11",
    chapter: "rv_safety_maturity",
    context: "general",
    questionText: "相手に不満があるとき、段階を踏んで伝えられる方？",
    prompt: "不満の伝達スタイル",
    labelLeft: "溜め込んで爆発しがち",
    labelRight: "こまめに伝えられる",
    axes: [
      { key: "escalation_risk", weight: -1.0, invert: true },
      { key: "direct_vs_diplomatic", weight: -0.4 },
      { key: "emotional_regulation", weight: 0.5 },
    ],
  },
  {
    id: "rv_12",
    chapter: "rv_safety_maturity",
    context: "general",
    questionText: "長期的な関係で、相手への態度が最初と変わる方？",
    prompt: "長期関係での態度変化",
    labelLeft: "ほぼ変わらない",
    labelRight: "かなり変わることがある",
    axes: [
      { key: "long_term_shift_risk", weight: 1.0 },
      { key: "relationship_mode_split", weight: 0.5 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 9: rv_context_shift — モードの変化 (全般 ×4)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "rv_13",
    chapter: "rv_context_shift",
    context: "general",
    questionText: "友達関係と恋愛関係で、自分の振る舞いはどのくらい変わる？",
    prompt: "関係種別での振る舞い変化",
    labelLeft: "ほぼ同じ自分",
    labelRight: "かなり別人になる",
    axes: [
      { key: "relationship_mode_split", weight: 1.0 },
      { key: "public_private_gap", weight: 0.6 },
    ],
  },
  {
    id: "rv_14",
    chapter: "rv_context_shift",
    context: "general",
    questionText: "異性の友人と、純粋な友情を維持できる方？",
    prompt: "異性友人との友情維持能力",
    labelLeft: "難しいと感じる",
    labelRight: "全く問題ない",
    axes: [
      { key: "friend_mode_fit", weight: 1.0 },
      { key: "intent_stability", weight: 0.5 },
    ],
  },
  {
    id: "rv_15",
    chapter: "rv_context_shift",
    context: "general",
    questionText: "人前での自分と、二人きりの時の自分にギャップはある？",
    prompt: "公私のギャップ",
    labelLeft: "ほぼ同じ",
    labelRight: "かなり違う",
    axes: [
      { key: "public_private_gap", weight: 1.0 },
      { key: "relationship_mode_split", weight: 0.4 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_22",
          chapter: "rv_context_shift",
          context: "general",
          questionText: "ギャップが大きいのは、演じてしまう自覚がある？",
          prompt: "ギャップの自覚度と演技性",
          labelLeft: "無意識でそうなる",
          labelRight: "演じている自覚がある",
          axes: [
            { key: "public_private_gap", weight: 0.6 },
            { key: "emotional_regulation", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_16",
    chapter: "rv_context_shift",
    context: "general",
    questionText: "相手に「自分だけを見ていてほしい」と思う気持ちは？",
    prompt: "排他的関心への欲求",
    labelLeft: "あまり思わない",
    labelRight: "強く思うことがある",
    axes: [
      { key: "exclusivity_pressure", weight: 1.0 },
      { key: "reassurance_need", weight: 0.5 },
      { key: "control_tendency", weight: 0.3 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // Chapter 10: rv_partner_preference — 相手に求めるもの（ミラー質問）
  // 自分がどうかではなく、相手にどうあってほしいかを観測
  // 各コンテキスト×2-3問 = 約15問
  // ═══════════════════════════════════════════════════════════════

  // ── 恋愛：相手に求めるもの ──
  {
    id: "rv_pp_01",
    chapter: "rv_partner_preference",
    context: "romantic",
    questionText: "恋人には、安心感と刺激のどちらをより求めますか？",
    prompt: "恋人に求める基本軸",
    labelLeft: "一緒にいると安心する人",
    labelRight: "一緒にいるとワクワクする人",
    axes: [
      { key: "change_embrace_vs_resist", weight: 0.5, invert: true },
      { key: "tradition_vs_novelty", weight: 0.3 },
      { key: "reassurance_need", weight: 0.4 },
    ],
    note: "自分自身の傾向ではなく、相手に求めるもの",
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_pp_01a",
          chapter: "rv_partner_preference",
          context: "romantic",
          questionText: "安心感を求めるのは、過去に不安定な恋愛を経験したからですか？",
          prompt: "安心感の背景",
          labelLeft: "特にそうではない",
          labelRight: "経験の影響が大きい",
          axes: [
            { key: "rejection_response_maturity", weight: 0.6 },
            { key: "reassurance_need", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_pp_02",
    chapter: "rv_partner_preference",
    context: "romantic",
    questionText: "恋人からの連絡頻度は、多い方がいいですか？少ない方が心地よいですか？",
    prompt: "相手への連絡頻度の期待",
    labelLeft: "連絡は少なめで十分",
    labelRight: "こまめに連絡してほしい",
    axes: [
      { key: "reassurance_need", weight: 0.7 },
      { key: "social_initiative", weight: 0.3, invert: true },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_pp_02a",
          chapter: "rv_partner_preference",
          context: "romantic",
          questionText: "連絡がないとき、相手が自分を嫌いになったのではと不安になりますか？",
          prompt: "連絡不安の深度",
          labelLeft: "忙しいだけだと思える",
          labelRight: "つい悪い方に考えてしまう",
          axes: [
            { key: "reassurance_need", weight: 0.8 },
            { key: "emotional_regulation", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_pp_03",
    chapter: "rv_partner_preference",
    context: "romantic",
    questionText: "恋人が異性の友達と仲良くしていたら、どう感じますか？",
    prompt: "パートナーの異性関係への感度",
    labelLeft: "全く気にならない",
    labelRight: "気になることがある",
    axes: [
      { key: "exclusivity_pressure", weight: 0.8 },
      { key: "control_tendency", weight: 0.3 },
      { key: "boundary_awareness", weight: 0.3 },
    ],
  },

  // ── 友達：相手に求めるもの ──
  {
    id: "rv_pp_04",
    chapter: "rv_partner_preference",
    context: "friendship",
    questionText: "友達とは、気軽に広く付き合いたいですか？少人数で深く付き合いたいですか？",
    prompt: "友人関係の理想形",
    labelLeft: "気軽に広く",
    labelRight: "少数で深く",
    axes: [
      { key: "quality_vs_quantity", weight: 0.7 },
      { key: "intimacy_pace", weight: 0.4, invert: true },
    ],
  },
  {
    id: "rv_pp_05",
    chapter: "rv_partner_preference",
    context: "friendship",
    questionText: "友達に、悩みを打ち明けてもらえると嬉しいですか？重く感じますか？",
    prompt: "相談を受ける側の感度",
    labelLeft: "頼られると嬉しい",
    labelRight: "重く感じることがある",
    axes: [
      { key: "friend_mode_fit", weight: 0.6 },
      { key: "emotional_regulation", weight: 0.3 },
      { key: "boundary_awareness", weight: 0.4 },
    ],
  },
  {
    id: "rv_pp_06",
    chapter: "rv_partner_preference",
    context: "friendship",
    questionText: "友達とは、価値観が近い方がいいですか？違う方が刺激になりますか？",
    prompt: "友人の価値観距離",
    labelLeft: "近い方が心地よい",
    labelRight: "違いがあった方が面白い",
    axes: [
      { key: "independence_vs_harmony", weight: 0.5, invert: true },
      { key: "tradition_vs_novelty", weight: 0.3 },
      { key: "friend_mode_fit", weight: 0.4 },
    ],
  },

  // ── 共創：相手に求めるもの ──
  {
    id: "rv_pp_07",
    chapter: "rv_partner_preference",
    context: "cocreation",
    questionText: "一緒に仕事をする相手には、スピード重視と丁寧さ重視のどちらを求めますか？",
    prompt: "共創パートナーの仕事スタイル期待",
    labelLeft: "スピードとアウトプット重視",
    labelRight: "丁寧さと品質重視",
    axes: [
      { key: "perfectionist_vs_pragmatic", weight: 0.6, invert: true },
      { key: "quality_vs_quantity", weight: 0.4 },
    ],
  },
  {
    id: "rv_pp_08",
    chapter: "rv_partner_preference",
    context: "cocreation",
    questionText: "共創パートナーからのフィードバックは、率直な方がいいですか？やわらかい方がいいですか？",
    prompt: "相手のフィードバックスタイル期待",
    labelLeft: "オブラートに包んでほしい",
    labelRight: "ストレートに言ってほしい",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.7, invert: true },
      { key: "emotional_regulation", weight: 0.3 },
    ],
    followUps: [
      {
        triggerValue: 5,
        question: {
          id: "rv_fu_pp_08a",
          chapter: "rv_partner_preference",
          context: "cocreation",
          questionText: "ストレートなフィードバックで、関係がぎくしゃくした経験はありますか？",
          prompt: "率直さと関係性のバランス",
          labelLeft: "特にない",
          labelRight: "何度かある",
          axes: [
            { key: "escalation_risk", weight: 0.5 },
            { key: "direct_vs_diplomatic", weight: 0.4 },
          ],
        },
      },
    ],
  },
  {
    id: "rv_pp_09",
    chapter: "rv_partner_preference",
    context: "cocreation",
    questionText: "共同作業では、明確な役割分担がある方がいいですか？柔軟に分け合う方がいいですか？",
    prompt: "共創の役割分担スタイル",
    labelLeft: "きっちり分担したい",
    labelRight: "臨機応変に分け合いたい",
    axes: [
      { key: "plan_vs_spontaneous", weight: 0.5 },
      { key: "independence_vs_harmony", weight: 0.4 },
    ],
  },

  // ── 家族：相手に求めるもの ──
  {
    id: "rv_pp_10",
    chapter: "rv_partner_preference",
    context: "family",
    questionText: "家族からの心配や助言は、ありがたいですか？干渉に感じますか？",
    prompt: "家族の関与への感度",
    labelLeft: "ありがたいと思える",
    labelRight: "干渉だと感じやすい",
    axes: [
      { key: "boundary_awareness", weight: 0.6 },
      { key: "independence_vs_harmony", weight: 0.5 },
    ],
  },
  {
    id: "rv_pp_11",
    chapter: "rv_partner_preference",
    context: "family",
    questionText: "家族と連絡を取る頻度は、多い方がいいですか？必要な時だけでいいですか？",
    prompt: "家族との連絡頻度の理想",
    labelLeft: "必要な時だけで十分",
    labelRight: "日常的に連絡を取りたい",
    axes: [
      { key: "social_initiative", weight: 0.4 },
      { key: "reassurance_need", weight: 0.3 },
      { key: "intimacy_pace", weight: 0.3 },
    ],
  },

  // ── 結婚相手：相手に求めるもの ──
  {
    id: "rv_pp_12",
    chapter: "rv_partner_preference",
    context: "spouse",
    questionText: "結婚相手とは、生活リズムが同じ方がいいですか？それぞれのペースで過ごしたいですか？",
    prompt: "配偶者との生活リズム",
    labelLeft: "同じリズムで過ごしたい",
    labelRight: "それぞれのペースでいい",
    axes: [
      { key: "independence_vs_harmony", weight: 0.6, invert: true },
      { key: "intimacy_pace", weight: 0.3 },
    ],
  },
  {
    id: "rv_pp_13",
    chapter: "rv_partner_preference",
    context: "spouse",
    questionText: "結婚相手とケンカした時、すぐ仲直りしたいですか？冷却期間がほしいですか？",
    prompt: "衝突後の修復スタイル",
    labelLeft: "すぐ話し合って解決したい",
    labelRight: "お互い冷却期間がほしい",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.5 },
      { key: "emotional_regulation", weight: 0.5 },
      { key: "escalation_risk", weight: 0.3, invert: true },
    ],
    followUps: [
      {
        triggerValue: 1,
        question: {
          id: "rv_fu_pp_13a",
          chapter: "rv_partner_preference",
          context: "spouse",
          questionText: "すぐ解決を求めるのは、未解決のまま過ごすのが耐えられないからですか？",
          prompt: "即解決願望の背景",
          labelLeft: "単に効率的だから",
          labelRight: "不安で耐えられないから",
          axes: [
            { key: "reassurance_need", weight: 0.7 },
            { key: "emotional_regulation", weight: 0.4, invert: true },
          ],
        },
      },
    ],
  },
  {
    id: "rv_pp_14",
    chapter: "rv_partner_preference",
    context: "spouse",
    questionText: "結婚生活で、金銭面の管理はどちらがいいですか？",
    prompt: "家計管理の主導権",
    labelLeft: "きっちり共同管理したい",
    labelRight: "各自で自由に管理したい",
    axes: [
      { key: "independence_vs_harmony", weight: 0.5, invert: true },
      { key: "control_tendency", weight: 0.4, invert: true },
      { key: "boundary_awareness", weight: 0.3 },
    ],
  },

  // ── ミラー質問（自分 ↔ 相手の期待で同じテーマ）──
  {
    id: "rv_mirror_01",
    chapter: "rv_partner_preference",
    context: "romantic",
    questionText: "あなた自身は恋人の行動をどの程度把握したいですか？（rv_10のミラー）",
    prompt: "恋人の行動把握（自己申告）",
    labelLeft: "自由にしていてほしい",
    labelRight: "ある程度知っておきたい",
    axes: [
      { key: "control_tendency", weight: 0.7 },
      { key: "reassurance_need", weight: 0.4 },
    ],
    note: "rv_10で「相手の行動を把握したい」と聞いた恋愛版ミラー",
  },
  {
    id: "rv_mirror_02",
    chapter: "rv_partner_preference",
    context: "friendship",
    questionText: "友達に対して、自分の近況を共有する頻度はどのくらいが自然ですか？",
    prompt: "友人への近況共有頻度（自己）",
    labelLeft: "聞かれたら話す程度",
    labelRight: "自分からよく共有する",
    axes: [
      { key: "social_initiative", weight: 0.6 },
      { key: "intimacy_pace", weight: 0.3 },
      { key: "public_private_gap", weight: 0.3, invert: true },
    ],
    note: "rv_pp_04（友達の理想形）と対になるミラー質問",
  },
  {
    id: "rv_mirror_03",
    chapter: "rv_partner_preference",
    context: "cocreation",
    questionText: "あなたが共創パートナーにフィードバックするとき、実際にはどうしていますか？",
    prompt: "フィードバック実態（自己）",
    labelLeft: "やわらかく伝える",
    labelRight: "ストレートに伝える",
    axes: [
      { key: "direct_vs_diplomatic", weight: 0.8 },
      { key: "independence_vs_harmony", weight: 0.2, invert: true },
    ],
    note: "rv_pp_08（相手のフィードバック期待）と対になるミラー質問",
  },
];

// ════════════════════════════════════════════════════════════════════
// ユーティリティ関数
// ════════════════════════════════════════════════════════════════════

/** 質問IDから質問を検索（基本問 + 深掘り問を含む） */
export function findRendezvousQuestionV2(
  id: string,
  queue?: RendezvousQuestionV2[]
): RendezvousQuestionV2 | Omit<RendezvousQuestionV2, "followUps"> | undefined {
  const source = queue ?? RENDEZVOUS_QUESTIONS_V2;
  // まず基本問から検索
  const base = source.find((q) => q.id === id);
  if (base) return base;
  // 深掘り問から検索
  for (const q of source) {
    const fu = q.followUps?.find((f) => f.question.id === id);
    if (fu) return fu.question;
  }
  return undefined;
}

/** チャプター情報を取得 */
export function getRendezvousChapterV2(
  key: RendezvousChapterKeyV2
): RendezvousChapterInfoV2 | undefined {
  return RENDEZVOUS_CHAPTERS_V2.find((c) => c.key === key);
}

// ════════════════════════════════════════════════════════════════════
// 旧API互換（他ファイルからの既存importを壊さないため）
// ════════════════════════════════════════════════════════════════════

export interface RendezvousQuestion {
  id: string;
  chapter:
    | "rendezvous_relational"
    | "rendezvous_boundary"
    | "rendezvous_safety"
    | "rendezvous_context";
  prompt: string;
  labelLeft: string;
  labelRight: string;
  axes: { key: TraitAxisKey; weight: number; invert?: boolean }[];
}

/** @deprecated V2を使ってください */
export const RENDEZVOUS_CHAPTERS = [
  {
    key: "rendezvous_relational" as const,
    label: "関係性の距離感",
    sublabel: "RELATIONAL DISTANCE",
    description:
      "人との距離のとり方が見える場所。あなたの自然な振る舞いを観測します。",
  },
  {
    key: "rendezvous_boundary" as const,
    label: "境界と信頼",
    sublabel: "BOUNDARY & TRUST",
    description:
      "守るもの、委ねるもの。あなたの境界線の形を観測します。",
  },
  {
    key: "rendezvous_safety" as const,
    label: "安全性と成熟度",
    sublabel: "SAFETY & MATURITY",
    description:
      "関係の中で何が起きるか。深層の判断パターンを観測します。",
  },
  {
    key: "rendezvous_context" as const,
    label: "関係モードの変化",
    sublabel: "MODE SHIFT",
    description:
      "相手や場面で変わる自分。その揺らぎの中に本質がある。",
  },
];

/** @deprecated V2を使ってください — 旧16問は同じIDのV2問に含まれています */
export const RENDEZVOUS_QUESTIONS: RendezvousQuestion[] = [
  // Chapter 1: 関係性の距離感
  { id: "rv_01", chapter: "rendezvous_relational", prompt: "新しい人と出会った時、距離を縮めるスピードは？", labelLeft: "じっくり様子を見る", labelRight: "すぐに打ち解ける", axes: [{ key: "intimacy_pace", weight: 1.0 }, { key: "social_initiative", weight: 0.6 }] },
  { id: "rv_02", chapter: "rendezvous_relational", prompt: "相手が自分をどう思っているか、確認したくなる方？", labelLeft: "特に気にならない", labelRight: "よく確認したくなる", axes: [{ key: "reassurance_need", weight: 1.0 }, { key: "emotional_variability", weight: 0.4 }] },
  { id: "rv_03", chapter: "rendezvous_relational", prompt: "親しい人に対して、自分から連絡を取る頻度は？", labelLeft: "相手からの連絡を待つ", labelRight: "自分から積極的に連絡する", axes: [{ key: "social_initiative", weight: 1.0 }, { key: "introvert_vs_extrovert", weight: 0.3 }] },
  { id: "rv_04", chapter: "rendezvous_relational", prompt: "感情の波は、日や状況によって大きく変わる方？", labelLeft: "いつも安定している", labelRight: "状況でかなり変わる", axes: [{ key: "emotional_variability", weight: 1.0 }, { key: "emotional_regulation", weight: -0.5, invert: true }] },
  // Chapter 2: 境界と信頼
  { id: "rv_05", chapter: "rendezvous_boundary", prompt: "自分のプライベートな領域に、人を入れることについて", labelLeft: "慎重に見極めてから", labelRight: "わりと気軽に入れる", axes: [{ key: "boundary_awareness", weight: 1.0, invert: true }, { key: "intimacy_pace", weight: 0.4 }] },
  { id: "rv_06", chapter: "rendezvous_boundary", prompt: "「ここから先は踏み込まないで」という線引きは、はっきりしている方？", labelLeft: "あまり意識しない", labelRight: "明確に持っている", axes: [{ key: "boundary_respect", weight: 1.0 }, { key: "boundary_awareness", weight: 0.8 }] },
  { id: "rv_07", chapter: "rendezvous_boundary", prompt: "相手の気持ちを確かめる前に行動してしまうことは？", labelLeft: "ほとんどない", labelRight: "よくある", axes: [{ key: "consent_maturity", weight: -1.0, invert: true }, { key: "social_initiative", weight: 0.3 }] },
  { id: "rv_08", chapter: "rendezvous_boundary", prompt: "信頼は、時間をかけて少しずつ育てる方？", labelLeft: "直感で信頼する方", labelRight: "時間をかけてじっくり", axes: [{ key: "cautious_vs_bold", weight: -0.6 }, { key: "boundary_awareness", weight: 0.5 }, { key: "intent_stability", weight: 0.4 }] },
  // Chapter 3: 安全性と成熟度
  { id: "rv_09", chapter: "rendezvous_safety", prompt: "断られた時、その後の自分の気持ちの切り替えは？", labelLeft: "しばらく引きずる", labelRight: "すぐ切り替えられる", axes: [{ key: "rejection_response_maturity", weight: 1.0 }, { key: "emotional_regulation", weight: 0.6 }] },
  { id: "rv_10", chapter: "rendezvous_safety", prompt: "相手の行動を把握していたいと思う気持ちは？", labelLeft: "あまり思わない", labelRight: "かなり把握したい", axes: [{ key: "control_tendency", weight: 1.0 }, { key: "exclusivity_pressure", weight: 0.6 }] },
  { id: "rv_11", chapter: "rendezvous_safety", prompt: "相手に不満がある時、段階を踏んで伝える方？", labelLeft: "溜め込んで爆発しがち", labelRight: "こまめに伝えられる", axes: [{ key: "escalation_risk", weight: -1.0, invert: true }, { key: "direct_vs_diplomatic", weight: -0.4 }, { key: "emotional_regulation", weight: 0.5 }] },
  { id: "rv_12", chapter: "rendezvous_safety", prompt: "長期的な関係で、相手への態度が最初と変わる方？", labelLeft: "ほぼ変わらない", labelRight: "かなり変わることがある", axes: [{ key: "long_term_shift_risk", weight: 1.0 }, { key: "relationship_mode_split", weight: 0.5 }] },
  // Chapter 4: 関係モードの変化
  { id: "rv_13", chapter: "rendezvous_context", prompt: "友達関係と恋愛関係で、自分の振る舞いはどのくらい変わる？", labelLeft: "ほぼ同じ自分", labelRight: "かなり別人になる", axes: [{ key: "relationship_mode_split", weight: 1.0 }, { key: "public_private_gap", weight: 0.6 }] },
  { id: "rv_14", chapter: "rendezvous_context", prompt: "異性の友人と、純粋な友情を維持できる方？", labelLeft: "難しいと感じる", labelRight: "全く問題ない", axes: [{ key: "friend_mode_fit", weight: 1.0 }, { key: "intent_stability", weight: 0.5 }] },
  { id: "rv_15", chapter: "rendezvous_context", prompt: "人前での自分と、二人きりの時の自分にギャップはある？", labelLeft: "ほぼ同じ", labelRight: "かなり違う", axes: [{ key: "public_private_gap", weight: 1.0 }, { key: "relationship_mode_split", weight: 0.4 }] },
  { id: "rv_16", chapter: "rendezvous_context", prompt: "相手に「自分だけを見ていてほしい」と思う気持ちは？", labelLeft: "あまり思わない", labelRight: "強く思うことがある", axes: [{ key: "exclusivity_pressure", weight: 1.0 }, { key: "reassurance_need", weight: 0.5 }, { key: "control_tendency", weight: 0.3 }] },
];
