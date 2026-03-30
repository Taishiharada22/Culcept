// lib/stargazer/stage1Questions.ts
// Stage 1: Surface Observation — 24問の多肢選択質問
// 6カテゴリ × 各3-5問、テンポよく基本傾向を広く観測

import type { TraitAxisKey } from "./traitAxes";

// ── カテゴリ定義 ──

export type Stage1Category =
  | "self_core"
  | "emotional_pattern"
  | "social_style"
  | "relationship_mode"
  | "boundary_safety"
  | "style_identity";

export interface Stage1CategoryInfo {
  key: Stage1Category;
  label: string;
  description: string;
  emoji: string;
}

export const STAGE1_CATEGORIES: Stage1CategoryInfo[] = [
  {
    key: "self_core",
    label: "自分の核",
    description: "あなたの基本的な思考傾向と判断の軸を観測します",
    emoji: "🔮",
  },
  {
    key: "emotional_pattern",
    label: "感情の傾向",
    description: "感情の感じ方と整理の仕方を観測します",
    emoji: "🌊",
  },
  {
    key: "social_style",
    label: "社交スタイル",
    description: "対人距離と関わり方のスタイルを観測します",
    emoji: "🤝",
  },
  {
    key: "relationship_mode",
    label: "関係性のモード",
    description: "友達・恋愛・コラボでの態度の違いを観測します",
    emoji: "💫",
  },
  {
    key: "boundary_safety",
    label: "境界と安全",
    description: "距離感と境界線の感覚を観測します",
    emoji: "🛡️",
  },
  {
    key: "style_identity",
    label: "スタイル・自分らしさ",
    description: "美意識と自己表現のスタイルを観測します",
    emoji: "✨",
  },
];

// ── 質問データ構造 ──

export interface Stage1AxisMapping {
  key: TraitAxisKey;
  weight: number;
}

export interface Stage1Option {
  id: string;
  label: string;
  axisMappings: Stage1AxisMapping[];
  /** Stage 2 分岐キー（オプション） */
  branchKey?: string;
}

export interface Stage1Question {
  id: string;
  category: Stage1Category;
  prompt: string;
  options: Stage1Option[];
}

// ── 24問の質問定義 ──

export const STAGE1_QUESTIONS: Stage1Question[] = [
  // ═══════════════════════════════════════════
  // A. Self Core（5問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q01",
    category: "self_core",
    prompt: "何かを決める時、あなたはどちらに近いですか？",
    options: [
      {
        id: "s1_q01_a",
        label: "データや事実をもとに論理的に考える",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.5 },
          { key: "cautious_vs_bold", weight: -0.2 },
        ],
      },
      {
        id: "s1_q01_b",
        label: "直感やフィーリングで判断する",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: 0.5 },
          { key: "plan_vs_spontaneous", weight: 0.2 },
        ],
      },
      {
        id: "s1_q01_c",
        label: "状況に応じて使い分ける",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: 0.0 },
          { key: "relationship_mode_split", weight: 0.3 },
        ],
      },
      {
        id: "s1_q01_d",
        label: "まず人に相談してから決める",
        axisMappings: [
          { key: "individual_vs_social", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q02",
    category: "self_core",
    prompt: "新しい環境や変化に対して、あなたはどう感じやすいですか？",
    options: [
      {
        id: "s1_q02_a",
        label: "ワクワクする。変化は成長の機会",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.5 },
          { key: "cautious_vs_bold", weight: 0.3 },
        ],
      },
      {
        id: "s1_q02_b",
        label: "少し不安だが、受け入れられる",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.1 },
          { key: "emotional_variability", weight: 0.2 },
        ],
      },
      {
        id: "s1_q02_c",
        label: "慎重に見極めてから動きたい",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "cautious_vs_bold", weight: -0.4 },
        ],
      },
      {
        id: "s1_q02_d",
        label: "できれば今のままがいい",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.5 },
          { key: "tradition_vs_novelty", weight: -0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q03",
    category: "self_core",
    prompt: "考えを深めたい時、あなたはどうしますか？",
    options: [
      {
        id: "s1_q03_a",
        label: "一人で静かに考える",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.5 },
          { key: "individual_vs_social", weight: -0.3 },
        ],
      },
      {
        id: "s1_q03_b",
        label: "人と話しながら整理する",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.5 },
          { key: "individual_vs_social", weight: 0.3 },
        ],
      },
      {
        id: "s1_q03_c",
        label: "まず調べて情報を集める",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "plan_vs_spontaneous", weight: -0.2 },
        ],
      },
      {
        id: "s1_q03_d",
        label: "とりあえずやってみて考える",
        axisMappings: [
          { key: "cautious_vs_bold", weight: 0.5 },
          { key: "plan_vs_spontaneous", weight: 0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q04",
    category: "self_core",
    prompt: "計画を立てることについて、どう思いますか？",
    options: [
      {
        id: "s1_q04_a",
        label: "計画がないと落ち着かない",
        axisMappings: [
          { key: "plan_vs_spontaneous", weight: -0.5 },
          { key: "perfectionist_vs_pragmatic", weight: -0.3 },
        ],
      },
      {
        id: "s1_q04_b",
        label: "大まかな方向だけ決める",
        axisMappings: [
          { key: "plan_vs_spontaneous", weight: -0.1 },
          { key: "perfectionist_vs_pragmatic", weight: 0.2 },
        ],
      },
      {
        id: "s1_q04_c",
        label: "流れに任せる方が楽しい",
        axisMappings: [
          { key: "plan_vs_spontaneous", weight: 0.5 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
        ],
      },
    ],
  },

  {
    id: "s1_q05",
    category: "self_core",
    prompt: "自分の強みだと思うのはどれですか？",
    options: [
      {
        id: "s1_q05_a",
        label: "深く考え、本質を見抜く力",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.4 },
          { key: "quality_vs_quantity", weight: -0.3 },
        ],
      },
      {
        id: "s1_q05_b",
        label: "人を巻き込み、場を動かす力",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.4 },
          { key: "social_initiative", weight: 0.4 },
        ],
      },
      {
        id: "s1_q05_c",
        label: "柔軟に対応し、状況に合わせる力",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "relationship_mode_split", weight: 0.3 },
        ],
      },
      {
        id: "s1_q05_d",
        label: "粘り強く、最後までやり抜く力",
        axisMappings: [
          { key: "perfectionist_vs_pragmatic", weight: -0.4 },
          { key: "cautious_vs_bold", weight: -0.2 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // B. Emotional Pattern（4問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q06",
    category: "emotional_pattern",
    prompt: "相手の返信が遅い時、あなたはどう感じやすいですか？",
    options: [
      {
        id: "s1_q06_a",
        label: "あまり気にしない",
        axisMappings: [
          { key: "reassurance_need", weight: -0.5 },
          { key: "emotional_variability", weight: -0.2 },
        ],
        branchKey: "low_anxiety",
      },
      {
        id: "s1_q06_b",
        label: "少し気になるが、すぐ忘れる",
        axisMappings: [
          { key: "reassurance_need", weight: -0.1 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "mild_anxiety",
      },
      {
        id: "s1_q06_c",
        label: "理由を考えてしまう",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        branchKey: "moderate_anxiety",
      },
      {
        id: "s1_q06_d",
        label: "自分のせいかもと思いやすい",
        axisMappings: [
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
        ],
        branchKey: "high_anxiety",
      },
    ],
  },

  {
    id: "s1_q07",
    category: "emotional_pattern",
    prompt: "ストレスを感じた時、あなたはどうしやすいですか？",
    options: [
      {
        id: "s1_q07_a",
        label: "一人になって静かに整理する",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.5 },
          { key: "introvert_vs_extrovert", weight: -0.3 },
        ],
      },
      {
        id: "s1_q07_b",
        label: "信頼できる人に話を聞いてもらう",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: 0.5 },
          { key: "individual_vs_social", weight: 0.3 },
        ],
      },
      {
        id: "s1_q07_c",
        label: "体を動かしたり、気分転換をする",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.4 },
          { key: "plan_vs_spontaneous", weight: 0.2 },
        ],
      },
      {
        id: "s1_q07_d",
        label: "しばらく引きずってしまう",
        axisMappings: [
          { key: "emotional_variability", weight: 0.4 },
          { key: "emotional_regulation", weight: -0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q08",
    category: "emotional_pattern",
    prompt: "傷ついた時、あなたの反応に一番近いのは？",
    options: [
      {
        id: "s1_q08_a",
        label: "すぐに気持ちを切り替えられる",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.5 },
          { key: "emotional_variability", weight: -0.3 },
        ],
      },
      {
        id: "s1_q08_b",
        label: "表には出さないが、内側で消化に時間がかかる",
        axisMappings: [
          { key: "public_private_gap", weight: 0.3 },
          { key: "introvert_vs_extrovert", weight: -0.3 },
        ],
      },
      {
        id: "s1_q08_c",
        label: "相手に率直に気持ちを伝える",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
      },
      {
        id: "s1_q08_d",
        label: "距離を置いて自分を守る",
        axisMappings: [
          { key: "stress_isolation_vs_social", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.4 },
        ],
      },
    ],
  },

  {
    id: "s1_q09",
    category: "emotional_pattern",
    prompt: "嫉妬や不安を感じた時、あなたはどうしやすいですか？",
    options: [
      {
        id: "s1_q09_a",
        label: "自分の中で整理して落ち着かせる",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.5 },
          { key: "control_tendency", weight: -0.2 },
        ],
      },
      {
        id: "s1_q09_b",
        label: "相手に確認したくなる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: -0.2 },
        ],
        branchKey: "needs_confirmation",
      },
      {
        id: "s1_q09_c",
        label: "あまり嫉妬や不安を感じない",
        axisMappings: [
          { key: "emotional_variability", weight: -0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
        ],
      },
      {
        id: "s1_q09_d",
        label: "態度や行動に出てしまうことがある",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.4 },
          { key: "pressure_risk", weight: 0.3 },
        ],
        branchKey: "reactive",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // C. Social Style（5問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q10",
    category: "social_style",
    prompt: "初めて会った人との会話で、あなたが自然とやっていることは？",
    options: [
      {
        id: "s1_q10_a",
        label: "相手の話を聞きながら、共通点を探す",
        axisMappings: [
          { key: "individual_vs_social", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
      },
      {
        id: "s1_q10_b",
        label: "自分の興味を話して反応を見る",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.4 },
          { key: "cautious_vs_bold", weight: 0.3 },
        ],
      },
      {
        id: "s1_q10_c",
        label: "まず様子を見て、場の空気を読む",
        axisMappings: [
          { key: "cautious_vs_bold", weight: -0.3 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
      },
      {
        id: "s1_q10_d",
        label: "相手のことを質問して深掘りする",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "social_initiative", weight: 0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q11",
    category: "social_style",
    prompt: "人と仲良くなる時、あなたはどちらに近いですか？",
    options: [
      {
        id: "s1_q11_a",
        label: "自然に距離が縮まる",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.4 },
          { key: "social_initiative", weight: 0.3 },
        ],
        branchKey: "natural_close",
      },
      {
        id: "s1_q11_b",
        label: "少しずつ様子を見る",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.3 },
          { key: "cautious_vs_bold", weight: -0.3 },
        ],
        branchKey: "gradual",
      },
      {
        id: "s1_q11_c",
        label: "相手次第でかなり変わる",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.4 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        branchKey: "depends_on_other",
      },
      {
        id: "s1_q11_d",
        label: "自分からはあまり詰めない",
        axisMappings: [
          { key: "social_initiative", weight: -0.5 },
          { key: "introvert_vs_extrovert", weight: -0.3 },
        ],
        branchKey: "passive",
      },
    ],
  },

  {
    id: "s1_q12",
    category: "social_style",
    prompt: "会話中の沈黙について、どう感じますか？",
    options: [
      {
        id: "s1_q12_a",
        label: "気にならない。沈黙も会話の一部",
        axisMappings: [
          { key: "emotional_regulation", weight: 0.3 },
          { key: "introvert_vs_extrovert", weight: -0.2 },
        ],
      },
      {
        id: "s1_q12_b",
        label: "少し気まずいので、何か話題を探す",
        axisMappings: [
          { key: "reassurance_need", weight: 0.2 },
          { key: "social_initiative", weight: 0.3 },
        ],
      },
      {
        id: "s1_q12_c",
        label: "相手によって全然違う",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "emotional_variability", weight: 0.2 },
        ],
      },
    ],
  },

  {
    id: "s1_q13",
    category: "social_style",
    prompt: "グループの中でのあなたの立ち位置は？",
    options: [
      {
        id: "s1_q13_a",
        label: "自然とまとめ役になることが多い",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.4 },
          { key: "social_initiative", weight: 0.4 },
          { key: "control_tendency", weight: 0.1 },
        ],
      },
      {
        id: "s1_q13_b",
        label: "場の空気を見ながらサポートする",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
      },
      {
        id: "s1_q13_c",
        label: "自分のペースで参加する",
        axisMappings: [
          { key: "individual_vs_social", weight: -0.3 },
          { key: "independence_vs_harmony", weight: -0.3 },
        ],
      },
      {
        id: "s1_q13_d",
        label: "気の合う人とだけ深く話す",
        axisMappings: [
          { key: "quality_vs_quantity", weight: -0.4 },
          { key: "introvert_vs_extrovert", weight: -0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q14",
    category: "social_style",
    prompt: "相手に合わせることについて、どう思いますか？",
    options: [
      {
        id: "s1_q14_a",
        label: "自然にできる。相手が楽ならそれでいい",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
      },
      {
        id: "s1_q14_b",
        label: "ある程度は合わせるが、譲れないラインがある",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.4 },
          { key: "independence_vs_harmony", weight: -0.1 },
        ],
      },
      {
        id: "s1_q14_c",
        label: "無理に合わせるのは疲れる",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "individual_vs_social", weight: -0.3 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // D. Relationship Mode（4問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q15",
    category: "relationship_mode",
    prompt: "友達としてつながる相手に求めるものは？",
    options: [
      {
        id: "s1_q15_a",
        label: "気楽さ",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.2 },
          { key: "independence_vs_harmony", weight: -0.2 },
          { key: "friend_mode_fit", weight: 0.3 },
        ],
      },
      {
        id: "s1_q15_b",
        label: "深い理解",
        axisMappings: [
          { key: "quality_vs_quantity", weight: -0.4 },
          { key: "individual_vs_social", weight: -0.2 },
        ],
      },
      {
        id: "s1_q15_c",
        label: "一緒に楽しめること",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.3 },
          { key: "plan_vs_spontaneous", weight: 0.2 },
        ],
      },
      {
        id: "s1_q15_d",
        label: "安定感",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "reassurance_need", weight: 0.2 },
        ],
      },
    ],
  },

  {
    id: "s1_q16",
    category: "relationship_mode",
    prompt: "恋愛関係で大切にしたいことは？",
    options: [
      {
        id: "s1_q16_a",
        label: "お互いの自由を尊重すること",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "control_tendency", weight: -0.3 },
          { key: "exclusivity_pressure", weight: -0.2 },
        ],
      },
      {
        id: "s1_q16_b",
        label: "安心感と信頼",
        axisMappings: [
          { key: "reassurance_need", weight: 0.3 },
          { key: "consent_maturity", weight: 0.2 },
        ],
      },
      {
        id: "s1_q16_c",
        label: "深い理解と共感",
        axisMappings: [
          { key: "quality_vs_quantity", weight: -0.3 },
          { key: "intimacy_pace", weight: 0.2 },
        ],
      },
      {
        id: "s1_q16_d",
        label: "成長し合える関係",
        axisMappings: [
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "perfectionist_vs_pragmatic", weight: -0.2 },
        ],
      },
    ],
  },

  {
    id: "s1_q17",
    category: "relationship_mode",
    prompt: "相手との温度差を感じた時、あなたはどうしますか？",
    options: [
      {
        id: "s1_q17_a",
        label: "相手のペースに合わせる",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: 0.3 },
        ],
      },
      {
        id: "s1_q17_b",
        label: "率直に話し合う",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "consent_maturity", weight: 0.3 },
        ],
      },
      {
        id: "s1_q17_c",
        label: "少し距離を置いて様子を見る",
        axisMappings: [
          { key: "cautious_vs_bold", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
      },
      {
        id: "s1_q17_d",
        label: "自分の気持ちを優先する",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "control_tendency", weight: 0.2 },
        ],
      },
    ],
  },

  {
    id: "s1_q18",
    category: "relationship_mode",
    prompt: "友達と恋愛で、あなたの態度はどう変わりますか？",
    options: [
      {
        id: "s1_q18_a",
        label: "あまり変わらない。どちらも自然体",
        axisMappings: [
          { key: "relationship_mode_split", weight: -0.5 },
          { key: "public_private_gap", weight: -0.3 },
        ],
      },
      {
        id: "s1_q18_b",
        label: "恋愛の方が気を使うし、不安になりやすい",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.4 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "reassurance_need", weight: 0.2 },
        ],
      },
      {
        id: "s1_q18_c",
        label: "恋愛の方が積極的になる",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "intimacy_pace", weight: 0.3 },
          { key: "escalation_risk", weight: 0.2 },
        ],
      },
      {
        id: "s1_q18_d",
        label: "友達の方が素を出せる",
        axisMappings: [
          { key: "public_private_gap", weight: 0.4 },
          { key: "friend_mode_fit", weight: 0.3 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // E. Boundary & Safety（3問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q19",
    category: "boundary_safety",
    prompt: "相手が慎重で距離を取りたがる時、どう感じやすいですか？",
    options: [
      {
        id: "s1_q19_a",
        label: "相手のペースを尊重したい",
        axisMappings: [
          { key: "boundary_awareness", weight: 0.5 },
          { key: "consent_maturity", weight: 0.3 },
          { key: "pressure_risk", weight: -0.3 },
        ],
        branchKey: "respectful",
      },
      {
        id: "s1_q19_b",
        label: "少し不安になる",
        axisMappings: [
          { key: "reassurance_need", weight: 0.4 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        branchKey: "anxious",
      },
      {
        id: "s1_q19_c",
        label: "自分との相性を考え直す",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "analytical",
      },
      {
        id: "s1_q19_d",
        label: "どう接すればいいか迷う",
        axisMappings: [
          { key: "social_initiative", weight: -0.2 },
          { key: "boundary_awareness", weight: -0.1 },
        ],
        branchKey: "uncertain",
      },
    ],
  },

  {
    id: "s1_q20",
    category: "boundary_safety",
    prompt: "自分の提案や誘いが断られた時、あなたはどうなりやすいですか？",
    options: [
      {
        id: "s1_q20_a",
        label: "すぐ引いて、別の選択肢を探す",
        axisMappings: [
          { key: "rejection_response_maturity", weight: 0.5 },
          { key: "pressure_risk", weight: -0.4 },
        ],
        branchKey: "graceful_retreat",
      },
      {
        id: "s1_q20_b",
        label: "少し様子を見て、もう一度だけ聞く",
        axisMappings: [
          { key: "rejection_response_maturity", weight: 0.1 },
          { key: "pressure_risk", weight: 0.1 },
        ],
        branchKey: "one_more_try",
      },
      {
        id: "s1_q20_c",
        label: "理由を知りたくなる",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "pressure_risk", weight: 0.2 },
        ],
        branchKey: "needs_reason",
      },
      {
        id: "s1_q20_d",
        label: "まだ可能性があると思いたい",
        axisMappings: [
          { key: "rejection_response_maturity", weight: -0.3 },
          { key: "pressure_risk", weight: 0.3 },
          { key: "escalation_risk", weight: 0.2 },
        ],
        branchKey: "persistent",
      },
    ],
  },

  {
    id: "s1_q21",
    category: "boundary_safety",
    prompt: "距離を縮めたい相手がいる時、あなたの感覚に近いのは？",
    options: [
      {
        id: "s1_q21_a",
        label: "相手のサインを見ながら少しずつ",
        axisMappings: [
          { key: "intimacy_pace", weight: -0.3 },
          { key: "consent_maturity", weight: 0.4 },
          { key: "boundary_awareness", weight: 0.3 },
        ],
      },
      {
        id: "s1_q21_b",
        label: "自然な流れに任せる",
        axisMappings: [
          { key: "plan_vs_spontaneous", weight: 0.3 },
          { key: "intimacy_pace", weight: 0.1 },
        ],
      },
      {
        id: "s1_q21_c",
        label: "積極的にアプローチする",
        axisMappings: [
          { key: "social_initiative", weight: 0.5 },
          { key: "intimacy_pace", weight: 0.4 },
          { key: "cautious_vs_bold", weight: 0.3 },
        ],
      },
      {
        id: "s1_q21_d",
        label: "相手から来てくれるのを待つ",
        axisMappings: [
          { key: "social_initiative", weight: -0.5 },
          { key: "intimacy_pace", weight: -0.4 },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // F. Style / Identity（3問）
  // ═══════════════════════════════════════════

  {
    id: "s1_q22",
    category: "style_identity",
    prompt: "服を選ぶ時、あなたが優先するのは？",
    options: [
      {
        id: "s1_q22_a",
        label: "自分が好きなもの",
        axisMappings: [
          { key: "function_vs_expression", weight: 0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
        ],
      },
      {
        id: "s1_q22_b",
        label: "自分に似合うもの",
        axisMappings: [
          { key: "analytical_vs_intuitive", weight: -0.2 },
          { key: "perfectionist_vs_pragmatic", weight: -0.2 },
        ],
      },
      {
        id: "s1_q22_c",
        label: "場面に合ったもの",
        axisMappings: [
          { key: "relationship_mode_split", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
      },
      {
        id: "s1_q22_d",
        label: "機能的で楽なもの",
        axisMappings: [
          { key: "function_vs_expression", weight: -0.4 },
          { key: "minimal_vs_maximal", weight: -0.3 },
        ],
      },
    ],
  },

  {
    id: "s1_q23",
    category: "style_identity",
    prompt: "状況に応じて自分のキャラクターを変えることはありますか？",
    options: [
      {
        id: "s1_q23_a",
        label: "あまり変えない。どこでも自分は同じ",
        axisMappings: [
          { key: "public_private_gap", weight: -0.5 },
          { key: "relationship_mode_split", weight: -0.3 },
        ],
      },
      {
        id: "s1_q23_b",
        label: "場に合わせて少し調整する",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: 0.3 },
          { key: "public_private_gap", weight: 0.1 },
        ],
      },
      {
        id: "s1_q23_c",
        label: "かなり変わる。場面で全然違う自分がいる",
        axisMappings: [
          { key: "public_private_gap", weight: 0.5 },
          { key: "relationship_mode_split", weight: 0.4 },
        ],
      },
    ],
  },

  {
    id: "s1_q24",
    category: "style_identity",
    prompt: "自分を表現することについて、あなたはどう思いますか？",
    options: [
      {
        id: "s1_q24_a",
        label: "自然にできる。自分を見せることが好き",
        axisMappings: [
          { key: "function_vs_expression", weight: 0.5 },
          { key: "introvert_vs_extrovert", weight: 0.3 },
        ],
      },
      {
        id: "s1_q24_b",
        label: "信頼できる相手には見せられる",
        axisMappings: [
          { key: "quality_vs_quantity", weight: -0.3 },
          { key: "public_private_gap", weight: 0.2 },
        ],
      },
      {
        id: "s1_q24_c",
        label: "あまり得意ではない",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.4 },
          { key: "function_vs_expression", weight: -0.3 },
        ],
      },
      {
        id: "s1_q24_d",
        label: "作品やスタイルで間接的に表現する",
        axisMappings: [
          { key: "function_vs_expression", weight: 0.3 },
          { key: "classic_vs_trendy", weight: 0.2 },
          { key: "tradition_vs_novelty", weight: 0.2 },
        ],
      },
    ],
  },
];
