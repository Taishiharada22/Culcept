/**
 * extendTimeWithModifier — PR A Commit 2 (CEO 2026-05-02)
 *
 * 「午後3時」 「朝7時」 「夜8時」 等の prefix を扱い、HH:MM 値を補正する。
 * extractExplicitTimes (rulePreParse) は 24h 形式で N時 を返すため、
 * 「午後3時」 → "03:00" → "15:00" のような prefix 補正が必要。
 *
 * 不変条件:
 *   - 入力: utterance + 既存抽出された時刻 span (extractExplicitTimes 結果)
 *   - 各時刻 span に対して、その直前に「午後」「夜」「晩」 prefix があるか確認
 *   - hit したら HH+12 (ただし 13-23 範囲)
 *   - 「朝」 prefix は変換不要 (そのまま)
 *   - 既に 13-23 の場合は変換しない (24h format respect)
 */

import { describe, it, expect } from "vitest";
import { extendTimeWithModifier } from "@/lib/alter-morning/comprehension/extendTimeWithModifier";

describe("extendTimeWithModifier", () => {
  it("「午後3時」 → 15:00", () => {
    const result = extendTimeWithModifier("午後3時に渋谷で打ち合わせ", [
      { value: "03:00", span: "3時", index: 2 },
    ]);
    expect(result).toEqual([{ value: "15:00", span: "3時", index: 2 }]);
  });

  it("「朝7時」 → 07:00 (変換不要)", () => {
    const result = extendTimeWithModifier("朝7時に新宿で朝食", [
      { value: "07:00", span: "7時", index: 1 },
    ]);
    expect(result).toEqual([{ value: "07:00", span: "7時", index: 1 }]);
  });

  it("「夜8時」 → 20:00", () => {
    const result = extendTimeWithModifier("夜8時に銀座でディナー", [
      { value: "08:00", span: "8時", index: 1 },
    ]);
    expect(result).toEqual([{ value: "20:00", span: "8時", index: 1 }]);
  });

  it("「12時」 (prefix なし) → 12:00 (そのまま)", () => {
    const result = extendTimeWithModifier("12時に新宿でランチ", [
      { value: "12:00", span: "12時", index: 0 },
    ]);
    expect(result).toEqual([{ value: "12:00", span: "12時", index: 0 }]);
  });

  it("既に 24h 形式 「18時」 → 18:00 (そのまま)", () => {
    const result = extendTimeWithModifier("18時から新宿で飲み会", [
      { value: "18:00", span: "18時", index: 0 },
    ]);
    expect(result).toEqual([{ value: "18:00", span: "18時", index: 0 }]);
  });

  it("「午後12時」 → 12:00 (午後12 は noon、加算しない、午後 1-11 のみ +12)", () => {
    const result = extendTimeWithModifier("午後12時に集合", [
      { value: "12:00", span: "12時", index: 2 },
    ]);
    expect(result).toEqual([{ value: "12:00", span: "12時", index: 2 }]);
  });

  it("空配列 → 空配列", () => {
    expect(extendTimeWithModifier("何でも", [])).toEqual([]);
  });

  it("「晩7時」 → 19:00 (晩 も夜と同等)", () => {
    const result = extendTimeWithModifier("晩7時に居酒屋", [
      { value: "07:00", span: "7時", index: 1 },
    ]);
    expect(result).toEqual([{ value: "19:00", span: "7時", index: 1 }]);
  });

  it("「9:30」 colon 形式 (prefix 無し) → そのまま", () => {
    const result = extendTimeWithModifier("9:30 に集合", [
      { value: "09:30", span: "9:30", index: 0 },
    ]);
    expect(result).toEqual([{ value: "09:30", span: "9:30", index: 0 }]);
  });

  it("複数時刻 「12時と15時」 → それぞれ独立に処理", () => {
    const result = extendTimeWithModifier("12時と15時に予定", [
      { value: "12:00", span: "12時", index: 0 },
      { value: "15:00", span: "15時", index: 4 },
    ]);
    expect(result).toEqual([
      { value: "12:00", span: "12時", index: 0 },
      { value: "15:00", span: "15時", index: 4 },
    ]);
  });
});
