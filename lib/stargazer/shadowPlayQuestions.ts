// lib/stargazer/shadowPlayQuestions.ts
// 影絵（Shadow Play）質問 — 投影法による深層観測
//
// 原理: 他者を評価する時、無意識に自分の価値基準が漏れる
// ロールシャッハテストと同じ心理学的原理
//
// 質問タイプ:
// 1. projection: 「Aさんがこうした。あなたはどう思う？」→ 評価に自分が映る
// 2. third_party_view: 「友人はあなたをどう紹介する？」→ 他者の目を借りた自己認識
// 3. meta_observation: 「最近〇〇が増えている。なぜだと思う？」→ 行動の自己説明

import type { TraitAxisKey } from "./traitAxes";
import type { MirrorSource } from "./threeMirrors";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ShadowPlayType = "projection" | "third_party_view" | "meta_observation";

export interface ShadowPlayOption {
  id: string;
  label: string;
  /** 対象軸へのスコア寄与 (-1.0 ~ +1.0) */
  score: number;
  /** この選択肢が示唆する心理的傾向（内部用） */
  implication?: string;
}

export interface ShadowPlayQuestion {
  id: string;
  type: ShadowPlayType;
  /** 質問のシナリオ/状況提示 */
  scenario: string;
  /** 実際の質問文 */
  prompt: string;
  options: ShadowPlayOption[];
  /** 主にマッピングする軸 */
  primaryAxis: TraitAxisKey;
  /** サブマッピング軸（重み付き） */
  secondaryAxes?: { key: TraitAxisKey; weight: number }[];
  /** データソースの分類 */
  mirrorSource: MirrorSource;
  /** 表示用カテゴリ */
  category: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shadow Play Questions — 投影型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SHADOW_PLAY_QUESTIONS: ShadowPlayQuestion[] = [
  // ── 投影型: 他者の行動を評価 → 自分の価値基準が映る ──

  {
    id: "sp_proj_01",
    type: "projection",
    scenario: "Aさんは仕事で大きなミスをした後、誰にも連絡せず3日間一人で過ごした。",
    prompt: "Aさんの行動についてどう思う？",
    options: [
      { id: "a", label: "当然。回復には一人の時間がいる", score: -0.7, implication: "isolation_positive" },
      { id: "b", label: "少し心配。せめて一言あった方がいい", score: -0.1, implication: "moderate_concern" },
      { id: "c", label: "もったいない。周りの力を借りるべき", score: 0.5, implication: "social_recovery" },
      { id: "d", label: "責任感がない。まず報告すべき", score: 0.8, implication: "duty_first" },
    ],
    primaryAxis: "stress_isolation_vs_social",
    secondaryAxes: [
      { key: "individual_vs_social", weight: 0.4 },
    ],
    mirrorSource: "shadow_play",
    category: "ストレス対処",
  },
  {
    id: "sp_proj_02",
    type: "projection",
    scenario: "Bさんは新しいプロジェクトで、データも根拠もないまま「これは絶対うまくいく」と直感だけで進め始めた。",
    prompt: "Bさんの進め方についてどう思う？",
    options: [
      { id: "a", label: "すごい。直感を信じられるのは強さ", score: 0.7, implication: "intuition_positive" },
      { id: "b", label: "面白いけど、少しデータも見た方がいい", score: 0.2, implication: "balanced" },
      { id: "c", label: "危険。根拠なく進むのはリスクが高い", score: -0.6, implication: "evidence_required" },
      { id: "d", label: "理解できない。なぜ確認しないのか", score: -0.9, implication: "evidence_absolute" },
    ],
    primaryAxis: "analytical_vs_intuitive",
    secondaryAxes: [
      { key: "cautious_vs_bold", weight: 0.5 },
      { key: "plan_vs_spontaneous", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "判断スタイル",
  },
  {
    id: "sp_proj_03",
    type: "projection",
    scenario: "Cさんは恋人に「今日何してた？」と毎日聞く。Cさん本人は「心配だから」と言っている。",
    prompt: "Cさんの行動についてどう思う？",
    options: [
      { id: "a", label: "愛情表現。気にかけてる証拠", score: 0.6, implication: "reassurance_natural" },
      { id: "b", label: "少し多いかも。でも気持ちはわかる", score: 0.2, implication: "moderate" },
      { id: "c", label: "窮屈。相手にも自由な時間が必要", score: -0.5, implication: "boundary_important" },
      { id: "d", label: "信頼が足りない。問題がある", score: -0.8, implication: "trust_issue" },
    ],
    primaryAxis: "reassurance_need",
    secondaryAxes: [
      { key: "boundary_awareness", weight: 0.5 },
      { key: "control_tendency", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "関係性パターン",
  },
  {
    id: "sp_proj_04",
    type: "projection",
    scenario: "Dさんは会議で自分の意見を一切言わず、後から個別にメールで提案を送った。",
    prompt: "Dさんのやり方についてどう思う？",
    options: [
      { id: "a", label: "賢い。場の空気を読んだ上での行動", score: -0.6, implication: "strategic_quiet" },
      { id: "b", label: "もったいない。その場で言えばいいのに", score: 0.3, implication: "directness_valued" },
      { id: "c", label: "配慮がある。対立を避けたんだと思う", score: -0.3, implication: "harmony_positive" },
      { id: "d", label: "フェアじゃない。全員の前で言うべき", score: 0.7, implication: "transparency_valued" },
    ],
    primaryAxis: "direct_vs_diplomatic",
    secondaryAxes: [
      { key: "introvert_vs_extrovert", weight: 0.3 },
      { key: "independence_vs_harmony", weight: 0.4 },
    ],
    mirrorSource: "shadow_play",
    category: "対人スタイル",
  },
  {
    id: "sp_proj_05",
    type: "projection",
    scenario: "Eさんは友達グループの中で、一人だけ流行りのものに興味を示さず、昔から好きなものを貫いている。",
    prompt: "Eさんのスタンスについてどう思う？",
    options: [
      { id: "a", label: "かっこいい。自分を持っている", score: -0.8, implication: "tradition_admired" },
      { id: "b", label: "わかる。好きなものは変わらなくていい", score: -0.4, implication: "tradition_natural" },
      { id: "c", label: "少しもったいない。新しいものも面白いのに", score: 0.3, implication: "openness_valued" },
      { id: "d", label: "頑固に見える。周りに合わせることも大切", score: 0.7, implication: "adaptability_valued" },
    ],
    primaryAxis: "tradition_vs_novelty",
    secondaryAxes: [
      { key: "classic_vs_trendy", weight: 0.5 },
      { key: "independence_vs_harmony", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "価値観",
  },
  {
    id: "sp_proj_06",
    type: "projection",
    scenario: "Fさんは週末の予定を金曜日の夜まで決めない。「その時の気分で決めたい」と言っている。",
    prompt: "Fさんの過ごし方についてどう思う？",
    options: [
      { id: "a", label: "最高。予定に縛られないのが一番", score: 0.8, implication: "spontaneous_ideal" },
      { id: "b", label: "気持ちはわかる。でも少しは決めておきたい", score: 0.2, implication: "moderate" },
      { id: "c", label: "不安。何も決まってないと落ち着かない", score: -0.6, implication: "plan_needed" },
      { id: "d", label: "周りに迷惑。合わせる人の気持ちも考えて", score: -0.4, implication: "consideration" },
    ],
    primaryAxis: "plan_vs_spontaneous",
    secondaryAxes: [
      { key: "cautious_vs_bold", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "行動パターン",
  },
  {
    id: "sp_proj_07",
    type: "projection",
    scenario: "Gさんは親友が落ち込んでいる時、アドバイスをせず、ただ隣に座って一緒に黙っていた。",
    prompt: "Gさんの対応についてどう思う？",
    options: [
      { id: "a", label: "最善。そばにいることが一番の支え", score: -0.7, implication: "presence_valued" },
      { id: "b", label: "優しい。でも何か言ってあげた方がいいかも", score: 0.1, implication: "words_also_help" },
      { id: "c", label: "歯がゆい。具体的に助けてあげたい", score: 0.5, implication: "action_oriented" },
      { id: "d", label: "気持ちはわかるけど解決にはならない", score: 0.7, implication: "solution_focused" },
    ],
    primaryAxis: "intimacy_pace",
    secondaryAxes: [
      { key: "emotional_regulation", weight: 0.4 },
      { key: "social_initiative", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "共感パターン",
  },
  {
    id: "sp_proj_08",
    type: "projection",
    scenario: "Hさんは自分のSNSに、加工なしのすっぴん写真や失敗談をよく投稿する。",
    prompt: "Hさんの発信スタイルについてどう思う？",
    options: [
      { id: "a", label: "勇気がある。飾らない姿が魅力的", score: -0.7, implication: "authenticity_admired" },
      { id: "b", label: "面白い。でも自分はそこまでできない", score: -0.2, implication: "aware_gap" },
      { id: "c", label: "少し気になる。見せ方も大事では", score: 0.4, implication: "presentation_matters" },
      { id: "d", label: "理解できない。なぜわざわざ弱みを見せる？", score: 0.8, implication: "facade_important" },
    ],
    primaryAxis: "public_private_gap",
    secondaryAxes: [
      { key: "function_vs_expression", weight: 0.4 },
      { key: "minimal_vs_maximal", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "自己開示",
  },

  // ── 第三者視点型: 他者の目を借りた自己認識 ──

  {
    id: "sp_3rd_01",
    type: "third_party_view",
    scenario: "",
    prompt: "一番親しい友人が、初対面の人にあなたを紹介するとしたら、どう言うと思う？",
    options: [
      { id: "a", label: "「静かだけど、話すと深い人」", score: -0.6, implication: "quiet_deep" },
      { id: "b", label: "「明るくて場を和ませてくれる人」", score: 0.6, implication: "social_warm" },
      { id: "c", label: "「頼りになる。困ったらこの人」", score: 0.2, implication: "reliable" },
      { id: "d", label: "「独特。他の誰とも違う感じ」", score: -0.3, implication: "unique" },
    ],
    primaryAxis: "introvert_vs_extrovert",
    secondaryAxes: [
      { key: "individual_vs_social", weight: 0.4 },
      { key: "social_initiative", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "社会的自己像",
  },
  {
    id: "sp_3rd_02",
    type: "third_party_view",
    scenario: "",
    prompt: "あなたの弱点を一番よく知っている人は、あなたの最大の課題を何だと言うと思う？",
    options: [
      { id: "a", label: "「考えすぎて動けなくなること」", score: -0.7, implication: "overthinking" },
      { id: "b", label: "「人に頼るのが苦手なこと」", score: -0.5, implication: "independence_excess" },
      { id: "c", label: "「感情に振り回されやすいこと」", score: 0.5, implication: "emotional_instability" },
      { id: "d", label: "「飽きっぽくて続かないこと」", score: 0.6, implication: "novelty_chasing" },
    ],
    primaryAxis: "emotional_variability",
    secondaryAxes: [
      { key: "plan_vs_spontaneous", weight: 0.3 },
      { key: "perfectionist_vs_pragmatic", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "他者から見た課題",
  },
  {
    id: "sp_3rd_03",
    type: "third_party_view",
    scenario: "",
    prompt: "職場の人や同級生は、ストレスがたまった時のあなたをどう見ていると思う？",
    options: [
      { id: "a", label: "「急に黙る・一人になる」", score: -0.8, implication: "withdraw" },
      { id: "b", label: "「イライラが表に出る」", score: 0.6, implication: "externalize" },
      { id: "c", label: "「普段と変わらない（隠すのがうまい）」", score: -0.3, implication: "mask" },
      { id: "d", label: "「逆に明るくなる・テンションが上がる」", score: 0.3, implication: "overcompensate" },
    ],
    primaryAxis: "stress_isolation_vs_social",
    secondaryAxes: [
      { key: "emotional_regulation", weight: 0.5 },
      { key: "public_private_gap", weight: 0.4 },
    ],
    mirrorSource: "shadow_play",
    category: "ストレス反応の外見",
  },
  {
    id: "sp_3rd_04",
    type: "third_party_view",
    scenario: "",
    prompt: "恋人や親しいパートナーは、あなたとの関係で何を一番求めていると思う？",
    options: [
      { id: "a", label: "「もっと気持ちを言葉にしてほしい」", score: -0.6, implication: "expression_need" },
      { id: "b", label: "「もう少し自由にさせてほしい」", score: 0.5, implication: "space_need" },
      { id: "c", label: "「もっと一緒にいる時間がほしい」", score: 0.3, implication: "time_need" },
      { id: "d", label: "「今のままでちょうどいい」", score: 0.0, implication: "satisfied" },
    ],
    primaryAxis: "intimacy_pace",
    secondaryAxes: [
      { key: "boundary_awareness", weight: 0.4 },
      { key: "reassurance_need", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "関係性の他者視点",
  },

  // ── メタ観測型: 自分の行動パターンへの気づきを問う ──

  {
    id: "sp_meta_01",
    type: "meta_observation",
    scenario: "ふと気づくと、最近は一人で過ごす時間が以前より増えている。",
    prompt: "それはなぜだと思う？",
    options: [
      { id: "a", label: "たまたまだと思う。特に理由はない", score: 0.0, implication: "avoidance" },
      { id: "b", label: "最近疲れていて、充電が必要だから", score: -0.4, implication: "internal_attribution" },
      { id: "c", label: "今の環境が合わなくなってきたから", score: -0.2, implication: "external_attribution" },
      { id: "d", label: "一人が心地よいと気づいたから", score: -0.7, implication: "self_awareness" },
    ],
    primaryAxis: "introvert_vs_extrovert",
    secondaryAxes: [
      { key: "stress_isolation_vs_social", weight: 0.4 },
    ],
    mirrorSource: "shadow_play",
    category: "メタ認知",
  },
  {
    id: "sp_meta_02",
    type: "meta_observation",
    scenario: "最近、何かを決める時に以前より時間がかかるようになっている気がする。",
    prompt: "心当たりはある？",
    options: [
      { id: "a", label: "選択肢が増えて、比較に時間がかかる", score: -0.3, implication: "information_overload" },
      { id: "b", label: "失敗したくない気持ちが強くなっている", score: -0.6, implication: "risk_aversion" },
      { id: "c", label: "自分の基準がはっきりしてきたから", score: -0.1, implication: "criteria_clarity" },
      { id: "d", label: "特に変わった実感はない", score: 0.0, implication: "low_awareness" },
    ],
    primaryAxis: "cautious_vs_bold",
    secondaryAxes: [
      { key: "perfectionist_vs_pragmatic", weight: 0.4 },
      { key: "analytical_vs_intuitive", weight: 0.3 },
    ],
    mirrorSource: "shadow_play",
    category: "判断パターンの変化",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Selection & Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 日付シードで日替わりの影絵質問を選択
 * dailyOrchestratorから呼ばれる想定
 */
export function selectDailyShadowPlay(
  dateStr: string,
  recentIds: string[] = [],
  count: number = 1
): ShadowPlayQuestion[] {
  // 最近出した質問を除外
  const available = SHADOW_PLAY_QUESTIONS.filter(q => !recentIds.includes(q.id));
  if (available.length === 0) return [];

  // 日付ベースの疑似ランダム
  const seed = dateStr.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const shuffled = [...available].sort((a, b) => {
    const hashA = (seed * 31 + a.id.charCodeAt(3)) % 1000;
    const hashB = (seed * 31 + b.id.charCodeAt(3)) % 1000;
    return hashA - hashB;
  });

  return shuffled.slice(0, count);
}

/**
 * 影絵質問の回答を軸スコア更新用のフォーマットに変換
 * 既存の軸スコアパイプラインに乗せられる形
 */
export function shadowPlayAnswerToAxisUpdates(
  question: ShadowPlayQuestion,
  selectedOptionId: string
): { axisId: TraitAxisKey; score: number; weight: number; source: MirrorSource }[] {
  const option = question.options.find(o => o.id === selectedOptionId);
  if (!option) return [];

  const updates: { axisId: TraitAxisKey; score: number; weight: number; source: MirrorSource }[] = [
    {
      axisId: question.primaryAxis,
      score: option.score,
      weight: 1.0,
      source: "shadow_play",
    },
  ];

  if (question.secondaryAxes) {
    for (const secondary of question.secondaryAxes) {
      updates.push({
        axisId: secondary.key,
        score: option.score,
        weight: secondary.weight,
        source: "shadow_play",
      });
    }
  }

  return updates;
}

/**
 * タイプ別にフィルタリング
 */
export function getShadowPlayByType(type: ShadowPlayType): ShadowPlayQuestion[] {
  return SHADOW_PLAY_QUESTIONS.filter(q => q.type === type);
}

/**
 * 軸でフィルタリング
 */
export function getShadowPlayByAxis(axisId: TraitAxisKey): ShadowPlayQuestion[] {
  return SHADOW_PLAY_QUESTIONS.filter(
    q => q.primaryAxis === axisId || q.secondaryAxes?.some(s => s.key === axisId)
  );
}
