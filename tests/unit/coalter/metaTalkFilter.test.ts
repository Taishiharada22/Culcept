/**
 * [B / U1 red tests — 2026-04-20]
 *
 *  CoAlter retrieval 汚染源の切り分け:
 *   U1a: META_TALK_PATTERNS（狭い）で、CoAlter 宛のメタ発話・露骨な罵倒語を
 *        recentMessages から除去する。感情語一般は対象外（relationship signal 保護）。
 *   U1b: トピック新鮮性分岐。数分前の別話題が `combined` に混入して
 *        decideSearch / extractMentionedCandidates を汚染するのを防ぐ。
 *        最後のメッセージから大きな gap が空いたら、その前を drop。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(async () => []),
}));

import {
  filterMetaTalk,
  META_TALK_PATTERNS,
} from "@/lib/coalter/conversationParser";
import { filterCurrentTopicBurst } from "@/lib/coalter/webConnector";
import type { ConversationTurn } from "@/lib/coalter/types";

const A = "user-a";
const B = "user-b";

function turn(body: string, offsetMinutes: number, sender: string = A): ConversationTurn {
  return {
    senderId: sender,
    body,
    createdAt: new Date(Date.now() - offsetMinutes * 60_000).toISOString(),
  };
}

describe("U1a META_TALK_PATTERNS filter (narrow)", () => {
  it("「coalter」を含む body は除去される", () => {
    const msgs = [
      turn("coalter クソ使えねーな", 2),
      turn("渋谷でご飯行こう", 1),
    ];
    const filtered = filterMetaTalk(msgs);
    expect(filtered.map((m) => m.body)).toEqual(["渋谷でご飯行こう"]);
  });

  it("「使えね」「クソ」「ゴミ」「使えない」は除去される", () => {
    const msgs = [
      turn("このAIゴミすぎる", 5),
      turn("coalter使えない", 4),
      turn("クソな提案ばっかり", 3),
      turn("お寿司食べたい", 1),
    ];
    const filtered = filterMetaTalk(msgs);
    expect(filtered.map((m) => m.body)).toEqual(["お寿司食べたい"]);
  });

  it("感情語（悲しい・嬉しい・怒り）は除去されない（relationship signal 保護）", () => {
    const msgs = [
      turn("ちょっと悲しかった", 3),
      turn("嬉しいな", 2),
      turn("腹立つわ", 1),
    ];
    const filtered = filterMetaTalk(msgs);
    expect(filtered.length).toBe(3);
  });

  it("META 発話なし → そのまま返る", () => {
    const msgs = [turn("今日の夕飯どうする？", 2), turn("ラーメンいいね", 1)];
    const filtered = filterMetaTalk(msgs);
    expect(filtered).toEqual(msgs);
  });

  it("全件が META → 空配列", () => {
    const msgs = [turn("coalter ゴミ", 2), turn("クソ使えねえ", 1)];
    const filtered = filterMetaTalk(msgs);
    expect(filtered).toEqual([]);
  });

  it("META_TALK_PATTERNS は export されている", () => {
    expect(Array.isArray(META_TALK_PATTERNS)).toBe(true);
    expect(META_TALK_PATTERNS.length).toBeGreaterThan(0);
    expect(META_TALK_PATTERNS.length).toBeLessThanOrEqual(10);
  });
});

describe("U1b topic-freshness branching (gap-based)", () => {
  it("gap > 10 分なら、その前のメッセージは drop", () => {
    const msgs = [
      turn("映画見に行きたい", 40, A),  // 40 分前 (stale topic)
      turn("ハリポタいいね", 38, B),    //
      // ← 28 分の gap
      turn("お昼何食べる？", 10, A),    // 10 分前 (fresh topic)
      turn("ラーメンかな", 9, B),
      turn("渋谷あたりで", 8, A),
    ];
    const burst = filterCurrentTopicBurst(msgs);
    expect(burst.map((m) => m.body)).toEqual([
      "お昼何食べる？",
      "ラーメンかな",
      "渋谷あたりで",
    ]);
  });

  it("全メッセージが近接（gap 全部 <10 分）→ そのまま返る", () => {
    const msgs = [
      turn("渋谷でご飯", 6, A),
      turn("いいね", 4, B),
      turn("寿司にする？", 2, A),
    ];
    const burst = filterCurrentTopicBurst(msgs);
    expect(burst).toEqual(msgs);
  });

  it("gap がちょうど境界（10 分）→ split 対象（閾値超のみ drop）", () => {
    const msgs = [
      turn("昔の話", 15, A),
      turn("そうね", 14, B),
      // gap 14 - 3 = 11 分 > 10
      turn("今の話", 3, A),
      turn("了解", 2, B),
    ];
    const burst = filterCurrentTopicBurst(msgs);
    expect(burst.map((m) => m.body)).toEqual(["今の話", "了解"]);
  });

  it("メッセージ 0 / 1 件 → そのまま返る", () => {
    expect(filterCurrentTopicBurst([])).toEqual([]);
    const one = [turn("hello", 1)];
    expect(filterCurrentTopicBurst(one)).toEqual(one);
  });

  it("複数の gap がある → 最後の gap より後のみ残る", () => {
    const msgs = [
      turn("話題A-1", 60, A),
      turn("話題A-2", 59, B),
      // gap 59-40 = 19 分
      turn("話題B-1", 40, A),
      turn("話題B-2", 39, B),
      // gap 39-5 = 34 分
      turn("話題C-1", 5, A),
      turn("話題C-2", 4, B),
    ];
    const burst = filterCurrentTopicBurst(msgs);
    expect(burst.map((m) => m.body)).toEqual(["話題C-1", "話題C-2"]);
  });
});
