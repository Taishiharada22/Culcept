/**
 * CoAlter Phase 2 — clarifyBuilder unit test (2026-04-19 v0.3 gate 6.B)
 *
 * 固定する契約（CEO 実装固定条件 4、必須観点）:
 *  - **候補を絶対に出さない**（型上 proposals / candidates フィールドが存在しない）
 *  - neutralTranslation は **言い換えのみ**（感情調停・提案・感情中立化 禁止）
 *  - tone.maxQuestion === 0 → question は null
 *  - target 不明 → question は null
 *  - 依存禁止: lib/talk/intentTranslation/* を import しない
 *    （本テストでは「builder が MisreadSignal の戻り値を読むだけ」で動くことを実証）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildClarifyCard,
  assertParaphraseOnly,
} from "@/lib/coalter/clarifyBuilder";
import type {
  ClarifyBuilderInput,
} from "@/lib/coalter/clarifyBuilder";
import type {
  MisreadSignal,
  ConversationTurn,
  ToneModifier,
} from "@/lib/coalter/types";

const A = "user_a";
const B = "user_b";

const TONE_NORMAL: ToneModifier = { softenClosing: false, maxQuestion: 1 };
const TONE_SOFT: ToneModifier = { softenClosing: true, maxQuestion: 0 };

function turn(senderId: string, body: string, id?: string): ConversationTurn {
  return {
    id,
    senderId,
    body,
    createdAt: "2026-04-19T12:00:00.000Z",
  };
}

function defaultInput(over: Partial<ClarifyBuilderInput> = {}): ClarifyBuilderInput {
  return {
    misread: {
      confidence: 0.8,
      direction: "a_to_b",
      anchorMessageId: "m1",
    },
    recentTurns: [
      turn(A, "したい", "m1"),
      turn(B, "うん"),
    ],
    userAId: A,
    userBId: B,
    tone: TONE_NORMAL,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════
// 必須観点: 候補を絶対に出さない（型レベル + 値レベル）
// ═════════════════════════════════════════════════════════════════════

describe("buildClarifyCard — 候補を絶対に出さない（CEO 条件 4）", () => {
  it("返り値に candidates / proposals フィールドが存在しない", () => {
    const card = buildClarifyCard(defaultInput());
    expect(card).not.toHaveProperty("candidates");
    expect(card).not.toHaveProperty("proposals");
  });

  it("mode は 'clarify' のみ", () => {
    const card = buildClarifyCard(defaultInput());
    expect(card.mode).toBe("clarify");
  });

  it("フィールド集合は設計書 §4.3 の ClarifyCard 契約どおり", () => {
    const card = buildClarifyCard(defaultInput());
    const keys = Object.keys(card).sort();
    expect(keys).toEqual(
      ["closing", "mode", "neutralTranslation", "pointList", "question", "summary"].sort(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// 必須観点: neutralTranslation 非侵食（言い換えのみ）
// ═════════════════════════════════════════════════════════════════════

describe("buildClarifyCard — neutralTranslation は言い換えのみ", () => {
  it("direction=a_to_b のとき aToB が埋まり、bToA は null", () => {
    const card = buildClarifyCard(defaultInput());
    expect(card.neutralTranslation.aToB).not.toBeNull();
    expect(card.neutralTranslation.bToA).toBeNull();
  });

  it("direction=b_to_a のとき bToA が埋まり、aToB は null", () => {
    const card = buildClarifyCard(
      defaultInput({
        misread: { confidence: 0.8, direction: "b_to_a", anchorMessageId: "m1" },
        recentTurns: [turn(B, "したい", "m1")],
      }),
    );
    expect(card.neutralTranslation.bToA).not.toBeNull();
    expect(card.neutralTranslation.aToB).toBeNull();
  });

  it("anchor が無い場合は両方 null（感情調停に走らない）", () => {
    const card = buildClarifyCard(
      defaultInput({
        misread: { confidence: 0.8, direction: "a_to_b", anchorMessageId: null },
      }),
    );
    expect(card.neutralTranslation.aToB).toBeNull();
    expect(card.neutralTranslation.bToA).toBeNull();
  });

  it("生成された翻訳文は paraphrase 契約を遵守する（assertParaphraseOnly が通る）", () => {
    const card = buildClarifyCard(defaultInput());
    expect(() => assertParaphraseOnly(card.neutralTranslation.aToB)).not.toThrow();
    expect(() => assertParaphraseOnly(card.neutralTranslation.bToA)).not.toThrow();
  });
});

describe("assertParaphraseOnly — 禁止表現検出", () => {
  const forbidden = [
    "本当はこう思ってる",
    "気持ちは大事に",
    "こうすべき",
    "〜してあげて",
    "別の候補はこれ",
    "代わりに和食はどう",
    "提案: コース料理",
    "別の店を検討",
  ];

  it.each(forbidden)("「%s」は throw する", (text) => {
    expect(() => assertParaphraseOnly(text)).toThrow(/contract violated/);
  });

  it("null は通す（翻訳不能時は安全側）", () => {
    expect(() => assertParaphraseOnly(null)).not.toThrow();
  });

  it("純粋な言い換え（主語補完）は通す", () => {
    expect(() => assertParaphraseOnly("（静かな店がいい、という発言）")).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════
// question: emotion_heat mid / target 不明で 0 問
// ═════════════════════════════════════════════════════════════════════

describe("buildClarifyCard — question の 0 問条件", () => {
  it("tone.maxQuestion=0 → question は null", () => {
    const card = buildClarifyCard(defaultInput({ tone: TONE_SOFT }));
    expect(card.question).toBeNull();
  });

  it("direction=null（target 不明） → question は null", () => {
    const card = buildClarifyCard(
      defaultInput({
        misread: { confidence: 0.8, direction: null, anchorMessageId: "m1" },
      }),
    );
    expect(card.question).toBeNull();
  });

  it("通常系（maxQuestion=1 & direction=a_to_b）→ question は A に聞く", () => {
    const card = buildClarifyCard(defaultInput());
    expect(card.question).not.toBeNull();
    expect(card.question!.target).toBe("a");
  });
});

// ═════════════════════════════════════════════════════════════════════
// pointList: 事実 / 感情の分離
// ═════════════════════════════════════════════════════════════════════

describe("buildClarifyCard — pointList (facts / feelings)", () => {
  it("数値を含む発話は facts、感情語を含む発話は feelings に入る", () => {
    const card = buildClarifyCard(
      defaultInput({
        recentTurns: [
          turn(A, "19時に渋谷で"),
          turn(B, "今日は疲れた"),
          turn(A, "駅から徒歩5分"),
        ],
      }),
    );
    expect(card.pointList.facts.length).toBeGreaterThan(0);
    expect(card.pointList.feelings.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 依存禁止: intentTranslation を直接 import しない
// ═════════════════════════════════════════════════════════════════════

describe("clarifyBuilder — 依存禁止表（§3.6）の静的検証", () => {
  const filePath = resolve(process.cwd(), "lib/coalter/clarifyBuilder.ts");
  const source = readFileSync(filePath, "utf8");

  it("lib/talk/intentTranslation を import していない", () => {
    expect(source).not.toMatch(/from\s+["']@\/lib\/talk\/intentTranslation/);
    expect(source).not.toMatch(/from\s+["']\.\.\/talk\/intentTranslation/);
  });

  it("foodRanker / movieRanker を import していない", () => {
    expect(source).not.toMatch(/from\s+["']@\/lib\/coalter\/foodRanker/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/coalter\/movieRanker/);
    expect(source).not.toMatch(/from\s+["']\.\/foodRanker/);
    expect(source).not.toMatch(/from\s+["']\.\/movieRanker/);
  });

  it("webConnector を import していない", () => {
    expect(source).not.toMatch(/from\s+["']@\/lib\/coalter\/webConnector/);
    expect(source).not.toMatch(/from\s+["']\.\/webConnector/);
  });

  it("nvcAnalysis を import していない", () => {
    expect(source).not.toMatch(/from\s+["'][^"']*nvcAnalysis/);
    expect(source).not.toMatch(/import\s+["'][^"']*nvcAnalysis/);
  });
});
