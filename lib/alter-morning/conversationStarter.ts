/**
 * Conversation Starter — 入力欄クリック時の先行メッセージ制御
 *
 * ユーザーがAlterの入力欄をクリックした瞬間に、
 * Alterから先に左側バブルで時間帯に応じたメッセージを1通送る。
 *
 * 4時間帯:
 * - morning  (5:00-11:59)  → 予定整理 or 進捗
 * - afternoon(12:00-16:59) → 予定整理(未確定) or 進捗(確定済み)
 * - evening  (17:00-22:59) → ジャーナル誘導
 * - night    (23:00-4:59)  → 軽い締め（質問なし）
 *
 * プラン状態:
 * - none:        予定未開始 → 予定整理starter
 * - in_progress: 途中離脱 → 前回文脈を引いて聞き直す
 * - confirmed:   予定確定 → 進捗/ジャーナル/締めに切り替え
 *
 * ルール:
 * - 各時間帯で1回のみ
 * - Home表示時は出さない（入力欄クリック時のみ）
 * - 14:59まで予定未確定なら15:00以降は予定starterの効力なし
 */

import { todayJST, currentHourJST } from "./dateUtils";
import type { PlanItem, PlanItemKind } from "./types";

const STORAGE_KEY = "alter_conversation_starter_v2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間帯
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "night"; // 23:00-4:59
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PlanStatus = "none" | "in_progress" | "confirmed";

export interface StarterState {
  /** 今日の日付（日付変更でリセット） */
  date: string;
  /** 各時間帯で表示済みか */
  shownSlots: TimeSlot[];
  /** プラン状態 */
  planStatus: PlanStatus;
  /** 途中離脱時のアイテム（前回文脈復帰用） */
  partialItems: Array<{ text: string; kind: PlanItemKind; startTime?: string }>;
}

function emptyState(): StarterState {
  return {
    date: todayJST(),
    shownSlots: [],
    planStatus: "none",
    partialItems: [],
  };
}

export function loadStarterState(): StarterState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as StarterState;
    // 日付が変わったらリセット
    if (parsed.date !== todayJST()) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function saveStarterState(state: StarterState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン状態の更新（外部から呼ばれる）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランが確定した時に呼ぶ。
 */
export function markPlanConfirmed(): void {
  const state = loadStarterState();
  saveStarterState({ ...state, planStatus: "confirmed", partialItems: [] });
}

/**
 * プラン作成中（途中状態）のアイテムを保存する。
 * アプリを閉じても次回復帰できるようにする。
 */
export function savePartialItems(items: PlanItem[]): void {
  const state = loadStarterState();
  saveStarterState({
    ...state,
    planStatus: "in_progress",
    partialItems: items.map((i) => ({
      text: i.text,
      kind: i.kind,
      startTime: i.startTime,
    })),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Starter 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StarterDecision {
  /** starterを出すか */
  shouldShow: boolean;
  /** メッセージ内容 */
  message: string;
  /** 現在の時間帯 */
  slot: TimeSlot;
  /** プラン状態 */
  planStatus: PlanStatus;
}

/**
 * 入力欄クリック時に starter を出すべきか判定し、メッセージを返す。
 */
export function getStarterDecision(): StarterDecision {
  const state = loadStarterState();
  const hour = currentHourJST();
  const slot = getTimeSlot(hour);

  const noShow: StarterDecision = {
    shouldShow: false,
    message: "",
    slot,
    planStatus: state.planStatus,
  };

  // この時間帯で既に表示済み — ただし in_progress（途中離脱）の場合は再表示を許可
  if (state.shownSlots.includes(slot) && state.planStatus !== "in_progress") return noShow;

  // メッセージを構築
  const message = buildStarterMessage(slot, state, hour);
  if (!message) return noShow;

  return {
    shouldShow: true,
    message,
    slot,
    planStatus: state.planStatus,
  };
}

/**
 * starter を表示した後に呼ぶ。
 */
export function markStarterShown(slot: TimeSlot): void {
  const state = loadStarterState();
  saveStarterState({
    ...state,
    shownSlots: [...state.shownSlots, slot],
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildStarterMessage(
  slot: TimeSlot,
  state: StarterState,
  hour: number
): string | null {
  switch (slot) {
    case "morning":
      return buildMorningMessage(state, hour);
    case "afternoon":
      return buildAfternoonMessage(state);
    case "evening":
      return buildEveningMessage(state);
    case "night":
      return buildNightMessage(state);
  }
}

function buildMorningMessage(state: StarterState, hour: number): string {
  const greeting = hour < 10 ? "おはよう。" : "おはよう。";

  switch (state.planStatus) {
    case "none":
      return `${greeting}今日はどんな1日にする？\nやりたいこと、決まってる予定、なんでも教えて`;
    case "in_progress": {
      const itemsSummary = state.partialItems
        .map((i) => i.text)
        .join("、");
      if (itemsSummary) {
        return `${greeting}さっき${itemsSummary}って聞いたけど、他にも何かある？`;
      }
      return `${greeting}さっきの続きだけど、今日の予定もう少し教えて`;
    }
    case "confirmed":
      // 予定確定済み → morning slotでは出さない（afternoonで進捗確認）
      return `${greeting}今日のプランもう決まってるね。何か気になることある？`;
  }
}

function buildAfternoonMessage(state: StarterState): string {
  switch (state.planStatus) {
    case "none":
      // 14:59まで予定未確定→15:00以降はplanの効力なし
      return "こんにちは。午後の予定はもう決まってる？";
    case "in_progress": {
      const itemsSummary = state.partialItems
        .map((i) => i.text)
        .join("、");
      if (itemsSummary) {
        return `さっき${itemsSummary}って聞いたけど、午後は他にも何かある？`;
      }
      return "さっきの続きだけど、午後の予定はどんな感じ？";
    }
    case "confirmed":
      return "午後の調子はどう？ プランの進み具合、教えて";
  }
}

function buildEveningMessage(state: StarterState): string {
  switch (state.planStatus) {
    case "confirmed":
      return "今日もお疲れさま。プランの振り返り、記録しておく？";
    default:
      return "今日もお疲れさま。記録残しておく？";
  }
}

function buildNightMessage(_state: StarterState): string {
  // 深夜は軽い締めのみ。追加質問なし。
  return "お疲れさま。ゆっくり休んでね";
}
