/**
 * D-2-e3-a0 citationNormalizer 単体テスト (pure foundation)。
 *
 * 検証軸 (PR #109 §5):
 *   Anthropic mapper:
 *     1. cited_text / encrypted_index を canonical に 1:1 map
 *     2. cited_text undefined → citedText undefined
 *     3. encrypted_index undefined → sourceLocationHint undefined
 *     4. 空配列 → 空配列
 *     5. 複数 entries → 順序保持
 *
 *   OpenAI mapper:
 *     6. start_index / end_index で rawText を slice → citedText
 *     7. start_index >= end_index → citedText 空文字
 *     8. start_index 負値 → 0 に clamp
 *     9. end_index rawText.length 超過 → rawText.length に clamp
 *    10. citedText は 150 char (CITED_TEXT_MAX_LENGTH) に切り詰め
 *    11. sourceLocationHint に "start_index-end_index" 保存
 *
 *   EXA mapper:
 *    12. highlights[0] 優先 → citedText
 *    13. highlights なし → text を citedText
 *    14. text もなし → citedText undefined
 *    15. citedText は 150 char に切り詰め
 *    16. sourceLocationHint は常に undefined
 *
 *   共通:
 *    17. 入力 mutate なし (pure function)
 *
 * D-2-e3-a0 scope: 実 SDK / 実 API 接続なし、raw 型による pure mapping のみ。
 */

import { describe, it, expect } from "vitest";
import {
  CITED_TEXT_MAX_LENGTH,
  normalizeAnthropicCitations,
  normalizeOpenAICitations,
  normalizeExaCitations,
  type AnthropicRawCitation,
  type OpenAIRawAnnotation,
  type ExaRawResult,
} from "@/lib/coalter/movie/providers/citationNormalizer";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Anthropic mapper
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeAnthropicCitations", () => {
  it("cited_text / encrypted_index を canonical に 1:1 map", () => {
    const raw: AnthropicRawCitation[] = [
      {
        url: "https://eiga.com/movie/12345/",
        title: "作品 X - eiga.com",
        cited_text: "TOHO 渋谷で 19:00〜上映",
        encrypted_index: "enc-abc",
      },
    ];
    expect(normalizeAnthropicCitations(raw)).toEqual([
      {
        url: "https://eiga.com/movie/12345/",
        title: "作品 X - eiga.com",
        citedText: "TOHO 渋谷で 19:00〜上映",
        sourceLocationHint: "enc-abc",
      },
    ]);
  });

  it("cited_text undefined → citedText undefined", () => {
    const raw: AnthropicRawCitation[] = [
      { url: "https://a.test", title: "A" },
    ];
    expect(normalizeAnthropicCitations(raw)).toEqual([
      {
        url: "https://a.test",
        title: "A",
        citedText: undefined,
        sourceLocationHint: undefined,
      },
    ]);
  });

  it("encrypted_index undefined → sourceLocationHint undefined", () => {
    const raw: AnthropicRawCitation[] = [
      { url: "https://a.test", title: "A", cited_text: "snippet" },
    ];
    const result = normalizeAnthropicCitations(raw);
    expect(result[0].sourceLocationHint).toBeUndefined();
  });

  it("空配列 → 空配列", () => {
    expect(normalizeAnthropicCitations([])).toEqual([]);
  });

  it("複数 entries の順序を保持", () => {
    const raw: AnthropicRawCitation[] = [
      { url: "https://a.test", title: "A" },
      { url: "https://b.test", title: "B" },
      { url: "https://c.test", title: "C" },
    ];
    const result = normalizeAnthropicCitations(raw);
    expect(result.map((c) => c.title)).toEqual(["A", "B", "C"]);
  });

  it("入力 raw を mutate しない", () => {
    const raw: AnthropicRawCitation[] = [
      { url: "https://a.test", title: "A", cited_text: "x" },
    ];
    const snapshot = JSON.parse(JSON.stringify(raw));
    normalizeAnthropicCitations(raw);
    expect(raw).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. OpenAI mapper
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeOpenAICitations", () => {
  const rawText =
    "今週末に公開される作品は TOHOシネマズ渋谷で 19:00〜21:30 上映されます。";
  // index map (utf16 code unit):
  //   今週末に公開される作品は TOHOシネマズ渋谷で 19:00〜21:30 上映されます。
  // 0-based start_index で部分切り出し可能

  it("start_index / end_index で rawText を slice", () => {
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://eiga.com/movie/12345/",
        title: "作品 X",
        start_index: 13,
        end_index: 23,
      },
    ];
    const result = normalizeOpenAICitations(annotations, rawText);
    expect(result[0].url).toBe("https://eiga.com/movie/12345/");
    expect(result[0].citedText).toBe(rawText.slice(13, 23));
    expect(result[0].sourceLocationHint).toBe("13-23");
  });

  it("start_index >= end_index → citedText 空文字", () => {
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://a.test",
        title: "A",
        start_index: 10,
        end_index: 10,
      },
    ];
    expect(normalizeOpenAICitations(annotations, rawText)[0].citedText).toBe(
      "",
    );
  });

  it("start_index 負値 → 0 に clamp", () => {
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://a.test",
        title: "A",
        start_index: -5,
        end_index: 4,
      },
    ];
    const result = normalizeOpenAICitations(annotations, rawText);
    expect(result[0].citedText).toBe(rawText.slice(0, 4));
    // sourceLocationHint は原始値保持
    expect(result[0].sourceLocationHint).toBe("-5-4");
  });

  it("end_index rawText.length 超過 → rawText.length に clamp", () => {
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://a.test",
        title: "A",
        start_index: 5,
        end_index: 9999,
      },
    ];
    const result = normalizeOpenAICitations(annotations, rawText);
    expect(result[0].citedText).toBe(rawText.slice(5));
  });

  it("citedText は CITED_TEXT_MAX_LENGTH (150) char に切り詰め", () => {
    const longText = "あ".repeat(500);
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://a.test",
        title: "A",
        start_index: 0,
        end_index: 500,
      },
    ];
    const result = normalizeOpenAICitations(annotations, longText);
    expect(result[0].citedText!.length).toBe(CITED_TEXT_MAX_LENGTH);
    expect(result[0].citedText).toBe("あ".repeat(150));
  });

  it("複数 entries の順序を保持", () => {
    const annotations: OpenAIRawAnnotation[] = [
      {
        type: "url_citation",
        url: "https://a.test",
        title: "A",
        start_index: 0,
        end_index: 5,
      },
      {
        type: "url_citation",
        url: "https://b.test",
        title: "B",
        start_index: 5,
        end_index: 10,
      },
    ];
    const result = normalizeOpenAICitations(annotations, rawText);
    expect(result.map((c) => c.title)).toEqual(["A", "B"]);
  });

  it("空 annotations → 空配列", () => {
    expect(normalizeOpenAICitations([], rawText)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. EXA mapper
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeExaCitations", () => {
  it("highlights[0] 優先 → citedText", () => {
    const results: ExaRawResult[] = [
      {
        url: "https://eiga.com/movie/12345/",
        title: "作品 X",
        text: "これは全文 text です。",
        highlights: ["TOHO 渋谷で 19:00〜", "別の highlight"],
      },
    ];
    expect(normalizeExaCitations(results)[0].citedText).toBe(
      "TOHO 渋谷で 19:00〜",
    );
  });

  it("highlights なし → text を citedText に使用", () => {
    const results: ExaRawResult[] = [
      {
        url: "https://a.test",
        title: "A",
        text: "fulltext content",
      },
    ];
    expect(normalizeExaCitations(results)[0].citedText).toBe("fulltext content");
  });

  it("text もなし → citedText undefined", () => {
    const results: ExaRawResult[] = [{ url: "https://a.test", title: "A" }];
    expect(normalizeExaCitations(results)[0].citedText).toBeUndefined();
  });

  it("highlights が空配列 → text を citedText に使用 (highlights なし扱い)", () => {
    const results: ExaRawResult[] = [
      { url: "https://a.test", title: "A", text: "fallback text", highlights: [] },
    ];
    expect(normalizeExaCitations(results)[0].citedText).toBe("fallback text");
  });

  it("citedText は 150 char に切り詰め (text 経由)", () => {
    const longText = "あ".repeat(500);
    const results: ExaRawResult[] = [
      { url: "https://a.test", title: "A", text: longText },
    ];
    const result = normalizeExaCitations(results)[0];
    expect(result.citedText!.length).toBe(CITED_TEXT_MAX_LENGTH);
  });

  it("citedText は 150 char に切り詰め (highlights 経由)", () => {
    const longHighlight = "い".repeat(500);
    const results: ExaRawResult[] = [
      { url: "https://a.test", title: "A", highlights: [longHighlight] },
    ];
    const result = normalizeExaCitations(results)[0];
    expect(result.citedText!.length).toBe(CITED_TEXT_MAX_LENGTH);
    expect(result.citedText).toBe("い".repeat(150));
  });

  it("sourceLocationHint は常に undefined (EXA に index 情報なし)", () => {
    const results: ExaRawResult[] = [
      { url: "https://a.test", title: "A", text: "x" },
    ];
    expect(normalizeExaCitations(results)[0].sourceLocationHint).toBeUndefined();
  });

  it("空配列 → 空配列", () => {
    expect(normalizeExaCitations([])).toEqual([]);
  });

  it("入力 results を mutate しない", () => {
    const results: ExaRawResult[] = [
      {
        url: "https://a.test",
        title: "A",
        text: "x",
        highlights: ["h"],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(results));
    normalizeExaCitations(results);
    expect(results).toEqual(snapshot);
  });
});
