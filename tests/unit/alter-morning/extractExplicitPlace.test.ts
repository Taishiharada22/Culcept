/**
 * extractExplicitPlace — PR A Commit 3 (CEO/GPT 2026-05-02)
 *
 * Goal:
 *   utterance から「時刻 span の後 + 活動 span の直前」 にある場所候補を
 *   厳格に抽出する。「で / に / から」 の助詞接続が必要、negative dict 排除。
 *
 * 不変条件 (CEO/GPT 厳密化):
 *   - 時刻 span の終端 index 以降、活動 span の開始 index 以前の substring が対象
 *   - 先頭の「に / から」 を除去
 *   - 末尾の「で」 を除去 (= 活動の前の助詞)
 *   - 残った文字列が 1-15 文字、句読点・特殊文字なし
 *   - negative dictionary (変更/相談/判断/かな/しよう/にして) と不一致
 *   - 「残り文字列から雑に抽出」 は禁止 (時刻 span / 活動 span の存在が前提)
 */

import { describe, it, expect } from "vitest";
import { extractExplicitPlace } from "@/lib/alter-morning/comprehension/extractExplicitPlace";

describe("extractExplicitPlace", () => {
  it("「12時に新宿でランチ」 → 新宿", () => {
    const result = extractExplicitPlace(
      "12時に新宿でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 7 },
    );
    expect(result).toBe("新宿");
  });

  it("「午後3時に渋谷で打ち合わせ」 → 渋谷", () => {
    const result = extractExplicitPlace(
      "午後3時に渋谷で打ち合わせ",
      { value: "15:00", span: "3時", index: 2 },
      { entry: { canonical: "打ち合わせ" } as any, span: "打ち合わせ", index: 7 },
    );
    expect(result).toBe("渋谷");
  });

  it("「18時から新宿で飲み会」 → 新宿", () => {
    const result = extractExplicitPlace(
      "18時から新宿で飲み会",
      { value: "18:00", span: "18時", index: 0 },
      { entry: { canonical: "飲み会" } as any, span: "飲み会", index: 7 },
    );
    expect(result).toBe("新宿");
  });

  it("「明日12時に新宿でランチ」 → 新宿", () => {
    const result = extractExplicitPlace(
      "明日12時に新宿でランチ",
      { value: "12:00", span: "12時", index: 2 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 9 },
    );
    expect(result).toBe("新宿");
  });

  // Negative cases
  it("活動語が時刻より前 → null (順序不正)", () => {
    const result = extractExplicitPlace(
      "ランチ12時新宿",
      { value: "12:00", span: "12時", index: 3 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 0 },
    );
    expect(result).toBeNull();
  });

  it("助詞「で」 が活動の直前にない → null", () => {
    // 「12時に新宿、ランチ」 (読点で区切られて、で が無い)
    const result = extractExplicitPlace(
      "12時に新宿、ランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("空文字 (時刻と活動が隣接) → null", () => {
    // 「12時ランチ」 (場所無し)
    const result = extractExplicitPlace(
      "12時ランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 3 },
    );
    expect(result).toBeNull();
  });

  it("場所候補が長すぎる (15 文字超) → null", () => {
    const longPlace = "あいうえおかきくけこさしすせそた"; // 16 文字
    const utterance = `12時に${longPlace}でランチ`;
    const placeIdx = "12時に".length;
    const activityIdx = `12時に${longPlace}で`.length;
    const result = extractExplicitPlace(
      utterance,
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: activityIdx },
    );
    expect(result).toBeNull();
  });

  it("negative dict 「変更」 を含む → null", () => {
    const result = extractExplicitPlace(
      "12時に変更でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("negative dict 「かな」 を含む → null", () => {
    const result = extractExplicitPlace(
      "12時にかなでランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("助詞のみ (「に」「で」 残り) → null", () => {
    // 場所候補が「、」 等の特殊文字のみ
    const result = extractExplicitPlace(
      "12時に、でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 6 },
    );
    expect(result).toBeNull();
  });

  it("「12時に新宿駅でランチ」 → 新宿駅 (駅含む地名 OK)", () => {
    const result = extractExplicitPlace(
      "12時に新宿駅でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { entry: { canonical: "ランチ" } as any, span: "ランチ", index: 8 },
    );
    expect(result).toBe("新宿駅");
  });
});
