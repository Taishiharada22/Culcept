/**
 * Phase 3-N List impl sub-phase 8b-1 — CategoryMeaning pure module
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 + Aneurasync 哲学整合):
 *   - 各 event の **意味文** (= alterNote) を category + 時刻帯 から deterministic 生成
 *   - **truth 源は Alter 由来観測 / 解釈** として明示 (= adapter ではなく別 module 経由、 GPT 「truth なき semantics 捏造禁止」 と整合)
 *   - pure module (= LLM / API / DB / network 不使用、 純粋関数のみ)
 *
 * 文体方針 (= Aneurasync 哲学、 観測 / 解釈、 押し付けない):
 *   - **状態 / 解釈型** (= 「整える時間」 / 「切り替える時間」 等)
 *   - **命令形 0** (= 「ましょう」 / 「ください」 禁止)
 *   - **評価形容詞 0** (= 「重要な」 / 「大事な」 / 「最適」 等禁止)
 *   - **末尾「時間」 統一** (= 視覚 / 文体の一貫性)
 *   - **8-18 字** (= CEO + GPT 合議で緩和、 自然な長さ許容)
 *   - **'other' は undefined return** (= 判断不能な対象に Alter が解釈を押し付けない)
 *
 * 時刻帯 (= 標準的な日本人生活時間帯):
 *   - 朝 (morning): [5:00, 11:00)
 *   - 昼 (lunch): [11:00, 14:00)
 *   - 午後 (afternoon): [14:00, 18:00)
 *   - 夜 (evening): [18:00, 23:00)
 *   - 深夜 (late_night): [23:00, 24:00) ∪ [0:00, 5:00)
 *
 * 設計書:
 *   - decision-log (= sub-phase 8b redefine + meaning text 文体方針確定)
 *   - lib/plan/list/types.ts (= EventCategory)
 *   - lib/plan/list/adapters/externalAnchorAdapter.ts (= 8b-2 で本 module を呼出 alterNote 注入)
 */

import { type EventCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimeOfDay 型 + 時刻帯判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻帯 (= 5 種、 標準的な日本人生活時間帯)
 */
export type TimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'evening' | 'late_night';

/**
 * "HH:MM" 形式 startTime から時刻帯を判定 (= deterministic、 pure)
 *
 * 入力が不正 (= 数値抽出不可) なら 'morning' fallback (= 8a 最小、 厳格 validation は将来)
 */
export function getTimeOfDay(startTime: string): TimeOfDay {
  const hourStr = startTime.slice(0, 2);
  const hour = Number.parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return 'morning';
  }
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  // 23-24 or 0-5
  return 'late_night';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 意味文 mapping table (= category × 時刻帯)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 意味文 mapping (= category 4 × TimeOfDay 5 = 20 文、 全 8-18 字、 状態/解釈型)
 *
 * 'other' は entry なし (= getMeaningText で undefined return)
 *
 * 全 20 文の文体ルール遵守:
 *   - 命令形 0 (= 「ましょう」 「ください」 「しよう」 含まず)
 *   - 評価形容詞 0 (= 「重要な」 「大事な」 「最適な」 含まず)
 *   - 末尾「時間」 / 「タイム」 統一
 *   - 8-18 字
 */
const MEANING_TABLE: Record<
  Exclude<EventCategory, 'other'>,
  Record<TimeOfDay, string>
> = {
  cafe: {
    morning: '集中しやすい時間',
    lunch: 'ひと息ついて過ごす時間',
    afternoon: '気持ちを切り替える時間',
    evening: '静かに過ごす時間',
    late_night: '静かに過ごす時間',
  },
  meal: {
    morning: '朝食をゆっくりとる時間',
    lunch: 'ランチで切り替える時間',
    afternoon: '軽くお腹を満たす時間',
    evening: 'ゆっくり食べる時間',
    late_night: '軽く済ませる時間',
  },
  work: {
    morning: '集中しやすい時間',
    lunch: '区切りをつける時間',
    afternoon: '午後の集中タイム',
    evening: '仕事を切り上げる時間',
    late_night: '仕事を切り上げる時間',
  },
  home: {
    morning: '一日を整える時間',
    lunch: '家で休憩を取る時間',
    afternoon: 'ひと息ついて過ごす時間',
    evening: '自分の余白に戻る時間',
    late_night: 'ゆっくり休む時間',
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 意味文取得 (= public API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * category + startTime から意味文取得 (= deterministic、 pure)
 *
 * - 'other' category → undefined (= 判断不能な対象に Alter が解釈を押し付けない)
 * - 'cafe' / 'meal' / 'work' / 'home' → 時刻帯 lookup
 */
export function getMeaningText(
  category: EventCategory,
  startTime: string,
): string | undefined {
  if (category === 'other') {
    return undefined;
  }
  const tod = getTimeOfDay(startTime);
  return MEANING_TABLE[category][tod];
}
