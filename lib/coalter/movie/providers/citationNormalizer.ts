/**
 * CoAlter D-2-e3-a0 Provider-Agnostic Foundation — Citation Normalizer
 *
 * PR #109 §5 で凍結された provider 別 citation → canonical schema mapping の pure 実装。
 *
 * 役割:
 *   - Anthropic citations → `Citation[]` (canonical、1:1 mapping)
 *   - OpenAI annotations → `Citation[]` (start/end index で text slice)
 *   - EXA results → `Citation[]` (highlights / text から citedText 抽出)
 *
 * 設計原則:
 *   - Anthropic 仕様を canonical schema base に採用 (PR #109 §5.1)
 *   - UI は canonical schema を表示 → provider 切替えで UI 揺れなし
 *   - 全 mapper は pure function (副作用なし、決定論)
 *
 * 凍結線:
 *   - 既存 file touch なし、Anthropic / OpenAI / EXA SDK import なし
 */

import type { Citation } from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Constants
// ═══════════════════════════════════════════════════════════════════════════

/** citedText の最大長 (Anthropic 仕様 150 char に合わせる)。 */
export const CITED_TEXT_MAX_LENGTH = 150;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Anthropic citations → canonical (1:1 mapping)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Anthropic web search tool response の citations 単位 raw 型 (PR #109 §7.1)。
 *
 *   実 Anthropic SDK response の citations[] 要素を本型に簡略化したもの。
 *   provider 実装 (D-2-e3-a 着手後) で SDK response → 本型に手前で変換する。
 */
export interface AnthropicRawCitation {
  url: string;
  title: string;
  cited_text?: string;
  encrypted_index?: string;
}

/**
 * Anthropic citations を canonical `Citation[]` に変換 (1:1 mapping)。
 *
 *   - `cited_text` → `citedText` (length 切り詰めなし、Anthropic 側で 150 char 上限済)
 *   - `encrypted_index` → `sourceLocationHint`
 */
export function normalizeAnthropicCitations(
  raw: readonly AnthropicRawCitation[],
): Citation[] {
  return raw.map((c) => ({
    url: c.url,
    title: c.title,
    citedText: c.cited_text,
    sourceLocationHint: c.encrypted_index,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. OpenAI annotations → canonical (start/end index で text slice)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * OpenAI Responses API / Chat Completions API の annotations 要素 raw 型 (PR #109 §7.2)。
 *
 *   `url_citation` annotation のみを対象とする。
 */
export interface OpenAIRawAnnotation {
  type: "url_citation";
  url: string;
  title: string;
  start_index: number;
  end_index: number;
}

/**
 * OpenAI annotations を canonical `Citation[]` に変換。
 *
 *   - `start_index` / `end_index` で rawText を slice → `citedText`
 *   - 150 char (CITED_TEXT_MAX_LENGTH) に切り詰め
 *   - `start_index-end_index` を `sourceLocationHint` に保存
 *
 *   range が無効 (start >= end or out of bounds) の場合は citedText を空文字に。
 */
export function normalizeOpenAICitations(
  annotations: readonly OpenAIRawAnnotation[],
  rawText: string,
): Citation[] {
  return annotations.map((a) => {
    const start = clamp(a.start_index, 0, rawText.length);
    const end = clamp(a.end_index, 0, rawText.length);
    const slice = start < end ? rawText.slice(start, end) : "";
    return {
      url: a.url,
      title: a.title,
      citedText: slice.slice(0, CITED_TEXT_MAX_LENGTH),
      sourceLocationHint: `${a.start_index}-${a.end_index}`,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXA results → canonical (highlights / text fallback)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EXA search API の result 要素 raw 型 (PR #109 §7.3)。
 *
 *   実 EXA SDK / API response の results[] 要素を本型に簡略化したもの。
 */
export interface ExaRawResult {
  url: string;
  title: string;
  text?: string;
  highlights?: readonly string[];
}

/**
 * EXA results を canonical `Citation[]` に変換。
 *
 *   - `highlights[0]` 優先 → なければ `text` → なければ undefined
 *   - 150 char (CITED_TEXT_MAX_LENGTH) に切り詰め
 *   - EXA は character index 情報を返さないため `sourceLocationHint` は undefined
 */
export function normalizeExaCitations(
  results: readonly ExaRawResult[],
): Citation[] {
  return results.map((r) => {
    const sourceText =
      (r.highlights && r.highlights.length > 0 ? r.highlights[0] : undefined) ??
      r.text;
    const citedText =
      sourceText !== undefined
        ? sourceText.slice(0, CITED_TEXT_MAX_LENGTH)
        : undefined;
    return {
      url: r.url,
      title: r.title,
      citedText,
      sourceLocationHint: undefined,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
