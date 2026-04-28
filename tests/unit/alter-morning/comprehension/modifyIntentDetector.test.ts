/**
 * detectModifyIntent — PR #41a Commit 8 unit tests
 *
 * 検証観点:
 *   1. time-shift pattern (「9時を10時に」「09:00を10:00に」「9時→10時」) → modify + suggestedNewStartTime
 *   2. change keyword 単独 → modify、target_ref undefined
 *   3. cancel keyword → modify、change_scope=remove
 *   4. なし → not modify
 *   5. NFKC 正規化 (全角数字)
 *   6. 範囲外時刻 (25時、61分等) → 該当 pattern として認識しない
 */

import { describe, it, expect } from "vitest";
import { detectModifyIntent } from "@/lib/alter-morning/comprehension/modifyIntentDetector";

describe("detectModifyIntent — time-shift pattern (Strategy 1)", () => {
  it("[ROOT CAUSE 検証] '9時を10時に変更' → modify, target_ref='9時の予定', newStartTime='10:00'", () => {
    const result = detectModifyIntent("9時を10時に変更");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBe("9時の予定");
    expect(result.suggestedNewStartTime).toBe("10:00");
    expect(result.suggestedChangeScope).toBe("patch");
    expect(result.reasons.hasTimeShiftPattern).toBe(true);
    expect(result.reasons.hasChangeKeyword).toBe(true);
  });

  it("'9時を10時にする' → modify (にする keyword)", () => {
    const result = detectModifyIntent("9時を10時にする");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:00");
  });

  it("'09:00を10:00に変更' → modify with HH:mm precision", () => {
    const result = detectModifyIntent("09:00を10:00に変更");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBe("9時の予定");
    expect(result.suggestedNewStartTime).toBe("10:00");
  });

  it("'09:30を10:30に' → modify, suggestedNewStartTime='10:30'", () => {
    const result = detectModifyIntent("09:30を10:30に");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:30");
  });

  it("矢印 pattern '9時→10時' → modify", () => {
    const result = detectModifyIntent("9時→10時");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:00");
  });

  it("矢印 pattern '09:00 → 10:00' (空白あり) → modify", () => {
    const result = detectModifyIntent("09:00 → 10:00");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:00");
  });

  it("'10時を9時にずらす' (逆方向 / 別 keyword) → modify", () => {
    const result = detectModifyIntent("10時を9時にずらす");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBe("10時の予定");
    expect(result.suggestedNewStartTime).toBe("09:00");
  });

  it("範囲外時刻 (25時) → time-shift pattern として認識しない", () => {
    const result = detectModifyIntent("25時を10時に");
    // 25時は invalid time → time-shift not matched
    // ただし「に」 keyword は「変更/にする」の一部かどうか曖昧。Strategy 3 にも該当しないため not modify
    expect(result.reasons.hasTimeShiftPattern).toBe(false);
  });

  it("範囲外分 (61分) → time-shift pattern として認識しない", () => {
    const result = detectModifyIntent("09:61を10:00に");
    expect(result.reasons.hasTimeShiftPattern).toBe(false);
  });
});

describe("detectModifyIntent — cancel keyword (Strategy 2)", () => {
  it("'9時のスタバはキャンセル' → modify, change_scope=remove", () => {
    const result = detectModifyIntent("9時のスタバはキャンセル");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedChangeScope).toBe("remove");
    expect(result.reasons.hasCancelKeyword).toBe(true);
  });

  it("'昼食やめる' → modify, change_scope=remove", () => {
    const result = detectModifyIntent("昼食やめる");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedChangeScope).toBe("remove");
  });

  it("'最後の予定削除' → modify, change_scope=remove", () => {
    const result = detectModifyIntent("最後の予定削除");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedChangeScope).toBe("remove");
  });
});

describe("detectModifyIntent — change keyword 単独 (Strategy 3)", () => {
  it("'予定を変更したい' (時刻 pattern なし) → modify, target_ref undefined", () => {
    const result = detectModifyIntent("予定を変更したい");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBeUndefined();
    expect(result.suggestedChangeScope).toBe("patch");
  });

  it("'場所を変える' → modify (将来 place-shift で拡張)", () => {
    const result = detectModifyIntent("場所を変える");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBeUndefined();
  });
});

describe("detectModifyIntent — not modify", () => {
  it("'明日9時に渋谷のスタバ' (create utterance) → not modify", () => {
    const result = detectModifyIntent("明日9時に渋谷のスタバ");
    expect(result.isModifyIntent).toBe(false);
  });

  it("'このあと武藤さんとディナー' (append utterance) → not modify", () => {
    const result = detectModifyIntent("このあと武藤さんとディナー");
    expect(result.isModifyIntent).toBe(false);
  });

  it("空文字 → not modify", () => {
    const result = detectModifyIntent("");
    expect(result.isModifyIntent).toBe(false);
  });

  it("単純な質問 '今日の状態は？' → not modify", () => {
    const result = detectModifyIntent("今日の状態は？");
    expect(result.isModifyIntent).toBe(false);
  });
});

describe("detectModifyIntent — NFKC 正規化", () => {
  it("全角 '９時を１０時に変更' → 半角と同じ判定", () => {
    const result = detectModifyIntent("９時を１０時に変更");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedTargetRef).toBe("9時の予定");
    expect(result.suggestedNewStartTime).toBe("10:00");
  });

  it("全角コロン '０９：００を１０：００に' → 半角と同じ判定", () => {
    const result = detectModifyIntent("０９：００を１０：００に");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:00");
  });
});

describe("detectModifyIntent — Strategy 優先順位", () => {
  it("time-shift + change keyword 両方 → time-shift 優先 (より specific)", () => {
    const result = detectModifyIntent("9時を10時に変更");
    expect(result.suggestedTargetRef).toBe("9時の予定"); // time-shift の suggestedTargetRef
    expect(result.suggestedNewStartTime).toBe("10:00"); // time-shift の new time
  });

  it("time-shift + cancel keyword は (現状) time-shift 優先", () => {
    // 「9時を10時に変更してキャンセル」 のような両立しないケースは time-shift 優先で patch 扱い
    const result = detectModifyIntent("9時を10時にキャンセル");
    expect(result.isModifyIntent).toBe(true);
    expect(result.suggestedNewStartTime).toBe("10:00");
    expect(result.suggestedChangeScope).toBe("patch"); // time-shift = patch
  });
});
