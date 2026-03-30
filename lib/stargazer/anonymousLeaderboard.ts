// lib/stargazer/anonymousLeaderboard.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anonymous Leaderboard — Duolingoのリーグ相当
//
// 匿名性を完全に保ちながら、社会的モチベーションを提供。
// ユーザー名/IDは一切表示しない。StreakLevelの称号のみ。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { StreakLevel } from "./streakIntelligence";

export interface LeaderboardEntry {
  /** 表示名（StreakLevel称号） */
  title: string;
  /** ストリーク日数 */
  streakDays: number;
  /** 観測品質スコア */
  qualityScore: number;
  /** 自分かどうか */
  isMe: boolean;
  /** 順位 */
  rank: number;
}

export interface LeaderboardResult {
  /** 上位エントリ（最大10件） */
  entries: LeaderboardEntry[];
  /** 自分の順位 */
  myRank: number;
  /** 全参加者数 */
  totalParticipants: number;
  /** 自分のパーセンタイル */
  myPercentile: number;
  /** 次のランクまでの差分 */
  gapToNextRank: { days: number; quality: number } | null;
  /** 週のラベル */
  weekLabel: string;
}

const LEVEL_TITLES: Record<StreakLevel, string> = {
  observer: "観測者",
  seeker: "探求者",
  introspector: "内省者",
  contradiction_witness: "矛盾の目撃者",
  abyss_traveler: "深淵の旅人",
};

/**
 * クライアントサイドでリーダーボードを構築
 *
 * サーバーから匿名集計データを受け取り、
 * 自分の位置を含むリーダーボードを生成。
 */
export function buildLeaderboard(
  myStreakDays: number,
  myQuality: number,
  myLevel: StreakLevel,
  anonymousData: {
    streakDistribution: Record<string, number>;
    totalUsers: number;
  },
): LeaderboardResult {
  const { streakDistribution, totalUsers } = anonymousData;

  // 匿名エントリを生成（実ユーザーデータから集計値のみ）
  const entries: LeaderboardEntry[] = [];
  const sortedBuckets = Object.entries(streakDistribution)
    .map(([days, count]) => ({ days: parseInt(days), count }))
    .sort((a, b) => b.days - a.days);

  let rank = 1;
  let myRank = totalUsers;

  for (const bucket of sortedBuckets.slice(0, 9)) {
    const level = bucket.days >= 30 ? "abyss_traveler"
      : bucket.days >= 21 ? "contradiction_witness"
      : bucket.days >= 14 ? "introspector"
      : bucket.days >= 7 ? "seeker"
      : "observer";

    const isMe = bucket.days === myStreakDays;
    if (isMe) myRank = rank;

    entries.push({
      title: LEVEL_TITLES[level as StreakLevel],
      streakDays: bucket.days,
      qualityScore: 0.5 + (bucket.days / 60) * 0.5, // 推定
      isMe,
      rank,
    });
    rank++;
  }

  // 自分がエントリにいなければ追加
  if (!entries.some((e) => e.isMe)) {
    let belowCount = 0;
    for (const [days, count] of Object.entries(streakDistribution)) {
      if (parseInt(days) < myStreakDays) belowCount += count;
    }
    myRank = Math.max(1, totalUsers - belowCount);
    entries.push({
      title: LEVEL_TITLES[myLevel],
      streakDays: myStreakDays,
      qualityScore: myQuality,
      isMe: true,
      rank: myRank,
    });
    entries.sort((a, b) => a.rank - b.rank);
  }

  const myPercentile = totalUsers > 0
    ? Math.round(((totalUsers - myRank) / totalUsers) * 100)
    : 50;

  // 次のランクまでの差分
  const nextEntry = entries.find((e) => e.rank === myRank - 1);
  const gapToNextRank = nextEntry
    ? { days: nextEntry.streakDays - myStreakDays, quality: nextEntry.qualityScore - myQuality }
    : null;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}〜の週`;

  return {
    entries: entries.slice(0, 10),
    myRank,
    totalParticipants: totalUsers,
    myPercentile,
    gapToNextRank,
    weekLabel,
  };
}
