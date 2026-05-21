/**
 * Phase 2-H: Explicit Place Keywords
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §4.2
 *
 * 役割:
 *   locationText が「明確な施設名 / 店舗名」 を含むかを判定するための keyword list。
 *   含まれていれば IntentType = "explicit_place" として扱い、locationText のみで検索 (既存 Phase 2-D 挙動)。
 *
 * 不変原則:
 *   - keyword は完全保守可能な const として集中、拡張は本 file のみで完結
 *   - 大文字小文字は意識しない (= 含有判定で正規化は呼出側責任、ここは原文 keyword)
 *   - chain 名 / 施設キーワード / 固有名詞っぽい pattern を網羅
 */

export const EXPLICIT_PLACE_KEYWORDS: ReadonlyArray<string> = [
  // === Cafe / coffee chains ===
  "スターバックス",
  "スタバ",
  "ドトール",
  "タリーズ",
  "ベローチェ",
  "コメダ",
  "サンマルク",
  "プロント",

  // === Fast food chains ===
  "マクドナルド",
  "マクド",
  "マック",
  "モスバーガー",
  "モス",
  "ケンタッキー",
  "KFC",
  "サブウェイ",
  "吉野家",
  "すき家",
  "松屋",

  // === Convenience stores ===
  "ファミマ",
  "ファミリーマート",
  "ローソン",
  "セブン",
  "セブンイレブン",
  "ミニストップ",

  // === Medical facilities ===
  "クリニック",
  "医院",
  "歯科",
  "歯医者",
  "病院",
  "総合病院",
  "大学病院",

  // === Beauty / salon ===
  "美容院",
  "美容室",
  "サロン",
  "ヘアサロン",

  // === Transit ===
  "駅",
  "空港",
  "ターミナル",
  "バス停",

  // === Public services ===
  "市役所",
  "区役所",
  "役所",
  "図書館",
  "公民館",

  // === Financial ===
  "銀行",
  "信金",
  "信用金庫",
  "ATM",

  // === Specific store types ===
  "百貨店",
  "デパート",
];
