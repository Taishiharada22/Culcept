/**
 * Journal Prompt — 夜ジャーナル誘導制御
 *
 * ルール:
 * - 毎日は出さない。週3-4回程度
 * - ユーザーが書いた日を学習（曜日パターン）
 * - 2回連続で「今日はいい」→ 次は3日空ける
 * - プランを作った日は優先的に出す（振り返りの動機が強い）
 */

import type { JournalPromptState } from "./types";
import { todayJST, dayOfWeekJST, currentHourJST } from "./dateUtils";

const STORAGE_KEY = "alter_morning_journal_v1";
const EVENING_START_HOUR = 18;
const MAX_WEEKLY_PROMPTS = 4;
const COOLDOWN_AFTER_DECLINE = 3; // 2回連続辞退 → 3日空ける

const today = todayJST;
const dayOfWeek = dayOfWeekJST;

export function loadJournalState(): JournalPromptState {
  if (typeof window === "undefined") {
    return {
      journalDayPattern: [0, 0, 0, 0, 0, 0, 0],
      consecutiveDeclines: 0,
      lastPromptDate: null,
      planCreatedToday: false,
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        journalDayPattern: [0, 0, 0, 0, 0, 0, 0],
        consecutiveDeclines: 0,
        lastPromptDate: null,
        planCreatedToday: false,
      };
    }
    return JSON.parse(raw) as JournalPromptState;
  } catch {
    return {
      journalDayPattern: [0, 0, 0, 0, 0, 0, 0],
      consecutiveDeclines: 0,
      lastPromptDate: null,
      planCreatedToday: false,
    };
  }
}

function saveJournalState(state: JournalPromptState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ジャーナル誘導判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface JournalPromptDecision {
  /** ジャーナル誘導すべきか */
  shouldPrompt: boolean;
  /** 誘導メッセージ */
  message?: string;
  /** 抑制理由 */
  suppressReason?: string;
}

/**
 * 夜のジャーナル誘導を出すべきか判定する。
 */
export function checkJournalPrompt(): JournalPromptDecision {
  const hour = currentHourJST();
  const state = loadJournalState();
  const todayStr = today();

  // 1. 夜時間帯のみ
  if (hour < EVENING_START_HOUR) {
    return { shouldPrompt: false, suppressReason: "not_evening" };
  }

  // 2. 今日既に誘導済み
  if (state.lastPromptDate === todayStr) {
    return { shouldPrompt: false, suppressReason: "already_prompted_today" };
  }

  // 3. 連続辞退 → クールダウン
  if (state.consecutiveDeclines >= 2 && state.lastPromptDate) {
    const lastDate = new Date(state.lastPromptDate);
    const daysSince = Math.floor(
      (Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSince < COOLDOWN_AFTER_DECLINE) {
      return { shouldPrompt: false, suppressReason: "cooldown_after_decline" };
    }
  }

  // 4. 週の頻度制限（直近7日間のプロンプト回数）
  // journalDayPattern の合計が MAX_WEEKLY_PROMPTS を超えていたら抑制
  // ただし planCreatedToday の場合は優先
  const weeklyTotal = state.journalDayPattern.reduce((sum, v) => sum + v, 0);
  if (weeklyTotal >= MAX_WEEKLY_PROMPTS && !state.planCreatedToday) {
    return { shouldPrompt: false, suppressReason: "weekly_limit" };
  }

  // 5. 曜日パターンに基づく判定
  const dow = dayOfWeek();
  const dayScore = state.journalDayPattern[dow];

  // プランを作った日は優先
  if (state.planCreatedToday) {
    return {
      shouldPrompt: true,
      message: "今日もお疲れさま。プランの振り返り、記録しておく？",
    };
  }

  // 曜日スコアが高い日（ユーザーがよく書く曜日）は出す
  if (dayScore > 0.3) {
    return {
      shouldPrompt: true,
      message: "今日もお疲れさま。記録残しておく？",
    };
  }

  // 全曜日スコアが低い（まだ学習不足）→ 適度に出す
  if (weeklyTotal < 2) {
    return {
      shouldPrompt: true,
      message: "今日もお疲れさま。記録残しておく？",
    };
  }

  return { shouldPrompt: false, suppressReason: "low_day_score" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 記録・学習
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランを作った日に呼ぶ（ジャーナル優先度を上げる）
 */
export function markPlanCreatedToday(): void {
  const state = loadJournalState();
  saveJournalState({ ...state, planCreatedToday: true });
}

/**
 * ユーザーがジャーナルを書いた時に呼ぶ（曜日パターン学習）
 */
export function recordJournalWritten(): void {
  const state = loadJournalState();
  const dow = dayOfWeek();
  const pattern = [...state.journalDayPattern];

  // 指数移動平均で曜日スコアを更新（直近の行動を重視）
  const alpha = 0.3;
  pattern[dow] = pattern[dow] * (1 - alpha) + 1 * alpha;

  saveJournalState({
    ...state,
    journalDayPattern: pattern,
    consecutiveDeclines: 0,
    lastPromptDate: today(),
    planCreatedToday: false, // 次の日のためにリセット
  });
}

/**
 * ユーザーが「今日はいい」を選んだ時に呼ぶ
 */
export function recordJournalDeclined(): void {
  const state = loadJournalState();
  const dow = dayOfWeek();
  const pattern = [...state.journalDayPattern];

  // 書かなかった日のスコアを下げる
  const alpha = 0.3;
  pattern[dow] = pattern[dow] * (1 - alpha);

  saveJournalState({
    ...state,
    journalDayPattern: pattern,
    consecutiveDeclines: state.consecutiveDeclines + 1,
    lastPromptDate: today(),
    planCreatedToday: false,
  });
}
