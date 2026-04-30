/**
 * CoAlter Bug-1 Phase 3B Layer 2-B — narrationEnricher emotion 接続契約テスト
 *
 * 正本: docs/coalter-bug1-emotion-retrieval-design.md §9 / §2.5 / §10
 *
 * 契約:
 *   - emotionTags が undefined / 空 / 全 malformed → 既存 prompt と同等
 *   - emotionTags ありなら user prompt に `emotion_signals:` block が追加される
 *   - speaker / category は prompt に出る、source_lexeme は出ない
 *   - SYSTEM_PROMPT に「決めつけ禁止 / 構造化ラベルを prose に出さない」趣旨
 *   - FORBIDDEN check が `emotion_signals:` / `speaker:` / `category:` を検出
 *
 * 対象は新規 export 経路 (`__internal.buildUserPrompt`) と FORBIDDEN 拡張のみ。
 * 既存 `enrichNarration` / `applyProse` の挙動は本テストでは検証しない（既存
 * 構造に optional field を加えただけで、既存 caller は影響を受けない）。
 *
 * server-only import を含むため vi.mock で空にする（test 環境で読み込めるように）。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
// runAI は本 test では呼ばないが、import 解決のため空 mock。
vi.mock("@/lib/ai", () => ({
  runAI: vi.fn(async () => ({ structured: null })),
}));

import { __internal } from "@/lib/coalter/narrationEnricher";
import type { EmotionTag } from "@/lib/coalter/emotion/types";
import type { ProposalCard, RankedCandidate } from "@/lib/coalter/types";

const { buildUserPrompt, violatesForbiddenExpressions, SYSTEM_PROMPT } =
  __internal;

// ─────────────────────────────────────────────
// Minimal mocks (buildUserPrompt が touch する field のみ用意)
// ─────────────────────────────────────────────

function mockCard(): ProposalCard {
  return {
    summary: "test summary",
    reasoning: "test reasoning",
  } as unknown as ProposalCard;
}

function mockRanked(): RankedCandidate[] {
  return [
    {
      candidateKey: "key1",
      role: "primary",
      title: "title1",
      theater: "th1",
      showtime: "10:00",
      rationale: {
        matchedInterestsA: ["interest_a"],
        matchedInterestsB: ["interest_b"],
      },
    } as unknown as RankedCandidate,
  ];
}

describe("narrationEnricher Layer 2-B: buildUserPrompt + emotion injection", () => {
  // ─────────────────────────────────────────────
  // 1. emotionTags なしなら既存 prompt と同等
  // ─────────────────────────────────────────────
  it("test 1: emotionTags 未指定 → emotion block を含まない", () => {
    const promptNoArg = buildUserPrompt(mockCard(), mockRanked());
    expect(promptNoArg).not.toContain("emotion_signals:");
    expect(promptNoArg).not.toContain("補助信号");
  });

  it("test 1b: emotionTags=undefined → 既存 prompt と完全同一", () => {
    const a = buildUserPrompt(mockCard(), mockRanked());
    const b = buildUserPrompt(mockCard(), mockRanked(), undefined);
    expect(a).toBe(b);
  });

  it("test 1c: emotionTags=[] → 既存 prompt と完全同一", () => {
    const a = buildUserPrompt(mockCard(), mockRanked());
    const b = buildUserPrompt(mockCard(), mockRanked(), []);
    expect(a).toBe(b);
  });

  // ─────────────────────────────────────────────
  // 2. emotionTags ありなら prompt に emotion_signals が入る
  // ─────────────────────────────────────────────
  it("test 2: emotionTags あり → prompt に 'emotion_signals:' が含まれる", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    expect(prompt).toContain("emotion_signals:");
  });

  // ─────────────────────────────────────────────
  // 3. prompt に speaker / category が入る
  // ─────────────────────────────────────────────
  it("test 3: prompt に 'speaker:' / 'category:' が含まれる", () => {
    const tags: EmotionTag[] = [
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    expect(prompt).toContain("speaker: both");
    expect(prompt).toContain("category: friction");
  });

  // ─────────────────────────────────────────────
  // 4. prompt に source_lexeme / 具体語は入らない
  // ─────────────────────────────────────────────
  it("test 4: source_lexeme / 具体語は prompt に出ない (CEO α 方針)", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    expect(prompt).not.toContain("気分");
    expect(prompt).not.toContain("すれ違い");
    expect(prompt).not.toContain("source_lexeme");
  });

  // ─────────────────────────────────────────────
  // 5. SYSTEM_PROMPT に「決めつけ禁止 / 構造化ラベルを出力しない」趣旨
  // ─────────────────────────────────────────────
  it("test 5: SYSTEM_PROMPT に 決めつけ / 構造化ラベル不出力 の指示が入る", () => {
    expect(SYSTEM_PROMPT).toContain("決めつけ");
    expect(SYSTEM_PROMPT).toContain("emotion_signals:");
    expect(SYSTEM_PROMPT).toContain("speaker:");
    expect(SYSTEM_PROMPT).toContain("category:");
    // 補助信号という位置づけが入る
    expect(SYSTEM_PROMPT).toContain("補助信号");
  });

  // ─────────────────────────────────────────────
  // 6. FORBIDDEN check が emotion_signals / speaker / category を検出
  // ─────────────────────────────────────────────
  it("test 6a: FORBIDDEN — 'emotion_signals:' を含む LLM prose は禁止扱い", () => {
    expect(violatesForbiddenExpressions("emotion_signals: foo")).toBe(true);
    expect(violatesForbiddenExpressions("補助信号として emotion_signals:が入る"))
      .toBe(true);
  });

  it("test 6b: FORBIDDEN — 行頭の 'speaker:' を含む LLM prose は禁止扱い", () => {
    expect(violatesForbiddenExpressions("speaker: user_a がそう感じている"))
      .toBe(true);
    expect(violatesForbiddenExpressions("- speaker: user_a")).toBe(true);
  });

  it("test 6c: FORBIDDEN — 行頭の 'category:' を含む LLM prose は禁止扱い", () => {
    expect(violatesForbiddenExpressions("category: mood")).toBe(true);
    expect(violatesForbiddenExpressions("  category: friction")).toBe(true);
  });

  it("test 6d: FORBIDDEN — 通常の自然文は誤検出しない (回帰防止)", () => {
    expect(violatesForbiddenExpressions("二人で土曜日に渋谷へ行こう。")).toBe(
      false,
    );
    expect(violatesForbiddenExpressions("候補は3つあります。")).toBe(false);
    expect(violatesForbiddenExpressions("少し迷っているようです。")).toBe(false);
  });

  it("test 6e: 既存 FORBIDDEN は維持 (回帰なし)", () => {
    expect(violatesForbiddenExpressions("〜すべきです")).toBe(true);
    expect(violatesForbiddenExpressions("本当はAが好き")).toBe(true);
    expect(violatesForbiddenExpressions("正しい選択")).toBe(true);
    expect(violatesForbiddenExpressions("AはBに合わせる")).toBe(true);
    expect(violatesForbiddenExpressions("BはAに合わせる")).toBe(true);
  });

  // ─────────────────────────────────────────────
  // 7. 集約規則 (stage1Narration の buildEmotionSignalsBlock 経由) が反映される
  // ─────────────────────────────────────────────
  it("test 7: 異 speaker/category → 別 entry が prompt に並ぶ", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "friction", source_lexeme: "すれ違い", speaker: "both" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    expect(prompt).toContain("speaker: user_a");
    expect(prompt).toContain("category: mood");
    expect(prompt).toContain("speaker: both");
    expect(prompt).toContain("category: friction");
  });

  it("test 7b: 同 (speaker, category) は dedupe され 1 entry のみ", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "気分", speaker: "user_a" },
      { tag: "mood", source_lexeme: "気持ち", speaker: "user_a" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    // category: mood が 1 回だけ出る
    const matches = prompt.match(/category: mood/g) ?? [];
    expect(matches.length).toBe(1);
  });

  // ─────────────────────────────────────────────
  // 8. 補助信号 header が prose を意識した文言
  // ─────────────────────────────────────────────
  it("test 8: 補助信号 header に 'prose には絶対に書き写さない' の指示が入る", () => {
    const tags: EmotionTag[] = [
      { tag: "mood", source_lexeme: "x", speaker: "user_a" },
    ];
    const prompt = buildUserPrompt(mockCard(), mockRanked(), tags);
    expect(prompt).toContain("補助信号");
    expect(prompt).toMatch(/prose.*書き写さない|書き写さない.*prose/);
  });
});
