/**
 * Activity Engine
 * 3種の共鳴アクティビティ管理
 * - ParallelQuestion: 並行質問 -> 同時開示 -> インサイト
 * - StyleDuet: 美的/ライフスタイル二択 5ラウンド -> 重なりマップ
 * - FutureScene: AI生成の「二人で...」シナリオ
 */

import type { RendezvousCategory } from "./types";

export type ActivityType = "parallel_question" | "style_duet" | "future_scene";

export type ActivityState = "waiting_both" | "waiting_one" | "revealed";

export type Activity = {
  id: string;
  candidateId: string;
  activityType: ActivityType;
  payload: Record<string, unknown>;
  userAAnswer: Record<string, unknown> | null;
  userBAnswer: Record<string, unknown> | null;
  revealed: boolean;
  insightText: string | null;
  createdAt: string;
};

// ============================================================================
// Parallel Questions - カテゴリ別の深い質問
// ============================================================================

type ParallelQuestionEntry = {
  id: string;
  text: string;
  category: RendezvousCategory | "general";
};

/** 汎用質問 (全カテゴリ共通) */
const GENERAL_QUESTIONS: ParallelQuestionEntry[] = [
  { id: "pq_weekend", text: "理想の週末の過ごし方は?", category: "general" },
  { id: "pq_recharge", text: "エネルギーが切れた時、どう回復する?", category: "general" },
  { id: "pq_conflict", text: "意見が合わない時、最初にすることは?", category: "general" },
  { id: "pq_silence", text: "沈黙は心地よい? それとも落ち着かない?", category: "general" },
  { id: "pq_decision", text: "大事な決断をする時、直感派? 分析派?", category: "general" },
  { id: "pq_surprise", text: "サプライズを受けるのは好き? 苦手?", category: "general" },
  { id: "pq_alone", text: "一人の時間はどのくらい必要?", category: "general" },
  { id: "pq_change", text: "変化は楽しい? 安定が大事?", category: "general" },
  { id: "pq_morning", text: "朝型? 夜型? それとも状況次第?", category: "general" },
  { id: "pq_travel", text: "一人旅と誰かとの旅、どちらが好き?", category: "general" },
];

/** Romantic カテゴリ - 恋愛・パートナーシップを深掘りする質問 */
const ROMANTIC_QUESTIONS: ParallelQuestionEntry[] = [
  { id: "pq_rom_lastday", text: "もし明日が最後の1日だとしたら、一緒にしたいことは?", category: "romantic" },
  { id: "pq_rom_safe", text: "誰かと一緒にいて「安心する」と感じる瞬間はどんな時?", category: "romantic" },
  { id: "pq_rom_fight", text: "ケンカした翌朝、自分から声をかける? 相手を待つ?", category: "romantic" },
  { id: "pq_rom_love_lang", text: "愛情を感じるのは「言葉」と「行動」、どちらから?", category: "romantic" },
  { id: "pq_rom_grow", text: "パートナーと一緒に成長するために、一番大事だと思うことは?", category: "romantic" },
  { id: "pq_rom_weakness", text: "弱さを見せることに抵抗がある? それとも見せたい相手がいる?", category: "romantic" },
  { id: "pq_rom_rhythm", text: "二人の時間と一人の時間、理想のバランスは?", category: "romantic" },
  { id: "pq_rom_future", text: "5年後、どんな日常を過ごしていたい?", category: "romantic" },
];

/** Friendship カテゴリ - 友情の本質を探る質問 */
const FRIENDSHIP_QUESTIONS: ParallelQuestionEntry[] = [
  { id: "pq_fri_hard", text: "本当に辛い時、友達に求めるのは「聞いてくれること」と「解決策」、どちら?", category: "friendship" },
  { id: "pq_fri_trust", text: "信頼できると感じるのは、どんな瞬間?", category: "friendship" },
  { id: "pq_fri_distance", text: "しばらく会えなくても変わらない関係と、頻繁に会って深まる関係、どちらが理想?", category: "friendship" },
  { id: "pq_fri_honest", text: "友達の選択に「それ、違うと思う」と言える? 言えない?", category: "friendship" },
  { id: "pq_fri_laugh", text: "一緒にいて一番笑った記憶は、どんな場面?", category: "friendship" },
  { id: "pq_fri_secret", text: "秘密を守ってくれると信じられる人の特徴は?", category: "friendship" },
  { id: "pq_fri_support", text: "応援してほしい時、言葉が欲しい? それとも隣にいてくれるだけでいい?", category: "friendship" },
  { id: "pq_fri_old", text: "10年後も続いている友情に必要なものは何?", category: "friendship" },
];

/** Cocreation カテゴリ - 共創の本質を探る質問 */
const COCREATION_QUESTIONS: ParallelQuestionEntry[] = [
  { id: "pq_coc_first", text: "制約がなかったら、最初に作りたいものは何?", category: "cocreation" },
  { id: "pq_coc_role", text: "チームで自然と引き受ける役割は?", category: "cocreation" },
  { id: "pq_coc_block", text: "行き詰まった時、休む派? 突き進む派?", category: "cocreation" },
  { id: "pq_coc_perfect", text: "完璧を目指す? それとも「まず出す」を優先する?", category: "cocreation" },
  { id: "pq_coc_inspire", text: "最近、一番インスピレーションを受けたものは?", category: "cocreation" },
  { id: "pq_coc_fail", text: "失敗した時、最初に考えることは何?", category: "cocreation" },
  { id: "pq_coc_dream", text: "一緒に何かを作るなら、「楽しさ」と「意味」、どちらを優先する?", category: "cocreation" },
  { id: "pq_coc_vision", text: "世界に一つだけ変化を起こせるとしたら、何を変える?", category: "cocreation" },
];

/** Community カテゴリ - コミュニティの本質を探る質問 */
const COMMUNITY_QUESTIONS: ParallelQuestionEntry[] = [
  { id: "pq_com_ideal", text: "理想のコミュニティを一言で表すなら?", category: "community" },
  { id: "pq_com_belong", text: "「居場所がある」と感じるのは、どんな条件が揃った時?", category: "community" },
  { id: "pq_com_conflict", text: "コミュニティ内で意見が割れた時、あなたはどう動く?", category: "community" },
  { id: "pq_com_give", text: "コミュニティに自分が貢献できることは何?", category: "community" },
  { id: "pq_com_size", text: "少人数の深い繋がりと大人数の緩い繋がり、どちらが心地よい?", category: "community" },
  { id: "pq_com_rule", text: "ルールは多い方がいい? 少ない方がいい?", category: "community" },
  { id: "pq_com_new", text: "新しい人が入ってきた時、自分から声をかける? 様子を見る?", category: "community" },
  { id: "pq_com_leave", text: "コミュニティを離れたくなる瞬間はどんな時?", category: "community" },
];

/** 全質問 */
const ALL_PARALLEL_QUESTIONS: ParallelQuestionEntry[] = [
  ...GENERAL_QUESTIONS,
  ...ROMANTIC_QUESTIONS,
  ...FRIENDSHIP_QUESTIONS,
  ...COCREATION_QUESTIONS,
  ...COMMUNITY_QUESTIONS,
];

const PARTNER_QUESTIONS: ParallelQuestionEntry[] = ROMANTIC_QUESTIONS;

const CATEGORY_QUESTIONS: Record<RendezvousCategory, ParallelQuestionEntry[]> = {
  romantic: ROMANTIC_QUESTIONS,
  friendship: FRIENDSHIP_QUESTIONS,
  cocreation: COCREATION_QUESTIONS,
  community: COMMUNITY_QUESTIONS,
  partner: PARTNER_QUESTIONS,
};

/** カテゴリ別の質問を優先的に選択 */
export function pickCategoryParallelQuestion(
  category: RendezvousCategory,
  usedIds: string[],
): ParallelQuestionEntry | null {
  const pool = CATEGORY_QUESTIONS[category] ?? [];
  const available = pool.filter((q) => !usedIds.includes(q.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** 汎用質問から選択 (fallback) */
export function pickParallelQuestion(
  usedIds: string[],
): ParallelQuestionEntry | null {
  const available = ALL_PARALLEL_QUESTIONS.filter((q) => !usedIds.includes(q.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** generateParallelQuestion: カテゴリベースで質問を返す */
export function generateParallelQuestion(
  category: RendezvousCategory,
  usedIds: string[] = [],
): { id: string; text: string } | null {
  return pickCategoryParallelQuestion(category, usedIds) ?? pickParallelQuestion(usedIds);
}

// ============================================================================
// Style Duet - 5ラウンドの美的/ライフスタイル二択
// ============================================================================

export type StyleDuetRound = {
  id: string;
  optionA: { label: string; imageHint: string };
  optionB: { label: string; imageHint: string };
};

const STYLE_DUET_ROUNDS: StyleDuetRound[] = [
  { id: "sd_space", optionA: { label: "ミニマルな部屋", imageHint: "minimal" }, optionB: { label: "モノに囲まれた部屋", imageHint: "cozy_clutter" } },
  { id: "sd_time", optionA: { label: "朝型", imageHint: "morning" }, optionB: { label: "夜型", imageHint: "night" } },
  { id: "sd_cafe", optionA: { label: "静かなカフェ", imageHint: "quiet_cafe" }, optionB: { label: "賑やかな居酒屋", imageHint: "izakaya" } },
  { id: "sd_trip", optionA: { label: "計画通りの旅", imageHint: "planned_trip" }, optionB: { label: "ノープランの旅", imageHint: "spontaneous" } },
  { id: "sd_social", optionA: { label: "一人の時間", imageHint: "alone" }, optionB: { label: "みんなでいる時間", imageHint: "together" } },
  { id: "sd_nature", optionA: { label: "山の静けさ", imageHint: "mountain" }, optionB: { label: "海の開放感", imageHint: "ocean" } },
  { id: "sd_food", optionA: { label: "手料理ディナー", imageHint: "home_cook" }, optionB: { label: "新しいレストラン", imageHint: "restaurant" } },
  { id: "sd_art", optionA: { label: "静かな読書", imageHint: "reading" }, optionB: { label: "ライブの熱気", imageHint: "live_music" } },
  { id: "sd_style", optionA: { label: "モノトーン", imageHint: "monochrome" }, optionB: { label: "鮮やかな色彩", imageHint: "colorful" } },
  { id: "sd_beauty", optionA: { label: "伝統的な美", imageHint: "traditional" }, optionB: { label: "前衛的なデザイン", imageHint: "avant_garde" } },
  { id: "sd_pace", optionA: { label: "ゆっくり丁寧に", imageHint: "slow" }, optionB: { label: "スピード重視", imageHint: "fast" } },
  { id: "sd_season", optionA: { label: "春の桜", imageHint: "spring" }, optionB: { label: "冬の雪景色", imageHint: "winter" } },
];

export function pickStyleDuetRounds(count: number = 5): StyleDuetRound[] {
  const shuffled = [...STYLE_DUET_ROUNDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** 5ラウンド分のスタイル二択を生成 */
export function generateStyleDuetRounds(): StyleDuetRound[] {
  return pickStyleDuetRounds(5);
}

export function computeStyleDuetOverlap(
  aChoices: string[],
  bChoices: string[],
): { overlapPercent: number; matches: string[]; differences: string[] } {
  const matches: string[] = [];
  const differences: string[] = [];
  for (let i = 0; i < aChoices.length; i++) {
    if (aChoices[i] === bChoices[i]) {
      matches.push(aChoices[i]);
    } else {
      differences.push(`${aChoices[i]} vs ${bChoices[i]}`);
    }
  }
  return {
    overlapPercent: Math.round((matches.length / Math.max(aChoices.length, 1)) * 100),
    matches,
    differences,
  };
}

// ============================================================================
// Future Scene
// ============================================================================

export type FutureScenePrompt = {
  id: string;
  scenario: string;
  context: string;
};

const FUTURE_SCENE_SCENARIOS: FutureScenePrompt[] = [
  { id: "fs_weekend_trip", scenario: "週末、二人で小旅行に出かけたら", context: "1泊2日の気軽な旅" },
  { id: "fs_rain_day", scenario: "雨の日に二人で過ごすとしたら", context: "外に出られない休日" },
  { id: "fs_cook_together", scenario: "一緒に料理を作るとしたら", context: "初めて二人で台所に立つ" },
  { id: "fs_flea_market", scenario: "フリーマーケットを一緒に回ったら", context: "日曜の朝市" },
  { id: "fs_lost", scenario: "知らない街で迷子になったら", context: "地図もWiFiもない状況" },
  { id: "fs_sunrise", scenario: "一緒に日の出を見に行ったら", context: "早朝の特別な時間" },
  { id: "fs_bookshop", scenario: "二人で古本屋を巡ったら", context: "お互いの本棚を覗く時間" },
  { id: "fs_late_night", scenario: "深夜の散歩に出かけたら", context: "眠れない夜の衝動" },
];

export function pickFutureScene(usedIds: string[]): FutureScenePrompt | null {
  const available = FUTURE_SCENE_SCENARIOS.filter((s) => !usedIds.includes(s.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================================
// Activity Selection - 次のアクティビティを選択
// ============================================================================

export type ActivitySuggestion = {
  type: ActivityType;
  label: string;
  description: string;
  available: boolean;
};

/** 次にやるべきアクティビティタイプを選択 */
export function selectNextActivity(
  candidateId: string,
  completedTypes: ActivityType[],
): ActivityType {
  // 優先順位: まだやっていないタイプを優先
  const counts: Record<ActivityType, number> = {
    parallel_question: 0,
    style_duet: 0,
    future_scene: 0,
  };
  for (const t of completedTypes) {
    counts[t] = (counts[t] ?? 0) + 1;
  }

  // まだ一度もやっていないタイプを優先
  if (counts.parallel_question === 0) return "parallel_question";
  if (counts.style_duet === 0) return "style_duet";
  if (counts.future_scene === 0) return "future_scene";

  // 全部やった場合は一番少ないタイプ
  const sorted = (Object.entries(counts) as [ActivityType, number][]).sort(
    (a, b) => a[1] - b[1],
  );
  return sorted[0][0];
}

export function getAvailableActivities(
  existingActivities: Activity[],
): ActivitySuggestion[] {
  const parallelCount = existingActivities.filter(
    (a) => a.activityType === "parallel_question",
  ).length;
  const duetCount = existingActivities.filter(
    (a) => a.activityType === "style_duet",
  ).length;
  const sceneCount = existingActivities.filter(
    (a) => a.activityType === "future_scene",
  ).length;

  const usedPqIds = existingActivities
    .filter((a) => a.activityType === "parallel_question")
    .map((a) => (a.payload as { questionId?: string }).questionId ?? "");
  const usedFsIds = existingActivities
    .filter((a) => a.activityType === "future_scene")
    .map((a) => (a.payload as { scenarioId?: string }).scenarioId ?? "");

  return [
    {
      type: "parallel_question",
      label: "並行クエスチョン",
      description: "同じ質問に別々に回答 → 同時開示",
      available:
        parallelCount < ALL_PARALLEL_QUESTIONS.length &&
        pickParallelQuestion(usedPqIds) !== null,
    },
    {
      type: "style_duet",
      label: "スタイルデュエット",
      description: "5ラウンドの美的センス二択",
      available: duetCount < 3,
    },
    {
      type: "future_scene",
      label: "フューチャーシーン",
      description: "「二人で...」のシナリオを想像",
      available:
        sceneCount < FUTURE_SCENE_SCENARIOS.length &&
        pickFutureScene(usedFsIds) !== null,
    },
  ];
}

// ============================================================================
// Insight Generation
// ============================================================================

export function generateParallelQuestionInsight(
  question: string,
  answerA: string,
  answerB: string,
): string {
  if (!answerA || !answerB) {
    return "二人の回答が揃いました。";
  }

  // 文字列の類似度を簡易チェック
  const wordsA = new Set(answerA.split(/\s+/));
  const wordsB = new Set(answerB.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const similarity = intersection.length / Math.max(wordsA.size, wordsB.size, 1);

  // 長さの比較
  const lengthRatio = Math.min(answerA.length, answerB.length) / Math.max(answerA.length, answerB.length, 1);

  if (similarity > 0.4 || lengthRatio > 0.8) {
    const insights = [
      "二人の感覚は近いかもしれません。共通の視点が見えてきました。",
      "似た方向を向いている二人。この共鳴は自然なもののようです。",
      "言葉は違っても、根底にある感覚が重なっています。",
    ];
    return insights[Math.floor(Math.random() * insights.length)];
  }

  if (similarity < 0.1) {
    const insights = [
      "全く異なる視点が見えました。この違いが新しい発見につながるかもしれません。",
      "対照的な回答です。お互いの世界を広げ合える可能性を感じます。",
      "異なる角度からの回答。補い合える関係性のヒントがここにあります。",
    ];
    return insights[Math.floor(Math.random() * insights.length)];
  }

  const insights = [
    "共通点もあれば違いもある。このバランスが二人の関係を面白くしそうです。",
    "部分的に重なり、部分的に異なる。丁度よい距離感かもしれません。",
    "お互いの回答に、それぞれの個性が表れています。",
  ];
  return insights[Math.floor(Math.random() * insights.length)];
}

export function generateStyleDuetInsight(overlapPercent: number): string {
  if (overlapPercent >= 80)
    return "美的感覚がとてもよく共鳴しています。同じ空間を心地よく共有できそうです。";
  if (overlapPercent >= 60)
    return "多くの点で感覚が重なっています。微妙な違いが良い刺激になりそうです。";
  if (overlapPercent >= 40)
    return "共通点と個性が半々。お互いの世界を広げ合える関係かもしれません。";
  if (overlapPercent >= 20)
    return "それぞれ独自の美意識を持っています。違いを楽しめる関係が生まれそうです。";
  return "対照的なセンスの持ち主同士。新しい視点をもたらし合える貴重な関係です。";
}

/** アクティビティタイプに応じたインサイト生成 */
export function generateActivityInsight(
  activityType: ActivityType,
  answerA: unknown,
  answerB: unknown,
): string {
  if (activityType === "parallel_question") {
    const textA = (answerA as { text?: string })?.text ?? "";
    const textB = (answerB as { text?: string })?.text ?? "";
    return generateParallelQuestionInsight("", textA, textB);
  }

  if (activityType === "style_duet") {
    const choicesA = (answerA as { choices?: string[] })?.choices ?? [];
    const choicesB = (answerB as { choices?: string[] })?.choices ?? [];
    const overlap = computeStyleDuetOverlap(choicesA, choicesB);
    return generateStyleDuetInsight(overlap.overlapPercent);
  }

  return "二人の共鳴体験が完了しました。";
}
