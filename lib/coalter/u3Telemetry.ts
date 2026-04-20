/**
 * §7 Step A (2026-04-20): U3 exclusion gate telemetry helpers.
 *
 * decideSearch の NO_SEARCH_PATTERNS hit 時に emit する観測点のサポート関数。
 * behavior 非変更。純関数のみ。Step B（flag 下での U3 撤廃）の Go / Rollback
 * 判断材料を蓄積する目的で導入。
 *
 * 設計原則:
 *  - theme-aware: food / movie / travel / activity を横断的に扱える shape
 *    （Step B 横展開時に集計キーが途中で変わらないようにする）
 *  - PII 配慮: 原文再現ではなく観測性が目的。matched_terms を優先、
 *    matched_text_sample は短縮 + マスク
 */

import type { ConversationAnalysis, ConversationTheme } from "./types";

export interface ActionableBreakdown {
  has_location: boolean;
  has_time: boolean;
  has_target: boolean;
  has_preference: boolean;
}

/**
 * Theme ごとの「target signal（検索価値を生む具体性）」検出パターン。
 *
 * - food:     料理ジャンル / 店舗種別
 * - movie:    作品ジャンル / 映画語彙
 * - travel:   観光地 / 体験種別
 * - activity: アクティビティ種別
 *
 * schedule / gift / general は SEARCH_REQUIRED_THEMES に含まれないため
 * U3 分岐を通らず telemetry も emit されない（念のため null）。
 */
const TARGET_PATTERNS: Record<ConversationTheme, RegExp | null> = {
  food: /ラーメン|寿司|焼肉|イタリアン|フレンチ|中華|和食|カフェ|居酒屋|パスタ|ピザ|そば|うどん|韓国料理|タイ料理|ビストロ|焼鳥|串|丼|定食/,
  movie: /映画|作品|アクション|恋愛|コメディ|ホラー|SF|アニメ|ドキュメンタリー|邦画|洋画|上映/,
  travel: /観光|温泉|海|山|神社|寺|絶景|世界遺産|リゾート|モデルコース|名所/,
  activity:
    /美術館|博物館|水族館|動物園|ライブ|コンサート|舞台|演劇|遊園地|テーマパーク|ボウリング|スポーツ|カラオケ/,
  schedule: null,
  gift: null,
  general: null,
};

/**
 * Theme-aware actionable constraints check.
 *
 * 判定ルール（theme ごとに actionable の意味は異なる）:
 *  - food:     location / time / target のいずれか
 *  - movie:    target / (location + time)
 *  - travel:   location / (target + time)
 *  - activity: location / target
 *  - その他:    location / time
 */
export function hasActionableConstraintsByTheme(
  analysis: ConversationAnalysis,
  theme: ConversationTheme,
): { hasActionable: boolean; breakdown: ActionableBreakdown } {
  const c = analysis.extractedConstraints;
  const prefs = c.preferences ?? [];
  const messagesText = (analysis.recentMessages ?? [])
    .map((m) => m.body)
    .join(" ");
  const searchSpace = `${prefs.join(" ")} ${messagesText}`;
  const targetPattern = TARGET_PATTERNS[theme];

  const has_location = !!c.location;
  const has_time = !!c.date || !!c.timeSlot;
  const has_target = targetPattern ? targetPattern.test(searchSpace) : false;
  const has_preference = prefs.length > 0;

  let hasActionable = false;
  switch (theme) {
    case "food":
      hasActionable = has_location || has_time || has_target;
      break;
    case "movie":
      hasActionable = has_target || (has_location && has_time);
      break;
    case "travel":
      hasActionable = has_location || (has_target && has_time);
      break;
    case "activity":
      hasActionable = has_location || has_target;
      break;
    default:
      hasActionable = has_location || has_time;
  }

  return {
    hasActionable,
    breakdown: { has_location, has_time, has_target, has_preference },
  };
}

/**
 * 正規表現の alternation から hit した literal 語のみ抽出する。
 *
 * NO_SEARCH_PATTERNS は `/気持ち|感情|気分/` の単純 alternation を想定。
 * character class / quantifier / escape を含む複雑構造が来た場合は、
 * 誤抽出を避けるため空配列を返す（安全側）。
 */
export function extractMatchedTerms(pattern: RegExp, text: string): string[] {
  const source = pattern.source;
  if (/[[\](){}+*?\\^$.]/.test(source)) {
    return [];
  }
  const terms = source.split("|").filter((t) => t.length > 0);
  return terms.filter((t) => text.includes(t));
}

/**
 * テキストを短縮し、PII 様式（email / URL / 長い数字列）をマスクする。
 *
 * Step A の matched_text_sample 用。原文再現は不要で、
 * パターンと文脈の雰囲気が分かれば十分。
 */
export function maskSensitiveText(text: string, maxLen = 32): string {
  if (!text) return "";
  return text
    .slice(0, maxLen)
    .replace(/[\w.+-]+@[\w.-]+\.[\w.-]+/g, "[EMAIL]")
    .replace(/https?:\/\/\S+/g, "[URL]")
    .replace(/\d{4,}/g, "[NUM]");
}
