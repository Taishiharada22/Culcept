/**
 * Morning Starter — 入力欄クリック時の先行メッセージ制御
 *
 * ユーザーがAlterの入力欄をクリックした瞬間に、
 * Alterから先に左側バブルで「おはよう。今日はどんな1日にする？」を送る。
 *
 * ルール:
 * - 1日1回のみ
 * - Home表示時は出さない（入力欄クリック時のみ）
 * - 既に会話が進行中でも、その日の starter が未表示なら出す
 * - Morning Protocol への強制ではない（ユーザーが別の話をしてもOK）
 */

import { todayJST, currentHourJST } from "./dateUtils";

const STORAGE_KEY = "alter_morning_starter_v1";

interface StarterState {
  /** 最後に starter を表示した日付（YYYY-MM-DD） */
  lastShownDate: string | null;
}

function loadState(): StarterState {
  if (typeof window === "undefined") return { lastShownDate: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastShownDate: null };
    return JSON.parse(raw) as StarterState;
  } catch {
    return { lastShownDate: null };
  }
}

function saveState(state: StarterState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

/**
 * 入力欄クリック時に starter を表示すべきか判定する。
 *
 * 条件:
 * 1. その日の starter がまだ未表示
 * 2. 朝〜昼の時間帯（5:00〜14:59）
 */
export function shouldShowMorningStarter(): boolean {
  const state = loadState();
  const today = todayJST();

  // 今日既に表示済み
  if (state.lastShownDate === today) return false;

  // 時間帯チェック: 5:00〜14:59 のみ
  const hour = currentHourJST();
  if (hour < 5 || hour >= 15) return false;

  return true;
}

/**
 * starter を表示した後に呼ぶ（その日の表示済みフラグを立てる）
 */
export function markMorningStarterShown(): void {
  saveState({ lastShownDate: todayJST() });
}

/**
 * starter メッセージのテキストを返す。
 */
export function getMorningStarterMessage(): string {
  return "おはよう。今日はどんな1日にする？\nやりたいこと、決まってる予定、なんでも教えて";
}
