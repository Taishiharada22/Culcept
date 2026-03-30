// lib/stargazer/retentionHooks.ts
// Stargazer Retention Hooks — ユーザーの観測習慣を育てるフック群
//
// 毎日アプリを開く理由を提供し、観測の継続価値を体感させる。
// localStorage ベースで即座に動作。サーバー依存なし。

import type { V4Feature } from "./depthPhaseController";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StreakData {
  /** 現在のストリーク日数 */
  currentStreak: number;
  /** 過去最長ストリーク */
  longestStreak: number;
  /** 今日観測済みか */
  observedToday: boolean;
  /** 直近7日の観測日（YYYY-MM-DD） */
  recentDays: string[];
  /** 合計観測日数 */
  totalDays: number;
}

export interface DailyHook {
  /** フック本文（日本語） */
  message: string;
  /** フックのタイプ */
  type: "pattern" | "streak" | "milestone" | "curiosity" | "prophecy" | "temporal";
  /** 関連する機能へのリンク（optional） */
  featureLink?: string;
  /** 優先度 0-1（高いほど重要） */
  priority: number;
}

export interface MilestoneInfo {
  /** 次のマイルストーン名 */
  name: string;
  /** マイルストーンの説明 */
  description: string;
  /** 現在の進捗値 */
  current: number;
  /** 目標値 */
  target: number;
  /** 進捗率 0-1 */
  progress: number;
  /** アンロックされる機能（optional） */
  unlocksFeature?: V4Feature;
}

export interface Teaser {
  /** ティーザー本文 */
  message: string;
  /** ティーザーのタイプ */
  type: "prophecy" | "pattern" | "discovery" | "milestone";
}

export interface NudgeData {
  /** ナッジID（重複表示防止用） */
  id: string;
  /** ナッジ本文 */
  message: string;
  /** リンク先 */
  href: string;
  /** 関連する機能 */
  feature: V4Feature;
  /** トリガーコンテキスト */
  trigger: "post_observation" | "post_prophecy" | "post_alter" | "post_weather";
}

export interface DailySummary {
  /** 今日の観測の一文まとめ */
  observationSummary: string;
  /** パターン変化があったか */
  patternChange: string | null;
  /** 予言のステータス */
  prophecyStatus: "pending" | "verified_hit" | "verified_miss" | "none";
  /** 予言ステータスの説明 */
  prophecyLabel: string;
  /** ストリーク */
  streak: number;
  /** 明日のティーザー */
  tomorrowTeaser: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage Keys
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STREAK_KEY = "culcept_sg_streak_v1";
const OBSERVATION_DAYS_KEY = "culcept_sg_observation_days_v1";
const NUDGE_SHOWN_KEY = "culcept_sg_nudges_shown_v1";
const DAILY_SUMMARY_KEY = "culcept_sg_daily_summary_v1";
const PROPHECY_STATUS_KEY = "culcept_sg_prophecy_status_v1";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function today(): string {
  return localDateStr(new Date());
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

function getDayOfWeek(): number {
  return new Date().getDay();
}

function getHour(): number {
  return new Date().getHours();
}

const DAY_NAMES = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

function safeGetJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSetJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface StoredStreak {
  currentStreak: number;
  longestStreak: number;
  lastObservationDate: string;
}

export function recordObservation(): void {
  const todayStr = today();
  const days: string[] = safeGetJSON(OBSERVATION_DAYS_KEY, []);

  if (!days.includes(todayStr)) {
    days.push(todayStr);
    // 直近90日分のみ保持
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = localDateStr(cutoff);
    const trimmed = days.filter((d) => d >= cutoffStr);
    safeSetJSON(OBSERVATION_DAYS_KEY, trimmed);
  }

  const streak: StoredStreak = safeGetJSON(STREAK_KEY, {
    currentStreak: 0,
    longestStreak: 0,
    lastObservationDate: "",
  });

  if (streak.lastObservationDate === todayStr) {
    return; // 既に今日記録済み
  }

  if (streak.lastObservationDate === yesterday()) {
    streak.currentStreak += 1;
  } else if (streak.lastObservationDate !== todayStr) {
    streak.currentStreak = 1;
  }

  streak.lastObservationDate = todayStr;
  if (streak.currentStreak > streak.longestStreak) {
    streak.longestStreak = streak.currentStreak;
  }

  safeSetJSON(STREAK_KEY, streak);
}

export function getStreakData(): StreakData {
  const streak: StoredStreak = safeGetJSON(STREAK_KEY, {
    currentStreak: 0,
    longestStreak: 0,
    lastObservationDate: "",
  });
  const days: string[] = safeGetJSON(OBSERVATION_DAYS_KEY, []);
  const todayStr = today();
  const observedToday = streak.lastObservationDate === todayStr;

  // ストリークが途切れているかチェック
  let currentStreak = streak.currentStreak;
  if (!observedToday && streak.lastObservationDate !== yesterday()) {
    currentStreak = 0;
  }

  // 直近7日
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 7);
  const recentCutoffStr = localDateStr(recentCutoff);
  const recentDays = days.filter((d) => d >= recentCutoffStr).sort();

  return {
    currentStreak,
    longestStreak: streak.longestStreak,
    observedToday,
    recentDays,
    totalDays: days.length,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getDailyHook(): DailyHook {
  const streak = getStreakData();
  const dow = getDayOfWeek();
  const hour = getHour();
  const dayName = DAY_NAMES[dow];
  const days: string[] = safeGetJSON(OBSERVATION_DAYS_KEY, []);

  // 曜日ごとの観測回数を算出
  const dowCounts: Record<number, number> = {};
  for (const d of days) {
    const date = new Date(d + "T00:00:00");
    const dw = date.getDay();
    dowCounts[dw] = (dowCounts[dw] || 0) + 1;
  }
  const todayDowCount = dowCounts[dow] || 0;

  const hooks: DailyHook[] = [];

  // 1. 曜日パターンフック
  if (todayDowCount >= 3) {
    hooks.push({
      message: `今日は${dayName}。君の${dayName}パターン、${todayDowCount}回分のデータがある。今日はどうなる？`,
      type: "pattern",
      priority: 0.8,
    });
  } else {
    hooks.push({
      message: `今日は${dayName}。まだ${dayName}のデータが少ない。今日の観測が、新しいパターンを浮かび上がらせるかもしれない。`,
      type: "pattern",
      priority: 0.5,
    });
  }

  // 2. ストリークフック
  if (streak.currentStreak >= 7) {
    hooks.push({
      message: `${streak.currentStreak}日連続観測中。ここまで続けたからこそ見えるものがある。`,
      type: "streak",
      priority: 0.9,
    });
  } else if (streak.currentStreak >= 3) {
    hooks.push({
      message: `${streak.currentStreak}日連続。あと${7 - streak.currentStreak}日で、週間パターンが見えてくる。`,
      type: "streak",
      priority: 0.7,
    });
  } else if (!streak.observedToday && streak.currentStreak > 0) {
    hooks.push({
      message: `${streak.currentStreak}日連続の記録、今日もつなげる？`,
      type: "streak",
      priority: 0.85,
    });
  }

  // 3. マイルストーン接近フック
  const milestone = getNextMilestone();
  if (milestone && milestone.progress >= 0.7) {
    hooks.push({
      message: `「${milestone.name}」まであと少し。今日の観測で到達するかもしれない。`,
      type: "milestone",
      featureLink: milestone.unlocksFeature
        ? `/stargazer/${milestone.unlocksFeature === "blind_spot" ? "blind-spot" : milestone.unlocksFeature === "inner_weather" ? "weather" : milestone.unlocksFeature === "decision_oracle" ? "oracle" : milestone.unlocksFeature === "ghost_resonance" ? "ghost" : milestone.unlocksFeature === "psyche_signature" ? "signature" : milestone.unlocksFeature === "unseen_map" ? "unseen-map" : milestone.unlocksFeature}`
        : undefined,
      priority: 0.95,
    });
  }

  // 4. 時間帯フック
  if (hour >= 22 || hour < 5) {
    hooks.push({
      message: "夜の観測は、昼とは違う自分が見える。防衛が緩む時間帯の回答には、本音が混じりやすい。",
      type: "temporal",
      priority: 0.6,
    });
  } else if (hour >= 6 && hour < 10) {
    hooks.push({
      message: "朝の自分は、判断がクリアになりやすい。昨日の夜と比べてみると面白い。",
      type: "temporal",
      priority: 0.55,
    });
  }

  // 5. 好奇心フック（予言系）
  const prophecyStatus = safeGetJSON<string>(PROPHECY_STATUS_KEY, "none");
  if (prophecyStatus === "pending") {
    hooks.push({
      message: "昨日の予言、当たった？ 検証すると予測精度が上がる。",
      type: "prophecy",
      featureLink: "/stargazer/prophecy",
      priority: 0.88,
    });
  }

  // 最も優先度の高いフックを返す
  hooks.sort((a, b) => b.priority - a.priority);
  return hooks[0] || {
    message: "今日も自分を観測してみよう。昨日の自分と、何が違うだろう？",
    type: "curiosity",
    priority: 0.3,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Milestones
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MILESTONES: {
  name: string;
  description: string;
  target: number;
  metric: "total_days" | "streak" | "total_observations";
  unlocksFeature?: V4Feature;
}[] = [
  {
    name: "初めての星",
    description: "最初の観測を完了する",
    target: 1,
    metric: "total_days",
  },
  {
    name: "パターンの片鱗",
    description: "5日間の観測であなたのパターンが見え始める",
    target: 5,
    metric: "total_days",
    unlocksFeature: "inner_weather",
  },
  {
    name: "週間観測者",
    description: "7日連続で観測を続ける",
    target: 7,
    metric: "streak",
    unlocksFeature: "blind_spot",
  },
  {
    name: "予測の始まり",
    description: "20回の観測であなたの行動を予測できるようになる",
    target: 20,
    metric: "total_observations",
    unlocksFeature: "prophecy",
  },
  {
    name: "もうひとりの自分との対話",
    description: "30日間の観測データでもうひとりの自分が語り始める",
    target: 30,
    metric: "total_days",
    unlocksFeature: "alter",
  },
  {
    name: "似た誰かの気配",
    description: "十分なデータが集まり、似たパターンの人が見えてくる",
    target: 45,
    metric: "total_days",
    unlocksFeature: "ghost_resonance",
  },
  {
    name: "心の指紋",
    description: "90日間の観測であなただけの心の指紋が完成する",
    target: 90,
    metric: "total_days",
    unlocksFeature: "psyche_signature",
  },
];

export function getNextMilestone(): MilestoneInfo | null {
  const streak = getStreakData();

  for (const ms of MILESTONES) {
    let current: number;
    switch (ms.metric) {
      case "total_days":
        current = streak.totalDays;
        break;
      case "streak":
        current = streak.currentStreak;
        break;
      case "total_observations": {
        // ローカルストレージから実際の観測数を取得
        const stored = safeGetJSON<number>("culcept_sg_total_observations_v1", 0);
        current = stored || streak.totalDays;
        break;
      }
      default:
        current = 0;
    }

    if (current < ms.target) {
      return {
        name: ms.name,
        description: ms.description,
        current,
        target: ms.target,
        progress: Math.min(1, current / ms.target),
        unlocksFeature: ms.unlocksFeature,
      };
    }
  }

  return null;
}

export function getAllMilestones(): (MilestoneInfo & { achieved: boolean })[] {
  const streak = getStreakData();

  return MILESTONES.map((ms) => {
    let current: number;
    switch (ms.metric) {
      case "total_days":
        current = streak.totalDays;
        break;
      case "streak":
        current = streak.longestStreak;
        break;
      case "total_observations": {
        const stored = safeGetJSON<number>("culcept_sg_total_observations_v1", 0);
        current = stored || streak.totalDays;
        break;
      }
      default:
        current = 0;
    }

    return {
      name: ms.name,
      description: ms.description,
      current: Math.min(current, ms.target),
      target: ms.target,
      progress: Math.min(1, current / ms.target),
      unlocksFeature: ms.unlocksFeature,
      achieved: current >= ms.target,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Teaser (明日のティーザー)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getTeaser(): Teaser {
  const streak = getStreakData();
  const milestone = getNextMilestone();
  const dow = getDayOfWeek();
  const tomorrowDow = (dow + 1) % 7;
  const tomorrowName = DAY_NAMES[tomorrowDow];

  // 日付ベースのシードで決定論的に選択
  const seed = parseInt(today().replace(/-/g, ""), 10);

  const teasers: Teaser[] = [
    {
      message: "明日の予言、もう準備されている...",
      type: "prophecy",
    },
    {
      message: `明日は${tomorrowName}。${tomorrowName}の君は、今日とは違う選択をするかもしれない。`,
      type: "pattern",
    },
    {
      message: "明日、あなたのアーキタイプにわずかな変化が起きる予兆がある。",
      type: "discovery",
    },
  ];

  // マイルストーン接近時のティーザー
  if (milestone && milestone.progress >= 0.8) {
    teasers.push({
      message: `「${milestone.name}」まであと${milestone.target - milestone.current}。明日、届くかもしれない。`,
      type: "milestone",
    });
  }

  // ストリーク系
  if (streak.currentStreak >= 5) {
    teasers.push({
      message: `${streak.currentStreak + 1}日目の観測で、今まで見えなかったものが浮かぶ。`,
      type: "pattern",
    });
  }

  return teasers[seed % teasers.length];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cross-Feature Nudges
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NUDGE_TEMPLATES: NudgeData[] = [
  // 観測後のナッジ
  {
    id: "post_obs_blind_spot",
    message: "今日の観測から、新しい死角が見えた。確認してみる？",
    href: "/stargazer/blind-spot",
    feature: "blind_spot",
    trigger: "post_observation",
  },
  {
    id: "post_obs_weather",
    message: "今の回答パターン、内なる天気に影響してるかも。",
    href: "/stargazer/weather",
    feature: "inner_weather",
    trigger: "post_observation",
  },
  {
    id: "post_obs_prophecy",
    message: "この傾向、明日の行動予言に反映される。見てみる？",
    href: "/stargazer/prophecy",
    feature: "prophecy",
    trigger: "post_observation",
  },
  {
    id: "post_obs_unseen",
    message: "今日の観測で、未知の地図が少し広がった。",
    href: "/stargazer/unseen-map",
    feature: "unseen_map",
    trigger: "post_observation",
  },

  // 予言検証後のナッジ
  {
    id: "post_prophecy_signature",
    message: "この的中パターン、Psyche Signature に反映された。",
    href: "/stargazer/signature",
    feature: "psyche_signature",
    trigger: "post_prophecy",
  },
  {
    id: "post_prophecy_oracle",
    message: "予言の精度が上がった。次の決断で、神託を試してみる？",
    href: "/stargazer/oracle",
    feature: "decision_oracle",
    trigger: "post_prophecy",
  },

  // Alter対話後のナッジ
  {
    id: "post_alter_blind",
    message: "もうひとりの自分が指摘した矛盾、三面鏡で確認してみる？",
    href: "/stargazer/blind-spot",
    feature: "blind_spot",
    trigger: "post_alter",
  },
  {
    id: "post_alter_ghost",
    message: "もうひとりの自分と同じパターンを持つ誰かがいる。見てみる？",
    href: "/stargazer/ghost",
    feature: "ghost_resonance",
    trigger: "post_alter",
  },

  // 内なる天気後のナッジ
  {
    id: "post_weather_alter",
    message: "この天気パターンの裏に、もうひとりの自分がいるかもしれない。",
    href: "/stargazer/alter",
    feature: "alter",
    trigger: "post_weather",
  },
  {
    id: "post_weather_oracle",
    message: "今の心の天気は、次の判断に影響する。神託で確認してみる？",
    href: "/stargazer/oracle",
    feature: "decision_oracle",
    trigger: "post_weather",
  },
  {
    id: "nudge_values",
    message: "あなたの選択パターンから価値観が浮かび上がった。確認してみませんか？",
    href: "/stargazer/values",
    feature: "values_discovery",
    trigger: "post_observation",
  },
  {
    id: "nudge_wound",
    message: "繰り返しているパターンの構造が見えてきた。向き合う準備はできている？",
    href: "/stargazer/wound",
    feature: "core_wound",
    trigger: "post_alter",
  },
  {
    id: "nudge_flexibility",
    message: "心理的柔軟性の6つのプロセス。あなたの柔軟性を測ってみませんか？",
    href: "/stargazer/flexibility",
    feature: "act_hexaflex",
    trigger: "post_observation",
  },
  {
    id: "nudge_dreams",
    message: "夢を覚えている？書き留めると、無意識からのメッセージが読める。",
    href: "/stargazer/dreams",
    feature: "dream_journal",
    trigger: "post_observation",
  },
  {
    id: "nudge_simulation",
    message: "もし自分が変わったら——その可能性をシミュレーションしてみませんか？",
    href: "/stargazer/simulation",
    feature: "transform_simulation",
    trigger: "post_weather",
  },
];

export function getNudgesForTrigger(
  trigger: NudgeData["trigger"],
  maxCount: number = 2,
): NudgeData[] {
  const shownIds: string[] = safeGetJSON(NUDGE_SHOWN_KEY, []);
  const todayStr = today();

  // 今日既に表示されたナッジを除外
  const todayShown = shownIds.filter((id) => id.startsWith(todayStr));
  const todayShownSet = new Set(todayShown.map((id) => id.split(":")[1]));

  const candidates = NUDGE_TEMPLATES.filter(
    (n) => n.trigger === trigger && !todayShownSet.has(n.id),
  );

  // 日付シードでシャッフル
  const seed = parseInt(todayStr.replace(/-/g, ""), 10);
  const shuffled = candidates
    .map((n, i) => ({ n, sort: Math.sin(seed * (i + 1) * 0.618) }))
    .sort((a, b) => a.sort - b.sort)
    .map((x) => x.n);

  return shuffled.slice(0, maxCount);
}

export function markNudgeShown(nudgeId: string): void {
  const shownIds: string[] = safeGetJSON(NUDGE_SHOWN_KEY, []);
  const todayStr = today();
  shownIds.push(`${todayStr}:${nudgeId}`);
  // 直近7日分のみ保持
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = localDateStr(cutoff);
  const trimmed = shownIds.filter((id) => id >= cutoffStr);
  safeSetJSON(NUDGE_SHOWN_KEY, trimmed);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function saveDailySummary(summary: DailySummary): void {
  const todayStr = today();
  const stored: Record<string, DailySummary> = safeGetJSON(DAILY_SUMMARY_KEY, {});
  stored[todayStr] = summary;
  // 直近30日分のみ保持
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = localDateStr(cutoff);
  const trimmed: Record<string, DailySummary> = {};
  for (const [date, s] of Object.entries(stored)) {
    if (date >= cutoffStr) trimmed[date] = s;
  }
  safeSetJSON(DAILY_SUMMARY_KEY, trimmed);
}

export function getTodaySummary(): DailySummary | null {
  const stored: Record<string, DailySummary> = safeGetJSON(DAILY_SUMMARY_KEY, {});
  return stored[today()] || null;
}

export function buildDailySummary(params: {
  totalObservationsToday: number;
  patternChangeDetected?: string | null;
  prophecyVerified?: boolean | null;
}): DailySummary {
  const streak = getStreakData();
  const teaser = getTeaser();

  const observationSummary =
    params.totalObservationsToday > 0
      ? `今日は${params.totalObservationsToday}問の観測を完了した。`
      : "今日はまだ観測していない。";

  let prophecyStatus: DailySummary["prophecyStatus"] = "none";
  let prophecyLabel = "予言なし";

  const storedProphecy = safeGetJSON<string>(PROPHECY_STATUS_KEY, "none");
  if (params.prophecyVerified === true) {
    prophecyStatus = "verified_hit";
    prophecyLabel = "予言的中 — 精度スコアに反映";
  } else if (params.prophecyVerified === false) {
    prophecyStatus = "verified_miss";
    prophecyLabel = "予言不的中 — しかし外れ方にも意味がある";
  } else if (storedProphecy === "pending") {
    prophecyStatus = "pending";
    prophecyLabel = "検証待ちの予言あり";
  }

  const summary: DailySummary = {
    observationSummary,
    patternChange: params.patternChangeDetected || null,
    prophecyStatus,
    prophecyLabel,
    streak: streak.currentStreak,
    tomorrowTeaser: teaser.message,
  };

  saveDailySummary(summary);
  return summary;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prophecy Status Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function setProphecyStatus(status: "pending" | "verified_hit" | "verified_miss" | "none"): void {
  safeSetJSON(PROPHECY_STATUS_KEY, status);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Anchor — 毎日帰ってくる最大の理由
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyAnchor {
  /** 今日の核心質問 — 毎日変わる、その日だけの深い問い */
  coreQuestion: string;
  /** 質問のコンテキスト — なぜ今日この質問なのか */
  context: string;
  /** 関連する過去の回答があるか */
  hasPriorData: boolean;
  /** 前回同じタイプの質問に答えた日 */
  lastSimilarDate: string | null;
  /** 予想される変化 */
  expectedShift: string | null;
}

const DAILY_ANCHOR_TEMPLATES: { question: string; context: string }[] = [
  { question: "今日、一番避けたいことは何？ その裏に本当の欲求が隠れている", context: "回避行動の裏には、最も強い動機が潜む。避けたいものの正体を知ることは、自分の核に触れること。" },
  { question: "昨日の自分に一言言えるとしたら？ それが今日の自分の本音", context: "過去の自分への言葉は、現在の価値判断を映す鏡になる。" },
  { question: "今、誰かに「本当のこと」を言えるとしたら、誰に何を言う？", context: "言えない真実は、自分の境界線と優先順位を教えてくれる。" },
  { question: "今日一番最初に感じた感情は？ 朝の感情は一日のフィルターになる", context: "起床直後の感情は、防衛が最も薄い瞬間の自分。その色が一日を染める。" },
  { question: "もし明日の自分から手紙が届くとしたら、何が書いてあると思う？", context: "未来の自分を想像する時、今の不安と期待が同時に現れる。" },
  { question: "今日、誰かの期待に応えなくていいとしたら、何をする？", context: "他者の期待を外した時に残るものが、本当の欲望。" },
  { question: "最近、説明できない苛立ちを感じた瞬間は？ その正体は何だと思う？", context: "言語化できない感情は、自分がまだ認めていない価値観の衝突を示す。" },
  { question: "今の自分を動物に例えるなら？ なぜその動物？", context: "比喩は論理を迂回して本質に触れる。選んだ動物の特性が、今の自己認識を映す。" },
  { question: "最後に「これでいい」と心から思えたのはいつ？ その時何があった？", context: "充足の記憶は、自分にとっての本当の成功条件を教える。" },
  { question: "今、自分の中で一番うるさい声は何を言っている？", context: "内なる声の正体を観察することは、自動思考のパターンを掴む第一歩。" },
  { question: "「自分らしくない」と思った最近の行動は？ 本当にらしくなかったのか？", context: "自己イメージと実際の行動のズレに、成長か退行かのヒントがある。" },
  { question: "今日、もし全てが許されるなら何をやめる？", context: "やめたいのにやめられないことの中に、義務感と恐怖の地図がある。" },
  { question: "最近「分かってもらえない」と感じた瞬間は？ 何を分かってほしかった？", context: "理解されたい部分は、自分が最も価値を置いている自己像を指す。" },
  { question: "5年前の自分が今の自分を見たら、何に一番驚く？", context: "過去の自分との差分は、無自覚な変化を浮かび上がらせる。" },
  { question: "今の生活から一つだけ消せるとしたら何を消す？ 消した後に何が残る？", context: "手放す覚悟があるものとないものの境界に、本当の優先順位がある。" },
  { question: "最近、自分を褒めた瞬間はある？ 何に対して？", context: "自己承認のパターンは、自分が本当に大切にしている価値を示す。" },
  { question: "誰にも見られていない時の自分は、どんな顔をしている？", context: "社会的仮面を外した素顔は、エネルギーの本当の方向を教える。" },
  { question: "今日の決断の中で、一番小さいけど一番迷ったものは？", context: "些細な迷いの中にこそ、大きな内的葛藤が圧縮されている。" },
  { question: "「あの人のようになりたい」と思う人は誰？ その人の何に惹かれる？", context: "憧れの対象は、自分の中の未発達な可能性を映す投影スクリーン。" },
  { question: "最近、時間を忘れて没頭したことは？ なぜそれに没頭できた？", context: "フロー状態の条件を知ることは、自分のエネルギー源泉を知ること。" },
  { question: "今の自分が抱えている「矛盾」を一つ挙げるとしたら？", context: "矛盾は弱さではなく、複数の自分が同時に存在している証拠。その構造を観る。" },
  { question: "もし感情に色があるとしたら、今日の自分は何色？ なぜ？", context: "感情の色彩化は、言葉にならない内面状態を視覚的に捉える試み。" },
  { question: "最近「これだけは譲れない」と感じたことは？ なぜ譲れない？", context: "非交渉領域は、アイデンティティの核に直結している。" },
  { question: "今、自分の中で最も静かな部分はどこ？ その静けさは何を意味する？", context: "注意が向かない領域には、抑圧か安定か、どちらかの答えがある。" },
  { question: "「自分は本当は何者なのか」と考えた時、最初に浮かぶイメージは？", context: "自己の本質への直感は、論理的分析より正確なことがある。" },
  { question: "最近、予想外に嬉しかったことは？ なぜ予想外だった？", context: "予想外の喜びは、自分がまだ把握していない欲求の存在を示す。" },
  { question: "今の自分に足りないものは何？ 本当にそれは足りないのか？", context: "欠乏感の正体を観ることで、外的条件と内的充足の区別がつく。" },
  { question: "10年後の自分に聞きたいことが一つあるとしたら？", context: "未来への問いは、今の自分が最も不確実に感じている領域を示す。" },
  { question: "最近「もういいや」と諦めたことはある？ その諦めは正しかった？", context: "諦めのパターンには、限界の認識と回避の区別がある。どちらかで意味が変わる。" },
  { question: "今日、自分の体が一番正直に反応した瞬間は？", context: "身体反応は意識より先に真実を知っている。緊張、弛緩、鳥肌——全てが信号。" },
  { question: "「普通」という言葉を使う時、自分にとっての普通とは何？", context: "普通の定義は人によって異なる。自分の「普通」の輪郭を知ることは、暗黙の基準を自覚すること。" },
];

/** 日付ベースのシードからインデックスを決定論的に算出 */
function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDailyAnchor(): DailyAnchor {
  const todayStr = today();
  const seed = dateSeed(todayStr);
  const index = seed % DAILY_ANCHOR_TEMPLATES.length;
  const template = DAILY_ANCHOR_TEMPLATES[index];
  const days: string[] = safeGetJSON(OBSERVATION_DAYS_KEY, []);

  // 過去に同じインデックスの質問が出た日を探す
  let lastSimilarDate: string | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d === todayStr) continue;
    if (dateSeed(d) % DAILY_ANCHOR_TEMPLATES.length === index) {
      lastSimilarDate = d;
      break;
    }
  }

  return {
    coreQuestion: template.question,
    context: template.context,
    hasPriorData: days.length > 0,
    lastSimilarDate,
    expectedShift: lastSimilarDate
      ? "前回と同じ問いへの回答がどう変化したか、比較できる"
      : null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enhanced Streak — 心理的フック付きストリーク
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type StreakLevel = "seed" | "sprout" | "bloom" | "constellation" | "galaxy";

export interface EnhancedStreakData extends StreakData {
  /** ストリーク段階 */
  level: StreakLevel;
  /** 段階の説明 */
  levelDescription: string;
  /** 次の段階まで */
  nextLevelDays: number;
  /** ストリークに応じた特典テキスト */
  streakReward: string;
  /** 週間パターンの可視化データ */
  weeklyHeatmap: boolean[];
}

const STREAK_LEVELS: {
  key: StreakLevel;
  minDays: number;
  description: string;
  reward: string;
}[] = [
  { key: "seed", minDays: 1, description: "種を蒔いた。芽が出るのを待つ", reward: "最初の一歩。パターンの種が土に落ちた。" },
  { key: "sprout", minDays: 3, description: "最初のパターンが芽吹き始めている", reward: "3日分のデータで、曜日の癖が見え始める。" },
  { key: "bloom", minDays: 7, description: "週間パターンが開花した。曜日ごとの自分が見え始める", reward: "1週間の完全な周期データ。内なる天気の予報精度が上がった。" },
  { key: "constellation", minDays: 14, description: "観測が繋がり、輪郭が浮かぶ", reward: "反復パターンの検出精度が大幅に向上。予言の的中率が上がる。" },
  { key: "galaxy", minDays: 30, description: "あなたの内なる銀河が形になった。他の誰とも違う形", reward: "30日分の深層データ。精神の署名が完成に近づいている。" },
];

export function getEnhancedStreakData(): EnhancedStreakData {
  const base = getStreakData();

  // レベル判定
  let level: StreakLevel = "seed";
  let levelDescription = "まだ観測を始めていない";
  let streakReward = "最初の観測を行うと、種が蒔かれる。";
  let nextLevelDays = 1;

  for (let i = STREAK_LEVELS.length - 1; i >= 0; i--) {
    if (base.currentStreak >= STREAK_LEVELS[i].minDays) {
      level = STREAK_LEVELS[i].key;
      levelDescription = STREAK_LEVELS[i].description;
      streakReward = STREAK_LEVELS[i].reward;
      // 次のレベルまでの日数
      const nextLevel = STREAK_LEVELS[i + 1];
      nextLevelDays = nextLevel ? nextLevel.minDays - base.currentStreak : 0;
      break;
    }
  }

  if (base.currentStreak === 0) {
    nextLevelDays = 1;
  }

  // 週間ヒートマップ: 直近7日間のうちどの日に観測したか
  const heatmap: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = localDateStr(d);
    heatmap.push(base.recentDays.includes(dStr));
  }

  return {
    ...base,
    level,
    levelDescription,
    nextLevelDays,
    streakReward,
    weeklyHeatmap: heatmap,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Progressive Revelation — 観測回数で解放される洞察
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProgressiveInsight {
  id: string;
  requiredObservations: number;
  title: string;
  teaserText: string;
  category: "behavioral" | "temporal" | "relational" | "predictive";
}

const PROGRESSIVE_INSIGHTS: ProgressiveInsight[] = [
  { id: "pi_5_first_impression", requiredObservations: 5, title: "あなたの回答パターンの第一印象", teaserText: "5回の観測で、最初のパターンの輪郭が浮かぶ...", category: "behavioral" },
  { id: "pi_10_weekday_map", requiredObservations: 10, title: "曜日ごとの感情マップ", teaserText: "10回の観測で、曜日と感情の相関が見え始める...", category: "temporal" },
  { id: "pi_15_contradiction", requiredObservations: 15, title: "矛盾の地図 -- 自分が知らない自分", teaserText: "15回の観測で、あなたの中の矛盾が地図になる...", category: "behavioral" },
  { id: "pi_20_decision", requiredObservations: 20, title: "意思決定の癖 -- 何を優先し、何を犠牲にするか", teaserText: "20回の観測で、無意識の優先順位が判明する...", category: "behavioral" },
  { id: "pi_25_morning_night", requiredObservations: 25, title: "朝の自分と夜の自分 -- 二つの人格", teaserText: "25回の観測で、時間帯による性格の変容が見える...", category: "temporal" },
  { id: "pi_30_time_shift", requiredObservations: 30, title: "時間帯別の性格シフト", teaserText: "30回の観測で、1日の中での自分の変化曲線が完成する...", category: "temporal" },
  { id: "pi_40_stress", requiredObservations: 40, title: "ストレス反応パターン -- あなたの防衛機制", teaserText: "40回の観測で、ストレス時のあなたの自動反応が解読される...", category: "behavioral" },
  { id: "pi_50_prediction", requiredObservations: 50, title: "予測モデル -- 明日のあなたを予測する精度", teaserText: "50回の観測で、行動予測の精度が飛躍的に上がる...", category: "predictive" },
  { id: "pi_60_relational", requiredObservations: 60, title: "他者との関係パターン -- 鏡としての対人関係", teaserText: "60回の観測で、人間関係のパターンが解読される...", category: "relational" },
  { id: "pi_75_hierarchy", requiredObservations: 75, title: "無意識の価値階層 -- 本当に大切なもの", teaserText: "75回の観測で、あなたが本当に大切にしているものの序列が見える...", category: "behavioral" },
  { id: "pi_90_signature", requiredObservations: 90, title: "完全なる精神の署名 -- あなただけの指紋", teaserText: "90回の観測で、唯一無二の精神の指紋が完成する...", category: "behavioral" },
  { id: "pi_100_future", requiredObservations: 100, title: "未来予測マトリクス -- 6ヶ月後のあなた", teaserText: "100回の観測で、長期的な変化の軌道が予測可能になる...", category: "predictive" },
  { id: "pi_120_shadow", requiredObservations: 120, title: "もうひとりの欲望マップ -- 意識下の動機", teaserText: "120回の観測で、自分でも気づかない深層動機が可視化される...", category: "behavioral" },
  { id: "pi_150_resonance", requiredObservations: 150, title: "共鳴パターン解析 -- あなたを動かす他者", teaserText: "150回の観測で、どんな人にどう影響されるかの完全マップが完成する...", category: "relational" },
  { id: "pi_180_metamorphosis", requiredObservations: 180, title: "変容の法則 -- あなたはどう変わるのか", teaserText: "180回の観測で、自分の変化法則そのものが解読される...", category: "predictive" },
  { id: "pi_200_complete", requiredObservations: 200, title: "内なる宇宙の完全図 -- 全ての星が繋がる", teaserText: "200回の観測で、あなたの内的宇宙の完全なアーキタイプが完成する...", category: "behavioral" },
];

export function getProgressiveInsights(
  totalObservations: number,
): Array<ProgressiveInsight & { unlocked: boolean }> {
  return PROGRESSIVE_INSIGHTS.map((pi) => ({
    ...pi,
    unlocked: totalObservations >= pi.requiredObservations,
  }));
}

/** 次にアンロックされる洞察を取得 */
export function getNextProgressiveInsight(
  totalObservations: number,
): (ProgressiveInsight & { remaining: number }) | null {
  for (const pi of PROGRESSIVE_INSIGHTS) {
    if (totalObservations < pi.requiredObservations) {
      return { ...pi, remaining: pi.requiredObservations - totalObservations };
    }
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Return Notification Templates — 復帰通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getReturnNotification(
  daysSinceLastVisit: number,
  streakBefore: number,
  lastInsight: string | null,
): { title: string; body: string } {
  if (daysSinceLastVisit <= 1) {
    return {
      title: "昨日の予言、検証してみない？",
      body: lastInsight
        ? `「${lastInsight}」——この仮説が正しかったか、今日の観測で分かる。`
        : "昨日の自分と今日の自分、何が変わった？ 一問で見える。",
    };
  }

  if (daysSinceLastVisit <= 3) {
    return {
      title: `${daysSinceLastVisit}日分のパターンデータが溜まっている`,
      body: streakBefore > 3
        ? `${streakBefore}日連続の記録は途切れたが、空白期間も観測対象になる。何が自分を遠ざけたのか？`
        : "数日の空白は、新しい発見のチャンスになる。戻った時の自分は、少し違うはず。",
    };
  }

  if (daysSinceLastVisit <= 7) {
    return {
      title: "1週間の沈黙",
      body: "その間に何が変わった？ 観測を再開すると、変化の輪郭が見える。不在の理由そのものがデータになる。",
    };
  }

  if (daysSinceLastVisit <= 14) {
    return {
      title: "データが語りかけている",
      body: "あなたの不在中も、過去のパターンは動き続けている。2週間前の自分と今の自分——どれだけズレているか、確かめてみないか。",
    };
  }

  return {
    title: "長い沈黙の後に戻ってきた人は、最も深い発見をする",
    body: "変化は離れている間にこそ起きる。今の自分は、前回の自分とは別人かもしれない。その差分を観測する価値がある。",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature Journey Connections
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface JourneyNode {
  feature: V4Feature;
  label: string;
  icon: string;
  description: string;
  href: string;
  explored: boolean;
  /** この機能が利用可能か */
  available: boolean;
  /** 前提となる機能 */
  prerequisites: V4Feature[];
  /** この機能の後に推奨される機能 */
  leadsTo: V4Feature[];
  /** 観測コアループでの位置 */
  phaseInLoop: "observe" | "detect" | "verify" | "discover" | "dialogue" | "synthesize";
}

/** 機能間の接続定義 */
const JOURNEY_GRAPH: Record<V4Feature, {
  prerequisites: V4Feature[];
  leadsTo: V4Feature[];
  phaseInLoop: JourneyNode["phaseInLoop"];
}> = {
  inner_weather: {
    prerequisites: [],
    leadsTo: ["blind_spot", "prophecy"],
    phaseInLoop: "observe",
  },
  blind_spot: {
    prerequisites: ["inner_weather"],
    leadsTo: ["alter", "unseen_map"],
    phaseInLoop: "discover",
  },
  prophecy: {
    prerequisites: ["inner_weather"],
    leadsTo: ["psyche_signature", "decision_oracle"],
    phaseInLoop: "verify",
  },
  unseen_map: {
    prerequisites: ["blind_spot"],
    leadsTo: ["alter", "ghost_resonance"],
    phaseInLoop: "discover",
  },
  alter: {
    prerequisites: ["blind_spot"],
    leadsTo: ["ghost_resonance", "psyche_signature"],
    phaseInLoop: "dialogue",
  },
  ghost_resonance: {
    prerequisites: ["alter"],
    leadsTo: ["psyche_signature"],
    phaseInLoop: "discover",
  },
  decision_oracle: {
    prerequisites: ["prophecy"],
    leadsTo: ["psyche_signature"],
    phaseInLoop: "verify",
  },
  psyche_signature: {
    prerequisites: ["prophecy", "alter"],
    leadsTo: [],
    phaseInLoop: "synthesize",
  },
  values_discovery: {
    prerequisites: ["inner_weather"],
    leadsTo: ["transformation"],
    phaseInLoop: "discover",
  },
  core_wound: {
    prerequisites: ["blind_spot"],
    leadsTo: ["transformation"],
    phaseInLoop: "discover",
  },
  parts_dialogue: {
    prerequisites: ["alter"],
    leadsTo: ["transformation"],
    phaseInLoop: "dialogue",
  },
  transformation: {
    prerequisites: ["values_discovery"],
    leadsTo: ["transform_simulation"],
    phaseInLoop: "synthesize",
  },
  life_events: {
    prerequisites: [],
    leadsTo: ["blind_spot"],
    phaseInLoop: "observe",
  },
  micro_ema: {
    prerequisites: [],
    leadsTo: ["inner_weather"],
    phaseInLoop: "observe",
  },
  act_hexaflex: {
    prerequisites: ["inner_weather"],
    leadsTo: ["transformation"],
    phaseInLoop: "detect",
  },
  transform_simulation: {
    prerequisites: ["transformation"],
    leadsTo: [],
    phaseInLoop: "synthesize",
  },
  dream_journal: {
    prerequisites: [],
    leadsTo: ["unseen_map"],
    phaseInLoop: "observe",
  },
  circadian_rhythm: {
    prerequisites: ["inner_weather"],
    leadsTo: ["blind_spot"],
    phaseInLoop: "detect",
  },
};

const FEATURE_META: Record<V4Feature, { label: string; icon: string; description: string; href: string }> = {
  inner_weather: { label: "内なる天気", icon: "\u{1F324}\u{FE0F}", description: "心の天気を観測", href: "/stargazer/weather" },
  blind_spot: { label: "見えない自分", icon: "\u{1F4A7}", description: "自覚できていない傾向", href: "/stargazer/blind-spot" },
  prophecy: { label: "行動予測", icon: "\u{1F52E}", description: "明日の行動を予測", href: "/stargazer/prophecy" },
  unseen_map: { label: "未知の地図", icon: "\u{1F5FA}\u{FE0F}", description: "自己理解の未探索領域", href: "/stargazer/unseen-map" },
  alter: { label: "もうひとりの自分", icon: "\u{1F464}", description: "もうひとりの自分との対話", href: "/stargazer/alter" },
  ghost_resonance: { label: "似た星の共鳴", icon: "\u{1F47B}", description: "似たパターンを持つ誰か", href: "/stargazer/ghost" },
  decision_oracle: { label: "選択の予測", icon: "\u{2696}\u{FE0F}", description: "あなたの判断傾向を予測", href: "/stargazer/oracle" },
  psyche_signature: { label: "心の指紋", icon: "\u{2726}", description: "あなた固有の心理パターン", href: "/stargazer/signature" },
  values_discovery: { label: "価値観の発見", icon: "💎", description: "無意識の価値観を発見", href: "/stargazer/values" },
  core_wound: { label: "苦しみの構造", icon: "🩹", description: "繰り返しパターンの構造", href: "/stargazer/wound" },
  parts_dialogue: { label: "内なるパーツ", icon: "🎭", description: "IFS的パーツとの対話", href: "/stargazer/wound" },
  transformation: { label: "変容の意図", icon: "🦋", description: "変わりたいかを問う", href: "/stargazer/transform" },
  life_events: { label: "人生の出来事", icon: "📅", description: "出来事と変化の相関", href: "/stargazer/events" },
  micro_ema: { label: "瞬間観測", icon: "⚡", description: "3秒のマイクロ観測", href: "/stargazer" },
  act_hexaflex: { label: "心理的柔軟性", icon: "🧠", description: "ACT 6プロセスの観測", href: "/stargazer/flexibility" },
  transform_simulation: { label: "変容シミュレーション", icon: "🔮", description: "もし変わったらを体験", href: "/stargazer/simulation" },
  dream_journal: { label: "夢日記", icon: "🌙", description: "夢のシンボルを解読", href: "/stargazer/dreams" },
  circadian_rhythm: { label: "サーカディアン", icon: "⏰", description: "時間帯別パターン", href: "/stargazer/rhythm" },
};

/** 探索済み機能を localStorage で追跡 */
const EXPLORED_KEY = "culcept_sg_explored_features_v1";

export function markFeatureExplored(feature: V4Feature): void {
  const explored: V4Feature[] = safeGetJSON(EXPLORED_KEY, []);
  if (!explored.includes(feature)) {
    explored.push(feature);
    safeSetJSON(EXPLORED_KEY, explored);
  }
}

export function getExploredFeatures(): Set<V4Feature> {
  const explored: V4Feature[] = safeGetJSON(EXPLORED_KEY, []);
  return new Set(explored);
}

export function buildJourneyMap(availableFeatures: Set<V4Feature>): JourneyNode[] {
  const explored = getExploredFeatures();

  return (Object.keys(JOURNEY_GRAPH) as V4Feature[]).map((feature) => {
    const graph = JOURNEY_GRAPH[feature];
    const meta = FEATURE_META[feature];
    return {
      feature,
      label: meta.label,
      icon: meta.icon,
      description: meta.description,
      href: meta.href,
      explored: explored.has(feature),
      available: availableFeatures.has(feature),
      prerequisites: graph.prerequisites,
      leadsTo: graph.leadsTo,
      phaseInLoop: graph.phaseInLoop,
    };
  });
}

export function getNextRecommendedFeature(availableFeatures: Set<V4Feature>): JourneyNode | null {
  const explored = getExploredFeatures();
  const journey = buildJourneyMap(availableFeatures);

  // 利用可能だが未探索の機能を、前提条件が満たされている順に探す
  const candidates = journey.filter(
    (node) =>
      node.available &&
      !node.explored &&
      node.prerequisites.every((p) => explored.has(p)),
  );

  if (candidates.length === 0) return null;

  // ループ順序で優先: observe > detect > verify > discover > dialogue > synthesize
  const phaseOrder: JourneyNode["phaseInLoop"][] = [
    "observe", "detect", "verify", "discover", "dialogue", "synthesize",
  ];
  candidates.sort((a, b) => phaseOrder.indexOf(a.phaseInLoop) - phaseOrder.indexOf(b.phaseInLoop));

  return candidates[0];
}
