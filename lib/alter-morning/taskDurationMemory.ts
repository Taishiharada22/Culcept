/**
 * TaskDurationMemory — タスク所要時間のパーソナライズ学習
 *
 * - 初回: カテゴリ別デフォルト値で仮置き
 * - ユーザーが修正 → 学習して次回以降反映
 * - 「前回は90分で組んでたからそのまま入れといたよ」的な hint を生成
 */

import {
  DEFAULT_DURATION_MAP,
  type DurationPattern,
  type TaskDurationStore,
} from "./types";

const STORAGE_KEY = "alter_morning_task_duration_v1";
const CURRENT_VERSION = 1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Load / Save
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function loadDurationStore(): TaskDurationStore {
  if (typeof window === "undefined") {
    return { patterns: {}, version: CURRENT_VERSION, updatedAt: new Date().toISOString() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { patterns: {}, version: CURRENT_VERSION, updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as TaskDurationStore;
    if (parsed.version !== CURRENT_VERSION) {
      return { patterns: {}, version: CURRENT_VERSION, updatedAt: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { patterns: {}, version: CURRENT_VERSION, updatedAt: new Date().toISOString() };
  }
}

export function saveDurationStore(store: TaskDurationStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage full — 静かに失敗
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// キーワード正規化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * タスクテキストから正規化されたキーワードを抽出する。
 * 「資料作り」→「資料」、「英語の勉強」→「英語」等。
 */
export function normalizeTaskKeyword(text: string): string {
  const cleaned = text
    .replace(/[をのにはがでと、。！？\s]/g, " ")
    .trim()
    .toLowerCase();

  // DEFAULT_DURATION_MAP のキーと部分一致を探す
  for (const key of Object.keys(DEFAULT_DURATION_MAP)) {
    if (key === "_default") continue;
    if (cleaned.includes(key)) return key;
  }

  // 学習済みパターンとも照合するため、先頭の意味のある語を返す
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words[0] || cleaned;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 所要時間の推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DurationEstimate {
  /** 推定時間（分） */
  minutes: number;
  /** 推定の根拠 */
  source: "learned" | "default" | "fallback";
  /** パーソナライズヒント（UI表示用） */
  hint?: string;
}

/**
 * タスクテキストから所要時間を推定する。
 * 学習済み > カテゴリデフォルト > フォールバック の優先順。
 */
export function estimateDuration(
  text: string,
  store: TaskDurationStore
): DurationEstimate {
  const keyword = normalizeTaskKeyword(text);

  // 1. 学習済みパターンを確認
  const learned = store.patterns[keyword];
  if (learned && learned.count >= 1) {
    return {
      minutes: Math.round(learned.lastDuration),
      source: "learned",
      hint: `前回は${learned.lastDuration}分で組んでたから、そのまま入れといたよ`,
    };
  }

  // 2. カテゴリデフォルト
  const defaultMin = DEFAULT_DURATION_MAP[keyword];
  if (defaultMin !== undefined) {
    return { minutes: defaultMin, source: "default" };
  }

  // 3. フォールバック
  return {
    minutes: DEFAULT_DURATION_MAP._default,
    source: "fallback",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 学習（ユーザーが時間を修正した時に呼ぶ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーがタスクの所要時間を修正した時に呼び出す。
 * 次回以降、同じキーワードに対して学習した値を使う。
 */
export function learnDuration(
  text: string,
  actualMinutes: number,
  store: TaskDurationStore
): TaskDurationStore {
  const keyword = normalizeTaskKeyword(text);
  const existing = store.patterns[keyword];

  const newPattern: DurationPattern = existing
    ? {
        lastDuration: actualMinutes,
        count: existing.count + 1,
        avgDuration: Math.round(
          (existing.avgDuration * existing.count + actualMinutes) /
            (existing.count + 1)
        ),
      }
    : {
        lastDuration: actualMinutes,
        count: 1,
        avgDuration: actualMinutes,
      };

  return {
    ...store,
    patterns: { ...store.patterns, [keyword]: newPattern },
    updatedAt: new Date().toISOString(),
  };
}
