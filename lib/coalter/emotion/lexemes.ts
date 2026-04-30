/**
 * CoAlter Bug-1 §4.3 — EMOTION_TAG_LEXEMES（正本）
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.3
 *
 * 位置づけ:
 * - 旧 `lib/coalter/webConnector.ts:82` `NO_SEARCH_PATTERNS` の後継正本。
 *   旧名は「検索しない根拠」を意味論的に含意していたが、実体は感情タグの語彙。
 *   Phase 1 で `EMOTION_TAG_LEXEMES` に正本名切替（§4.3 / §6.3）。
 *
 * 構造:
 * - category → { lexemes: 語彙リスト, polarity: カテゴリ極性 }
 * - polarity は §4.3 語彙表通りカテゴリ単位で定義（mood / indecision / relation = neutral,
 *   friction = negative）。polarity は hard filter 用途ではなく narration 用（§5.1）。
 *
 * Phase 1 の責務範囲:
 * - 本ファイルは新規追加のみ。既存コード（webConnector / conversationParser / engine）
 *   からの参照は Phase 3 で接続する。Phase 1 時点では dead asset。
 */

import type { EmotionCategory, EmotionPolarity } from "./types";

export interface EmotionLexemeCategory {
  readonly lexemes: readonly string[];
  readonly polarity: EmotionPolarity;
}

export const EMOTION_TAG_LEXEMES: Readonly<
  Record<EmotionCategory, EmotionLexemeCategory>
> = {
  mood: {
    lexemes: ["気持ち", "気分", "感情", "心境", "気分が乗らない"],
    polarity: "neutral",
  },
  indecision: {
    lexemes: ["迷う", "迷い", "分からない", "どっちも", "どっちでもいい"],
    polarity: "neutral",
  },
  relation: {
    lexemes: ["関係", "仲", "距離感", "距離", "付き合い方"],
    polarity: "neutral",
  },
  friction: {
    lexemes: ["すれ違い", "誤解", "喧嘩", "ぎくしゃく", "気まずい"],
    polarity: "negative",
  },
} as const;
