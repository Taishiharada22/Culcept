/**
 * Follow-up Tracker — 日中フォロー制御
 *
 * プラン確定後のタスク進捗フォローアップを管理する。
 *
 * ルール:
 * - 1日最大2回まで
 * - 前回フォローから最低3時間空ける
 * - ユーザーがアプリを開いた時のみ（プッシュ通知ではない）
 * - 連続スキップ（2回）でその日はフォロー停止
 * - 固定予定終了後に1回だけフォロー
 */

import type { FollowUpThrottle, MorningPlan, PlanItem } from "./types";
import { todayJST, currentHourJST } from "./dateUtils";

const STORAGE_KEY = "alter_morning_followup_v1";
const MAX_DAILY_FOLLOWUPS = 2;
const MIN_GAP_MS = 3 * 60 * 60 * 1000; // 3時間
const MAX_CONSECUTIVE_SKIPS = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Load / Save
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const today = todayJST;

export function loadFollowUpThrottle(): FollowUpThrottle {
  if (typeof window === "undefined") {
    return { dailyFollowUpCount: 0, lastFollowUpAt: null, consecutiveSkips: 0, date: today() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dailyFollowUpCount: 0, lastFollowUpAt: null, consecutiveSkips: 0, date: today() };
    const parsed = JSON.parse(raw) as FollowUpThrottle;
    // 日付が変わったらリセット
    if (parsed.date !== today()) {
      return { dailyFollowUpCount: 0, lastFollowUpAt: null, consecutiveSkips: 0, date: today() };
    }
    return parsed;
  } catch {
    return { dailyFollowUpCount: 0, lastFollowUpAt: null, consecutiveSkips: 0, date: today() };
  }
}

function saveFollowUpThrottle(throttle: FollowUpThrottle): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(throttle));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フォロー可否判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FollowUpDecision {
  /** フォローすべきか */
  shouldFollowUp: boolean;
  /** フォロー対象のPlanItem（固定予定の後 or 未完了todo） */
  targetItem?: PlanItem;
  /** フォローメッセージ */
  message?: string;
  /** 抑制理由（デバッグ用） */
  suppressReason?: string;
}

/**
 * 日中フォローを出すべきか判定する。
 * ユーザーがアプリを開いた時（Home表示時）に呼ぶ。
 */
export function checkFollowUp(plan: MorningPlan): FollowUpDecision {
  const throttle = loadFollowUpThrottle();
  const now = Date.now();

  // 1. 連続スキップ上限
  if (throttle.consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
    return { shouldFollowUp: false, suppressReason: "consecutive_skips" };
  }

  // 2. 1日の上限チェック
  if (throttle.dailyFollowUpCount >= MAX_DAILY_FOLLOWUPS) {
    return { shouldFollowUp: false, suppressReason: "daily_limit" };
  }

  // 3. 最低間隔チェック
  if (throttle.lastFollowUpAt) {
    const elapsed = now - new Date(throttle.lastFollowUpAt).getTime();
    if (elapsed < MIN_GAP_MS) {
      return { shouldFollowUp: false, suppressReason: "too_soon" };
    }
  }

  // 4. フォロー対象を決定
  const target = findFollowUpTarget(plan);
  if (!target) {
    return { shouldFollowUp: false, suppressReason: "no_target" };
  }

  return {
    shouldFollowUp: true,
    targetItem: target,
    message: buildFollowUpMessage(target),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フォロー対象の選定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function currentTimeMinutes(): number {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * フォロー対象のPlanItemを見つける。
 * - 固定予定が終了している場合: その直後のタスクの進捗を聞く
 * - 最近終わったはずのTodoの進捗を聞く
 */
function findFollowUpTarget(plan: MorningPlan): PlanItem | null {
  const nowMin = currentTimeMinutes();

  // 固定予定の終了後チェック: 終了から30分以内のイベント
  for (const item of plan.items) {
    if (item.kind !== "fixed" || !item.startTime) continue;
    const endMin = timeToMinutes(item.startTime) + item.durationMin;
    if (nowMin >= endMin && nowMin <= endMin + 30 && !item.completed) {
      return item;
    }
  }

  // 未完了Todoで、開始時刻＋所要時間を過ぎているもの
  for (const item of plan.items) {
    if (item.completed || !item.startTime) continue;
    const expectedEnd = timeToMinutes(item.startTime) + item.durationMin;
    if (nowMin >= expectedEnd && nowMin <= expectedEnd + 60) {
      return item;
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildFollowUpMessage(item: PlanItem): string {
  if (item.kind === "fixed") {
    // 固定予定の後
    return `${item.text}お疲れさま。その後はどう？`;
  }

  // Todo の進捗
  return `${item.text}、終わった？`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フォロー実行記録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * フォローを出した後に呼ぶ（カウントアップ + タイムスタンプ更新）
 */
export function recordFollowUp(): void {
  const throttle = loadFollowUpThrottle();
  saveFollowUpThrottle({
    ...throttle,
    dailyFollowUpCount: throttle.dailyFollowUpCount + 1,
    lastFollowUpAt: new Date().toISOString(),
    consecutiveSkips: 0, // フォロー出した = スキップリセット
  });
}

/**
 * ユーザーがフォローをスキップ（無視 or 閉じた）した時に呼ぶ
 */
export function recordFollowUpSkip(): void {
  const throttle = loadFollowUpThrottle();
  saveFollowUpThrottle({
    ...throttle,
    consecutiveSkips: throttle.consecutiveSkips + 1,
  });
}

/**
 * ユーザーがフォローに応答した時に呼ぶ
 * （完了/途中/やめた いずれでもスキップカウントをリセット）
 */
export function recordFollowUpResponse(): void {
  const throttle = loadFollowUpThrottle();
  saveFollowUpThrottle({
    ...throttle,
    dailyFollowUpCount: throttle.dailyFollowUpCount + 1,
    lastFollowUpAt: new Date().toISOString(),
    consecutiveSkips: 0,
  });
}
