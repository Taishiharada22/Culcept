/**
 * CoAlter Phase 2 — conversationParser signals unit test (2026-04-19 v0.3 gate 6.B)
 *
 * 固定する契約（CEO 実装固定条件 2）:
 *  - 検出器は **検出のみ**。提案生成・翻訳・解決策を持ち込まない。
 *  - 返すのは ContradictionSignal / StallSignal のみ。
 */

import { describe, it, expect } from "vitest";

import {
  detectContradiction,
  detectMisread,
  detectStall,
} from "@/lib/coalter/conversationParser";
import type { ConversationTurn } from "@/lib/coalter/types";

const A = "user_a";
const B = "user_b";

function turn(
  senderId: string,
  body: string,
  offsetMin = 0,
  id?: string,
): ConversationTurn {
  return {
    id,
    senderId,
    body,
    createdAt: new Date(Date.parse("2026-04-19T12:00:00.000Z") + offsetMin * 60_000).toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════════
// detectContradiction
// ═════════════════════════════════════════════════════════════════════

describe("detectContradiction — A が希望 & B が否定（同軸）", () => {
  it("A: 静かな店がいい / B: 静かな店はちょっと → 検出", () => {
    const turns = [
      turn(A, "今日は静かな店がいいな"),
      turn(B, "静かな店はちょっと気分じゃない"),
    ];
    const sig = detectContradiction(turns, A, B);
    expect(sig.detected).toBe(true);
    expect(sig.axes).toContain("quietness");
    expect(sig.stanceA).toContain("静かな店がいい");
    expect(sig.stanceB).toContain("気分じゃない");
  });

  it("B: 近場に行きたい / A: 近いところは違う → 検出（逆方向）", () => {
    const turns = [
      turn(B, "今日は近くに行きたい"),
      turn(A, "近いところは違うな"),
    ];
    const sig = detectContradiction(turns, A, B);
    expect(sig.detected).toBe(true);
    expect(sig.axes).toContain("access");
  });
});

describe("detectContradiction — 非検出ケース", () => {
  it("両者が同じ希望 → 非検出", () => {
    const turns = [
      turn(A, "静かな店がいい"),
      turn(B, "静かな店にしよう"),
    ];
    const sig = detectContradiction(turns, A, B);
    expect(sig.detected).toBe(false);
    expect(sig.axes).toEqual([]);
    expect(sig.stanceA).toBeNull();
    expect(sig.stanceB).toBeNull();
  });

  it("軸が違う（quietness vs price） → 非検出（同軸で対立していない）", () => {
    const turns = [
      turn(A, "静かなところがいい"),
      turn(B, "予算は安い方がいい"),
    ];
    const sig = detectContradiction(turns, A, B);
    expect(sig.detected).toBe(false);
  });

  it("空入力 → 非検出", () => {
    expect(detectContradiction([], A, B)).toEqual({
      detected: false,
      axes: [],
      stanceA: null,
      stanceB: null,
    });
  });
});

describe("detectContradiction — 解決策を持ち込まない（検出器契約）", () => {
  it("返り値は signal だけ（summary や proposal のフィールドが存在しない）", () => {
    const turns = [
      turn(A, "静かな店がいい"),
      turn(B, "静かな店は避けたい"),
    ];
    const sig = detectContradiction(turns, A, B);
    const keys = Object.keys(sig).sort();
    expect(keys).toEqual(["axes", "detected", "stanceA", "stanceB"]);
  });

  it("stanceA / stanceB は根拠原文のまま返す（要約・翻訳しない）", () => {
    const raw = "静かな店がいいな、今日は疲れたし";
    const turns = [turn(A, raw), turn(B, "静かな店は合わない")];
    const sig = detectContradiction(turns, A, B);
    expect(sig.stanceA).toBe(raw);
  });
});

// ═════════════════════════════════════════════════════════════════════
// detectStall
// ═════════════════════════════════════════════════════════════════════

describe("detectStall — 膠着検出", () => {
  it("3 ターン以上決着せず → 検出", () => {
    const turns = [
      turn(A, "どうしよう"),
      turn(B, "うーん"),
      turn(A, "迷うな"),
    ];
    const sig = detectStall(turns, 3);
    expect(sig.detected).toBe(true);
    expect(sig.consecutiveTurns).toBe(3);
  });

  it("決着語が直近にある → 非検出", () => {
    const turns = [
      turn(A, "どうしよう"),
      turn(B, "うーん"),
      turn(A, "じゃあそれでいこう"),
    ];
    const sig = detectStall(turns, 3);
    expect(sig.detected).toBe(false);
  });

  it("ターン数不足 → 非検出", () => {
    const turns = [turn(A, "どうしよう")];
    const sig = detectStall(turns, 3);
    expect(sig.detected).toBe(false);
    expect(sig.consecutiveTurns).toBe(1);
  });
});

describe("detectStall — 解決策を持ち込まない（検出器契約）", () => {
  it("返り値は signal だけ（next_action / suggestion フィールドが存在しない）", () => {
    const turns = [turn(A, "a"), turn(B, "b"), turn(A, "c")];
    const sig = detectStall(turns, 3);
    const keys = Object.keys(sig).sort();
    expect(keys).toEqual(["consecutiveTurns", "detected"]);
  });
});

// ═════════════════════════════════════════════════════════════════════
// detectMisread — Phase A (CoAlter-local regex 実装)
//
// CEO 承認条件 (2026-04-19 採用案 A):
//  1. confidence は保守的 (明示困惑 0.8 / 連続質問 0.7 / topic drift 0.6)
//  2. multiple signals は加点しない (最強シグナル採用)
//  3. Intent Translation を direct import しない (純関数)
// ═════════════════════════════════════════════════════════════════════

describe("detectMisread — 明示的困惑語 (confidence 0.8)", () => {
  it("B が「え?」で困惑 → direction=a_to_b, confidence=0.8", () => {
    const turns = [
      turn(A, "土曜はあれにしよう", 0, "m1"),
      turn(B, "え?"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.8);
    expect(sig.direction).toBe("a_to_b");
    expect(sig.anchorMessageId).toBe("m1");
  });

  it("A が「どういうこと?」で困惑 → direction=b_to_a", () => {
    const turns = [
      turn(B, "あれでいいよね", 0, "m1"),
      turn(A, "どういうこと?"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.8);
    expect(sig.direction).toBe("b_to_a");
    expect(sig.anchorMessageId).toBe("m1");
  });

  it("「意味わかんない」も明示語として検出", () => {
    const turns = [
      turn(A, "じゃあそれで", 0, "m1"),
      turn(B, "意味わかんないんだけど"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.8);
    expect(sig.direction).toBe("a_to_b");
  });

  it("「???」も明示語として検出", () => {
    const turns = [
      turn(A, "ok了解", 0, "m1"),
      turn(B, "???"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.8);
  });

  it("anchor 直前の相手発話が無ければ anchorMessageId=null", () => {
    const turns = [
      turn(B, "え?"),
    ];
    const sig = detectMisread(turns, A, B);
    // 2 ターン未満なので MISREAD_EMPTY が返る
    expect(sig.confidence).toBe(0);
  });
});

describe("detectMisread — 連続質問 (confidence 0.7)", () => {
  it("A が 2 ターン連続で疑問 (間に B の応答あり) → direction=b_to_a, confidence=0.7", () => {
    const turns = [
      turn(A, "いつ空いてる?", 0, "m1"),
      turn(B, "まあね", 1, "m2"),
      turn(A, "結局いつなの?", 2, "m3"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.7);
    expect(sig.direction).toBe("b_to_a");
  });
});

describe("detectMisread — topic drift (confidence 0.6)", () => {
  it("A: 価格の話 / B: 時間の話 → drift 検出", () => {
    // A が price axis, B が runtime axis → 共通軸なし
    // direction = "a_to_b" (B が A の話題 price を拾えず runtime に drift した)
    const turns = [
      turn(A, "予算は安い方がいい", 0, "m1"),
      turn(B, "上映時間は長いのが好き", 1, "m2"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0.6);
    expect(sig.direction).toBe("a_to_b");
    expect(sig.anchorMessageId).toBe("m1");
  });

  it("片方に軸がない (挨拶など) → drift 判定しない", () => {
    const turns = [
      turn(A, "おはよう"),
      turn(B, "予算は安い方がいい"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0);
  });

  it("同じ軸 (price 同士) なら drift ではない", () => {
    const turns = [
      turn(A, "予算は抑えたい"),
      turn(B, "安い店がいい"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0);
  });
});

describe("detectMisread — 非検出 / 過検知防止", () => {
  it("空入力 → MISREAD_EMPTY", () => {
    expect(detectMisread([], A, B)).toEqual({
      confidence: 0,
      direction: null,
      anchorMessageId: null,
    });
  });

  it("1 ターンのみ → MISREAD_EMPTY", () => {
    const sig = detectMisread([turn(A, "え?")], A, B);
    expect(sig.confidence).toBe(0);
  });

  it("通常の会話 (希望・同意のみ) → 非検出", () => {
    const turns = [
      turn(A, "静かな店がいいな"),
      turn(B, "いいね、そうしよう"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0);
  });

  it("A が希望 / B が否定 (contradiction) → 非検出 (negotiate 領域)", () => {
    const turns = [
      turn(A, "静かな店がいい"),
      turn(B, "静かな店は避けたい"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0);
  });

  it("stall 相当 (短文連続) → 非検出 (stall 領域)", () => {
    const turns = [
      turn(A, "うーん"),
      turn(B, "うん"),
      turn(A, "迷う"),
    ];
    const sig = detectMisread(turns, A, B);
    expect(sig.confidence).toBe(0);
  });
});

describe("detectMisread — 検出器契約 (提案・復元を含まない)", () => {
  it("返り値は signal だけ (confidence/direction/anchorMessageId の 3 キーのみ)", () => {
    const turns = [turn(A, "あれでいこう", 0, "m1"), turn(B, "え?")];
    const sig = detectMisread(turns, A, B);
    const keys = Object.keys(sig).sort();
    expect(keys).toEqual(["anchorMessageId", "confidence", "direction"]);
  });

  it("confidence は 0.6 / 0.7 / 0.8 / 0 のいずれか (連続加点しない)", () => {
    // 明示困惑 + topic drift が重なった場合も 0.8 のまま (加点しない)
    const turns = [
      turn(A, "予算は安い方がいい", 0, "m1"),
      turn(B, "え? 上映時間は長いのが好きだけど"),
    ];
    const sig = detectMisread(turns, A, B);
    // 明示困惑語が最強 → 0.8 (topic drift の 0.6 にならない)
    expect(sig.confidence).toBe(0.8);
  });
});
