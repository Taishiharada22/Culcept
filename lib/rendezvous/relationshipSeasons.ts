/**
 * Relationship Seasons Engine
 * 関係の自然なサイクルを季節として検出・命名する
 *
 * すべての関係には自然なリズムがある:
 *   春（芽吹き）→ 夏（満開）→ 秋（収穫）→ 冬（静寂）
 * コミュニケーションが減っても、それは「冬」であり「終わり」ではない。
 */

import type { RendezvousCategory } from "./types";

// =============================================================================
// Types
// =============================================================================

export type Season = "spring" | "summer" | "autumn" | "winter";

export type SeasonProfile = {
  currentSeason: Season;
  seasonLabel: string;
  seasonDescription: string;
  seasonEmoji: string;
  /** この季節でのアドバイス */
  guidance: string;
  /** 季節の進行度 (0..1, how deep into this season) */
  progress: number;
  /** 推定される次の季節 */
  nextSeason: Season;
  /** 次の季節までの推定日数 */
  estimatedDaysToNext: number | null;
  /** この関係の全季節履歴 */
  seasonHistory: SeasonPhase[];
  /** 関係の「年齢」（何サイクル目か） */
  cycleCount: number;
};

export type SeasonPhase = {
  season: Season;
  startedAt: string;
  endedAt: string | null;
  durationDays: number;
  /** この季節で起きた重要なこと */
  highlights: string[];
};

export type SeasonSignals = {
  messageFrequency: number;       // messages per day (recent 7 days)
  messageFrequencyTrend: number;  // change vs previous 7 days (-1..+∞)
  averageResponseTime: number;    // hours
  conversationDepth: number;      // 0..1 (message length + question ratio)
  initiationBalance: number;      // -1..1 (negative = they initiate more)
  activityEngagement: number;     // 0..1 (activity completion rate)
  emotionalIntensity: number;     // 0..1 (emoji usage, exclamation marks, etc.)
};

// =============================================================================
// Season Constants
// =============================================================================

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];

const SEASON_META: Record<
  Season,
  { label: string; emoji: string; description: string }
> = {
  spring: {
    label: "春 — 芽吹きの季節",
    emoji: "\u{1F331}", // 🌱
    description:
      "新しいエネルギーが関係に流れ込んでいます。お互いへの好奇心が芽を出し、会話のテンポが上がり始める季節。まだ繊細ですが、確実に何かが育ち始めています。",
  },
  summer: {
    label: "夏 — 満開の季節",
    emoji: "\u{1F33B}", // 🌻
    description:
      "関係が最も活発で豊かに花開いている季節。メッセージの往来が活発で、感情の共有も深まっています。この輝きを存分に味わってください。",
  },
  autumn: {
    label: "秋 — 収穫の季節",
    emoji: "\u{1F342}", // 🍂
    description:
      "量よりも質が大切になる季節。やり取りの頻度は落ち着いていますが、一つひとつの会話の深さが増しています。関係が成熟に向かっている証です。",
  },
  winter: {
    label: "冬 — 静寂の季節",
    emoji: "\u{2744}\u{FE0F}", // ❄️
    description:
      "静かな休息の季節。コミュニケーションのペースが落ちていますが、これは終わりではなく再生のための準備です。沈黙の中でも、つながりは消えません。",
  },
};

// =============================================================================
// Season Detection
// =============================================================================

/**
 * シグナルから現在の季節を検出する
 *
 * 判定ロジック:
 *  - Spring: 上昇トレンドが強い、または関係初期
 *  - Summer: 高頻度 + 高感情 + バランスの取れたやり取り
 *  - Autumn: 頻度は下がるが会話の深さが増す
 *  - Winter: 低頻度 + 長い応答時間 + 低エンゲージメント
 */
export function detectSeason(
  signals: SeasonSignals,
  previousSeason?: Season,
): Season {
  const {
    messageFrequency,
    messageFrequencyTrend,
    averageResponseTime,
    conversationDepth,
    initiationBalance,
    activityEngagement,
    emotionalIntensity,
  } = signals;

  // Composite scores for each season
  const springScore = computeSpringScore(signals);
  const summerScore = computeSummerScore(signals);
  const autumnScore = computeAutumnScore(signals);
  const winterScore = computeWinterScore(signals);

  const scores: Record<Season, number> = {
    spring: springScore,
    summer: summerScore,
    autumn: autumnScore,
    winter: winterScore,
  };

  // Apply hysteresis: give current season a small bonus to prevent rapid flipping
  if (previousSeason) {
    scores[previousSeason] += 0.15;
  }

  // Pick the highest-scoring season
  let best: Season = "spring";
  let bestScore = -Infinity;
  for (const s of SEASON_ORDER) {
    if (scores[s] > bestScore) {
      bestScore = scores[s];
      best = s;
    }
  }

  return best;
}

function computeSpringScore(s: SeasonSignals): number {
  let score = 0;
  // Strong upward trend is the primary spring signal
  if (s.messageFrequencyTrend > 0.2) score += 0.5;
  if (s.messageFrequencyTrend > 0.5) score += 0.2;
  // Moderate frequency (not yet at summer peak)
  if (s.messageFrequency >= 1 && s.messageFrequency <= 5) score += 0.2;
  // Growing emotional engagement
  if (s.emotionalIntensity > 0.3 && s.emotionalIntensity < 0.7) score += 0.15;
  // Activity is picking up
  if (s.activityEngagement > 0.3) score += 0.1;
  return score;
}

function computeSummerScore(s: SeasonSignals): number {
  let score = 0;
  // High message frequency is the hallmark of summer
  if (s.messageFrequency > 3) score += 0.3;
  if (s.messageFrequency > 6) score += 0.2;
  // High emotional intensity
  if (s.emotionalIntensity > 0.6) score += 0.3;
  // Balanced initiation (both sides engaged)
  if (Math.abs(s.initiationBalance) < 0.3) score += 0.2;
  // Good engagement
  if (s.activityEngagement > 0.5) score += 0.15;
  // Quick responses
  if (s.averageResponseTime < 2) score += 0.1;
  return score;
}

function computeAutumnScore(s: SeasonSignals): number {
  let score = 0;
  // Frequency declining but still present
  if (s.messageFrequencyTrend < 0 && s.messageFrequencyTrend > -0.5)
    score += 0.3;
  // But depth is high - the defining autumn trait
  if (s.conversationDepth > 0.6) score += 0.4;
  if (s.conversationDepth > 0.8) score += 0.15;
  // Moderate frequency
  if (s.messageFrequency >= 0.5 && s.messageFrequency <= 3) score += 0.15;
  // Emotional intensity settling into warmth
  if (s.emotionalIntensity >= 0.3 && s.emotionalIntensity <= 0.6)
    score += 0.1;
  return score;
}

function computeWinterScore(s: SeasonSignals): number {
  let score = 0;
  // Low message frequency
  if (s.messageFrequency < 1) score += 0.3;
  if (s.messageFrequency < 0.3) score += 0.2;
  // Long response times
  if (s.averageResponseTime > 12) score += 0.25;
  if (s.averageResponseTime > 24) score += 0.15;
  // Low activity engagement
  if (s.activityEngagement < 0.2) score += 0.2;
  // Low emotional intensity
  if (s.emotionalIntensity < 0.2) score += 0.15;
  // Declining trend
  if (s.messageFrequencyTrend < -0.3) score += 0.1;
  return score;
}

// =============================================================================
// Season Profile Builder
// =============================================================================

export function buildSeasonProfile(
  candidateId: string,
  signals: SeasonSignals,
  milestones: { type: string; reachedAt: string }[],
  seasonHistory: SeasonPhase[],
  category: RendezvousCategory,
): SeasonProfile {
  const previousSeason =
    seasonHistory.length > 0
      ? seasonHistory[seasonHistory.length - 1].season
      : undefined;

  // If there are milestones within the last 7 days, bias toward spring
  const recentMilestone = milestones.some((m) => {
    const age =
      (Date.now() - new Date(m.reachedAt).getTime()) / (1000 * 60 * 60 * 24);
    return age <= 7;
  });

  const adjustedSignals: SeasonSignals = recentMilestone
    ? { ...signals, messageFrequencyTrend: Math.max(signals.messageFrequencyTrend, 0.3) }
    : signals;

  const currentSeason = detectSeason(adjustedSignals, previousSeason);
  const meta = SEASON_META[currentSeason];

  // Compute cycle count (how many full spring→winter cycles)
  const cycleCount = computeCycleCount(seasonHistory, currentSeason);

  // Estimate progress within current season
  const progress = estimateSeasonProgress(seasonHistory, currentSeason);

  // Next season
  const nextSeason = getNextSeason(currentSeason);

  // Estimate days to next season (based on historical average or defaults)
  const estimatedDaysToNext = estimateDaysToNextSeason(
    seasonHistory,
    currentSeason,
  );

  const guidance = generateSeasonGuidance(currentSeason, category, cycleCount);

  return {
    currentSeason,
    seasonLabel: meta.label,
    seasonDescription: meta.description,
    seasonEmoji: meta.emoji,
    guidance,
    progress,
    nextSeason,
    estimatedDaysToNext,
    seasonHistory,
    cycleCount,
  };
}

// =============================================================================
// Guidance Generator
// =============================================================================

type GuidanceTemplates = Record<Season, Record<RendezvousCategory, string[]>>;

const GUIDANCE_FIRST_CYCLE: GuidanceTemplates = {
  spring: {
    romantic: [
      "新しいエネルギーが流れ始めています。好奇心に従って、自然体で向き合ってみてください。",
      "芽吹きの季節。焦らず、お互いのペースを大切に育てていきましょう。",
    ],
    friendship: [
      "新しいつながりが芽を出しています。気負わず、自然な会話を楽しんで。",
      "何気ないやり取りが、やがて大きな信頼に育ちます。",
    ],
    cocreation: [
      "新しいコラボレーションの種が蒔かれました。アイデアを自由に交換してみましょう。",
      "まずは小さな共同作業から。お互いの得意分野を探り合う時期です。",
    ],
    community: [
      "グループに新しい風が吹き込んでいます。まずは場の空気を感じ取って。",
      "新しいメンバーとの接点が増えています。オープンな姿勢で迎え入れましょう。",
    ],
    partner: [
      "人生を共に歩む相手との出会いが始まっています。焦らず、価値観を確かめ合いましょう。",
      "新しいご縁の芽吹き。お互いの暮らしの軸を丁寧に見つめる時期です。",
    ],
  },
  summer: {
    romantic: [
      "関係が最も豊かに花開く季節。この瞬間を味わって。",
      "お互いへの信頼と親密さが深まっています。素直な気持ちを大切に。",
    ],
    friendship: [
      "友情が最も輝く季節。一緒に過ごす時間が自然と増えているはず。",
      "気の合う関係が花開いています。この心地よさを楽しんで。",
    ],
    cocreation: [
      "共創のエネルギーが最高潮。アイデアが次々と生まれる季節です。",
      "プロジェクトが最も活発に動く時期。勢いに乗って形にしましょう。",
    ],
    community: [
      "グループの一体感が最も高まっている季節。みんなの活気を感じて。",
      "コミュニティが最も活発な時期。この熱量を共に楽しみましょう。",
    ],
    partner: [
      "お互いへの信頼が深まり、将来を語り合える関係に。この温もりを大切に。",
      "価値観の重なりが確かなものになっています。二人の未来を描く季節です。",
    ],
  },
  autumn: {
    romantic: [
      "深さが増す季節。量より質が大切になっています。",
      "静かな親密さが育っています。言葉にならない安心感を大切に。",
    ],
    friendship: [
      "頻繁に会わなくても分かり合える。そんな成熟した友情が育っています。",
      "お互いの存在が、当たり前のように心強い。そんな季節です。",
    ],
    cocreation: [
      "プロジェクトが収穫期に入っています。成果をまとめ、次に活かす時期です。",
      "ここまでの共同作業を振り返り、学びを整理する季節。",
    ],
    community: [
      "グループの落ち着いた成熟期。深いつながりが根付いています。",
      "活動のペースは落ちても、絆の深さは増しています。",
    ],
    partner: [
      "関係が落ち着き、深い安心感が育っています。言葉にしなくても伝わるものがある。",
      "暮らしのリズムが自然に重なってきた季節。この穏やかさが二人の土台です。",
    ],
  },
  winter: {
    romantic: [
      "休息の季節。沈黙は終わりではなく、再生の準備です。",
      "距離があっても、つながりは消えません。お互いの時間を尊重して。",
    ],
    friendship: [
      "しばらく会えなくても大丈夫。本当の友情は沈黙に耐えます。",
      "静かな時期も、友情の一部。また春が来ます。",
    ],
    cocreation: [
      "プロジェクトの休眠期。次のインスピレーションを待つ時間です。",
      "充電期間。新しいアイデアが自然と湧いてくるのを待ちましょう。",
    ],
    community: [
      "グループの活動が静かな時期。でも、またみんなが集まる季節が来ます。",
      "休息も大切なリズムの一部。次の盛り上がりに備えて。",
    ],
    partner: [
      "距離を感じる時期があっても、それは関係の終わりではありません。お互いの時間を尊重して。",
      "静かな冬の先に、また穏やかな春が来ます。信頼の根は生きています。",
    ],
  },
};

const GUIDANCE_REPEAT_CYCLE: GuidanceTemplates = {
  spring: {
    romantic: [
      "再び芽吹きの季節。前のサイクルを経た今、より深い春が訪れています。",
      "新しいサイクルの始まり。お互いの変化を楽しんで。",
    ],
    friendship: [
      "また新しい章が始まります。友情は季節を重ねるごとに豊かになる。",
      "再びエネルギーが戻ってきました。新しい共通体験を見つけよう。",
    ],
    cocreation: [
      "新しいプロジェクトサイクルの幕開け。前回の学びを活かして。",
      "再始動の季節。前のサイクルの経験が今回の基盤になります。",
    ],
    community: [
      "グループに再び活気が戻ってきました。新旧メンバーの化学反応を楽しんで。",
      "新しいサイクルの始まり。コミュニティの変化と成長を感じて。",
    ],
    partner: [
      "再び二人の関係に新しいエネルギーが流れ始めています。前のサイクルの学びが活きる春です。",
      "共に歩んできた道のりが、新しい章の土台になっています。",
    ],
  },
  summer: {
    romantic: [
      "何度目かの夏。お互いを知り尽くした上での親密さは、最初の夏より深い。",
      "成熟した関係だからこそ味わえる豊かさがあります。",
    ],
    friendship: [
      "気心知れた友情の夏。安心感の中で、新しい冒険も楽しめる。",
      "何度目かの盛り上がり。変わらない心地よさと新鮮さが同居する季節。",
    ],
    cocreation: [
      "息の合ったチームの全盛期。阿吽の呼吸で進められる季節。",
      "経験を重ねたからこその生産性。勢いを活かしましょう。",
    ],
    community: [
      "コミュニティの再繁栄期。成熟した関係性が土台にある分、より深い。",
      "経験豊かなグループの活発な季節。質の高い交流を楽しんで。",
    ],
    partner: [
      "何度目かの夏。積み重ねてきた信頼が、より深い安心と喜びを生んでいます。",
      "成熟した関係だからこその穏やかな幸せ。この時間を味わって。",
    ],
  },
  autumn: {
    romantic: [
      "深まりを知っている秋。言葉が少なくても、伝わるものがある。",
      "何度かの季節を経た穏やかさ。この関係の確かさを感じて。",
    ],
    friendship: [
      "年輪を重ねた友情の秋。存在そのものが安らぎになっています。",
      "長い付き合いだからこそ、沈黙も心地いい。",
    ],
    cocreation: [
      "ベテランチームの振り返り期。次のサイクルの布石を打つ時期です。",
      "経験の蓄積を棚卸しする季節。次はさらに効率的に動けるはず。",
    ],
    community: [
      "コミュニティの知恵が蓄積される季節。次世代への継承も意識して。",
      "グループの成熟と安定。この落ち着きが次の春の土壌になります。",
    ],
    partner: [
      "何度かの秋を経た穏やかさ。言葉にしなくても、そばにいる安心感がある。",
      "長く歩んできたからこその深い理解。この関係の確かさを静かに感じて。",
    ],
  },
  winter: {
    romantic: [
      "何度目かの冬。もう「大丈夫」と知っている。春は必ず来ます。",
      "経験が教えてくれます。この静けさの先に、また温もりがあると。",
    ],
    friendship: [
      "何度冬を越えたかが、友情の深さを物語ります。",
      "また春が来ることを、お互い知っている。それが本当の友情。",
    ],
    cocreation: [
      "チームの戦略的休息期。次のサイクルで飛躍するための充電時間。",
      "経験上、この休息が次の爆発力を生みます。焦らず待ちましょう。",
    ],
    community: [
      "コミュニティの休眠期。でも根は生きている。次の芽吹きを待って。",
      "何度も冬を越えてきたグループの強さ。また集まる日は来ます。",
    ],
    partner: [
      "何度目かの冬。もう知っています、この静けさの先にまた温もりがあると。",
      "共に冬を越えてきた経験が、二人の絆の深さそのものです。",
    ],
  },
};

export function generateSeasonGuidance(
  season: Season,
  category: RendezvousCategory,
  cycleCount: number,
): string {
  const templates =
    cycleCount <= 1 ? GUIDANCE_FIRST_CYCLE : GUIDANCE_REPEAT_CYCLE;
  const options = templates[season][category];
  // Deterministic pick based on cycle count
  const index = cycleCount % options.length;
  return options[index];
}

// =============================================================================
// Helpers
// =============================================================================

function getNextSeason(current: Season): Season {
  const idx = SEASON_ORDER.indexOf(current);
  return SEASON_ORDER[(idx + 1) % SEASON_ORDER.length];
}

function computeCycleCount(history: SeasonPhase[], current: Season): number {
  // Count how many times we've gone through a full spring→winter cycle
  let cycles = 0;
  let lastSpringIndex = -1;
  for (let i = 0; i < history.length; i++) {
    if (history[i].season === "spring") {
      lastSpringIndex = i;
    }
    if (history[i].season === "winter" && lastSpringIndex >= 0) {
      cycles++;
      lastSpringIndex = -1;
    }
  }
  // If we're currently in spring or later and have had a spring in this partial cycle
  if (lastSpringIndex >= 0) {
    cycles++; // current (partial) cycle
  }
  return Math.max(1, cycles);
}

function estimateSeasonProgress(
  history: SeasonPhase[],
  currentSeason: Season,
): number {
  // Find the current (last) phase in history
  if (history.length === 0) return 0;
  const currentPhase = history[history.length - 1];
  if (currentPhase.season !== currentSeason || !currentPhase.startedAt) {
    return 0;
  }

  const elapsed =
    (Date.now() - new Date(currentPhase.startedAt).getTime()) /
    (1000 * 60 * 60 * 24);

  // Use historical average duration for this season type, or defaults
  const avgDuration = computeAverageSeasonDuration(history, currentSeason);
  if (avgDuration <= 0) return Math.min(elapsed / 30, 1); // default 30 days

  return Math.min(elapsed / avgDuration, 1);
}

function computeAverageSeasonDuration(
  history: SeasonPhase[],
  season: Season,
): number {
  const completed = history.filter(
    (p) => p.season === season && p.endedAt !== null,
  );
  if (completed.length === 0) {
    // Defaults per season (days)
    const defaults: Record<Season, number> = {
      spring: 21,
      summer: 45,
      autumn: 30,
      winter: 21,
    };
    return defaults[season];
  }
  const total = completed.reduce((sum, p) => sum + p.durationDays, 0);
  return total / completed.length;
}

function estimateDaysToNextSeason(
  history: SeasonPhase[],
  currentSeason: Season,
): number | null {
  if (history.length === 0) return null;

  const currentPhase = history[history.length - 1];
  if (currentPhase.season !== currentSeason || !currentPhase.startedAt) {
    return null;
  }

  const elapsed =
    (Date.now() - new Date(currentPhase.startedAt).getTime()) /
    (1000 * 60 * 60 * 24);

  const avgDuration = computeAverageSeasonDuration(history, currentSeason);
  const remaining = Math.max(0, avgDuration - elapsed);

  return Math.round(remaining);
}
