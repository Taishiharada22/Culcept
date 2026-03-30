// lib/ui/sectionCompletionGate.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section Completion Gate — Duolingo的「一本道」完了抑制
//
// 完了したセクションを折りたたみ/グレーアウトし、
// 「何をすべきか分からない」問題を解消する。
//
// Duolingo: 完了レッスンはグレーアウト、次のレッスンだけがアクティブ
// Aneurasync: 今日の観測完了後 → 観測セクション抑制、次の推奨アクションだけ強調
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SectionKey = "today" | "star" | "connect" | "deepen";

export type SectionState = "active" | "completed" | "locked" | "collapsed";

export interface SectionGateState {
  /** 各セクションの状態 */
  sections: Record<SectionKey, SectionState>;
  /** 今日の観測完了時刻 */
  observationCompletedAt: string | null;
  /** 次の観測可能時刻（8時間後） */
  nextObservationAvailableAt: string | null;
  /** 今日は全て完了か */
  allDoneForToday: boolean;
}

const GATE_KEY = "aneurasync_section_gate_v1";
const COOLDOWN_HOURS = 8;

/**
 * 今日の日付キー
 */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 保存された完了状態を読み込み
 */
export function loadGateState(): SectionGateState {
  if (typeof window === "undefined") {
    return getDefaultGateState();
  }
  try {
    const raw = localStorage.getItem(GATE_KEY);
    if (!raw) return getDefaultGateState();
    const stored = JSON.parse(raw);
    // 日付が変わっていたらリセット
    if (stored.date !== todayKey()) {
      return getDefaultGateState();
    }
    return stored.state;
  } catch {
    return getDefaultGateState();
  }
}

/**
 * 完了状態を保存
 */
function saveGateState(state: SectionGateState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GATE_KEY, JSON.stringify({ date: todayKey(), state }));
  } catch {}
}

function getDefaultGateState(): SectionGateState {
  return {
    sections: { today: "active", star: "active", connect: "active", deepen: "active" },
    observationCompletedAt: null,
    nextObservationAvailableAt: null,
    allDoneForToday: false,
  };
}

/**
 * 観測完了を記録
 * → 観測セクションをcompletedにし、8時間クールダウンを設定
 */
export function markObservationComplete(): SectionGateState {
  const state = loadGateState();
  const now = new Date();
  const nextAvailable = new Date(now.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);

  state.sections.star = "completed";
  state.sections.today = "collapsed";
  state.observationCompletedAt = now.toISOString();
  state.nextObservationAvailableAt = nextAvailable.toISOString();

  // 観測完了 = 今日のメインタスク完了
  state.allDoneForToday = true;

  saveGateState(state);
  return state;
}

/**
 * クールダウンが終了したかチェック
 */
export function isObservationAvailable(): boolean {
  const state = loadGateState();
  if (!state.nextObservationAvailableAt) return true;
  return new Date() >= new Date(state.nextObservationAvailableAt);
}

/**
 * 残りクールダウン時間を取得
 */
export function getCooldownRemaining(): { hours: number; minutes: number } | null {
  const state = loadGateState();
  if (!state.nextObservationAvailableAt) return null;
  const remaining = new Date(state.nextObservationAvailableAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  return {
    hours: Math.floor(remaining / (60 * 60 * 1000)),
    minutes: Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000)),
  };
}

/**
 * セクションのスタイル情報を取得
 */
export function getSectionStyle(section: SectionKey): {
  opacity: number;
  pointerEvents: "auto" | "none";
  badge: string | null;
  collapsed: boolean;
} {
  const state = loadGateState();
  const sectionState = state.sections[section];

  switch (sectionState) {
    case "completed":
      return { opacity: 0.45, pointerEvents: "none", badge: "✅ 完了", collapsed: false };
    case "collapsed":
      return { opacity: 0.6, pointerEvents: "auto", badge: null, collapsed: true };
    case "locked": {
      const cd = getCooldownRemaining();
      return {
        opacity: 0.3,
        pointerEvents: "none",
        badge: cd ? `🔒 ${cd.hours}h ${cd.minutes}m` : "🔒",
        collapsed: false,
      };
    }
    default:
      return { opacity: 1, pointerEvents: "auto", badge: null, collapsed: false };
  }
}
