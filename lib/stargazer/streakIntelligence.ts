// lib/stargazer/streakIntelligence.ts
// 観測ストリーク知性 — 単なるカウンターではなく、観測の質を追跡する
//
// 設計思想:
// "毎日ログインするだけではない。どれだけ深く自分を見つめたか"
// "質の高いストリークは新しい対話モードとインサイト深度を解放する"

import { safeSetItem } from "./localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type StreakLevel =
  | "observer"             // 観測者 — 3日
  | "seeker"               // 探求者 — 7日
  | "introspector"         // 内省者 — 14日
  | "contradiction_witness" // 矛盾の目撃者 — 21日 + 3矛盾
  | "abyss_traveler";      // 深淵の旅人 — 30日 + 品質 > 0.7

export interface StreakLevelInfo {
  level: StreakLevel;
  nameJa: string;
  description: string;
  requiredDays: number;
  requiredContradictions: number;
  requiredQualityScore: number;
  /** 解放される機能 */
  unlocks: string[];
}

export interface DailyObservationQuality {
  date: string;
  /** 回答した質問数 */
  questionCount: number;
  /** 新たに検出された矛盾数 */
  newContradictions: number;
  /** カバーした軸の数 */
  axisCoverage: number;
  /** 応答の深さ (平均応答時間 / 基準時間) */
  responseDepth: number;
  /** 回答変更があったか (深い思考の証拠) */
  hadAnswerChanges: boolean;
  /** 総合品質スコア (0-1) */
  qualityScore: number;
}

export interface StreakState {
  /** 連続観測日数 */
  currentStreak: number;
  /** 過去最長ストリーク */
  longestStreak: number;
  /** 現在のレベル */
  currentLevel: StreakLevel;
  /** 次のレベルまでの進捗 */
  nextLevelProgress: number;
  /** 次のレベル名 */
  nextLevelName: string | null;
  /** 次のレベルに必要な条件 */
  nextLevelRequirements: string[];
  /** 累計矛盾検出数 */
  totalContradictions: number;
  /** 直近7日の平均品質スコア */
  recentQualityAvg: number;
  /** 日次観測品質の履歴 */
  dailyQualities: DailyObservationQuality[];
  /** 最後の観測日 */
  lastObservationDate: string | null;
  /** レベルアップ通知 */
  pendingLevelUp: StreakLevel | null;
  /** ストリーク保護の残回数（最大2） */
  freezesAvailable: number;
  /** 保護を使用した日付の履歴 */
  freezeUsedDates: string[];
  /** 直近のフリーズ発動通知（UIで読み取り後にクリア） */
  pendingFreezeNotice: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STREAK_STATE_KEY = "stargazer_streak_intelligence_v1";
const MAX_DAILY_HISTORY = 60;

export const STREAK_LEVELS: StreakLevelInfo[] = [
  {
    level: "observer",
    nameJa: "観測者",
    description: "自分を見つめる習慣が始まった",
    requiredDays: 3,
    requiredContradictions: 0,
    requiredQualityScore: 0,
    unlocks: [
      "基本的な行動パターンの表示",
      "日次予測の開始",
    ],
  },
  {
    level: "seeker",
    nameJa: "探求者",
    description: "表面の下に何かがあることに気づいた",
    requiredDays: 7,
    requiredContradictions: 0,
    requiredQualityScore: 0,
    unlocks: [
      "週間パターンの検出",
      "Alter との基本対話",
      "応答時間分析の表示",
    ],
  },
  {
    level: "introspector",
    nameJa: "内省者",
    description: "自分の内面を、データで理解し始めた",
    requiredDays: 14,
    requiredContradictions: 0,
    requiredQualityScore: 0,
    unlocks: [
      "周期パターンの検出",
      "深層予測の解放",
      "Alter との深い対話モード",
      "時間帯別の傾向分析",
    ],
  },
  {
    level: "contradiction_witness",
    nameJa: "矛盾の目撃者",
    description: "自分の中の矛盾を、恐れずに見つめた",
    requiredDays: 21,
    requiredContradictions: 3,
    requiredQualityScore: 0,
    unlocks: [
      "矛盾マップの全体表示",
      "盲点検出の解放",
      "Alter の挑発的質問モード",
      "自己欺瞞パターンの分析",
    ],
  },
  {
    level: "abyss_traveler",
    nameJa: "深淵の旅人",
    description: "深淵を覗き込んだ者だけが見える景色がある",
    requiredDays: 30,
    requiredContradictions: 3,
    requiredQualityScore: 0.7,
    unlocks: [
      "全パターンエンジンの解放",
      "予測精度ダッシュボード",
      "Alter の全対話モード",
      "他ユーザーとの匿名比較",
      "自分の「法則」の命名機能",
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Quality Computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 本日の観測品質を記録する。
 * 観測セッション完了時に呼ばれる。
 */
export function recordDailyObservation(params: {
  questionCount: number;
  newContradictions: number;
  axisCoverage: number;
  averageResponseTimeMs: number;
  hadAnswerChanges: boolean;
}): StreakState {
  const today = new Date().toISOString().split("T")[0];

  // 品質スコアの計算
  const qualityScore = computeQualityScore(params);

  const dailyQuality: DailyObservationQuality = {
    date: today,
    questionCount: params.questionCount,
    newContradictions: params.newContradictions,
    axisCoverage: params.axisCoverage,
    responseDepth: params.averageResponseTimeMs / 5000, // 5秒を基準
    hadAnswerChanges: params.hadAnswerChanges,
    qualityScore,
  };

  // 既存の状態を読み込み
  const state = loadStreakState();

  // 今日の記録を追加（既存の今日の記録は上書き）
  const existingIdx = state.dailyQualities.findIndex((d) => d.date === today);
  if (existingIdx >= 0) {
    state.dailyQualities[existingIdx] = dailyQuality;
  } else {
    state.dailyQualities.push(dailyQuality);
  }

  // 履歴の上限を維持
  if (state.dailyQualities.length > MAX_DAILY_HISTORY) {
    state.dailyQualities = state.dailyQualities.slice(-MAX_DAILY_HISTORY);
  }

  // ストリーク更新
  updateStreak(state, today);

  // 矛盾カウント更新
  state.totalContradictions += params.newContradictions;

  // 直近7日の平均品質
  const recent7 = state.dailyQualities.slice(-7);
  state.recentQualityAvg =
    recent7.length > 0
      ? Math.round(
          (recent7.reduce((sum, d) => sum + d.qualityScore, 0) / recent7.length) *
            1000,
        ) / 1000
      : 0;

  // レベル判定
  const previousLevel = state.currentLevel;
  state.currentLevel = determineLevel(state);

  // レベルアップ通知
  if (state.currentLevel !== previousLevel) {
    const prevIdx = STREAK_LEVELS.findIndex((l) => l.level === previousLevel);
    const newIdx = STREAK_LEVELS.findIndex((l) => l.level === state.currentLevel);
    if (newIdx > prevIdx) {
      state.pendingLevelUp = state.currentLevel;
    }
  }

  // 次のレベル情報
  updateNextLevelInfo(state);

  // 保存
  saveStreakState(state);

  return state;
}

function computeQualityScore(params: {
  questionCount: number;
  newContradictions: number;
  axisCoverage: number;
  averageResponseTimeMs: number;
  hadAnswerChanges: boolean;
}): number {
  // 質問数 (0-0.25): 5問で最大
  const questionScore = Math.min(0.25, (params.questionCount / 5) * 0.25);

  // 矛盾検出 (0-0.20): 矛盾は深い情報の証拠
  const contradictionScore = Math.min(0.20, params.newContradictions * 0.10);

  // 軸カバレッジ (0-0.25): 多くの軸をカバーするほど良い
  const totalAxes = 33; // TRAIT_AXES の数
  const coverageScore = Math.min(0.25, (params.axisCoverage / totalAxes) * 0.25 * 5);

  // 応答深度 (0-0.15): 適度な時間をかけている
  const depthRatio = params.averageResponseTimeMs / 5000; // 5秒基準
  const depthScore =
    depthRatio >= 0.5 && depthRatio <= 3.0
      ? 0.15
      : depthRatio < 0.5
        ? depthRatio * 0.3
        : 0.08;

  // 回答変更 (0-0.15): 考え直しは深い思考の証拠
  const changeScore = params.hadAnswerChanges ? 0.15 : 0;

  return Math.min(
    1,
    questionScore + contradictionScore + coverageScore + depthScore + changeScore,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function updateStreak(state: StreakState, today: string): void {
  if (!state.lastObservationDate) {
    // 初回観測
    state.currentStreak = 1;
    state.lastObservationDate = today;
    return;
  }

  const lastDate = new Date(state.lastObservationDate);
  const todayDate = new Date(today);
  const diffDays = Math.floor(
    (todayDate.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) {
    // 同日: ストリーク変更なし
    return;
  } else if (diffDays === 1) {
    // 連続: ストリーク+1
    state.currentStreak++;
    // 7日ごとにフリーズ1個獲得（上限2）
    if (state.currentStreak > 0 && state.currentStreak % 7 === 0) {
      state.freezesAvailable = Math.min(2, (state.freezesAvailable ?? 0) + 1);
    }
  } else if (diffDays === 2 && (state.freezesAvailable ?? 0) > 0 && state.currentStreak >= 3) {
    // 1日スキップ + フリーズ残あり + 3日以上のストリーク → 保護発動
    state.freezesAvailable = (state.freezesAvailable ?? 0) - 1;
    state.freezeUsedDates = [...(state.freezeUsedDates ?? []), state.lastObservationDate!];
    state.pendingFreezeNotice = true;
    state.currentStreak++; // スキップ日もカウント
  } else {
    // 途切れた: リセット
    state.currentStreak = 1;
  }

  state.lastObservationDate = today;
  if (state.currentStreak > state.longestStreak) {
    state.longestStreak = state.currentStreak;
  }
}

function determineLevel(state: StreakState): StreakLevel {
  // 最も条件が厳しいレベルから逆順にチェック
  for (let i = STREAK_LEVELS.length - 1; i >= 0; i--) {
    const level = STREAK_LEVELS[i];
    if (
      state.currentStreak >= level.requiredDays &&
      state.totalContradictions >= level.requiredContradictions &&
      (level.requiredQualityScore === 0 ||
        state.recentQualityAvg >= level.requiredQualityScore)
    ) {
      return level.level;
    }
  }

  // どのレベルにも達していない
  return "observer";
}

function updateNextLevelInfo(state: StreakState): void {
  const currentIdx = STREAK_LEVELS.findIndex(
    (l) => l.level === state.currentLevel,
  );

  if (currentIdx >= STREAK_LEVELS.length - 1) {
    // 最高レベル
    state.nextLevelName = null;
    state.nextLevelProgress = 1;
    state.nextLevelRequirements = [];
    return;
  }

  const nextLevel = STREAK_LEVELS[currentIdx + 1];
  state.nextLevelName = nextLevel.nameJa;

  // 進捗計算
  const requirements: string[] = [];
  let metricsCompleted = 0;
  let metricsTotal = 0;

  // 日数要件
  metricsTotal++;
  if (state.currentStreak >= nextLevel.requiredDays) {
    metricsCompleted++;
  } else {
    requirements.push(
      `あと${nextLevel.requiredDays - state.currentStreak}日の連続観測`,
    );
  }

  // 矛盾要件
  if (nextLevel.requiredContradictions > 0) {
    metricsTotal++;
    if (state.totalContradictions >= nextLevel.requiredContradictions) {
      metricsCompleted++;
    } else {
      requirements.push(
        `あと${nextLevel.requiredContradictions - state.totalContradictions}つの矛盾検出`,
      );
    }
  }

  // 品質要件
  if (nextLevel.requiredQualityScore > 0) {
    metricsTotal++;
    if (state.recentQualityAvg >= nextLevel.requiredQualityScore) {
      metricsCompleted++;
    } else {
      requirements.push(
        `品質スコアを${Math.round(nextLevel.requiredQualityScore * 100)}%以上に（現在: ${Math.round(state.recentQualityAvg * 100)}%）`,
      );
    }
  }

  state.nextLevelProgress =
    metricsTotal > 0 ? metricsCompleted / metricsTotal : 0;
  state.nextLevelRequirements = requirements;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在のストリーク状態を取得する。
 */
export function getStreakState(): StreakState {
  return loadStreakState();
}

/**
 * 現在のレベル情報を取得する。
 */
export function getCurrentLevelInfo(): StreakLevelInfo {
  const state = loadStreakState();
  return (
    STREAK_LEVELS.find((l) => l.level === state.currentLevel) ??
    STREAK_LEVELS[0]
  );
}

/**
 * 指定レベルで解放される機能を取得する。
 */
export function getUnlocksForLevel(level: StreakLevel): string[] {
  const info = STREAK_LEVELS.find((l) => l.level === level);
  return info?.unlocks ?? [];
}

/**
 * 指定レベルに達しているかチェックする。
 * 機能ゲーティングに使用。
 */
export function hasReachedLevel(requiredLevel: StreakLevel): boolean {
  const state = loadStreakState();
  const currentIdx = STREAK_LEVELS.findIndex(
    (l) => l.level === state.currentLevel,
  );
  const requiredIdx = STREAK_LEVELS.findIndex(
    (l) => l.level === requiredLevel,
  );
  return currentIdx >= requiredIdx;
}

/**
 * レベルアップ通知をクリアする。
 */
export function clearPendingLevelUp(): void {
  const state = loadStreakState();
  state.pendingLevelUp = null;
  saveStreakState(state);
}

/**
 * 今日の観測品質を取得する。
 */
export function getTodayQuality(): DailyObservationQuality | null {
  const state = loadStreakState();
  const today = new Date().toISOString().split("T")[0];
  return state.dailyQualities.find((d) => d.date === today) ?? null;
}

/**
 * ストリークが途切れるまでの猶予を確認する。
 * 今日まだ観測していない場合、「あとN時間で途切れる」を返す。
 */
export function getStreakUrgency(): {
  isAtRisk: boolean;
  hoursRemaining: number;
  message: string;
} | null {
  const state = loadStreakState();
  if (state.currentStreak < 2) return null;

  const today = new Date().toISOString().split("T")[0];
  const todayQuality = state.dailyQualities.find((d) => d.date === today);

  if (todayQuality) {
    // 今日は既に観測済み
    return null;
  }

  // 今日まだ観測していない
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const hoursRemaining = Math.max(
    0,
    (endOfDay.getTime() - now.getTime()) / (60 * 60 * 1000),
  );

  const levelInfo = getCurrentLevelInfo();

  return {
    isAtRisk: hoursRemaining < 6,
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    message:
      hoursRemaining < 3
        ? `${state.currentStreak}日の「${levelInfo.nameJa}」ストリークがあと${Math.round(hoursRemaining)}時間で途切れます`
        : `今日の観測がまだです（${state.currentStreak}日連続中）`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Persistence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function loadStreakState(): StreakState {
  if (typeof window === "undefined") {
    return createDefaultState();
  }
  try {
    const raw = localStorage.getItem(STREAK_STATE_KEY);
    if (!raw) return createDefaultState();
    return JSON.parse(raw) as StreakState;
  } catch {
    return createDefaultState();
  }
}

function saveStreakState(state: StreakState): void {
  if (typeof window === "undefined") return;
  safeSetItem(STREAK_STATE_KEY, JSON.stringify(state));
}

function createDefaultState(): StreakState {
  return {
    currentStreak: 0,
    longestStreak: 0,
    currentLevel: "observer",
    nextLevelProgress: 0,
    nextLevelName: "観測者",
    nextLevelRequirements: ["3日間の連続観測"],
    totalContradictions: 0,
    recentQualityAvg: 0,
    dailyQualities: [],
    lastObservationDate: null,
    pendingLevelUp: null,
    freezesAvailable: 0,
    freezeUsedDates: [],
    pendingFreezeNotice: false,
  };
}

/**
 * フリーズ発動通知をクリアする（UIで読み取り後に呼ぶ）
 */
export function clearFreezeNotice(): void {
  const state = loadStreakState();
  if (state.pendingFreezeNotice) {
    state.pendingFreezeNotice = false;
    saveStreakState(state);
  }
}
