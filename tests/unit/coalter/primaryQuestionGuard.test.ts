/**
 * CoAlter 2026-04-19 — Primary Question Guard unit tests (CEO 採用案 D)
 *
 * 契約:
 *  - slot="what" / 「何を観る」型の破綻質問を検出して破棄
 *  - 破棄した場合は 埋まっていない条件スロット (where/when/how) の 1 問に書き換え
 *  - 健全な質問 (slot=where 等) はそのまま通す
 *  - 条件が全て埋まっていれば runtime (long/short) を聞く fallback
 *  - 作れない場合は null
 */

import { describe, it, expect } from "vitest";

import {
  isBrokenPickQuestion,
  sanitizePrimaryQuestion,
  buildConditionQuestionFromAnalysis,
} from "@/lib/coalter/primaryQuestionGuard";
import type {
  ConversationAnalysis,
  ConversationBrief,
  PrimaryUnresolvedQuestion,
} from "@/lib/coalter/types";

function makeBrief(overrides: Partial<ConversationBrief> = {}): ConversationBrief {
  return {
    theme: "movie",
    area: null,
    approximateTime: { date: null, timeSlot: null, preferredStartHour: null },
    mood: [],
    hardConstraints: [],
    rankingAxes: {
      preset: "balance_focus",
      roles: [],
      rationale: "",
    },
    primaryUnresolvedQuestion: null,
    confidence: 0.6,
    fieldConfidence: { theme: 0.6, area: 0.2, approximateTime: 0.2 },
    source: "llm",
    ...overrides,
  } as ConversationBrief;
}

function makeAnalysis(
  overrides: Partial<ConversationAnalysis["extractedConstraints"]> = {},
): ConversationAnalysis {
  return {
    theme: "movie",
    stalemate: null,
    recentMessages: [],
    caringIntensityA: 0.5,
    caringIntensityB: 0.5,
    extractedConstraints: {
      date: null,
      location: null,
      budget: null,
      timeSlot: null,
      preferences: [],
      ...overrides,
    },
    constraintScore: 0.3,
  };
}

// ─────────────────────────────────────────────
// isBrokenPickQuestion
// ─────────────────────────────────────────────

describe("isBrokenPickQuestion — 破綻検出", () => {
  it("slot=what は破綻", () => {
    expect(
      isBrokenPickQuestion({
        key: "movie",
        slot: "what",
        question: "どの映画にする？",
      }),
    ).toBe(true);
  });

  it("「土曜日に何を観に行くか」(slot=where でも破綻)", () => {
    expect(
      isBrokenPickQuestion({
        key: "x",
        slot: "where",
        question: "土曜日に何を観に行くか教えて",
      }),
    ).toBe(true);
  });

  it("「何を食べるか」も破綻", () => {
    expect(
      isBrokenPickQuestion({
        key: "x",
        slot: "where",
        question: "今夜は何を食べたい？",
      }),
    ).toBe(true);
  });

  it("「作品名を教えて」も破綻", () => {
    expect(
      isBrokenPickQuestion({
        key: "x",
        slot: "where",
        question: "作品名を教えてください",
      }),
    ).toBe(true);
  });

  it("「タイトル」を聞くのも破綻", () => {
    expect(
      isBrokenPickQuestion({
        key: "x",
        slot: "where",
        question: "観たい映画のタイトルはありますか？",
      }),
    ).toBe(true);
  });
});

describe("isBrokenPickQuestion — 健全質問は通す", () => {
  it("「どのあたりで観る？」(slot=where) は OK", () => {
    expect(
      isBrokenPickQuestion({
        key: "area",
        slot: "where",
        question: "どのあたりで観る？",
      }),
    ).toBe(false);
  });

  it("「時間帯は昼と夜どっち？」(slot=when) は OK", () => {
    expect(
      isBrokenPickQuestion({
        key: "time",
        slot: "when",
        question: "時間帯は昼と夜どっちが合う？",
      }),
    ).toBe(false);
  });

  it("「どの時間」は NG パターンから除外 (「どのあたり」除外規則と同様)", () => {
    expect(
      isBrokenPickQuestion({
        key: "time",
        slot: "when",
        question: "どの時間帯がいい？",
      }),
    ).toBe(false);
  });

  it("null は破綻ではない", () => {
    expect(isBrokenPickQuestion(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────
// sanitizePrimaryQuestion
// ─────────────────────────────────────────────

describe("sanitizePrimaryQuestion — 書き換え", () => {
  it("破綻質問 + area 未定 → area を聞く where 質問に書き換え", () => {
    const broken: PrimaryUnresolvedQuestion = {
      key: "what",
      slot: "what",
      question: "どの映画にする？",
    };
    const res = sanitizePrimaryQuestion(broken, makeBrief(), "movie");
    expect(res.sanitized).toBe(true);
    expect(res.reason).toBe("broken_pick_rewritten");
    expect(res.question?.slot).toBe("where");
    expect(res.question?.question).toContain("どのあたり");
  });

  it("破綻質問 + area 定義済み + 時間未定 → when 質問", () => {
    const broken: PrimaryUnresolvedQuestion = {
      key: "x",
      slot: "what",
      question: "何を観る？",
    };
    const res = sanitizePrimaryQuestion(
      broken,
      makeBrief({ area: "渋谷" }),
      "movie",
    );
    expect(res.question?.slot).toBe("when");
    expect(res.question?.question).toContain("昼と夜");
  });

  it("破綻質問 + area/time 定義済み + mood 未定 → mood 質問 (how)", () => {
    const broken: PrimaryUnresolvedQuestion = {
      key: "x",
      slot: "what",
      question: "何を観る？",
    };
    const res = sanitizePrimaryQuestion(
      broken,
      makeBrief({
        area: "渋谷",
        approximateTime: {
          date: null,
          timeSlot: "night",
          preferredStartHour: null,
        },
      }),
      "movie",
    );
    expect(res.question?.slot).toBe("how");
    expect(res.question?.question).toContain("軽めと重め");
  });

  it("破綻質問 + 全スロット埋まっている → runtime 質問 fallback", () => {
    const broken: PrimaryUnresolvedQuestion = {
      key: "x",
      slot: "what",
      question: "何を観る？",
    };
    const res = sanitizePrimaryQuestion(
      broken,
      makeBrief({
        area: "渋谷",
        approximateTime: {
          date: "土曜",
          timeSlot: "night",
          preferredStartHour: null,
        },
        mood: ["癒し"],
      }),
      "movie",
    );
    expect(res.question?.key).toBe("runtime");
    expect(res.question?.question).toContain("上映時間");
  });
});

describe("sanitizePrimaryQuestion — passthrough", () => {
  it("健全質問はそのまま通す", () => {
    const healthy: PrimaryUnresolvedQuestion = {
      key: "area",
      slot: "where",
      question: "どのあたりで観る？",
    };
    const res = sanitizePrimaryQuestion(healthy, makeBrief(), "movie");
    expect(res.sanitized).toBe(false);
    expect(res.reason).toBe("passthrough");
    expect(res.question).toBe(healthy);
  });

  it("q=null + area 未定 → null_filled で補充", () => {
    const res = sanitizePrimaryQuestion(null, makeBrief(), "movie");
    expect(res.reason).toBe("null_filled");
    expect(res.question?.slot).toBe("where");
  });
});

// ─────────────────────────────────────────────
// buildConditionQuestionFromAnalysis (legacy path 用)
// ─────────────────────────────────────────────

describe("buildConditionQuestionFromAnalysis", () => {
  it("movie / 全未定 → where 質問", () => {
    const q = buildConditionQuestionFromAnalysis(makeAnalysis(), "movie");
    expect(q?.slot).toBe("where");
  });

  it("movie / area あり / 時間未定 → when 質問", () => {
    const q = buildConditionQuestionFromAnalysis(
      makeAnalysis({ location: "渋谷" }),
      "movie",
    );
    expect(q?.slot).toBe("when");
  });

  it("food / 全未定 → where 質問", () => {
    const q = buildConditionQuestionFromAnalysis(makeAnalysis(), "food");
    expect(q?.slot).toBe("where");
  });

  it("travel など対象外テーマ → null", () => {
    const q = buildConditionQuestionFromAnalysis(makeAnalysis(), "travel");
    expect(q).toBeNull();
  });
});

// ─────────────────────────────────────────────
// E: Loop guard — avoidKey 対応
// ─────────────────────────────────────────────

describe("generateConditionQuestion — avoidKey loop guard", () => {
  it("movie / 全未定 / avoidKey=area → 次 (time/when) に進む", () => {
    const q = buildConditionQuestionFromAnalysis(
      makeAnalysis(),
      "movie",
      "area",
    );
    expect(q?.key).toBe("time");
    expect(q?.slot).toBe("when");
  });

  it("movie / area あり / avoidKey=time → 次 (mood/how) に進む", () => {
    const q = buildConditionQuestionFromAnalysis(
      makeAnalysis({ location: "渋谷" }),
      "movie",
      "time",
    );
    expect(q?.key).toBe("mood");
    expect(q?.slot).toBe("how");
  });

  it("movie / 全未定 / avoidKey=runtime (関係ない key) → 通常 area", () => {
    const q = buildConditionQuestionFromAnalysis(
      makeAnalysis(),
      "movie",
      "runtime",
    );
    expect(q?.key).toBe("area");
  });

  it("movie / 全スロット埋まっている / avoidKey=runtime → null (撤退)", () => {
    const res = sanitizePrimaryQuestion(
      null,
      makeBrief({
        area: "渋谷",
        approximateTime: {
          date: "土曜",
          timeSlot: "night",
          preferredStartHour: null,
        },
        mood: ["癒し"],
      }),
      "movie",
      "runtime",
    );
    expect(res.question).toBeNull();
    expect(res.reason).toBe("loop_avoided");
  });

  it("sanitizePrimaryQuestion / 健全質問 + avoidKey 一致 → 次条件に書き換え", () => {
    const healthy: PrimaryUnresolvedQuestion = {
      key: "area",
      slot: "where",
      question: "どのあたりで観る？",
    };
    const res = sanitizePrimaryQuestion(healthy, makeBrief(), "movie", "area");
    expect(res.sanitized).toBe(true);
    expect(res.question?.key).toBe("time");
  });

  it("food / 全スロット埋まっている / avoidKey=mood → null (food は runtime fallback 無し)", () => {
    const q = buildConditionQuestionFromAnalysis(
      makeAnalysis({ location: "渋谷", timeSlot: "night" }),
      "food",
      "mood",
    );
    expect(q).toBeNull();
  });
});
