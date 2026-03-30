// lib/stargazer/anonymousSocialProof.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anonymous Social Proof（匿名ソーシャルプルーフ）
//
// 脳科学的根拠:
// ミラーニューロン系は「同じ行動をしている他者」の存在だけで活性化する。
// 社会的報酬（オキシトシン経路）を得るのに、
// 個人の特定や直接の接触は不要。
//
// 設計思想:
// - IDなし、プロフィールなし、接触なし
// - 「自分は一人ではない」感覚 ＋「自分は特別」感覚の同時提供
// - Rendezvousの「拒絶の恐怖なし」設計と同じ原理 — リスクゼロの社会的報酬
//
// 世界参照:
// - Strava: 「今週○人がこのルートを走りました」
// - Duolingo: 「○○人がこのレッスンを完了しました」
// - Spotify: 「○○人があなたと同じ曲を聴いています」
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import type { StreakLevel } from "./streakIntelligence";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 匿名ソーシャルプルーフのメッセージ */
export interface SocialProofMessage {
  /** メッセージID（表示管理用） */
  id: string;
  /** メッセージの種類 */
  type: SocialProofType;
  /** 表示テキスト */
  text: string;
  /** 数値データ（人数、%等） */
  value: number;
  /** 表示コンテキスト */
  context: "home" | "observation" | "streak" | "insight" | "contradiction";
  /** メッセージの感情トーン */
  tone: "belonging" | "distinction" | "encouragement" | "curiosity";
  /** 表示優先度（0-1） */
  priority: number;
}

export type SocialProofType =
  | "co_observers"         // 同時観測者数
  | "similar_stars"        // 似た星を持つ人
  | "shared_contradiction" // 同じ矛盾を持つ人
  | "streak_percentile"    // ストリークの上位%
  | "observation_wave"     // 観測の波（今この瞬間の観測者数）
  | "discovery_cohort"     // 同じ発見をした仲間
  | "growth_trend"         // 同じ成長傾向の人数
  | "rare_pattern";        // レアパターンの保有者数

/** ユーザーの匿名プルーフ生成用コンテキスト */
export interface SocialProofContext {
  /** 現在のストリーク日数 */
  streakDays: number;
  /** 現在のレベル */
  streakLevel: StreakLevel;
  /** 矛盾の数 */
  contradictionCount: number;
  /** 総観測回数 */
  totalObservations: number;
  /** 予測精度 */
  predictionAccuracy: number;
  /** 支配的な軸の傾向（アーキタイプに近い） */
  dominantAxes: TraitAxisKey[];
  /** 観測Level */
  observationLevel: number;
  /** 今日が観測済みか */
  observedToday: boolean;
}

/**
 * 匿名集計データ（サーバーサイドで定期的に計算・キャッシュ）
 *
 * プライバシー:
 * - 個人を特定できる情報は一切含まない
 * - 全て集計値（最小グループサイズ: 5人以上）
 * - 5人未満のグループは「数人」と表示（k-匿名性の確保）
 */
export interface AnonymousAggregates {
  /** 今日の総観測者数 */
  todayObserverCount: number;
  /** 現在この瞬間の同時観測者数（推定） */
  concurrentObservers: number;
  /** ストリーク分布（日数 → 人数） */
  streakDistribution: Record<string, number>;
  /** レベル分布 */
  levelDistribution: Record<StreakLevel, number>;
  /** 矛盾数分布 */
  contradictionDistribution: Record<string, number>;
  /** 観測回数分布 */
  observationCountDistribution: Record<string, number>;
  /** 予測精度分布 */
  predictionAccuracyDistribution: Record<string, number>;
  /** 総ユーザー数 */
  totalUsers: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Percentile Computation — 上位何%かを計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 分布データからパーセンタイルを計算
 */
function computePercentile(
  value: number,
  distribution: Record<string, number>,
  totalUsers: number,
): number {
  if (totalUsers === 0) return 50;

  let belowCount = 0;
  for (const [key, count] of Object.entries(distribution)) {
    const threshold = parseFloat(key);
    if (threshold < value) {
      belowCount += count;
    }
  }

  return Math.round((belowCount / totalUsers) * 100);
}

/**
 * 匿名性を確保した人数表示
 * k-匿名性: 5人未満は「数人」、5人以上は実数
 */
function anonymizeCount(count: number): string {
  if (count < 5) return "数人";
  if (count < 10) return `約${count}人`;
  if (count < 100) return `${Math.round(count / 5) * 5}人以上`;
  return `${Math.round(count / 10) * 10}人以上`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Social Proof Message Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「自分は一人ではない」メッセージ（belonging）
 */
function generateBelongingMessages(
  ctx: SocialProofContext,
  agg: AnonymousAggregates,
): SocialProofMessage[] {
  const messages: SocialProofMessage[] = [];

  // 今日の同時観測者
  if (agg.todayObserverCount >= 5) {
    messages.push({
      id: "co_obs_today",
      type: "co_observers",
      text: `今日、${anonymizeCount(agg.todayObserverCount)}が自分を観測した`,
      value: agg.todayObserverCount,
      context: "home",
      tone: "belonging",
      priority: 0.6,
    });
  }

  // リアルタイム同時観測
  if (agg.concurrentObservers >= 3) {
    messages.push({
      id: "concurrent_obs",
      type: "observation_wave",
      text: `今この瞬間、${anonymizeCount(agg.concurrentObservers)}が同時に自分と向き合っている`,
      value: agg.concurrentObservers,
      context: "observation",
      tone: "belonging",
      priority: 0.7,
    });
  }

  // 同じストリークレベルの仲間
  const sameLevelCount = agg.levelDistribution[ctx.streakLevel] ?? 0;
  if (sameLevelCount >= 5) {
    messages.push({
      id: `level_cohort_${ctx.streakLevel}`,
      type: "discovery_cohort",
      text: `「${getLevelNameJa(ctx.streakLevel)}」の仲間が${anonymizeCount(sameLevelCount)}いる`,
      value: sameLevelCount,
      context: "streak",
      tone: "belonging",
      priority: 0.5,
    });
  }

  return messages;
}

/**
 * 「自分は特別」メッセージ（distinction）
 *
 * 脳科学: 自己特異性効果（self-reference effect）。
 * 「上位8%」と言われると、自己参照処理が強化され、
 * その情報の記憶が通常の5倍になる。
 */
function generateDistinctionMessages(
  ctx: SocialProofContext,
  agg: AnonymousAggregates,
): SocialProofMessage[] {
  const messages: SocialProofMessage[] = [];

  // ストリークのパーセンタイル
  const streakPercentile = computePercentile(
    ctx.streakDays,
    agg.streakDistribution,
    agg.totalUsers,
  );

  if (streakPercentile >= 80) {
    messages.push({
      id: "streak_top",
      type: "streak_percentile",
      text: `${ctx.streakDays}日連続。全観測者の上位${100 - streakPercentile}%`,
      value: 100 - streakPercentile,
      context: "streak",
      tone: "distinction",
      priority: 0.85,
    });
  }

  // 予測精度のパーセンタイル
  const accuracyPercentile = computePercentile(
    ctx.predictionAccuracy,
    agg.predictionAccuracyDistribution,
    agg.totalUsers,
  );

  if (accuracyPercentile >= 75 && ctx.totalObservations >= 20) {
    messages.push({
      id: "accuracy_top",
      type: "rare_pattern",
      text: `予測精度が上位${100 - accuracyPercentile}%。あなたの自己理解は深い`,
      value: 100 - accuracyPercentile,
      context: "insight",
      tone: "distinction",
      priority: 0.8,
    });
  }

  // 矛盾数のパーセンタイル（多い＝自己理解が深い）
  const contradictionPercentile = computePercentile(
    ctx.contradictionCount,
    agg.contradictionDistribution,
    agg.totalUsers,
  );

  if (contradictionPercentile >= 70 && ctx.contradictionCount >= 3) {
    messages.push({
      id: "contradiction_depth",
      type: "shared_contradiction",
      text: `${ctx.contradictionCount}個の矛盾を自覚している。これは上位${100 - contradictionPercentile}%の深さ`,
      value: ctx.contradictionCount,
      context: "contradiction",
      tone: "distinction",
      priority: 0.75,
    });
  }

  return messages;
}

/**
 * 「もっと続けよう」メッセージ（encouragement）
 */
function generateEncouragementMessages(
  ctx: SocialProofContext,
  agg: AnonymousAggregates,
): SocialProofMessage[] {
  const messages: SocialProofMessage[] = [];

  // 次のレベルの人数を見せる（「あそこに行ける」感覚）
  const nextLevel = getNextLevel(ctx.streakLevel);
  if (nextLevel) {
    const nextLevelCount = agg.levelDistribution[nextLevel] ?? 0;
    if (nextLevelCount >= 5) {
      messages.push({
        id: `next_level_${nextLevel}`,
        type: "discovery_cohort",
        text: `「${getLevelNameJa(nextLevel)}」に到達した${anonymizeCount(nextLevelCount)}が、あなたの先を歩いている`,
        value: nextLevelCount,
        context: "streak",
        tone: "encouragement",
        priority: 0.65,
      });
    }
  }

  // 今日まだ観測していない場合
  if (!ctx.observedToday && agg.todayObserverCount >= 10) {
    messages.push({
      id: "others_already_observed",
      type: "co_observers",
      text: `今日すでに${anonymizeCount(agg.todayObserverCount)}が観測を終えた`,
      value: agg.todayObserverCount,
      context: "home",
      tone: "encouragement",
      priority: 0.55,
    });
  }

  return messages;
}

/**
 * 「気になる」メッセージ（curiosity）
 *
 * 好奇心ギャップの活用:
 * 「同じ矛盾を持つ人」「似たパターンの人」の存在を示唆するだけで
 * 「自分と似た人はどういう傾向なんだろう？」という好奇心を刺激
 */
function generateCuriosityMessages(
  ctx: SocialProofContext,
  agg: AnonymousAggregates,
): SocialProofMessage[] {
  const messages: SocialProofMessage[] = [];

  // 観測回数が近い人の存在
  const obsRange = `${Math.floor(ctx.totalObservations / 10) * 10}`;
  const similarObsCount = agg.observationCountDistribution[obsRange] ?? 0;

  if (similarObsCount >= 5 && ctx.totalObservations >= 20) {
    messages.push({
      id: "similar_depth",
      type: "similar_stars",
      text: `あなたと同じ深さまで潜った${anonymizeCount(similarObsCount)}は、この先で何を見つけたのか`,
      value: similarObsCount,
      context: "home",
      tone: "curiosity",
      priority: 0.7,
    });
  }

  // 矛盾を持つ人の増加（「仲間が増えた」感覚）
  if (ctx.contradictionCount >= 2) {
    const similarContradictionCount =
      agg.contradictionDistribution[`${ctx.contradictionCount}`] ?? 0;
    if (similarContradictionCount >= 3) {
      messages.push({
        id: "contradiction_cohort",
        type: "shared_contradiction",
        text: `同じ数の矛盾を抱える人が${anonymizeCount(similarContradictionCount)}いる。同じ構造の矛盾かもしれない`,
        value: similarContradictionCount,
        context: "contradiction",
        tone: "curiosity",
        priority: 0.6,
      });
    }
  }

  return messages;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 匿名ソーシャルプルーフメッセージを生成
 *
 * 最大3メッセージを返す:
 * 1. belonging（一人ではない）
 * 2. distinction（特別な存在）
 * 3. curiosity / encouragement（好奇心 / 励まし）
 */
export function generateSocialProofMessages(
  ctx: SocialProofContext,
  agg: AnonymousAggregates,
): SocialProofMessage[] {
  const belonging = generateBelongingMessages(ctx, agg);
  const distinction = generateDistinctionMessages(ctx, agg);
  const encouragement = generateEncouragementMessages(ctx, agg);
  const curiosity = generateCuriosityMessages(ctx, agg);

  // 各カテゴリから最も優先度の高いものを1つずつ選択
  const selected: SocialProofMessage[] = [];

  // 1つ目: distinctionを優先（「自分は特別」が最も強い動機）
  const topDistinction = distinction.sort((a, b) => b.priority - a.priority)[0];
  if (topDistinction) selected.push(topDistinction);

  // 2つ目: belongingまたはcuriosity
  const topBelongingOrCuriosity = [...belonging, ...curiosity]
    .sort((a, b) => b.priority - a.priority)[0];
  if (topBelongingOrCuriosity) selected.push(topBelongingOrCuriosity);

  // 3つ目: encouragement
  const topEncouragement = encouragement.sort((a, b) => b.priority - a.priority)[0];
  if (topEncouragement) selected.push(topEncouragement);

  return selected.slice(0, 3);
}

/**
 * デフォルトの集計データ（サーバーサイドキャッシュが利用できない場合）
 *
 * プライバシーを確保しつつ、最小限のソーシャルプルーフを提供するための
 * 初期値。実際のユーザーが増えたらサーバーサイドの定期集計に置き換わる。
 */
export function getDefaultAggregates(): AnonymousAggregates {
  return {
    todayObserverCount: 0,
    concurrentObservers: 0,
    streakDistribution: {},
    levelDistribution: {
      observer: 0,
      seeker: 0,
      introspector: 0,
      contradiction_witness: 0,
      abyss_traveler: 0,
    },
    contradictionDistribution: {},
    observationCountDistribution: {},
    predictionAccuracyDistribution: {},
    totalUsers: 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getLevelNameJa(level: StreakLevel): string {
  const names: Record<StreakLevel, string> = {
    observer: "観測者",
    seeker: "探求者",
    introspector: "内省者",
    contradiction_witness: "矛盾の目撃者",
    abyss_traveler: "深淵の旅人",
  };
  return names[level];
}

function getNextLevel(current: StreakLevel): StreakLevel | null {
  const order: StreakLevel[] = [
    "observer",
    "seeker",
    "introspector",
    "contradiction_witness",
    "abyss_traveler",
  ];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}
