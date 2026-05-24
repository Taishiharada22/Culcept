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
 * 意味文 mapping (= category 4 × TimeOfDay 5 = 20 文、 状態描写型、 8b-6 で自然な日本語化)
 *
 * 'other' は entry なし (= getMeaningText で undefined return)
 *
 * 全 20 文の文体ルール遵守 (= CEO + GPT 合議 2026-05-24 8b-6):
 *   - **自然な日本語** (= 「〜時間」 末尾強制 廃止、 硬い 文体を緩和)
 *   - 命令形 0 (= 「ましょう」 「ください」 「しよう」 含まず)
 *   - 評価形容詞 0 (= 「重要な」 「大事な」 「最適な」 「おすすめ」 「推奨」 含まず)
 *   - 状態描写型 (= 場面 / ペース / 質感 を一言で添える)
 *   - 8-22 字 (= 自然な長さ、 厳格上限緩和)
 *
 * 注: 将来 LLM 推論で動的生成も可 (= CEO 「LLM で推論させて作成していい」 明示)、
 *     ただし本 module は deterministic pure fallback として残す (= 8b-6 範囲)
 */
const MEANING_TABLE: Record<
  Exclude<EventCategory, 'other'>,
  Record<TimeOfDay, string>
> = {
  cafe: {
    morning: '静かなカフェで、今日の計画を整理しましょう',
    lunch: 'カフェでひと息ついて、気分を切り替えましょう',
    afternoon: 'カフェタイムで気分をリセットしましょう',
    evening: '夜のカフェで、静かに過ごす時間',
    late_night: '夜更けのカフェで、ゆったりと',
  },
  meal: {
    morning: '朝食をゆっくり、一日のはじまり',
    lunch: '美味しいランチで、リフレッシュしましょう',
    afternoon: '軽くおやつで、ひと休み',
    evening: '夜の食卓で、ゆっくり食事を楽しみましょう',
    late_night: '夜更けの軽い食事で、無理なく',
  },
  work: {
    morning: '朝の集中時間、落ち着いて仕事に取り組みましょう',
    lunch: '午前を区切るランチ前のひととき',
    afternoon: '午後の集中タイム、大切なタスクを進めましょう',
    evening: '一日の仕事を、しっかり締めくくりましょう',
    late_night: '残りを片付けて、無理なく切り上げましょう',
  },
  home: {
    morning: '一日を整える朝、ゆっくり準備をしましょう',
    lunch: '家で少し休んで、午後に備えましょう',
    afternoon: '家でひと息ついて、ペースを取り戻しましょう',
    evening: 'ゆっくり過ごして、明日への活力に',
    late_night: 'ぐっすり休んで、明日に備えましょう',
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 意味文取得 (= public API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * category + startTime から意味文取得 (= deterministic、 pure、 8b-1 base)
 *
 * - 'other' category → undefined (= 判断不能な対象に Alter が解釈を押し付けない)
 * - 'cafe' / 'meal' / 'work' / 'home' → 時刻帯 lookup
 *
 * 注: 8b-7 で getNarrative (5W1H 文章) を主用、 本関数は内部 fallback として残す
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getNarrative (= 8b-7、 5W1H 文章生成、 location / title を含む)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 時刻帯名を日本語に変換 (= 「朝」 「昼」 「午後」 「夜」 「深夜」)
 */
function todToJp(tod: TimeOfDay): string {
  switch (tod) {
    case 'morning': return '朝';
    case 'lunch': return '昼';
    case 'afternoon': return '午後';
    case 'evening': return '夜';
    case 'late_night': return '深夜';
  }
}

/**
 * 5W1H narrative 生成 (= 8b-7 + 8b-8 mock 整合 refactor、 CEO 「自然な日本語、 稚拙さ排除」)
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 8b-8、 mock 文体準拠):
 *   - **mock 文体** (例: 「集中しやすい静かなカフェで、 今日の計画を整理しましょう」)
 *   - 命令形 「ましょう」 「しよう」 **OK** (= 8b-8 で緩和、 mock 通り)
 *   - 短く親しみやすい (= 8b-5 までの 「〜時間」 硬さも、 8b-7 までの 「〜時間帯」 wordy さも避ける)
 *   - location あり: 場所を主役、 mock 整合の柔らかい文
 *   - location なし: MEANING_TABLE の deterministic 文
 *
 * pure (= LLM 不使用、 deterministic、 入力 mutate なし)
 *
 * 将来: LLM 推論で 動的生成も可 (= CEO 「LLM で推論作成していい」 許可済)
 */
export function getNarrative(
  category: EventCategory,
  startTime: string,
  location?: string,
  title?: string,
): string | undefined {
  if (category === 'other') {
    return undefined;
  }
  const tod = getTimeOfDay(startTime);

  // location あり (= 場所を主役、 mock 整合の柔らかい文)
  if (location !== undefined && location.length > 0) {
    switch (category) {
      case 'cafe':
        if (tod === 'morning') return `${location}で、今日の計画を静かに整理しましょう`;
        if (tod === 'lunch') return `${location}でひと息ついて、気分を切り替えましょう`;
        if (tod === 'afternoon') return `${location}で、午後の気分をリセットしましょう`;
        if (tod === 'evening') return `${location}で、夜のひと時を静かに過ごしましょう`;
        return `${location}で、夜更けのひと時を`;
      case 'meal':
        if (tod === 'morning') return `${location}で、朝食をゆっくりとりましょう`;
        if (tod === 'lunch') return `${location}でランチ、半日のリフレッシュに`;
        if (tod === 'afternoon') return `${location}で軽く、おやつのひと休み`;
        if (tod === 'evening') return `${location}で、夜の食卓をゆっくり楽しみましょう`;
        return `${location}で、夜更けの軽食を無理なく`;
      case 'work':
        if (tod === 'morning') return `${location}で、朝の集中時間を活かしましょう`;
        if (tod === 'lunch') return `${location}での仕事、午前の締めくくり`;
        if (tod === 'afternoon') return `${location}で午後の集中タイム、タスクを進めましょう`;
        if (tod === 'evening') return `${location}での仕事を、しっかり締めくくりましょう`;
        return `${location}で残りを片付けて、無理なく切り上げを`;
      case 'home':
        if (tod === 'morning') return `${location}で一日を整え、ゆっくり準備を`;
        if (tod === 'lunch') return `${location}で少し休んで、午後に備えましょう`;
        if (tod === 'afternoon') return `${location}でひと息ついて、ペースを取り戻しましょう`;
        if (tod === 'evening') return `${location}でゆっくり過ごして、明日への活力に`;
        return `${location}でぐっすり休んで、明日に備えましょう`;
    }
  }

  // location なし → MEANING_TABLE の deterministic 文を使う
  return MEANING_TABLE[category][tod];
}
