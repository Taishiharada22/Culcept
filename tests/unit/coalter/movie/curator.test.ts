/**
 * D-1-c LLM Ranker (curator.ts) 単体テスト (基本)。
 *
 * 検証軸 (mainstream plan §3.2 元 D-2-c / 三段式 §2.3.3):
 *   1. mock LLM が valid JSON → CuratorResult 正常 (top + alternates 分離)
 *   2. invalid JSON / non-JSON → fallback narration
 *   3. mock LLM throw (network 失敗) → fallback (失敗独立、Bug-1 §2.3 精神)
 *   4. pool 外 title → reject (hallucination 防止)
 *   5. reasoning 5 要素いずれか欠落 → reject (G3)
 *   6. confidence 不正 (NaN / 範囲外) → reject
 *   7. narrative 空 → reject
 *   8. fairnessAdjustment non-null + LLM が note 出さない → 自動付与
 *   9. pool 空 → placeholder + diagnostics.fallbackUsed=true
 *  10. immutability (input 不変)
 *  11. diagnostics 正確性 (totalPicks / validPicks / rejectionReasons)
 *  12. B1 構造 gate (curator.ts に missing_where / theater 実装行参照なし、
 *      buildUserPrompt が candidate.theater を embed しない)
 *
 * test は **mock / pure** で行う (CEO 厳禁: 実 LLM / API 接続なし)。
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildUserPrompt,
  curate,
  parseLLMResponse,
  type CuratorInput,
  type CuratorLLMClient,
  type CuratorResult,
  type PersonalityRootedPick,
  type PersonalityRootedReasoning,
} from "@/lib/coalter/movie/curator";
import type { MovieCandidate } from "@/lib/coalter/movie/candidatePool";
import type { MovieQuery } from "@/lib/coalter/movie/queryDerivation";
import type {
  PersonalLens,
  TwoPersonLensToday,
  UserId,
} from "@/lib/coalter/understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// fixture builders
// ═══════════════════════════════════════════════════════════════════════════

function buildPersonalLens(suffix: "a" | "b"): PersonalLens {
  return {
    userId: `user-${suffix}` as UserId,
    displayName: suffix === "a" ? "Aさん" : "Bさん",
    coreDecisionPrinciples: [`${suffix}-原理-1`, `${suffix}-原理-2`],
    currentEmotionalHue: `${suffix}-情調`,
    todaySensitivities: [`${suffix}-敏感-1`],
    comfortPathways: [`${suffix}-回復-1`, `${suffix}-回復-2`],
    sourcedFrom: { stargazer: [], alter: [], behavioral: [] },
  };
}

function buildLens(
  overrides: Partial<TwoPersonLensToday> = {},
): TwoPersonLensToday {
  return {
    personalLenses: { a: buildPersonalLens("a"), b: buildPersonalLens("b") },
    relationalLens: {
      temperature: "warm",
      dominantDynamic: "今日は A 主導 B 受容",
      careAxes: ["B-疲労配慮"],
      avoidElements: ["重い暴力", "悲しすぎる結末"],
      interactionPace: "steady",
    },
    todayReading: {
      mode: "recover",
      energyBudget: "low",
      timeBudget: "limited",
      implicitIntent: "今日は静かに整えたい",
      latentNeeds: ["静かさ"],
      confidence: 0.7,
    },
    fairnessAdjustment: {
      favorSide: null,
      rationale: null,
      strength: 0,
      basedOnSessionCount: 0,
    },
    understanding_confidence: 0.7,
    dataGaps: [],
    computedAt: "2026-05-11T00:00:00Z",
    lensVersion: "1.0.0",
    ...overrides,
  };
}

function buildQuery(): MovieQuery {
  return {
    genres: ["ヒューマンドラマ", "ファンタジー"],
    mood: "comforting",
    weight: "light",
    length_minutes_max: 120,
    era: "now-showing",
    couple_fit_hints: ["静かに寄り添える"],
    exclude: ["重い暴力", "悲しすぎる結末"],
  };
}

function buildCandidate(
  id: string,
  title: string,
  overrides: Partial<MovieCandidate> = {},
): MovieCandidate {
  return {
    id,
    title,
    genres: ["ヒューマンドラマ"],
    releaseStatus: "now-showing",
    sourceProvider: "ranking",
    screenCountEstimate: 30,
    synopsis: `${title} のあらすじ`,
    runtimeMin: 110,
    ...overrides,
  };
}

function buildInput(
  overrides: Partial<CuratorInput> = {},
): CuratorInput {
  return {
    lens: buildLens(),
    query: buildQuery(),
    candidatePool: [
      buildCandidate("c1", "作品-1"),
      buildCandidate("c2", "作品-2"),
      buildCandidate("c3", "作品-3"),
    ],
    ...overrides,
  };
}

function buildReasoning(
  overrides: Partial<PersonalityRootedReasoning> = {},
): PersonalityRootedReasoning {
  return {
    personA_lens: "Aさんは a-原理-1 を大事にする",
    personB_lens: "Bさんは b-原理-1 を大事にする",
    relational_fit: "今日は A 主導 B 受容 に合う",
    today_hook: "todayReading.mode=recover に沿う",
    veto_guard: "重い暴力 は外した",
    ...overrides,
  };
}

function buildPickJson(
  title: string,
  overrides: Partial<PersonalityRootedPick> = {},
): Record<string, unknown> {
  const base: PersonalityRootedPick = {
    title,
    confidence: 0.85,
    reasoning: buildReasoning(),
    narrative: `${title} を Aさん Bさん の組み合わせで提案`,
    fairnessNote: null,
    ...overrides,
  };
  return base as unknown as Record<string, unknown>;
}

function mockLLMReturning(value: string): CuratorLLMClient {
  return vi.fn().mockResolvedValue(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. valid JSON → CuratorResult 正常
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — valid LLM 応答", () => {
  it("3 picks の JSON → top + alternates 2 件", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("作品-1", { confidence: 0.9 }),
        buildPickJson("作品-2", { confidence: 0.7 }),
        buildPickJson("作品-3", { confidence: 0.5 }),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.topPick.title).toBe("作品-1");
    expect(result.topPick.confidence).toBe(0.9);
    expect(result.alternates.map((p) => p.title)).toEqual(["作品-2", "作品-3"]);
    expect(result.diagnostics.llmCallSucceeded).toBe(true);
    expect(result.diagnostics.fallbackUsed).toBe(false);
    expect(result.diagnostics.validPicks).toBe(3);
    expect(result.diagnostics.rejectedPicks).toBe(0);
  });

  it("1 pick → top のみ、alternates 空", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1")],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.topPick.title).toBe("作品-1");
    expect(result.alternates).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2-3. fallback (invalid JSON / throw)
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — fallback (失敗独立)", () => {
  it("invalid JSON → fallback、diagnostics.fallbackUsed=true", async () => {
    const input = buildInput();
    const result = await curate(input, {
      llmClient: mockLLMReturning("this is not json"),
    });
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.diagnostics.llmCallSucceeded).toBe(true); // call 自体は成功
    expect(result.topPick.title).toBe("作品-1"); // pool 先頭
    expect(result.alternates).toEqual([]);
  });

  it("LLM throw (network 失敗) → fallback、llmCallSucceeded=false", async () => {
    const input = buildInput();
    const llmClient: CuratorLLMClient = vi
      .fn()
      .mockRejectedValue(new Error("network down"));
    const result = await curate(input, { llmClient });
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.diagnostics.llmCallSucceeded).toBe(false);
    expect(result.topPick.title).toBe("作品-1");
    // fallback narration 5 要素は全て non-empty
    expect(result.topPick.reasoning.personA_lens.length).toBeGreaterThan(0);
    expect(result.topPick.reasoning.personB_lens.length).toBeGreaterThan(0);
    expect(result.topPick.reasoning.relational_fit.length).toBeGreaterThan(0);
    expect(result.topPick.reasoning.today_hook.length).toBeGreaterThan(0);
    expect(result.topPick.reasoning.veto_guard.length).toBeGreaterThan(0);
    expect(result.topPick.narrative.length).toBeGreaterThan(0);
  });

  it("空 picks 配列 → fallback", async () => {
    const input = buildInput();
    const result = await curate(input, {
      llmClient: mockLLMReturning(JSON.stringify({ picks: [] })),
    });
    expect(result.diagnostics.fallbackUsed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4-7. validation reject
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — validation reject", () => {
  it("pool 外 title → title_not_in_pool で reject", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("hallucinated-title"), // pool に無い
        buildPickJson("作品-2"),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.rejectedPicks).toBe(1);
    expect(result.diagnostics.rejectionReasons).toContainEqual({
      reason: "title_not_in_pool",
      count: 1,
    });
    expect(result.topPick.title).toBe("作品-2");
  });

  it("reasoning 5 要素のいずれか空 → missing_reasoning_field で reject (G3)", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("作品-1", {
          reasoning: { ...buildReasoning(), today_hook: "" }, // 空
        }),
        buildPickJson("作品-2"),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.rejectedPicks).toBe(1);
    expect(result.diagnostics.rejectionReasons).toContainEqual({
      reason: "missing_reasoning_field",
      count: 1,
    });
    expect(result.topPick.title).toBe("作品-2");
  });

  it("confidence 範囲外 → invalid_confidence", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("作品-1", { confidence: 1.5 }), // > 1
        buildPickJson("作品-2", { confidence: -0.1 }), // < 0
        buildPickJson("作品-3"),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.rejectedPicks).toBe(2);
    expect(result.diagnostics.rejectionReasons).toContainEqual({
      reason: "invalid_confidence",
      count: 2,
    });
  });

  it("confidence NaN → invalid_confidence", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("作品-1", { confidence: NaN as unknown as number }),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.diagnostics.rejectionReasons).toContainEqual({
      reason: "invalid_confidence",
      count: 1,
    });
  });

  it("narrative 空 → empty_narrative", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1", { narrative: "" })],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.rejectedPicks).toBe(1);
    expect(result.diagnostics.rejectionReasons).toContainEqual({
      reason: "empty_narrative",
      count: 1,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. fairnessNote 自動付与
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — fairnessNote 自動付与", () => {
  it("lens.fairnessAdjustment non-null + LLM が note なし → 自動付与", async () => {
    const lens = buildLens({
      fairnessAdjustment: {
        favorSide: "a",
        rationale: "前回 B 寄りだったので今回は A の好みを優先",
        strength: 0.6,
        basedOnSessionCount: 5,
      },
    });
    const input = buildInput({ lens });
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1", { fairnessNote: null })],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.topPick.fairnessNote).toBe(
      "前回 B 寄りだったので今回は A の好みを優先",
    );
  });

  it("lens.fairnessAdjustment.favorSide=null → 自動付与しない (LLM null のまま)", async () => {
    const input = buildInput(); // default で favorSide null
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1", { fairnessNote: null })],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.topPick.fairnessNote).toBeNull();
  });

  it("LLM が fairnessNote を返した場合は LLM のものを優先", async () => {
    const lens = buildLens({
      fairnessAdjustment: {
        favorSide: "a",
        rationale: "default rationale",
        strength: 0.6,
        basedOnSessionCount: 5,
      },
    });
    const input = buildInput({ lens });
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1", { fairnessNote: "LLM 独自 note" })],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.topPick.fairnessNote).toBe("LLM 独自 note");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. pool 空 → placeholder
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — pool 空", () => {
  it("candidatePool 空 → placeholder + fallbackUsed=true (LLM 呼ばれない)", async () => {
    const llmClient = vi.fn();
    const input = buildInput({ candidatePool: [] });
    const result = await curate(input, { llmClient });
    expect(llmClient).not.toHaveBeenCalled();
    expect(result.topPick.title).toBe("(候補なし)");
    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.diagnostics.llmCallSucceeded).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — immutability", () => {
  it("input.lens / query / candidatePool を mutate しない", async () => {
    const input = buildInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    const llmJson = JSON.stringify({
      picks: [buildPickJson("作品-1")],
    });
    await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(input).toEqual(snapshot);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. diagnostics 正確性
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — diagnostics", () => {
  it("totalPicks = LLM raw 件数、validPicks + rejectedPicks = totalPicks", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("作品-1"), // valid
        buildPickJson("hallucinated"), // reject
        buildPickJson("作品-2"), // valid
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    expect(result.diagnostics.totalPicks).toBe(3);
    expect(result.diagnostics.validPicks).toBe(2);
    expect(result.diagnostics.rejectedPicks).toBe(1);
    expect(
      result.diagnostics.validPicks + result.diagnostics.rejectedPicks,
    ).toBe(result.diagnostics.totalPicks);
  });

  it("rejectionReasons は各理由を集計 (重複理由は count にまとめる)", async () => {
    const input = buildInput();
    const llmJson = JSON.stringify({
      picks: [
        buildPickJson("hall-1"),
        buildPickJson("hall-2"),
        buildPickJson("作品-1", { confidence: 2 }),
      ],
    });
    const result = await curate(input, { llmClient: mockLLMReturning(llmJson) });
    const reasons = result.diagnostics.rejectionReasons;
    expect(reasons).toContainEqual({ reason: "title_not_in_pool", count: 2 });
    expect(reasons).toContainEqual({ reason: "invalid_confidence", count: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. B1 構造 gate (curator.ts に missing_where / theater 実装行参照なし)
// ═══════════════════════════════════════════════════════════════════════════

describe("curate — B1 構造 gate (theater 不参照、missing_where reject なし)", () => {
  const SOURCE_PATH = resolve(process.cwd(), "lib/coalter/movie/curator.ts");
  const sourceCode = readFileSync(SOURCE_PATH, "utf8");

  it("curator.ts の **実装行** に 'missing_where' が存在しない", () => {
    const lines = sourceCode.split("\n");
    const offending = lines.filter((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      ) {
        return false;
      }
      return /missing_where/.test(line);
    });
    expect(offending).toEqual([]);
  });

  it("curator.ts の **実装行** に '.theater' 参照が存在しない (型定義 / コメント許容)", () => {
    const lines = sourceCode.split("\n");
    const offending = lines.filter((line) => {
      // doc コメント / ブロックコメント許容
      const trimmed = line.trim();
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      ) {
        return false;
      }
      // 型定義 (theater?: string | null) 許容
      if (/theater\?\s*:\s*string\s*\|\s*null/.test(line)) return false;
      return /\.theater\b/.test(line);
    });
    expect(offending).toEqual([]);
  });

  it("buildUserPrompt は candidate.theater **field の値** を embed しない (title 自体は embed)", () => {
    // 注: test 意図は「theater field の値が prompt に出ないこと」。
    // title 文字列自体が "theater" を含むケースは題名側の embed なので別問題。
    // ここでは theater field 値 (劇場名) の embed 不在のみを verify する。
    const input = buildInput({
      candidatePool: [
        buildCandidate("c1", "作品-アルファ", {
          theater: "TOHO シネマズ渋谷", // theater あり
        }),
      ],
    });
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("作品-アルファ"); // title は embed (正常)
    expect(prompt).not.toContain("TOHO シネマズ渋谷"); // theater field 値は不在 (B1)
  });

  it("buildUserPrompt は theater 欠落 candidate も pool 内に含めて embed", () => {
    const input = buildInput({
      candidatePool: [
        buildCandidate("c1", "作品-ベータ", { theater: null }),
      ],
    });
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("作品-ベータ");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. parseLLMResponse helper (export されているので単体 test)
// ═══════════════════════════════════════════════════════════════════════════

describe("parseLLMResponse — 単体", () => {
  it("valid JSON with picks → array of RawPick", () => {
    const out = parseLLMResponse(JSON.stringify({ picks: [{ title: "x" }] }));
    expect(out).toHaveLength(1);
  });

  it("invalid JSON → []", () => {
    expect(parseLLMResponse("not json")).toEqual([]);
  });

  it("JSON without picks key → []", () => {
    expect(parseLLMResponse(JSON.stringify({ other: 1 }))).toEqual([]);
  });

  it("null / 空文字 → []", () => {
    expect(parseLLMResponse("")).toEqual([]);
    expect(parseLLMResponse("null")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. shape verify
// ═══════════════════════════════════════════════════════════════════════════

describe("CuratorResult shape", () => {
  it("返り値は topPick / alternates / diagnostics 3 fields", async () => {
    const input = buildInput();
    const result: CuratorResult = await curate(input, {
      llmClient: mockLLMReturning(
        JSON.stringify({ picks: [buildPickJson("作品-1")] }),
      ),
    });
    expect(Object.keys(result).sort()).toEqual([
      "alternates",
      "diagnostics",
      "topPick",
    ]);
  });

  it("topPick reasoning は 5 要素必須", async () => {
    const input = buildInput();
    const result = await curate(input, {
      llmClient: mockLLMReturning(
        JSON.stringify({ picks: [buildPickJson("作品-1")] }),
      ),
    });
    expect(Object.keys(result.topPick.reasoning).sort()).toEqual([
      "personA_lens",
      "personB_lens",
      "relational_fit",
      "today_hook",
      "veto_guard",
    ]);
  });
});
