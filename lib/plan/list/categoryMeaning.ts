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
    morning: '集中の入り口にちょうどいい朝',
    lunch: '気持ちが少し緩むひととき',
    afternoon: 'ペースを取り戻す午後',
    evening: '夜にひと息つくひととき',
    late_night: '夜更けの静かなひととき',
  },
  meal: {
    morning: '朝をはじめる食卓',
    lunch: '半日を区切るランチ',
    afternoon: '軽くお腹を満たすひと品',
    evening: '夜のゆっくりした食卓',
    late_night: '夜更けの軽い食事',
  },
  work: {
    morning: '朝の集中が乗りやすい仕事',
    lunch: '午前を区切るお昼',
    afternoon: '午後の仕事を進める',
    evening: '仕事を締めにいく時間帯',
    late_night: '残作業を片付ける時間帯',
  },
  home: {
    morning: '一日のスタートを整える朝',
    lunch: '家で少しゆっくり休む昼',
    afternoon: '家でひと息つく午後',
    evening: '自分の余白に戻る夜',
    late_night: 'ゆっくり休みに入る夜更け',
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
 * 5W1H narrative 生成 (= 8b-7 追加、 CEO 「自然な日本語、 5W1H 意識」)
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 8b-7):
 *   - **場所 (where)** + **環境** + **何を (what)** + **いつ (when)** を一文に組み込む
 *   - 例: 「集中しやすい静かなカフェで今日の計画を整理しましょう」 (= mock 整合)
 *   - location あり: 場所を主役にした自然な文
 *   - location なし: 時刻帯 + category 主体の自然な文
 *   - 'other' category: undefined (= 判断不能、 押し付けない)
 *
 * 文体 (= Aneurasync 哲学整合):
 *   - 命令形 0
 *   - 評価形容詞 0 (= 「重要」 「最適」 等)
 *   - 状態 / 動作描写、 自然な日本語
 *
 * pure (= LLM / API 不使用、 deterministic template、 入力 mutate なし)
 *
 * 将来: LLM 接続版に拡張可 (= CEO 「LLM で推論作成していい」 許可済)、 ただし pure fallback を残す
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
  const todJp = todToJp(tod);

  // location あり (= 場所を主役に、 自然な文章)
  if (location !== undefined && location.length > 0) {
    switch (category) {
      case 'cafe':
        if (tod === 'morning') return `${todJp}の${location}で、 一日の計画を静かに整える時間`;
        if (tod === 'lunch') return `${todJp}の${location}で、 ひと息ついて気持ちを緩める時間`;
        if (tod === 'afternoon') return `${location}で、 午後のペースを取り戻す時間`;
        if (tod === 'evening') return `${todJp}の${location}で、 静かに過ごす時間`;
        return `${location}で、 深夜の静かなひとときを過ごす`;
      case 'meal':
        if (tod === 'morning') return `${location}で、 朝を始める食卓を囲む`;
        if (tod === 'lunch') return `${location}で、 半日を区切るランチをとる`;
        if (tod === 'afternoon') return `${location}で、 軽くお腹を満たすひと品を楽しむ`;
        if (tod === 'evening') return `${todJp}の${location}で、 ゆっくり食卓を囲む`;
        return `${location}で、 夜更けに軽い食事をとる`;
      case 'work':
        if (tod === 'morning') return `${location}で、 朝の集中が乗りやすい時間に仕事を進める`;
        if (tod === 'lunch') return `${location}で、 午前を区切る時間帯`;
        if (tod === 'afternoon') return `${location}で、 午後の仕事を着実に進める`;
        if (tod === 'evening') return `${location}で、 仕事を締めにいく時間帯`;
        return `${location}で、 残作業を片付ける時間帯`;
      case 'home':
        if (tod === 'morning') return `${location}で、 一日のスタートを整える朝`;
        if (tod === 'lunch') return `${location}で、 少しゆっくりと休む昼`;
        if (tod === 'afternoon') return `${location}で、 午後にひと息つく時間`;
        if (tod === 'evening') return `${location}に戻り、 自分の余白を取り戻す夜`;
        return `${location}で、 深夜にゆっくり休みに入る`;
    }
  }

  // location なし (= 時刻帯 + category 主体の自然な文)
  switch (category) {
    case 'cafe':
      if (tod === 'morning') return '集中しやすい静かな朝のひととき';
      if (tod === 'lunch') return '気持ちを少し緩めるカフェタイム';
      if (tod === 'afternoon') return '午後のペースを取り戻すひととき';
      if (tod === 'evening') return '夜にひと息つくカフェタイム';
      return '深夜の静かなひとときを過ごす';
    case 'meal':
      if (tod === 'morning') return '朝を始める食卓を囲む';
      if (tod === 'lunch') return '半日を区切るランチをとる';
      if (tod === 'afternoon') return '軽くお腹を満たすひと品を楽しむ';
      if (tod === 'evening') return '夜のゆっくりした食卓を囲む';
      return '夜更けに軽い食事をとる';
    case 'work':
      if (tod === 'morning') return '朝の集中が乗りやすい時間に仕事を進める';
      if (tod === 'lunch') return '午前を区切るお昼の時間';
      if (tod === 'afternoon') return '午後の仕事を着実に進める時間';
      if (tod === 'evening') return '仕事を締めにいく時間帯';
      return '残作業を片付ける時間帯';
    case 'home':
      if (tod === 'morning') return '一日のスタートを整える朝の時間';
      if (tod === 'lunch') return '少しゆっくりと休む昼';
      if (tod === 'afternoon') return '午後にひと息つく時間';
      if (tod === 'evening') return '自分の余白を取り戻す夜';
      return '深夜にゆっくり休みに入る';
  }
}
