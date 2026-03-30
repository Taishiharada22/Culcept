// lib/stargazer/stage3Questions.ts
// Stage 3: Deep Observation — 15問の行動シナリオ質問
// 6軸 × 各2-3問、直接自己報告ではなく観察可能な選択を通じて深層特性を観測

import type { TraitAxisKey } from "./traitAxes";

// ── カテゴリ定義 ──

export type Stage3Category =
  | "attachment_style"
  | "locus_of_control"
  | "growth_mindset"
  | "shame_vs_guilt"
  | "rumination_tendency"
  | "fairness_sensitivity"
  | "values_clarification"
  | "transformation_readiness";

export interface Stage3CategoryInfo {
  key: Stage3Category;
  label: string;
  description: string;
  axis: TraitAxisKey;
}

export const STAGE3_CATEGORIES: Stage3CategoryInfo[] = [
  {
    key: "attachment_style",
    label: "つながりのパターン",
    description: "親密な関係での安全基地の感じ方を観測します",
    axis: "attachment_style",
  },
  {
    key: "locus_of_control",
    label: "主導権の所在",
    description: "出来事の原因をどこに帰属させるかを観測します",
    axis: "locus_of_control",
  },
  {
    key: "growth_mindset",
    label: "成長と才能の捉え方",
    description: "能力や特性の変化可能性についての信念を観測します",
    axis: "growth_mindset",
  },
  {
    key: "shame_vs_guilt",
    label: "失敗への反応",
    description: "失敗や過ちに対する内的反応の方向性を観測します",
    axis: "shame_vs_guilt",
  },
  {
    key: "rumination_tendency",
    label: "思考の反芻",
    description: "ネガティブな出来事を繰り返し考える傾向を観測します",
    axis: "rumination_tendency",
  },
  {
    key: "fairness_sensitivity",
    label: "公平さへの感度",
    description: "不均衡な状況における内的反応の方向を観測します",
    axis: "fairness_sensitivity",
  },
  {
    key: "values_clarification",
    label: "価値の明確化",
    description: "ACTに基づく直接的な価値観探索を行います",
    axis: "independence_vs_harmony",
  },
  {
    key: "transformation_readiness",
    label: "変容への準備度",
    description: "自己変容への意欲と方向性を観測します",
    axis: "growth_mindset",
  },
];

// ── 質問データ構造 ──

export interface Stage3AxisMapping {
  key: TraitAxisKey;
  weight: number;
}

export interface Stage3Option {
  id: string;
  label: string;
  axisMappings: Stage3AxisMapping[];
  /** Stage 2 / フォローアップ分岐キー（オプション） */
  branchKey?: string;
}

export interface Stage3Question {
  id: string;
  category: Stage3Category;
  prompt: string;
  options: Stage3Option[];
}

// ── 15問の質問定義 ──

export const STAGE3_QUESTIONS: Stage3Question[] = [
  // ═══════════════════════════════════════════
  // A. attachment_style（3問）
  // スコア: 負 = 回避型, 正 = 不安型, 0 = 安定型
  // ═══════════════════════════════════════════

  {
    id: "s3_q01",
    category: "attachment_style",
    prompt:
      "友人からのメッセージに3時間返信がない時、最初に浮かぶ感覚は？",
    options: [
      {
        id: "s3_q01_a",
        label: "特に気にならない。相手にも都合があると思う",
        axisMappings: [
          { key: "attachment_style", weight: 0.0 },
          { key: "reassurance_need", weight: -0.4 },
          { key: "emotional_variability", weight: -0.3 },
        ],
        branchKey: "secure",
      },
      {
        id: "s3_q01_b",
        label: "何か怒らせてしまったのかと不安になる",
        axisMappings: [
          { key: "attachment_style", weight: 0.5 },
          { key: "reassurance_need", weight: 0.5 },
          { key: "emotional_variability", weight: 0.3 },
        ],
        branchKey: "anxious",
      },
      {
        id: "s3_q01_c",
        label: "そもそもそんなにこまめに連絡しないので気にしない",
        axisMappings: [
          { key: "attachment_style", weight: -0.5 },
          { key: "reassurance_need", weight: -0.3 },
          { key: "intimacy_pace", weight: -0.3 },
        ],
        branchKey: "avoidant",
      },
      {
        id: "s3_q01_d",
        label: "少し気になるが、すぐに別のことに集中できる",
        axisMappings: [
          { key: "attachment_style", weight: 0.1 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "reassurance_need", weight: -0.1 },
        ],
        branchKey: "mild_secure",
      },
    ],
  },

  {
    id: "s3_q02",
    category: "attachment_style",
    prompt:
      "恋人が「今日は一人になりたい」と言った時、あなたの内側に起きることは？",
    options: [
      {
        id: "s3_q02_a",
        label: "自分の時間が確保できてむしろ嬉しい",
        axisMappings: [
          { key: "attachment_style", weight: -0.5 },
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "intimacy_pace", weight: -0.2 },
        ],
        branchKey: "avoidant",
      },
      {
        id: "s3_q02_b",
        label: "理解はできるが、少し寂しいと感じる",
        axisMappings: [
          { key: "attachment_style", weight: 0.1 },
          { key: "reassurance_need", weight: 0.1 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        branchKey: "mild_secure",
      },
      {
        id: "s3_q02_c",
        label: "自分が何かしたのかと心配になる",
        axisMappings: [
          { key: "attachment_style", weight: 0.5 },
          { key: "reassurance_need", weight: 0.4 },
          { key: "emotional_variability", weight: 0.4 },
        ],
        branchKey: "anxious",
      },
      {
        id: "s3_q02_d",
        label: "相手の気持ちを尊重しつつ、自分も別の予定を入れる",
        axisMappings: [
          { key: "attachment_style", weight: 0.0 },
          { key: "independence_vs_harmony", weight: -0.1 },
          { key: "emotional_regulation", weight: 0.4 },
        ],
        branchKey: "secure",
      },
    ],
  },

  {
    id: "s3_q03",
    category: "attachment_style",
    prompt:
      "仲のいい友人が最近ほかの人と仲良くしているのを見かけた時、内側に浮かぶのは？",
    options: [
      {
        id: "s3_q03_a",
        label: "その人が楽しそうで自分も嬉しい",
        axisMappings: [
          { key: "attachment_style", weight: 0.0 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "reassurance_need", weight: -0.3 },
        ],
        branchKey: "secure",
      },
      {
        id: "s3_q03_b",
        label: "自分との関係が薄れるのかと不安になる",
        axisMappings: [
          { key: "attachment_style", weight: 0.5 },
          { key: "reassurance_need", weight: 0.5 },
          { key: "exclusivity_pressure", weight: 0.2 },
        ],
        branchKey: "anxious",
      },
      {
        id: "s3_q03_c",
        label: "特に気にしない。それぞれの関係は別もの",
        axisMappings: [
          { key: "attachment_style", weight: -0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "reassurance_need", weight: -0.2 },
        ],
        branchKey: "avoidant",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // B. locus_of_control（2問）
  // スコア: 負 = 内的統制（自分次第）, 正 = 外的統制（環境次第）
  // ═══════════════════════════════════════════

  {
    id: "s3_q04",
    category: "locus_of_control",
    prompt:
      "仕事やプロジェクトで大きな失敗をした後、最初に考えることは？",
    options: [
      {
        id: "s3_q04_a",
        label: "自分の準備・判断・努力が足りなかった",
        axisMappings: [
          { key: "locus_of_control", weight: -0.5 },
          { key: "shame_vs_guilt", weight: 0.2 },
          { key: "perfectionist_vs_pragmatic", weight: -0.2 },
        ],
        branchKey: "internal",
      },
      {
        id: "s3_q04_b",
        label: "タイミングが悪かった、状況が整っていなかった",
        axisMappings: [
          { key: "locus_of_control", weight: 0.5 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        branchKey: "external",
      },
      {
        id: "s3_q04_c",
        label: "自分のせいもあるが、環境や相手にも問題があった",
        axisMappings: [
          { key: "locus_of_control", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        branchKey: "mixed",
      },
      {
        id: "s3_q04_d",
        label: "なぜ失敗したかより、次にどうするかをすぐ考える",
        axisMappings: [
          { key: "locus_of_control", weight: -0.3 },
          { key: "growth_mindset", weight: -0.4 },
          { key: "rumination_tendency", weight: -0.3 },
        ],
        branchKey: "forward",
      },
    ],
  },

  {
    id: "s3_q05",
    category: "locus_of_control",
    prompt:
      "人生がうまくいっていると感じる時、その理由として最もしっくり来るのは？",
    options: [
      {
        id: "s3_q05_a",
        label: "自分が選んで行動し続けた結果だと思う",
        axisMappings: [
          { key: "locus_of_control", weight: -0.5 },
          { key: "growth_mindset", weight: -0.3 },
          { key: "cautious_vs_bold", weight: 0.1 },
        ],
        branchKey: "internal",
      },
      {
        id: "s3_q05_b",
        label: "いい環境・いい人・いいタイミングに恵まれた",
        axisMappings: [
          { key: "locus_of_control", weight: 0.5 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
        ],
        branchKey: "external",
      },
      {
        id: "s3_q05_c",
        label: "自分の努力と運が重なった感じ",
        axisMappings: [
          { key: "locus_of_control", weight: 0.1 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        branchKey: "mixed",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // C. growth_mindset（2問）
  // スコア: 負 = 成長志向（変われる）, 正 = 固定志向（生まれつき）
  // ═══════════════════════════════════════════

  {
    id: "s3_q06",
    category: "growth_mindset",
    prompt:
      "苦手なことに挑戦する機会が来た時、最初の反応に最も近いのは？",
    options: [
      {
        id: "s3_q06_a",
        label: "苦手なことでも続ければ必ず上達できると思ってやってみる",
        axisMappings: [
          { key: "growth_mindset", weight: -0.5 },
          { key: "cautious_vs_bold", weight: 0.3 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
        ],
        branchKey: "growth",
      },
      {
        id: "s3_q06_b",
        label: "苦手なものは苦手のままだから、得意なことに注力したい",
        axisMappings: [
          { key: "growth_mindset", weight: 0.5 },
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "perfectionist_vs_pragmatic", weight: 0.2 },
        ],
        branchKey: "fixed",
      },
      {
        id: "s3_q06_c",
        label: "やってみないとわからないが、深刻には構えない",
        axisMappings: [
          { key: "growth_mindset", weight: -0.2 },
          { key: "cautious_vs_bold", weight: 0.2 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "open",
      },
      {
        id: "s3_q06_d",
        label: "失敗が怖くて、一歩引いてしまいやすい",
        axisMappings: [
          { key: "growth_mindset", weight: 0.3 },
          { key: "cautious_vs_bold", weight: -0.4 },
          { key: "shame_vs_guilt", weight: -0.2 },
        ],
        branchKey: "fear_failure",
      },
    ],
  },

  {
    id: "s3_q07",
    category: "growth_mindset",
    prompt:
      "自分より圧倒的に優れている人を見た時、内側に浮かぶ感情に最も近いのは？",
    options: [
      {
        id: "s3_q07_a",
        label: "刺激を受けて、自分も近づきたいと思う",
        axisMappings: [
          { key: "growth_mindset", weight: -0.5 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "cautious_vs_bold", weight: 0.2 },
        ],
        branchKey: "inspired",
      },
      {
        id: "s3_q07_b",
        label: "才能の違いを感じて、少し落ち込む",
        axisMappings: [
          { key: "growth_mindset", weight: 0.5 },
          { key: "shame_vs_guilt", weight: -0.2 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        branchKey: "deflated",
      },
      {
        id: "s3_q07_c",
        label: "純粋に尊敬し、どうやって到達したか興味が湧く",
        axisMappings: [
          { key: "growth_mindset", weight: -0.4 },
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "quality_vs_quantity", weight: -0.2 },
        ],
        branchKey: "curious",
      },
      {
        id: "s3_q07_d",
        label: "自分には向いていない分野だと確認できて、気が楽になる",
        axisMappings: [
          { key: "growth_mindset", weight: 0.4 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        branchKey: "relief",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // D. shame_vs_guilt（3問）
  // スコア: 負 = 恥（自分全体が悪い）, 正 = 罪悪感（行動が悪い）
  // ═══════════════════════════════════════════

  {
    id: "s3_q08",
    category: "shame_vs_guilt",
    prompt:
      "大切な約束をうっかり忘れてしまった時、最初に浮かぶ思いは？",
    options: [
      {
        id: "s3_q08_a",
        label: "あの行動は良くなかった。次は必ず守ろう",
        axisMappings: [
          { key: "shame_vs_guilt", weight: 0.5 },
          { key: "locus_of_control", weight: -0.2 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "guilt",
      },
      {
        id: "s3_q08_b",
        label: "自分はダメな人間だ。信頼を失ったに違いない",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.5 },
          { key: "rumination_tendency", weight: 0.4 },
          { key: "emotional_variability", weight: 0.3 },
        ],
        branchKey: "shame",
      },
      {
        id: "s3_q08_c",
        label: "すぐ謝って、どうすれば取り戻せるかを考える",
        axisMappings: [
          { key: "shame_vs_guilt", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "growth_mindset", weight: -0.2 },
        ],
        branchKey: "repair",
      },
      {
        id: "s3_q08_d",
        label: "しばらく自己嫌悪が続く",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.4 },
          { key: "rumination_tendency", weight: 0.5 },
          { key: "emotional_regulation", weight: -0.3 },
        ],
        branchKey: "prolonged_shame",
      },
    ],
  },

  {
    id: "s3_q09",
    category: "shame_vs_guilt",
    prompt:
      "人前で間違いを指摘された時、最初の反応に最も近いのは？",
    options: [
      {
        id: "s3_q09_a",
        label: "すぐに認めて謝れる",
        axisMappings: [
          { key: "shame_vs_guilt", weight: 0.4 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "emotional_regulation", weight: 0.4 },
        ],
        branchKey: "guilt",
      },
      {
        id: "s3_q09_b",
        label: "恥ずかしくて顔が赤くなり、しばらく立ち直れない",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.5 },
          { key: "emotional_variability", weight: 0.4 },
          { key: "public_private_gap", weight: 0.3 },
        ],
        branchKey: "shame",
      },
      {
        id: "s3_q09_c",
        label: "防衛的になってしまい、言い訳をしたくなる",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.3 },
          { key: "emotional_regulation", weight: -0.3 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        branchKey: "defensive",
      },
      {
        id: "s3_q09_d",
        label: "その場では認め、後でこっそり落ち込む",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.2 },
          { key: "public_private_gap", weight: 0.4 },
          { key: "rumination_tendency", weight: 0.3 },
        ],
        branchKey: "hidden_shame",
      },
    ],
  },

  {
    id: "s3_q10",
    category: "shame_vs_guilt",
    prompt:
      "人を傷つけてしまったとわかった時、その後あなたはどうなりやすい？",
    options: [
      {
        id: "s3_q10_a",
        label: "相手に直接謝り、具体的に何が悪かったか伝える",
        axisMappings: [
          { key: "shame_vs_guilt", weight: 0.5 },
          { key: "direct_vs_diplomatic", weight: -0.4 },
          { key: "consent_maturity", weight: 0.3 },
        ],
        branchKey: "guilt_repair",
      },
      {
        id: "s3_q10_b",
        label: "自分が最低だと感じて、相手を避けてしまう",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.5 },
          { key: "attachment_style", weight: -0.2 },
          { key: "stress_isolation_vs_social", weight: -0.3 },
        ],
        branchKey: "shame_withdrawal",
      },
      {
        id: "s3_q10_c",
        label: "謝りたいが、どう伝えればいいか悩んで時間がかかる",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.1 },
          { key: "rumination_tendency", weight: 0.3 },
          { key: "direct_vs_diplomatic", weight: 0.2 },
        ],
        branchKey: "hesitant",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // E. rumination_tendency（2問）
  // スコア: 負 = 低反芻（切り替えが早い）, 正 = 高反芻（考え続ける）
  // ═══════════════════════════════════════════

  {
    id: "s3_q11",
    category: "rumination_tendency",
    prompt:
      "嫌なことがあった日の夜、寝る前にどうなりやすいですか？",
    options: [
      {
        id: "s3_q11_a",
        label: "眠れるし、翌朝にはほぼ忘れている",
        axisMappings: [
          { key: "rumination_tendency", weight: -0.5 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "change_embrace_vs_resist", weight: -0.2 },
        ],
        branchKey: "low_rumination",
      },
      {
        id: "s3_q11_b",
        label: "布団の中で何度もその場面を再生してしまう",
        axisMappings: [
          { key: "rumination_tendency", weight: 0.5 },
          { key: "emotional_regulation", weight: -0.4 },
          { key: "analytical_vs_intuitive", weight: 0.2 },
        ],
        branchKey: "high_rumination",
      },
      {
        id: "s3_q11_c",
        label: "少し引きずるが、何か別のことをすれば切り替えられる",
        axisMappings: [
          { key: "rumination_tendency", weight: 0.1 },
          { key: "emotional_regulation", weight: 0.2 },
          { key: "plan_vs_spontaneous", weight: 0.1 },
        ],
        branchKey: "moderate",
      },
      {
        id: "s3_q11_d",
        label: "どうすれば良かったかを分析しながら、次第に落ち着く",
        axisMappings: [
          { key: "rumination_tendency", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: -0.4 },
          { key: "locus_of_control", weight: -0.2 },
        ],
        branchKey: "analytical_process",
      },
    ],
  },

  {
    id: "s3_q12",
    category: "rumination_tendency",
    prompt:
      "3日前に起きた失敗や気まずい出来事を、今どれくらい考えていますか？",
    options: [
      {
        id: "s3_q12_a",
        label: "ほとんど思い出さない",
        axisMappings: [
          { key: "rumination_tendency", weight: -0.5 },
          { key: "emotional_regulation", weight: 0.4 },
        ],
        branchKey: "low",
      },
      {
        id: "s3_q12_b",
        label: "ふとした瞬間に頭に浮かんでくる",
        axisMappings: [
          { key: "rumination_tendency", weight: 0.3 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        branchKey: "occasional",
      },
      {
        id: "s3_q12_c",
        label: "まだ頻繁に考えていて、気持ちが揺れることがある",
        axisMappings: [
          { key: "rumination_tendency", weight: 0.5 },
          { key: "emotional_variability", weight: 0.4 },
          { key: "emotional_regulation", weight: -0.3 },
        ],
        branchKey: "high",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // F. fairness_sensitivity（3問）
  // スコア: 負 = 受益過敏（もらいすぎ不安）, 正 = 加害過敏（不公平に敏感）
  // 0付近 = バランス型
  // ═══════════════════════════════════════════

  {
    id: "s3_q13",
    category: "fairness_sensitivity",
    prompt:
      "友人が食事をおごってくれた時、最初に浮かぶ感覚は？",
    options: [
      {
        id: "s3_q13_a",
        label: "ありがたく受け取って、また別の機会に返せばいい",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.0 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.2 },
        ],
        branchKey: "balanced",
      },
      {
        id: "s3_q13_b",
        label: "もらいすぎて申し訳ない、早く返さないと落ち着かない",
        axisMappings: [
          { key: "fairness_sensitivity", weight: -0.5 },
          { key: "emotional_variability", weight: 0.2 },
          { key: "reassurance_need", weight: 0.2 },
        ],
        branchKey: "beneficiary_sensitive",
      },
      {
        id: "s3_q13_c",
        label: "次は自分がおごる機会を作らないと不公平だと思う",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.4 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "control_tendency", weight: 0.1 },
        ],
        branchKey: "perpetrator_sensitive",
      },
      {
        id: "s3_q13_d",
        label: "気持ちが嬉しくて、素直に喜ぶだけ",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.1 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "emotional_variability", weight: -0.2 },
        ],
        branchKey: "unconcerned",
      },
    ],
  },

  {
    id: "s3_q14",
    category: "fairness_sensitivity",
    prompt:
      "チームで成果が出た時、自分の貢献が少ないと感じたら？",
    options: [
      {
        id: "s3_q14_a",
        label: "チームの成功だから、特に気にしない",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.0 },
          { key: "independence_vs_harmony", weight: 0.4 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "team_oriented",
      },
      {
        id: "s3_q14_b",
        label: "自分が余分に評価を受けているようで居心地が悪い",
        axisMappings: [
          { key: "fairness_sensitivity", weight: -0.5 },
          { key: "shame_vs_guilt", weight: 0.2 },
          { key: "emotional_variability", weight: 0.2 },
        ],
        branchKey: "beneficiary_sensitive",
      },
      {
        id: "s3_q14_c",
        label: "次の機会でもっと貢献して帳尻を合わせたい",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.3 },
          { key: "growth_mindset", weight: -0.2 },
          { key: "locus_of_control", weight: -0.2 },
        ],
        branchKey: "compensating",
      },
      {
        id: "s3_q14_d",
        label: "誰がどれだけ貢献したか、正直に評価されるべきだと思う",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.5 },
          { key: "direct_vs_diplomatic", weight: -0.3 },
          { key: "analytical_vs_intuitive", weight: -0.2 },
        ],
        branchKey: "justice_oriented",
      },
    ],
  },

  {
    id: "s3_q15",
    category: "fairness_sensitivity",
    prompt:
      "グループで決めたルールを自分だけが守っていないと気づいた時、最初に感じることは？",
    options: [
      {
        id: "s3_q15_a",
        label: "他の人に迷惑をかけていると感じて、すぐ謝りたい",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.4 },
          { key: "shame_vs_guilt", weight: 0.4 },
          { key: "emotional_regulation", weight: 0.2 },
        ],
        branchKey: "guilt_perpetrator",
      },
      {
        id: "s3_q15_b",
        label: "自分が損をしていたなら、むしろルールが厳しすぎると感じる",
        axisMappings: [
          { key: "fairness_sensitivity", weight: -0.3 },
          { key: "independence_vs_harmony", weight: -0.3 },
          { key: "locus_of_control", weight: 0.2 },
        ],
        branchKey: "victim_sensitive",
      },
      {
        id: "s3_q15_c",
        label: "ルール自体が本当に公平かを考え直したくなる",
        axisMappings: [
          { key: "fairness_sensitivity", weight: 0.2 },
          { key: "analytical_vs_intuitive", weight: -0.3 },
          { key: "direct_vs_diplomatic", weight: -0.2 },
        ],
        branchKey: "systemic",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // G. values_clarification（4問）— ACT価値明確化
  // 直接的に価値観を問い、implicitValuesExtractor の結果と照合する
  // ═══════════════════════════════════════════

  {
    id: "s3_q16",
    category: "values_clarification",
    prompt:
      "80歳の自分が人生を振り返った時、最も誇りに思いたいことは？",
    options: [
      {
        id: "s3_q16_a",
        label: "困難に屈せず、自分の信念を貫いたこと",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.5 },
          { key: "cautious_vs_bold", weight: 0.3 },
          { key: "locus_of_control", weight: -0.3 },
        ],
        branchKey: "autonomy",
      },
      {
        id: "s3_q16_b",
        label: "大切な人たちとの深い絆を築いたこと",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "intimacy_pace", weight: 0.3 },
          { key: "individual_vs_social", weight: 0.3 },
        ],
        branchKey: "connection",
      },
      {
        id: "s3_q16_c",
        label: "常に成長し続け、昨日の自分を超え続けたこと",
        axisMappings: [
          { key: "growth_mindset", weight: -0.5 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "quality_vs_quantity", weight: -0.2 },
        ],
        branchKey: "growth",
      },
      {
        id: "s3_q16_d",
        label: "世界に何かしらの良い影響を残せたこと",
        axisMappings: [
          { key: "individual_vs_social", weight: 0.5 },
          { key: "independence_vs_harmony", weight: 0.2 },
          { key: "social_initiative", weight: 0.3 },
        ],
        branchKey: "contribution",
      },
    ],
  },

  {
    id: "s3_q17",
    category: "values_clarification",
    prompt:
      "もし何の制約もなかったら、あなたは毎日何に時間を使いたいですか？",
    options: [
      {
        id: "s3_q17_a",
        label: "誰にも邪魔されず、自分の興味を深く掘り下げる",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: -0.4 },
          { key: "quality_vs_quantity", weight: -0.4 },
          { key: "independence_vs_harmony", weight: -0.3 },
        ],
        branchKey: "exploration",
      },
      {
        id: "s3_q17_b",
        label: "大切な人たちとの時間を最大限に過ごす",
        axisMappings: [
          { key: "introvert_vs_extrovert", weight: 0.3 },
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "reassurance_need", weight: 0.2 },
        ],
        branchKey: "togetherness",
      },
      {
        id: "s3_q17_c",
        label: "新しい場所や体験を次々と試していく",
        axisMappings: [
          { key: "tradition_vs_novelty", weight: 0.5 },
          { key: "cautious_vs_bold", weight: 0.4 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
        ],
        branchKey: "adventure",
      },
      {
        id: "s3_q17_d",
        label: "誰かの役に立つ活動や仕事に打ち込む",
        axisMappings: [
          { key: "individual_vs_social", weight: 0.5 },
          { key: "social_initiative", weight: 0.4 },
          { key: "perfectionist_vs_pragmatic", weight: 0.2 },
        ],
        branchKey: "service",
      },
    ],
  },

  {
    id: "s3_q18",
    category: "values_clarification",
    prompt:
      "大切な人との関係で、あなたが最も大切にしていることは？",
    options: [
      {
        id: "s3_q18_a",
        label: "正直でいられること。嘘のない関係",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "public_private_gap", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.2 },
        ],
        branchKey: "honesty",
      },
      {
        id: "s3_q18_b",
        label: "お互いの自由を尊重し合えること",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.4 },
          { key: "boundary_awareness", weight: 0.4 },
          { key: "attachment_style", weight: -0.2 },
        ],
        branchKey: "freedom",
      },
      {
        id: "s3_q18_c",
        label: "深い安心感と信頼があること",
        axisMappings: [
          { key: "attachment_style", weight: 0.0 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.3 },
          { key: "intimacy_pace", weight: 0.2 },
        ],
        branchKey: "security",
      },
      {
        id: "s3_q18_d",
        label: "一緒に成長できること。刺激し合える関係",
        axisMappings: [
          { key: "growth_mindset", weight: -0.4 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
          { key: "individual_vs_social", weight: 0.2 },
        ],
        branchKey: "mutual_growth",
      },
    ],
  },

  {
    id: "s3_q19",
    category: "values_clarification",
    prompt:
      "「これだけは絶対に譲れない」と感じるものは？",
    options: [
      {
        id: "s3_q19_a",
        label: "自分で決める権利。誰かに人生を委ねたくない",
        axisMappings: [
          { key: "independence_vs_harmony", weight: -0.5 },
          { key: "individual_vs_social", weight: -0.4 },
          { key: "control_tendency", weight: 0.3 },
        ],
        branchKey: "sovereignty",
      },
      {
        id: "s3_q19_b",
        label: "誠実さ。自分にも他者にも嘘をつきたくない",
        axisMappings: [
          { key: "direct_vs_diplomatic", weight: -0.5 },
          { key: "public_private_gap", weight: -0.4 },
          { key: "perfectionist_vs_pragmatic", weight: -0.2 },
        ],
        branchKey: "integrity",
      },
      {
        id: "s3_q19_c",
        label: "人とのつながり。孤立だけは耐えられない",
        axisMappings: [
          { key: "independence_vs_harmony", weight: 0.5 },
          { key: "stress_isolation_vs_social", weight: 0.4 },
          { key: "reassurance_need", weight: 0.3 },
        ],
        branchKey: "belonging",
      },
      {
        id: "s3_q19_d",
        label: "自分の可能性。「無理だ」と言われても挑みたい",
        axisMappings: [
          { key: "cautious_vs_bold", weight: 0.5 },
          { key: "growth_mindset", weight: -0.4 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
        ],
        branchKey: "potential",
      },
    ],
  },

  // ═══════════════════════════════════════════
  // H. transformation_readiness（2問）
  // 自己変容への意欲を直接観測し、Prochaska ステージ判定の補助データとする
  // ═══════════════════════════════════════════

  {
    id: "s3_q20",
    category: "transformation_readiness",
    prompt:
      "今の自分を変えたいと思うことがある？",
    options: [
      {
        id: "s3_q20_a",
        label: "強く思う。変わりたい部分が明確にある",
        axisMappings: [
          { key: "growth_mindset", weight: -0.5 },
          { key: "change_embrace_vs_resist", weight: -0.4 },
          { key: "locus_of_control", weight: -0.2 },
        ],
        branchKey: "strong_yes",
      },
      {
        id: "s3_q20_b",
        label: "少しはある。でも具体的には決まっていない",
        axisMappings: [
          { key: "growth_mindset", weight: -0.2 },
          { key: "change_embrace_vs_resist", weight: -0.1 },
          { key: "rumination_tendency", weight: 0.1 },
        ],
        branchKey: "somewhat",
      },
      {
        id: "s3_q20_c",
        label: "あまり思わない。今の自分で概ね満足している",
        axisMappings: [
          { key: "growth_mindset", weight: 0.2 },
          { key: "change_embrace_vs_resist", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.3 },
        ],
        branchKey: "not_really",
      },
      {
        id: "s3_q20_d",
        label: "思わない。自分は自分だと受け入れている",
        axisMappings: [
          { key: "growth_mindset", weight: 0.3 },
          { key: "emotional_regulation", weight: 0.4 },
          { key: "locus_of_control", weight: 0.1 },
        ],
        branchKey: "no",
      },
    ],
  },

  {
    id: "s3_q21",
    category: "transformation_readiness",
    prompt:
      "もし1つだけ自分を変えられるとしたら、何を変えたい？",
    options: [
      {
        id: "s3_q21_a",
        label: "感情のコントロール。もっと安定していたい",
        axisMappings: [
          { key: "emotional_regulation", weight: -0.5 },
          { key: "emotional_variability", weight: 0.3 },
          { key: "rumination_tendency", weight: 0.2 },
        ],
        branchKey: "emotion",
      },
      {
        id: "s3_q21_b",
        label: "人との距離感。もっと自然に関われるようになりたい",
        axisMappings: [
          { key: "intimacy_pace", weight: 0.3 },
          { key: "boundary_awareness", weight: -0.3 },
          { key: "attachment_style", weight: 0.2 },
        ],
        branchKey: "social",
      },
      {
        id: "s3_q21_c",
        label: "行動力。考えすぎずにもっと動けるようになりたい",
        axisMappings: [
          { key: "cautious_vs_bold", weight: 0.4 },
          { key: "plan_vs_spontaneous", weight: 0.3 },
          { key: "change_embrace_vs_resist", weight: -0.3 },
        ],
        branchKey: "action",
      },
      {
        id: "s3_q21_d",
        label: "自信。もっと自分を信じられるようになりたい",
        axisMappings: [
          { key: "shame_vs_guilt", weight: -0.3 },
          { key: "reassurance_need", weight: 0.3 },
          { key: "locus_of_control", weight: -0.3 },
        ],
        branchKey: "confidence",
      },
    ],
  },
];
