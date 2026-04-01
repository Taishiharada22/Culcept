// lib/stargazer/microEMA.ts
// Micro-EMA (Ecological Momentary Assessment) — 瞬間的状態観測
// 心理学的根拠: ESM/EMA研究 — リアルタイムの状態変動から特性を推定
// 1日複数回の3秒マイクロ観測で日内変動パターンを捕捉する

import type { TraitAxisKey } from "./traitAxes";

const STORAGE_KEY = "stargazer_micro_ema_v1";
const LAST_PROMPT_KEY = "stargazer_micro_ema_last_prompt";

// Module-level guard: survives Fast Refresh / HMR (module not re-evaluated),
// but resets on full page reload (module re-evaluated).
// This prevents multiple timer callbacks from all returning true.
let _sessionChecked = false;

export interface MicroEMAEntry {
  id: string;
  timestamp: string;
  axis: TraitAxisKey;
  score: number; // -1 to +1
  context: {
    timeOfDay: "morning" | "afternoon" | "evening" | "night";
    dayOfWeek: number; // 0-6
  };
}

export interface MicroEMAQuestion {
  axis: TraitAxisKey;
  question: string;
  leftLabel: string;
  rightLabel: string;
}

// Questions targeting the most dynamic axes (state-sensitive, not stable traits)
const MICRO_QUESTIONS: MicroEMAQuestion[] = [
  { axis: "stress_isolation_vs_social", question: "今、一人でいたい？それとも誰かといたい？", leftLabel: "一人がいい", rightLabel: "誰かといたい" },
  { axis: "cautious_vs_bold", question: "今、新しいことに挑戦したい気分？", leftLabel: "安全でいたい", rightLabel: "挑戦したい" },
  { axis: "analytical_vs_intuitive", question: "今、頭で考えている？それとも感覚で動いている？", leftLabel: "頭で考え中", rightLabel: "感覚で動き中" },
  { axis: "emotional_variability", question: "今の感情はどれくらい安定している？", leftLabel: "穏やか", rightLabel: "揺れている" },
  { axis: "plan_vs_spontaneous", question: "今日の残り、計画通りに過ごしたい？", leftLabel: "計画通りに", rightLabel: "流れに任せる" },
  { axis: "introvert_vs_extrovert", question: "今のエネルギーレベルは？", leftLabel: "内側に向いている", rightLabel: "外側に向いている" },
  { axis: "function_vs_expression", question: "今、効率を重視している？それとも表現を重視？", leftLabel: "効率重視", rightLabel: "表現重視" },
  { axis: "rumination_tendency", question: "今、頭の中で何かがループしている？", leftLabel: "スッキリ", rightLabel: "ぐるぐる考え中" },
  { axis: "change_embrace_vs_resist", question: "今、変化を受け入れやすい気分？", leftLabel: "変化したい", rightLabel: "このままがいい" },
  { axis: "reassurance_need", question: "今、誰かに「大丈夫」と言ってほしい？", leftLabel: "必要ない", rightLabel: "言ってほしい" },
];

function getTimeOfDay(): MicroEMAEntry["context"]["timeOfDay"] {
  const h = new Date().getHours();
  if (h < 11) return "morning";
  if (h < 15) return "afternoon";
  if (h < 20) return "evening";
  return "night";
}

/**
 * Check if a Micro-EMA prompt should be shown AND atomically mark it as shown.
 * Returns true at most once per qualifying window (max 2/day, min 4h apart).
 * Uses a module-level guard to ensure only ONE call per page session returns true,
 * preventing Fast Refresh / HMR / React Strict Mode double-mount from showing
 * the prompt multiple times.
 */
export function shouldPromptAndMark(): boolean {
  // Module-level dedup: if already checked this page session, return false.
  // This prevents Fast Refresh / HMR from triggering multiple prompts.
  if (_sessionChecked) {
    return false;
  }
  _sessionChecked = true;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(LAST_PROMPT_KEY);
    if (!raw) {
      // First ever prompt — mark immediately
      localStorage.setItem(LAST_PROMPT_KEY, JSON.stringify({
        timestamp: new Date().toISOString(),
        countToday: 0,
        shownToday: 1,
        date: today,
      }));
      return true;
    }
    const last = JSON.parse(raw) as {
      timestamp: string; countToday: number; date: string; shownToday?: number;
    };
    const isNewDay = last.date !== today;
    const shownToday = isNewDay ? 0 : (last.shownToday ?? last.countToday ?? 0);
    // Max 2 shows per day
    if (shownToday >= 2) {
      return false;
    }
    // At least 4 hours apart (skip check on new day)
    if (!isNewDay) {
      const hoursSince = (Date.now() - new Date(last.timestamp).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 4) {
        return false;
      }
    }
    // All checks passed — atomically increment shownToday
    localStorage.setItem(LAST_PROMPT_KEY, JSON.stringify({
      timestamp: new Date().toISOString(),
      countToday: isNewDay ? 0 : (last.countToday ?? 0),
      shownToday: shownToday + 1,
      date: today,
    }));
    return true;
  } catch {
    return false; // fail-closed: don't show on error
  }
}

/** @deprecated Use shouldPromptAndMark() instead. Kept for backward compat. */
export function shouldPrompt(): boolean {
  return shouldPromptAndMark();
}

/** @deprecated No longer needed — shouldPromptAndMark() handles this atomically. */
export function markPromptShown(): void {
  // no-op: shownToday is now incremented inside shouldPromptAndMark()
}

/** Get a random question for the current context */
export function getNextQuestion(): MicroEMAQuestion {
  const seed = Date.now() % MICRO_QUESTIONS.length;
  return MICRO_QUESTIONS[seed];
}

/** Record a micro-EMA response */
export function recordResponse(axis: TraitAxisKey, score: number): void {
  try {
    const entries: MicroEMAEntry[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    entries.push({
      id: `ema_${Date.now()}`,
      timestamp: new Date().toISOString(),
      axis,
      score,
      context: {
        timeOfDay: getTimeOfDay(),
        dayOfWeek: new Date().getDay(),
      },
    });
    // Keep last 200 entries
    if (entries.length > 200) entries.splice(0, entries.length - 200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

    // Update prompt tracking — preserve shownToday
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(LAST_PROMPT_KEY);
    const last = raw ? JSON.parse(raw) : { countToday: 0, shownToday: 0, date: "" };
    const isNewDay = last.date !== today;
    localStorage.setItem(LAST_PROMPT_KEY, JSON.stringify({
      timestamp: new Date().toISOString(),
      countToday: isNewDay ? 1 : (last.countToday ?? 0) + 1,
      shownToday: isNewDay ? (last.shownToday ?? 0) : (last.shownToday ?? last.countToday ?? 0),
      date: today,
    }));
  } catch {}
}

/** Get all entries for analysis */
export function getEntries(): MicroEMAEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export { MICRO_QUESTIONS };
