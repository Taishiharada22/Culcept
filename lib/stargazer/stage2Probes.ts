// lib/stargazer/stage2Probes.ts
// Stage 2: Neural Deep Probe — 6テーマ × 5ステップ分岐型深掘り
// 表面回答ではなく、判断構造・揺れ・矛盾・越境傾向を観測

import type { TraitAxisKey } from "./traitAxes";

// ── 型定義 ──

export type ProbeContext =
  | "friends"
  | "romance"
  | "long_term"
  | "collab"
  | "cross_gender_friendship";

export type ProbeStep =
  | "main_question"
  | "reason_probe"
  | "condition_change"
  | "reverse_situation"
  | "action_choice";

export const PROBE_STEP_LABELS: Record<
  ProbeStep,
  { label: string; description: string }
> = {
  main_question: { label: "本質問", description: "シナリオに対する直感的な反応" },
  reason_probe: { label: "理由の深掘り", description: "なぜそう選んだのか" },
  condition_change: {
    label: "条件変化",
    description: "状況が変わったらどうするか",
  },
  reverse_situation: {
    label: "逆転状況",
    description: "逆の立場になったら",
  },
  action_choice: {
    label: "行動選択",
    description: "具体的な行動シナリオ",
  },
};

export const PROBE_STEPS: ProbeStep[] = [
  "main_question",
  "reason_probe",
  "condition_change",
  "reverse_situation",
  "action_choice",
];

/**
 * 各ステップの重み — Step 1 単独では低い、5ステップ通して初めて信頼できる
 *
 * 重み付けの科学的根拠:
 *
 * - main_question (0.15): 単一の自己報告質問は最も信頼性の低いシグナル。
 *   内省的アクセスの限界により、人は自分の判断理由を正確に報告できない
 *   (Nisbett & Wilson, 1977)。
 *
 * - reason_probe (0.25): 意識的な評価プロセスを明示させる。
 *   最高重みを付与 — 精緻化の深さが構成概念妥当性と相関する
 *   (Ericsson & Simon, 1993 プロトコル分析)。
 *
 * - condition_change (0.20): 状況依存性を検出。
 *   if-then プロファイルの特定により、文脈横断的な安定性を評価
 *   (Mischel & Shoda, 1995 CAPS モデル)。
 *
 * - reverse_situation (0.20): 視点転換による自己-他者一貫性の検証。
 *   非対称性は潜在的バイアスを示す高情報量シグナル
 *   (Pronin, Lin & Ross, 2002 ナイーブ・リアリズム)。
 *
 * - action_choice (0.20): 行動意図の測定。
 *   実際の行動予測に最も近いが、社会的望ましさバイアスの影響を受けるため
 *   reason_probe より低い重みとする (Ajzen, 1991 計画的行動理論)。
 */
export const PROBE_STEP_WEIGHTS: Record<ProbeStep, number> = {
  main_question: 0.15,
  reason_probe: 0.25,
  condition_change: 0.2,
  reverse_situation: 0.2,
  action_choice: 0.2,
};

export interface ProbeAxisMapping {
  key: TraitAxisKey;
  weight: number;
}

export interface ProbeOption {
  id: string;
  label: string;
  axisMappings: ProbeAxisMapping[];
  branchKey?: string;
}

export interface ProbeStepDefinition {
  step: ProbeStep;
  prompt: string;
  options: ProbeOption[];
  /** branchKey → 表示するoption IDリスト。省略時は全表示 */
  conditionalOptions?: Record<string, string[]>;
}

export interface ProbeTheme {
  id: string;
  context: ProbeContext;
  title: string;
  description: string;
  emoji: string;
  steps: ProbeStepDefinition[];
}

// ── 回答・結果 ──

export interface ProbeStepAnswer {
  step: ProbeStep;
  selectedOptionId: string;
  branchKey?: string;
  responseTimeMs: number;
}

export interface ProbeThemeResult {
  themeId: string;
  context: ProbeContext;
  answers: ProbeStepAnswer[];
  completedAt: string;
  axisDeltas: Partial<Record<TraitAxisKey, number>>;
}

// ── コンテキストカラー ──

export const PROBE_CONTEXT_COLORS: Record<
  ProbeContext,
  { accent: string; bg: string; label: string }
> = {
  friends: {
    accent: "rgba(74,222,128,0.8)",
    bg: "rgba(74,222,128,0.08)",
    label: "友人関係",
  },
  romance: {
    accent: "rgba(251,113,133,0.8)",
    bg: "rgba(251,113,133,0.08)",
    label: "恋愛",
  },
  long_term: {
    accent: "rgba(251,191,36,0.8)",
    bg: "rgba(251,191,36,0.08)",
    label: "長期関係",
  },
  collab: {
    accent: "rgba(96,165,250,0.8)",
    bg: "rgba(96,165,250,0.08)",
    label: "コラボ",
  },
  cross_gender_friendship: {
    accent: "rgba(168,85,247,0.8)",
    bg: "rgba(168,85,247,0.08)",
    label: "異性友人",
  },
};

// ═══════════════════════════════════════════
// 6テーマのプローブ定義
// ═══════════════════════════════════════════

export const PROBE_THEMES: ProbeTheme[] = [
  // ─────────────────────────────────────────
  // Theme 1: 友人との距離感
  // ─────────────────────────────────────────
  {
    id: "probe_friends_boundary",
    context: "friends",
    title: "友人との距離感",
    description: "友人関係における境界線の取り方を深く観測します",
    emoji: "🤝",
    steps: [
      {
        step: "main_question",
        prompt:
          "親しい友人があなたの予定を勝手に変更して、別の友人を加えてしまいました。あなたの最初の反応は？",
        options: [
          {
            id: "fb_s1_a",
            label: "楽しそうだし、いいと思う",
            axisMappings: [
              { key: "boundary_respect", weight: -0.3 },
              { key: "independence_vs_harmony", weight: 0.3 },
            ],
            branchKey: "accepting",
          },
          {
            id: "fb_s1_b",
            label: "少しモヤッとするが、言わずに合わせる",
            axisMappings: [
              { key: "boundary_respect", weight: -0.1 },
              { key: "direct_vs_diplomatic", weight: 0.4 },
              { key: "public_private_gap", weight: 0.2 },
            ],
            branchKey: "suppressing",
          },
          {
            id: "fb_s1_c",
            label: "一言、事前に聞いてほしかったと伝える",
            axisMappings: [
              { key: "boundary_respect", weight: 0.4 },
              { key: "consent_maturity", weight: 0.3 },
              { key: "direct_vs_diplomatic", weight: -0.3 },
            ],
            branchKey: "assertive",
          },
        ],
      },
      {
        step: "reason_probe",
        prompt: "そう感じた・行動した理由として、最も近いのは？",
        options: [
          {
            id: "fb_s2_a",
            label: "みんなが楽しめることが一番大事だから",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.3 },
              { key: "friend_mode_fit", weight: 0.2 },
            ],
          },
          {
            id: "fb_s2_b",
            label: "自分の気持ちより場の空気を優先するクセがあるから",
            axisMappings: [
              { key: "public_private_gap", weight: 0.3 },
              { key: "emotional_regulation", weight: -0.2 },
            ],
          },
          {
            id: "fb_s2_c",
            label: "自分の時間や予定に関する決定権は自分にあると思うから",
            axisMappings: [
              { key: "boundary_respect", weight: 0.4 },
              { key: "control_tendency", weight: 0.1 },
            ],
          },
        ],
        conditionalOptions: {
          accepting: ["fb_s2_a", "fb_s2_b"],
          suppressing: ["fb_s2_b", "fb_s2_c"],
          assertive: ["fb_s2_c", "fb_s2_a"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "もしその友人が恋人だった場合、同じ反応をしますか？",
        options: [
          {
            id: "fb_s3_a",
            label: "同じ。誰であっても事前に聞いてほしい",
            axisMappings: [
              { key: "relationship_mode_split", weight: -0.3 },
              { key: "boundary_respect", weight: 0.3 },
            ],
          },
          {
            id: "fb_s3_b",
            label: "恋人なら少し甘くなるかも",
            axisMappings: [
              { key: "relationship_mode_split", weight: 0.3 },
              { key: "intimacy_pace", weight: 0.2 },
            ],
          },
          {
            id: "fb_s3_c",
            label: "恋人ならもっと気になる。もっとちゃんと伝える",
            axisMappings: [
              { key: "relationship_mode_split", weight: 0.4 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "逆に、あなたが友人の予定を勝手に変えてしまい、相手に指摘されたらどう感じますか？",
        options: [
          {
            id: "fb_s4_a",
            label: "素直に謝る。配慮が足りなかった",
            axisMappings: [
              { key: "consent_maturity", weight: 0.4 },
              { key: "rejection_response_maturity", weight: 0.3 },
            ],
          },
          {
            id: "fb_s4_b",
            label: "少し驚くが、相手の気持ちは理解できる",
            axisMappings: [
              { key: "consent_maturity", weight: 0.2 },
              { key: "boundary_awareness", weight: 0.2 },
            ],
          },
          {
            id: "fb_s4_c",
            label: "そこまで言わなくても...と思ってしまう",
            axisMappings: [
              { key: "consent_maturity", weight: -0.2 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt:
          "今後同じような場面で、あなたが実際に取りそうな行動は？",
        options: [
          {
            id: "fb_s5_a",
            label: "事前に確認してから動く",
            axisMappings: [
              { key: "consent_maturity", weight: 0.4 },
              { key: "boundary_respect", weight: 0.3 },
            ],
          },
          {
            id: "fb_s5_b",
            label: "状況次第で臨機応変に",
            axisMappings: [
              { key: "plan_vs_spontaneous", weight: 0.3 },
              { key: "boundary_respect", weight: -0.1 },
            ],
          },
          {
            id: "fb_s5_c",
            label: "楽しいと思う方を優先する",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.2 },
              { key: "boundary_respect", weight: -0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────
  // Theme 2: 断られた時の反応
  // ─────────────────────────────────────────
  {
    id: "probe_rejection_response",
    context: "romance",
    title: "断られた時の反応",
    description: "提案や誘いが受け入れられなかった時の反応構造を観測します",
    emoji: "💭",
    steps: [
      {
        step: "main_question",
        prompt:
          "自分の提案が相手に響いていないと感じた時、どうなりやすいですか？",
        options: [
          {
            id: "rr_s1_a",
            label: "すぐ引く",
            axisMappings: [
              { key: "rejection_response_maturity", weight: 0.4 },
              { key: "pressure_risk", weight: -0.4 },
            ],
            branchKey: "immediate_retreat",
          },
          {
            id: "rr_s1_b",
            label: "少し様子を見る",
            axisMappings: [
              { key: "rejection_response_maturity", weight: 0.2 },
              { key: "cautious_vs_bold", weight: -0.2 },
            ],
            branchKey: "observing",
          },
          {
            id: "rr_s1_c",
            label: "理由を知りたくなる",
            axisMappings: [
              { key: "analytical_vs_intuitive", weight: -0.2 },
              { key: "pressure_risk", weight: 0.2 },
            ],
            branchKey: "seeking_reason",
          },
          {
            id: "rr_s1_d",
            label: "まだ可能性があると思う",
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
        step: "reason_probe",
        prompt: "そうなる一番大きな理由は？",
        options: [
          {
            id: "rr_s2_a",
            label: "相手の気持ちを尊重したい",
            axisMappings: [
              { key: "consent_maturity", weight: 0.4 },
              { key: "boundary_respect", weight: 0.3 },
            ],
          },
          {
            id: "rr_s2_b",
            label: "曖昧だと気になる",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "emotional_regulation", weight: -0.1 },
            ],
          },
          {
            id: "rr_s2_c",
            label: "ちゃんと向き合いたい",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "intent_stability", weight: 0.2 },
            ],
          },
          {
            id: "rr_s2_d",
            label: "簡単には諦めたくない",
            axisMappings: [
              { key: "pressure_risk", weight: 0.3 },
              { key: "escalation_risk", weight: 0.2 },
            ],
          },
        ],
        conditionalOptions: {
          immediate_retreat: ["rr_s2_a", "rr_s2_b"],
          observing: ["rr_s2_b", "rr_s2_c"],
          seeking_reason: ["rr_s2_c", "rr_s2_b"],
          persistent: ["rr_s2_d", "rr_s2_c"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "その相手が自分にとってかなり魅力的な相手でも同じですか？",
        options: [
          {
            id: "rr_s3_a",
            label: "同じ。魅力に関わらず相手の意思を尊重する",
            axisMappings: [
              { key: "consent_maturity", weight: 0.5 },
              { key: "escalation_risk", weight: -0.3 },
            ],
          },
          {
            id: "rr_s3_b",
            label: "少し粘りたくなるかもしれない",
            axisMappings: [
              { key: "escalation_risk", weight: 0.3 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
          {
            id: "rr_s3_c",
            label: "もう少し働きかけると思う",
            axisMappings: [
              { key: "escalation_risk", weight: 0.4 },
              { key: "pressure_risk", weight: 0.3 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "逆に、自分が慎重なだけで相手に押されたらどう感じますか？",
        options: [
          {
            id: "rr_s4_a",
            label: "少し距離を取りたくなる",
            axisMappings: [
              { key: "boundary_awareness", weight: 0.4 },
              { key: "pressure_risk", weight: -0.2 },
            ],
          },
          {
            id: "rr_s4_b",
            label: "気持ちは理解できるが、ペースを守りたい",
            axisMappings: [
              { key: "boundary_respect", weight: 0.3 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
          {
            id: "rr_s4_c",
            label: "相手の熱意に少し嬉しさも感じる",
            axisMappings: [
              { key: "reassurance_need", weight: 0.2 },
              { key: "pressure_risk", weight: 0.1 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt: "実際にその場面で最も近い行動は？",
        options: [
          {
            id: "rr_s5_a",
            label: "相手のペースを優先する",
            axisMappings: [
              { key: "consent_maturity", weight: 0.4 },
              { key: "rejection_response_maturity", weight: 0.3 },
            ],
          },
          {
            id: "rr_s5_b",
            label: "1回だけ確認する",
            axisMappings: [
              { key: "rejection_response_maturity", weight: 0.2 },
              { key: "direct_vs_diplomatic", weight: -0.2 },
            ],
          },
          {
            id: "rr_s5_c",
            label: "もう少し働きかける",
            axisMappings: [
              { key: "pressure_risk", weight: 0.3 },
              { key: "escalation_risk", weight: 0.2 },
            ],
          },
          {
            id: "rr_s5_d",
            label: "関係自体を見直す",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.2 },
              { key: "independence_vs_harmony", weight: -0.3 },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────
  // Theme 3: 友達から恋愛への越境
  // ─────────────────────────────────────────
  {
    id: "probe_friend_to_romance",
    context: "cross_gender_friendship",
    title: "友達から恋愛への越境",
    description: "友人関係から恋愛への発展における境界線を観測します",
    emoji: "🌸",
    steps: [
      {
        step: "main_question",
        prompt:
          "友達としてつながった相手に惹かれ始めたら、あなたはどうしやすいですか？",
        options: [
          {
            id: "fr_s1_a",
            label: "今の関係を大切にして慎重に考える",
            axisMappings: [
              { key: "friend_mode_fit", weight: 0.4 },
              { key: "intent_stability", weight: 0.3 },
              { key: "escalation_risk", weight: -0.3 },
            ],
            branchKey: "cautious",
          },
          {
            id: "fr_s1_b",
            label: "相手の温度感を探る",
            axisMappings: [
              { key: "cautious_vs_bold", weight: -0.2 },
              { key: "analytical_vs_intuitive", weight: -0.2 },
            ],
            branchKey: "exploring",
          },
          {
            id: "fr_s1_c",
            label: "気持ちは自然に少し出ると思う",
            axisMappings: [
              { key: "intent_stability", weight: -0.2 },
              { key: "escalation_risk", weight: 0.2 },
            ],
            branchKey: "leaking",
          },
          {
            id: "fr_s1_d",
            label: "早めに伝える方が誠実だと思う",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.4 },
              { key: "escalation_risk", weight: 0.3 },
            ],
            branchKey: "direct",
          },
        ],
      },
      {
        step: "reason_probe",
        prompt: "そう考える理由は何ですか？",
        options: [
          {
            id: "fr_s2_a",
            label: "友情を失いたくないから",
            axisMappings: [
              { key: "friend_mode_fit", weight: 0.4 },
              { key: "intent_stability", weight: 0.3 },
            ],
          },
          {
            id: "fr_s2_b",
            label: "相手の反応を見てから判断したいから",
            axisMappings: [
              { key: "cautious_vs_bold", weight: -0.3 },
              { key: "consent_maturity", weight: 0.2 },
            ],
          },
          {
            id: "fr_s2_c",
            label: "気持ちを隠し続けるのは不誠実だと思うから",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "public_private_gap", weight: -0.2 },
            ],
          },
          {
            id: "fr_s2_d",
            label: "チャンスを逃したくないから",
            axisMappings: [
              { key: "escalation_risk", weight: 0.3 },
              { key: "pressure_risk", weight: 0.2 },
            ],
          },
        ],
        conditionalOptions: {
          cautious: ["fr_s2_a", "fr_s2_b"],
          exploring: ["fr_s2_b", "fr_s2_c"],
          leaking: ["fr_s2_c", "fr_s2_d"],
          direct: ["fr_s2_c", "fr_s2_d"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "相手が最初から「恋愛発展は望まない」と明示していた場合でも同じですか？",
        options: [
          {
            id: "fr_s3_a",
            label: "それなら完全に友達として接する",
            axisMappings: [
              { key: "consent_maturity", weight: 0.5 },
              { key: "boundary_respect", weight: 0.4 },
              { key: "escalation_risk", weight: -0.4 },
            ],
          },
          {
            id: "fr_s3_b",
            label: "頭では理解するが、気持ちは簡単には変わらない",
            axisMappings: [
              { key: "consent_maturity", weight: 0.1 },
              { key: "emotional_regulation", weight: -0.2 },
            ],
          },
          {
            id: "fr_s3_c",
            label: "時間が経てば相手の気持ちも変わるかもしれない",
            axisMappings: [
              { key: "consent_maturity", weight: -0.3 },
              { key: "escalation_risk", weight: 0.4 },
              { key: "pressure_risk", weight: 0.3 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "逆に、自分が友達だと思っていた相手から急に好意を向けられたらどう感じますか？",
        options: [
          {
            id: "fr_s4_a",
            label: "驚くが、相手の気持ちは受け止める",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.3 },
              { key: "consent_maturity", weight: 0.2 },
            ],
          },
          {
            id: "fr_s4_b",
            label: "少し困惑する。友達のままでいたかった",
            axisMappings: [
              { key: "friend_mode_fit", weight: 0.3 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "fr_s4_c",
            label: "正直、不快に感じるかもしれない",
            axisMappings: [
              { key: "boundary_respect", weight: 0.4 },
              { key: "friend_mode_fit", weight: 0.2 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt: "その場面で、あなたが実際にとりそうな行動は？",
        options: [
          {
            id: "fr_s5_a",
            label: "一度関係を整理する",
            axisMappings: [
              { key: "boundary_respect", weight: 0.4 },
              { key: "emotional_regulation", weight: 0.3 },
            ],
          },
          {
            id: "fr_s5_b",
            label: "相手の境界線を確認する",
            axisMappings: [
              { key: "consent_maturity", weight: 0.4 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "fr_s5_c",
            label: "少しずつ好意を見せる",
            axisMappings: [
              { key: "escalation_risk", weight: 0.2 },
              { key: "intimacy_pace", weight: 0.2 },
            ],
          },
          {
            id: "fr_s5_d",
            label: "流れに任せる",
            axisMappings: [
              { key: "plan_vs_spontaneous", weight: 0.3 },
              { key: "intent_stability", weight: -0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────
  // Theme 4: 異性の友達モード適性
  // ─────────────────────────────────────────
  {
    id: "probe_cross_gender_friend",
    context: "cross_gender_friendship",
    title: "異性の友達モード適性",
    description: "異性との友人関係における安定性を観測します",
    emoji: "🌈",
    steps: [
      {
        step: "main_question",
        prompt:
          "異性とも、恋愛抜きで自然に友達関係を築けると思いますか？",
        options: [
          {
            id: "cf_s1_a",
            label: "はい、かなりそう思う",
            axisMappings: [
              { key: "friend_mode_fit", weight: 0.5 },
              { key: "intent_stability", weight: 0.3 },
            ],
            branchKey: "confident",
          },
          {
            id: "cf_s1_b",
            label: "条件が合えばそう思う",
            axisMappings: [
              { key: "friend_mode_fit", weight: 0.2 },
              { key: "boundary_awareness", weight: 0.2 },
            ],
            branchKey: "conditional",
          },
          {
            id: "cf_s1_c",
            label: "少し難しいと思う",
            axisMappings: [
              { key: "friend_mode_fit", weight: -0.2 },
              { key: "intent_stability", weight: -0.2 },
            ],
            branchKey: "difficult",
          },
          {
            id: "cf_s1_d",
            label: "あまりそうは思わない",
            axisMappings: [
              { key: "friend_mode_fit", weight: -0.5 },
              { key: "escalation_risk", weight: 0.3 },
            ],
            branchKey: "unlikely",
          },
        ],
      },
      {
        step: "reason_probe",
        prompt: "そう思う理由は？",
        options: [
          {
            id: "cf_s2_a",
            label: "目的がはっきりしていれば大丈夫",
            axisMappings: [
              { key: "intent_stability", weight: 0.4 },
              { key: "boundary_awareness", weight: 0.3 },
            ],
          },
          {
            id: "cf_s2_b",
            label: "自分の中で線引きできる",
            axisMappings: [
              { key: "boundary_respect", weight: 0.4 },
              { key: "emotional_regulation", weight: 0.3 },
            ],
          },
          {
            id: "cf_s2_c",
            label: "相手次第でズレやすい",
            axisMappings: [
              { key: "intent_stability", weight: -0.3 },
              { key: "emotional_variability", weight: 0.3 },
            ],
          },
          {
            id: "cf_s2_d",
            label: "感情が混ざりやすい",
            axisMappings: [
              { key: "friend_mode_fit", weight: -0.4 },
              { key: "escalation_risk", weight: 0.3 },
            ],
          },
        ],
        conditionalOptions: {
          confident: ["cf_s2_a", "cf_s2_b"],
          conditional: ["cf_s2_a", "cf_s2_c"],
          difficult: ["cf_s2_c", "cf_s2_d"],
          unlikely: ["cf_s2_d", "cf_s2_c"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "相手が魅力的だったり、自分に好意的だったりした場合でも同じですか？",
        options: [
          {
            id: "cf_s3_a",
            label: "同じ。友達は友達",
            axisMappings: [
              { key: "intent_stability", weight: 0.5 },
              { key: "friend_mode_fit", weight: 0.4 },
            ],
          },
          {
            id: "cf_s3_b",
            label: "少し意識してしまうかもしれない",
            axisMappings: [
              { key: "intent_stability", weight: -0.2 },
              { key: "emotional_variability", weight: 0.2 },
            ],
          },
          {
            id: "cf_s3_c",
            label: "正直、揺れると思う",
            axisMappings: [
              { key: "intent_stability", weight: -0.4 },
              { key: "escalation_risk", weight: 0.3 },
              { key: "friend_mode_fit", weight: -0.3 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "「友達のつもりだったのに急に口説いてきた」相手にどう感じますか？",
        options: [
          {
            id: "cf_s4_a",
            label: "信頼を裏切られた気がする",
            axisMappings: [
              { key: "boundary_respect", weight: 0.5 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
          {
            id: "cf_s4_b",
            label: "驚くが、気持ちは理解できる",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.3 },
              { key: "independence_vs_harmony", weight: 0.2 },
            ],
          },
          {
            id: "cf_s4_c",
            label: "状況次第で受け入れるかも",
            axisMappings: [
              { key: "friend_mode_fit", weight: -0.3 },
              { key: "intent_stability", weight: -0.2 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt: "その場面で、あなたが実際にとりそうな行動は？",
        options: [
          {
            id: "cf_s5_a",
            label: "友達モードの境界をはっきり伝える",
            axisMappings: [
              { key: "boundary_respect", weight: 0.5 },
              { key: "direct_vs_diplomatic", weight: -0.3 },
            ],
          },
          {
            id: "cf_s5_b",
            label: "少し距離を取る",
            axisMappings: [
              { key: "boundary_awareness", weight: 0.3 },
              { key: "stress_isolation_vs_social", weight: -0.2 },
            ],
          },
          {
            id: "cf_s5_c",
            label: "相手の気持ちを探る",
            axisMappings: [
              { key: "cautious_vs_bold", weight: -0.2 },
              { key: "intent_stability", weight: -0.1 },
            ],
          },
          {
            id: "cf_s5_d",
            label: "状況次第で受け入れる",
            axisMappings: [
              { key: "friend_mode_fit", weight: -0.3 },
              { key: "plan_vs_spontaneous", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────
  // Theme 5: 長期関係での変化
  // ─────────────────────────────────────────
  {
    id: "probe_long_term_shift",
    context: "long_term",
    title: "長期関係での変化",
    description: "関係が深まった時の変化傾向を観測します",
    emoji: "🏠",
    steps: [
      {
        step: "main_question",
        prompt:
          "関係が深まるほど、お互いに優先順位を高くしてほしいと感じますか？",
        options: [
          {
            id: "lt_s1_a",
            label: "あまり感じない",
            axisMappings: [
              { key: "exclusivity_pressure", weight: -0.4 },
              { key: "control_tendency", weight: -0.3 },
            ],
            branchKey: "low_expectation",
          },
          {
            id: "lt_s1_b",
            label: "少し感じる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.1 },
              { key: "reassurance_need", weight: 0.2 },
            ],
            branchKey: "mild_expectation",
          },
          {
            id: "lt_s1_c",
            label: "かなり感じる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.4 },
              { key: "control_tendency", weight: 0.2 },
            ],
            branchKey: "high_expectation",
          },
          {
            id: "lt_s1_d",
            label: "関係が深いなら自然だと思う",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.3 },
              { key: "long_term_shift_risk", weight: 0.2 },
            ],
            branchKey: "normalized",
          },
        ],
      },
      {
        step: "reason_probe",
        prompt: "そう感じる理由は何ですか？",
        options: [
          {
            id: "lt_s2_a",
            label: "大切にされている実感がほしい",
            axisMappings: [
              { key: "reassurance_need", weight: 0.4 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
          {
            id: "lt_s2_b",
            label: "信頼関係には優先が必要だと思う",
            axisMappings: [
              { key: "control_tendency", weight: 0.2 },
              { key: "long_term_shift_risk", weight: 0.2 },
            ],
          },
          {
            id: "lt_s2_c",
            label: "自然とそうなるものだと思う",
            axisMappings: [
              { key: "long_term_shift_risk", weight: 0.1 },
              { key: "independence_vs_harmony", weight: 0.2 },
            ],
          },
          {
            id: "lt_s2_d",
            label: "お互いの自由が大切だと思う",
            axisMappings: [
              { key: "independence_vs_harmony", weight: -0.4 },
              { key: "control_tendency", weight: -0.3 },
            ],
          },
        ],
        conditionalOptions: {
          low_expectation: ["lt_s2_d", "lt_s2_c"],
          mild_expectation: ["lt_s2_a", "lt_s2_c"],
          high_expectation: ["lt_s2_a", "lt_s2_b"],
          normalized: ["lt_s2_b", "lt_s2_c"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "結婚後や同棲後でも、相手が一人の時間や友人関係を大切にしたいと言ったらどう感じますか？",
        options: [
          {
            id: "lt_s3_a",
            label: "当然のこと。尊重する",
            axisMappings: [
              { key: "control_tendency", weight: -0.4 },
              { key: "exclusivity_pressure", weight: -0.3 },
              { key: "boundary_respect", weight: 0.3 },
            ],
          },
          {
            id: "lt_s3_b",
            label: "理解はするが、少し寂しい",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "long_term_shift_risk", weight: 0.2 },
            ],
          },
          {
            id: "lt_s3_c",
            label: "バランスは話し合って決めたい",
            axisMappings: [
              { key: "consent_maturity", weight: 0.3 },
              { key: "control_tendency", weight: 0.1 },
            ],
          },
          {
            id: "lt_s3_d",
            label: "もう少しこちらを優先してほしい",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.4 },
              { key: "control_tendency", weight: 0.3 },
              { key: "long_term_shift_risk", weight: 0.3 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "逆に、自分の行動や交友関係を細かく気にされたらどう感じますか？",
        options: [
          {
            id: "lt_s4_a",
            label: "窮屈に感じる",
            axisMappings: [
              { key: "independence_vs_harmony", weight: -0.4 },
              { key: "boundary_respect", weight: 0.3 },
            ],
          },
          {
            id: "lt_s4_b",
            label: "心配してくれているのだと理解する",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.3 },
              { key: "public_private_gap", weight: 0.2 },
            ],
          },
          {
            id: "lt_s4_c",
            label: "関係が深いならある程度は当然",
            axisMappings: [
              { key: "control_tendency", weight: 0.3 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt: "長期関係において、あなたが実際にとりそうな行動は？",
        options: [
          {
            id: "lt_s5_a",
            label: "相手の自由を尊重する",
            axisMappings: [
              { key: "control_tendency", weight: -0.4 },
              { key: "boundary_respect", weight: 0.4 },
            ],
          },
          {
            id: "lt_s5_b",
            label: "少し不安なので話し合いたい",
            axisMappings: [
              { key: "consent_maturity", weight: 0.3 },
              { key: "reassurance_need", weight: 0.2 },
            ],
          },
          {
            id: "lt_s5_c",
            label: "優先順位は合わせてほしいと伝える",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.3 },
              { key: "control_tendency", weight: 0.2 },
            ],
          },
          {
            id: "lt_s5_d",
            label: "関係が深いならある程度当然だと思う",
            axisMappings: [
              { key: "long_term_shift_risk", weight: 0.3 },
              { key: "control_tendency", weight: 0.2 },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────
  // Theme 6: 束縛・支配の兆候
  // ─────────────────────────────────────────
  {
    id: "probe_control_tendency",
    context: "long_term",
    title: "自由と親密さのバランス",
    description: "親密な関係における自由と距離感のバランスを観測します",
    emoji: "⚖️",
    steps: [
      {
        step: "main_question",
        prompt:
          "大切な相手が、自分以外の異性と親しくしていたらどう感じやすいですか？",
        options: [
          {
            id: "ct_s1_a",
            label: "ほとんど気にならない",
            axisMappings: [
              { key: "exclusivity_pressure", weight: -0.5 },
              { key: "control_tendency", weight: -0.3 },
            ],
            branchKey: "unconcerned",
          },
          {
            id: "ct_s1_b",
            label: "少し気になる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.1 },
              { key: "reassurance_need", weight: 0.2 },
            ],
            branchKey: "slightly_concerned",
          },
          {
            id: "ct_s1_c",
            label: "内容によっては気になる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.2 },
              { key: "boundary_awareness", weight: 0.2 },
            ],
            branchKey: "conditionally_concerned",
          },
          {
            id: "ct_s1_d",
            label: "かなり気になる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.5 },
              { key: "control_tendency", weight: 0.3 },
            ],
            branchKey: "very_concerned",
          },
        ],
      },
      {
        step: "reason_probe",
        prompt: "気になるとしたら、何が一番引っかかりますか？",
        options: [
          {
            id: "ct_s2_a",
            label: "信頼の問題",
            axisMappings: [
              { key: "reassurance_need", weight: 0.3 },
              { key: "consent_maturity", weight: 0.1 },
            ],
          },
          {
            id: "ct_s2_b",
            label: "自分の知らない関係性",
            axisMappings: [
              { key: "control_tendency", weight: 0.3 },
              { key: "public_private_gap", weight: 0.2 },
            ],
          },
          {
            id: "ct_s2_c",
            label: "置いていかれる感じ",
            axisMappings: [
              { key: "reassurance_need", weight: 0.4 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
          {
            id: "ct_s2_d",
            label: "相手の配慮不足",
            axisMappings: [
              { key: "boundary_awareness", weight: 0.2 },
              { key: "consent_maturity", weight: 0.2 },
            ],
          },
        ],
        conditionalOptions: {
          unconcerned: ["ct_s2_a", "ct_s2_d"],
          slightly_concerned: ["ct_s2_a", "ct_s2_c"],
          conditionally_concerned: ["ct_s2_b", "ct_s2_d"],
          very_concerned: ["ct_s2_b", "ct_s2_c"],
        },
      },
      {
        step: "condition_change",
        prompt:
          "それが長く付き合った相手や配偶者だった場合は強くなりますか？",
        options: [
          {
            id: "ct_s3_a",
            label: "変わらない",
            axisMappings: [
              { key: "long_term_shift_risk", weight: -0.4 },
              { key: "emotional_regulation", weight: 0.3 },
            ],
          },
          {
            id: "ct_s3_b",
            label: "少し強くなると思う",
            axisMappings: [
              { key: "long_term_shift_risk", weight: 0.2 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
          {
            id: "ct_s3_c",
            label: "かなり強くなると思う",
            axisMappings: [
              { key: "long_term_shift_risk", weight: 0.5 },
              { key: "exclusivity_pressure", weight: 0.4 },
              { key: "control_tendency", weight: 0.3 },
            ],
          },
        ],
      },
      {
        step: "reverse_situation",
        prompt:
          "逆に、自分が友人と親しくしていることを相手に細かく気にされたらどう感じますか？",
        options: [
          {
            id: "ct_s4_a",
            label: "窮屈に感じる。信頼してほしい",
            axisMappings: [
              { key: "control_tendency", weight: -0.3 },
              { key: "boundary_respect", weight: 0.4 },
            ],
          },
          {
            id: "ct_s4_b",
            label: "気持ちは理解できるので説明する",
            axisMappings: [
              { key: "consent_maturity", weight: 0.3 },
              { key: "direct_vs_diplomatic", weight: -0.2 },
            ],
          },
          {
            id: "ct_s4_c",
            label: "相手が不安なら距離感を調整する",
            axisMappings: [
              { key: "independence_vs_harmony", weight: 0.3 },
              { key: "control_tendency", weight: 0.1 },
            ],
          },
        ],
      },
      {
        step: "action_choice",
        prompt: "実際にその場面で最も近い行動は？",
        options: [
          {
            id: "ct_s5_a",
            label: "自分の不安を整理する",
            axisMappings: [
              { key: "emotional_regulation", weight: 0.4 },
              { key: "control_tendency", weight: -0.2 },
            ],
          },
          {
            id: "ct_s5_b",
            label: "相手と率直に話す",
            axisMappings: [
              { key: "direct_vs_diplomatic", weight: -0.3 },
              { key: "consent_maturity", weight: 0.3 },
            ],
          },
          {
            id: "ct_s5_c",
            label: "相手に距離感を調整してほしいと伝える",
            axisMappings: [
              { key: "control_tendency", weight: 0.3 },
              { key: "exclusivity_pressure", weight: 0.2 },
            ],
          },
          {
            id: "ct_s5_d",
            label: "かなり嫌だと感じる",
            axisMappings: [
              { key: "exclusivity_pressure", weight: 0.4 },
              { key: "emotional_regulation", weight: -0.3 },
            ],
          },
        ],
      },
    ],
  },
];
