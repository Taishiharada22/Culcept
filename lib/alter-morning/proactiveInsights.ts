/**
 * Proactive Insight Engine — プロアクティブ・インサイト（Phase 4）
 *
 * 蓄積された曜日パターンからインサイトを生成し、
 * Alterの「観測レイヤー」としてユーザーに提示する。
 *
 * インサイトの種類:
 * - weekday_strength: 調子がいい曜日の検出
 * - weekday_caution:  完了率が低い曜日の注意喚起
 * - streak:           連続プラン作成の称賛
 * - gentle_suggestion: タスク過多の検出
 *
 * 制御ルール:
 * - 1日最大1インサイト
 * - 同タイプは3日間クールダウン
 * - 最小データ閾値: 5プラン以上（weekday系）
 * - 完了率偏差20%以上のみ検出（雑音除去）
 */

import type { ProactiveInsight, InsightType, InsightThrottleStore } from "./types";
import { todayJST } from "./dateUtils";
import {
  loadWeekdayStore,
  getWeekdayAnalysis,
  getOverallCompletionRate,
} from "./weekdayPatterns";

const THROTTLE_KEY = "alter_morning_insight_throttle_v1";
const CURRENT_VERSION = 1;

/** weekday系インサイトの最小プラン数 */
const MIN_PLANS_FOR_WEEKDAY = 5;
/** 完了率の偏差閾値（全体平均との差がこれ以上で検出） */
const COMPLETION_RATE_DEVIATION = 0.20;
/** 同タイプのクールダウン日数 */
const TYPE_COOLDOWN_DAYS = 3;
/** ストリークインサイトの最小日数 */
const MIN_STREAK_DAYS = 3;
/** タスク過多の閾値（1プランあたりの平均タスク数） */
const HIGH_TASK_THRESHOLD = 6;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Throttle Load / Save
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const today = todayJST;

function loadThrottle(): InsightThrottleStore {
  if (typeof window === "undefined") {
    return { lastShown: {}, shownToday: null, version: CURRENT_VERSION };
  }
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    if (!raw) return { lastShown: {}, shownToday: null, version: CURRENT_VERSION };
    const parsed = JSON.parse(raw) as InsightThrottleStore;
    if (parsed.version !== CURRENT_VERSION) {
      return { lastShown: {}, shownToday: null, version: CURRENT_VERSION };
    }
    return parsed;
  } catch {
    return { lastShown: {}, shownToday: null, version: CURRENT_VERSION };
  }
}

function saveThrottle(store: InsightThrottleStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(store));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スロットル判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isTypeOnCooldown(type: InsightType, throttle: InsightThrottleStore): boolean {
  const lastDate = throttle.lastShown[type];
  if (!lastDate) return false;
  const last = new Date(lastDate);
  const daysSince = Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000));
  return daysSince < TYPE_COOLDOWN_DAYS;
}

function isAlreadyShownToday(throttle: InsightThrottleStore): boolean {
  return throttle.shownToday === today();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// インサイト候補生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface InsightCandidate {
  insight: ProactiveInsight;
  /** 優先度（高いほど重要） */
  priority: number;
}

function generateCandidates(): InsightCandidate[] {
  const store = loadWeekdayStore();
  const candidates: InsightCandidate[] = [];
  const todayDow = new Date().getDay();

  // ── ストリーク ──
  // ストリークは少ないデータでも意味があるので閾値不要
  if (store.currentStreak >= MIN_STREAK_DAYS) {
    candidates.push({
      insight: {
        type: "streak",
        message: `${store.currentStreak}日連続でプラン作ってるね。いいリズム`,
      },
      priority: store.currentStreak >= 7 ? 90 : 70,
    });
  }

  // 以下は最小データ閾値を満たす場合のみ
  if (store.totalPlans < MIN_PLANS_FOR_WEEKDAY) return candidates;

  const analysis = getWeekdayAnalysis(store);
  const overallRate = getOverallCompletionRate(store);

  // ── 曜日別の強み / 注意 ──
  if (overallRate !== null) {
    const todayAnalysis = analysis[todayDow];

    if (todayAnalysis.completionRate !== null) {
      const deviation = todayAnalysis.completionRate - overallRate;

      if (deviation >= COMPLETION_RATE_DEVIATION) {
        // 今日の曜日は完了率が高い → weekday_strength
        const pct = Math.round(todayAnalysis.completionRate * 100);
        candidates.push({
          insight: {
            type: "weekday_strength",
            message: `${todayAnalysis.label}曜は完了率${pct}%。調子いい曜日だね`,
          },
          priority: 60,
        });
      } else if (deviation <= -COMPLETION_RATE_DEVIATION) {
        // 今日の曜日は完了率が低い → weekday_caution
        candidates.push({
          insight: {
            type: "weekday_caution",
            message: `${todayAnalysis.label}曜は少しペースが落ちがち。今日は軽めにする？`,
          },
          priority: 50,
        });
      }
    }
  }

  // ── タスク過多 ──
  // 直近のプランでタスク数が多い傾向がある場合
  const recentAvg = analysis[todayDow].avgTasks;
  if (recentAvg >= HIGH_TASK_THRESHOLD && analysis[todayDow].planCount >= 2) {
    candidates.push({
      insight: {
        type: "gentle_suggestion",
        message: "最近タスクが多め。余白を入れてみてもいいかも",
      },
      priority: 40,
    });
  }

  return candidates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインAPI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日のプロアクティブ・インサイトを生成する。
 *
 * - 1日1回まで
 * - 同タイプは3日間クールダウン
 * - データ不足の場合は null
 *
 * 呼び出し元: AneurasyncHome のマウント時（Home画面表示時）
 */
export function generateMorningInsight(): ProactiveInsight | null {
  const throttle = loadThrottle();

  // 今日既に表示済み
  if (isAlreadyShownToday(throttle)) return null;

  // 候補を生成
  const candidates = generateCandidates();
  if (candidates.length === 0) return null;

  // クールダウン中のタイプを除外
  const available = candidates.filter((c) => !isTypeOnCooldown(c.insight.type, throttle));
  if (available.length === 0) return null;

  // 優先度順にソート → 最上位を選択
  available.sort((a, b) => b.priority - a.priority);
  const selected = available[0].insight;

  // スロットル記録
  saveThrottle({
    ...throttle,
    lastShown: { ...throttle.lastShown, [selected.type]: today() },
    shownToday: today(),
  });

  return selected;
}
