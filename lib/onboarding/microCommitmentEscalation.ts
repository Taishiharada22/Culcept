// lib/onboarding/microCommitmentEscalation.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Micro-Commitment Escalation（段階的コミットメント設計）
//
// 脳科学的根拠:
// Foot-in-the-door効果（Freedman & Fraser, 1966）:
// 小さなYesの連鎖が大きなYesを生む。
//
// 各ステップで投資量が増えるが、各ステップで報酬（insight）も増える。
// コミットメント（投資）とリワード（洞察）が常に同時に増加する。
//
// 設計:
// Step 0: Zero-Second Mirror（受動的。読むだけ。0秒）
// Step 1: Binary Choice（2択。タップ1回。3秒）
// Step 2: Insight Mirror（「だからあなたは…」。読む。5秒）
// Step 3: Triple Choice（3択。少し考える。8秒）
// Step 4: Behavioral Reveal（迷いの可視化。読む。3秒）
// Step 5: 「もっと深く見たい？」→ Stage1に自然に移行
//
// 既存資産:
// InitialOnboardingFlow.tsx の 3 Magic Questions がこの構造の核。
// Zero-Second Mirror（Step 0）を追加し、
// 各ステップ間のinsightを強化するレイヤーとして機能。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** コミットメントステップの種類 */
export type CommitmentStepType =
  | "passive_read"       // 読むだけ（Zero-Second Mirror）
  | "binary_choice"      // 2択（最小のコミットメント）
  | "insight_reveal"     // 洞察の提示（報酬）
  | "triple_choice"      // 3択（やや深い選択）
  | "behavioral_reveal"  // 行動パターンの可視化（報酬）
  | "invitation";        // 次のステージへの招待

/** 各ステップの定義 */
export interface CommitmentStep {
  /** ステップ番号 */
  stepNumber: number;
  /** ステップの種類 */
  type: CommitmentStepType;
  /** 期待される所要時間（秒） */
  expectedDuration: number;
  /** ユーザーの投資レベル（0-1） */
  commitmentLevel: number;
  /** 報酬レベル（0-1） */
  rewardLevel: number;
  /** ステップのコンテンツ */
  content: StepContent;
}

export type StepContent =
  | PassiveReadContent
  | BinaryChoiceContent
  | InsightRevealContent
  | TripleChoiceContent
  | BehavioralRevealContent
  | InvitationContent;

export interface PassiveReadContent {
  type: "passive_read";
  text: string;
  subText: string | null;
}

export interface BinaryChoiceContent {
  type: "binary_choice";
  prompt: string;
  optionA: { label: string; value: string; axisHints: Partial<Record<TraitAxisKey, number>> };
  optionB: { label: string; value: string; axisHints: Partial<Record<TraitAxisKey, number>> };
}

export interface InsightRevealContent {
  type: "insight_reveal";
  /** 動的に生成されるinsight */
  insightGenerator: "after_binary" | "after_triple";
  /** フォールバックテキスト */
  fallbackText: string;
}

export interface TripleChoiceContent {
  type: "triple_choice";
  prompt: string;
  options: {
    label: string;
    value: string;
    axisHints: Partial<Record<TraitAxisKey, number>>;
  }[];
}

export interface BehavioralRevealContent {
  type: "behavioral_reveal";
  /** 動的に生成される行動分析 */
  analysisType: "hesitation_pattern" | "choice_speed" | "contradiction_hint";
  /** フォールバックテキスト */
  fallbackText: string;
}

export interface InvitationContent {
  type: "invitation";
  mainText: string;
  ctaText: string;
  /** 拒否オプション（任意） */
  declineText: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Step Flow Definition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Binary Choiceの質問プール
 *
 * 2択は「簡単に答えられる」が「深い意味がある」質問。
 * どちらを選んでも「当たっている」insightが出る設計。
 */
const BINARY_QUESTIONS: BinaryChoiceContent[] = [
  {
    type: "binary_choice",
    prompt: "今、どちらが近い？",
    optionA: {
      label: "考えすぎる方",
      value: "overthink",
      axisHints: {
        analytical_vs_intuitive: -0.4,
        emotional_variability: 0.3,
        perfectionist_vs_pragmatic: -0.3,
      },
    },
    optionB: {
      label: "感じすぎる方",
      value: "overfeel",
      axisHints: {
        analytical_vs_intuitive: 0.4,
        emotional_variability: 0.5,
        introvert_vs_extrovert: -0.2,
      },
    },
  },
  {
    type: "binary_choice",
    prompt: "どちらの「疲れ」が多い？",
    optionA: {
      label: "人といて疲れる",
      value: "social_fatigue",
      axisHints: {
        introvert_vs_extrovert: -0.5,
        stress_isolation_vs_social: -0.4,
        boundary_awareness: 0.4,
      },
    },
    optionB: {
      label: "一人でいて疲れる",
      value: "alone_fatigue",
      axisHints: {
        introvert_vs_extrovert: 0.4,
        stress_isolation_vs_social: 0.4,
        individual_vs_social: 0.5,
      },
    },
  },
  {
    type: "binary_choice",
    prompt: "失敗したとき、先に来るのは？",
    optionA: {
      label: "「なぜ失敗したか」の分析",
      value: "analyze",
      axisHints: {
        analytical_vs_intuitive: -0.5,
        emotional_regulation: 0.3,
        perfectionist_vs_pragmatic: -0.4,
      },
    },
    optionB: {
      label: "「自分はダメだ」の感情",
      value: "self_blame",
      axisHints: {
        analytical_vs_intuitive: 0.3,
        emotional_variability: 0.5,
        public_private_gap: 0.3,
      },
    },
  },
];

/**
 * Triple Choiceの質問プール
 *
 * 3択は「少し考えないと答えられない」質問。
 * 投資量が増え、それに応じてinsightの深さも増す。
 */
const TRIPLE_QUESTIONS: TripleChoiceContent[] = [
  {
    type: "triple_choice",
    prompt: "大切な人が間違っていると思ったとき——",
    options: [
      {
        label: "すぐに伝える",
        value: "direct",
        axisHints: { direct_vs_diplomatic: -0.6, cautious_vs_bold: 0.4 },
      },
      {
        label: "タイミングを見て伝える",
        value: "timed",
        axisHints: { direct_vs_diplomatic: 0.2, emotional_regulation: 0.4 },
      },
      {
        label: "伝えないことが多い",
        value: "silent",
        axisHints: { direct_vs_diplomatic: 0.6, independence_vs_harmony: 0.5 },
      },
    ],
  },
  {
    type: "triple_choice",
    prompt: "新しい環境に入ったとき、最初にすることは？",
    options: [
      {
        label: "全体を観察する",
        value: "observe",
        axisHints: { cautious_vs_bold: -0.4, analytical_vs_intuitive: -0.3 },
      },
      {
        label: "話しかけやすい人を探す",
        value: "connect",
        axisHints: { social_initiative: 0.5, introvert_vs_extrovert: 0.3 },
      },
      {
        label: "自分の居場所を確保する",
        value: "secure",
        axisHints: { boundary_awareness: 0.5, stress_isolation_vs_social: -0.3 },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Dynamic Insight Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Binary Choice後のInsight生成 */
export function generateBinaryInsight(
  selectedValue: string,
  responseTimeMs: number,
): string {
  // 迷いの検出
  const hesitated = responseTimeMs > 5000;

  const insights: Record<string, { quick: string; hesitated: string }> = {
    overthink: {
      quick: "即答で「考えすぎる」を選んだ。つまり、自分が考えすぎていることを、すでに考えすぎている。",
      hesitated: "「考えすぎる方」を選ぶのにも時間をかけた。考えることが呼吸のように自然で、止められない。",
    },
    overfeel: {
      quick: "即答で「感じすぎる」を選んだ。感情の波が強いことを、あなたは自覚している。自覚できること自体が、実は稀な能力。",
      hesitated: "「感じすぎる方」を選ぶのに迷った。考えることと感じることの境界が曖昧な人かもしれない。",
    },
    social_fatigue: {
      quick: "迷わず「人といて疲れる」。でもそれは内向的だからではなく、人の感情を精密に読み取りすぎるからかもしれない。",
      hesitated: "「人といて疲れる」を選ぶのに迷った。本当は人が好きなのに疲れる——その矛盾が、あなたの核心に近い。",
    },
    alone_fatigue: {
      quick: "「一人でいて疲れる」。一人の時間に、頭の中の声が大きくなるタイプ。人といることで、その声を遮断している。",
      hesitated: "どちらも疲れるが、一人の方がより辛い。静寂が、処理しきれていない感情を表面化させるからかもしれない。",
    },
    analyze: {
      quick: "分析が先に来る。感情より構造を見る目。それは強みだが、自分の「痛み」を直視することを避ける盾でもある。",
      hesitated: "分析を選んだが迷った。本当は感情が先に来るのに、それを「分析」で覆い隠す癖があるかもしれない。",
    },
    self_blame: {
      quick: "自己否定が先に来ることを、あなたは知っている。それを知っていても止められないのが、この感情の厄介さ。",
      hesitated: "「ダメだ」と感じることと「分析しよう」の間で迷った。両方が同時に起きている。感情と論理の戦い。",
    },
  };

  const entry = insights[selectedValue];
  if (!entry) return "あなたの選択が、最初のデータポイントになった。";
  return hesitated ? entry.hesitated : entry.quick;
}

/** Behavioral Reveal（行動パターン可視化）の生成 */
export function generateBehavioralReveal(
  binaryResponseTimeMs: number,
  tripleResponseTimeMs: number,
  binaryValue: string,
  tripleValue: string,
): string {
  // パターン分析
  const gettingFaster = tripleResponseTimeMs < binaryResponseTimeMs * 0.8;
  const gettingSlower = tripleResponseTimeMs > binaryResponseTimeMs * 1.5;
  const consistentlyFast = binaryResponseTimeMs < 3000 && tripleResponseTimeMs < 5000;
  const consistentlySlow = binaryResponseTimeMs > 8000 && tripleResponseTimeMs > 12000;

  if (gettingFaster) {
    return "最初の質問より2問目の方が速く答えた。自分について考え始めると、どんどん明確になっていくタイプ。内省のエンジンがかかると加速する。";
  }
  if (gettingSlower) {
    return "2問目の方が時間がかかった。質問が深くなるほど、自分の中の複雑さに気づき始めている。簡単に答えられないことが、深さの証拠。";
  }
  if (consistentlyFast) {
    return "どちらも即決。自分の感覚を信じるタイプ。直感の精度が高い反面、「本当にそうか？」と立ち止まる機会が少ないかもしれない。";
  }
  if (consistentlySlow) {
    return "どちらもじっくり考えた。正確に自分を表現しようとする誠実さ。ただし、完璧な答えを探しすぎて、最初の直感を見失うことがある。";
  }

  return "答え方にパターンが見え始めている。もう少しデータが集まると、あなたの判断の癖が浮かび上がってくる。";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Step Flow Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * オンボーディングフローの全ステップを構築
 *
 * 日付ベースのシード値で質問を日替わりにする。
 * 同じ日に再訪問しても同じ質問が出る（一貫性）。
 */
export function buildCommitmentSteps(dateSeed?: string): CommitmentStep[] {
  const seed = dateSeed ?? new Date().toISOString().slice(0, 10);
  const hash = simpleHash(seed);

  // 質問をシードで選択
  const binaryQ = BINARY_QUESTIONS[hash % BINARY_QUESTIONS.length];
  const tripleQ = TRIPLE_QUESTIONS[(hash >> 4) % TRIPLE_QUESTIONS.length];

  return [
    // Step 0: Zero-Second Mirror（別モジュールで生成）
    {
      stepNumber: 0,
      type: "passive_read",
      expectedDuration: 3,
      commitmentLevel: 0,
      rewardLevel: 0.3, // 「当たっている」感覚自体が報酬
      content: {
        type: "passive_read",
        text: "", // zeroSecondMirror.tsから注入
        subText: null,
      },
    },

    // Step 1: Binary Choice
    {
      stepNumber: 1,
      type: "binary_choice",
      expectedDuration: 3,
      commitmentLevel: 0.2,
      rewardLevel: 0,
      content: binaryQ,
    },

    // Step 2: Insight Mirror（Binary Choiceの結果に基づく）
    {
      stepNumber: 2,
      type: "insight_reveal",
      expectedDuration: 5,
      commitmentLevel: 0.2, // 読むだけだが、内容が深い
      rewardLevel: 0.5,
      content: {
        type: "insight_reveal",
        insightGenerator: "after_binary",
        fallbackText: "あなたの選択が、最初の地図のピンになった。",
      },
    },

    // Step 3: Triple Choice
    {
      stepNumber: 3,
      type: "triple_choice",
      expectedDuration: 8,
      commitmentLevel: 0.4,
      rewardLevel: 0,
      content: tripleQ,
    },

    // Step 4: Behavioral Reveal
    {
      stepNumber: 4,
      type: "behavioral_reveal",
      expectedDuration: 4,
      commitmentLevel: 0.4,
      rewardLevel: 0.7,
      content: {
        type: "behavioral_reveal",
        analysisType: "choice_speed",
        fallbackText: "あなたの答え方にパターンが見え始めている。",
      },
    },

    // Step 5: Invitation
    {
      stepNumber: 5,
      type: "invitation",
      expectedDuration: 3,
      commitmentLevel: 0.5,
      rewardLevel: 0.9,
      content: {
        type: "invitation",
        mainText: "ここまでで、あなたの輪郭が見え始めた。\nもっと深く見たい？",
        ctaText: "深層観測を始める",
        declineText: null, // 拒否オプションなし（自然な流れ）
      },
    },
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Engagement Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** オンボーディングの各ステップの計測データ */
export interface OnboardingStepMetric {
  stepNumber: number;
  /** ステップに到達したか */
  reached: boolean;
  /** ステップでの滞在時間（ms） */
  dwellTimeMs: number;
  /** 選択した値（choice系のステップ） */
  selectedValue: string | null;
  /** 応答時間（choice系のステップ） */
  responseTimeMs: number | null;
  /** 離脱したか */
  dropped: boolean;
}

/**
 * オンボーディングの完了率と離脱ポイントを分析
 */
export function analyzeOnboardingFunnel(
  metrics: OnboardingStepMetric[],
): {
  completionRate: number;
  dropOffStep: number | null;
  avgResponseTimeMs: number;
  engagementScore: number;
} {
  const reached = metrics.filter((m) => m.reached);
  const completed = metrics.filter((m) => m.reached && !m.dropped);
  const dropped = metrics.find((m) => m.dropped);

  const responseTimes = metrics
    .filter((m) => m.responseTimeMs !== null)
    .map((m) => m.responseTimeMs!);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
      : 0;

  // エンゲージメントスコア: 到達率 × 応答の深さ
  const reachRate = reached.length / Math.max(1, metrics.length);
  const responseDepth = avgResponseTime > 0 ? Math.min(1, avgResponseTime / 10000) : 0;
  const engagementScore = reachRate * 0.6 + responseDepth * 0.4;

  return {
    completionRate: completed.length / Math.max(1, metrics.length),
    dropOffStep: dropped?.stepNumber ?? null,
    avgResponseTimeMs: avgResponseTime,
    engagementScore,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}
