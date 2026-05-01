/**
 * findActivitySpanInUtterance — PR A Commit 1 (CEO 2026-05-02)
 *
 * 用途: deterministicOperationSynth.detectAppendPattern が
 *   「時刻 span の後 + 活動 span の直前」 から場所候補を切り出すために、
 *   utterance 内での活動 alias の **位置 index** を取得する helper。
 *
 * resolveActivity は normalize で位置情報を破壊するため、本 helper を新規追加。
 *
 * 不変条件 (CEO/GPT 2026-05-02):
 *   - 最長一致優先 (例: 「打ち合わせ」 vs 「合わせ」)
 *   - 同じ長さなら最も前に出たもの
 *   - hit しなければ null
 */

import { describe, it, expect } from "vitest";
import { findActivitySpanInUtterance } from "@/lib/alter-morning/activityVocabulary";

describe("findActivitySpanInUtterance", () => {
  it("「12時に新宿でランチ」 → entry=ランチ, span=ランチ, index=8", () => {
    const result = findActivitySpanInUtterance("12時に新宿でランチ");
    expect(result).not.toBeNull();
    expect(result!.entry.canonical).toBe("ランチ");
    expect(result!.span).toBe("ランチ");
    expect(result!.index).toBe(7); // "12時に新宿で" = 7 文字 (1+2+時+に+新+宿+で)
  });

  it("「午後3時に渋谷で打ち合わせ」 → 打ち合わせ", () => {
    const result = findActivitySpanInUtterance("午後3時に渋谷で打ち合わせ");
    expect(result).not.toBeNull();
    expect(result!.entry.canonical).toBe("打ち合わせ");
    expect(result!.span).toBe("打ち合わせ");
    expect(result!.index).toBeGreaterThan(0);
  });

  it("「18時から新宿で飲み会」 → 飲み会", () => {
    const result = findActivitySpanInUtterance("18時から新宿で飲み会");
    expect(result).not.toBeNull();
    expect(result!.entry.canonical).toBe("飲み会");
  });

  it("「ミーティング」 単独 → ミーティング", () => {
    const result = findActivitySpanInUtterance("ミーティング");
    expect(result).not.toBeNull();
    expect(result!.entry.canonical).toBe("ミーティング");
    expect(result!.index).toBe(0);
  });

  it("活動語なし「電車」 → null", () => {
    const result = findActivitySpanInUtterance("電車");
    expect(result).toBeNull();
  });

  it("活動語なし「新宿」 → null", () => {
    const result = findActivitySpanInUtterance("新宿");
    expect(result).toBeNull();
  });

  it("活動語なし「9時を10時に変更」 → null", () => {
    const result = findActivitySpanInUtterance("9時を10時に変更");
    expect(result).toBeNull();
  });

  // 最長一致優先 (CEO/GPT 重要条件)
  it("最長一致優先: 「打ち合わせ」 が 「合わせ」 より先に hit", () => {
    // 「打ち合わせ」 (5 文字) vs 単純な部分 match のサイズ比較
    const result = findActivitySpanInUtterance("打ち合わせ");
    expect(result).not.toBeNull();
    expect(result!.span).toBe("打ち合わせ");
    expect(result!.span.length).toBe(5);
  });

  // alias で hit
  it("alias 「MTG」 → ミーティング canonical", () => {
    const result = findActivitySpanInUtterance("12時にMTG");
    expect(result).not.toBeNull();
    expect(result!.entry.canonical).toBe("ミーティング");
    expect(result!.span).toBe("MTG");
  });

  it("空文字 → null", () => {
    expect(findActivitySpanInUtterance("")).toBeNull();
  });
});
