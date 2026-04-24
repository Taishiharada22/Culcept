/**
 * CoAlter Bug-1 §4.3 / §2.3 — extractEmotionTags（low-level 純関数）
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §4.3 / §2.3
 *
 * 位置づけ (mainstream plan §2.2):
 * - EMOTION_TAG_LEXEMES を唯一の参照とする低レベル純関数。
 * - 外部 state / speaker 情報は参照しない（speaker は常に "unknown"）。
 * - 上位 API `extractEmotionTags(analysis, aId, bId)` (§4.3) は conversationParser
 *   側で wrapper として実装される（Phase 3 以降）。本関数はその基盤。
 *
 * 失敗独立 5 条文 (§2.3) の遵守:
 * 1. DB / network / localStorage に touch しない（純関数）
 * 2. 例外を投げず、不正入力 (null / undefined / 非文字列 / 空文字) に対して [] を返す
 * 3. 決定的（同一入力で同一結果）
 * 4. 1 実行 100ms 以内
 * 5. caller 以外に信号を発しない（副作用ゼロ）
 */

import type { EmotionCategory, EmotionTag } from "./types";
import { EMOTION_TAG_LEXEMES } from "./lexemes";

/**
 * 自由テキストから感情タグを抽出する（low-level 純関数）。
 *
 * @param text 分析対象テキスト。null / undefined / 非文字列 / 空文字は [] に倒す（fail-open）。
 * @returns 検出された EmotionTag 配列。speaker は常に "unknown"（speaker 判定は上位 wrapper の責務）。
 */
export function extractEmotionTags(text: unknown): EmotionTag[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const hits: EmotionTag[] = [];
  const seen = new Set<string>();

  const categories = Object.keys(EMOTION_TAG_LEXEMES) as EmotionCategory[];
  for (const category of categories) {
    const { lexemes, polarity } = EMOTION_TAG_LEXEMES[category];
    for (const lexeme of lexemes) {
      if (!text.includes(lexeme)) continue;
      const dedupeKey = `${category}:${lexeme}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      hits.push({
        tag: category,
        source_lexeme: lexeme,
        speaker: "unknown",
        polarity,
      });
    }
  }

  return hits;
}
