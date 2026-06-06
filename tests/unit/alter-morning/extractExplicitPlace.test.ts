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
      { span: "ランチ", index: 7 },
    );
    expect(result).toBe("新宿");
  });

  it("「午後3時に渋谷で打ち合わせ」 → 渋谷", () => {
    const result = extractExplicitPlace(
      "午後3時に渋谷で打ち合わせ",
      { value: "15:00", span: "3時", index: 2 },
      { span: "打ち合わせ", index: 7 },
    );
    expect(result).toBe("渋谷");
  });

  it("「18時から新宿で飲み会」 → 新宿", () => {
    const result = extractExplicitPlace(
      "18時から新宿で飲み会",
      { value: "18:00", span: "18時", index: 0 },
      { span: "飲み会", index: 7 },
    );
    expect(result).toBe("新宿");
  });

  it("「明日12時に新宿でランチ」 → 新宿", () => {
    const result = extractExplicitPlace(
      "明日12時に新宿でランチ",
      { value: "12:00", span: "12時", index: 2 },
      { span: "ランチ", index: 9 },
    );
    expect(result).toBe("新宿");
  });

  // Negative cases
  it("活動語が時刻より前 → null (順序不正)", () => {
    const result = extractExplicitPlace(
      "ランチ12時新宿",
      { value: "12:00", span: "12時", index: 3 },
      { span: "ランチ", index: 0 },
    );
    expect(result).toBeNull();
  });

  it("助詞「で」 が活動の直前にない → null", () => {
    // 「12時に新宿、ランチ」 (読点で区切られて、で が無い)
    const result = extractExplicitPlace(
      "12時に新宿、ランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("空文字 (時刻と活動が隣接) → null", () => {
    // 「12時ランチ」 (場所無し)
    const result = extractExplicitPlace(
      "12時ランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 3 },
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
      { span: "ランチ", index: activityIdx },
    );
    expect(result).toBeNull();
  });

  it("negative dict 「変更」 を含む → null", () => {
    const result = extractExplicitPlace(
      "12時に変更でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("negative dict 「かな」 を含む → null", () => {
    const result = extractExplicitPlace(
      "12時にかなでランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 7 },
    );
    expect(result).toBeNull();
  });

  it("助詞のみ (「に」「で」 残り) → null", () => {
    // 場所候補が「、」 等の特殊文字のみ
    const result = extractExplicitPlace(
      "12時に、でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 6 },
    );
    expect(result).toBeNull();
  });

  it("「12時に新宿駅でランチ」 → 新宿駅 (駅含む地名 OK)", () => {
    const result = extractExplicitPlace(
      "12時に新宿駅でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 8 },
    );
    expect(result).toBe("新宿駅");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PR A Commit 7: negative pattern (who / duration / transport keyword)
  //   mid section に「と」「時間/分/秒」「電車/徒歩/...」 が含まれたら null。
  //   LLM が拾う方が情報が豊かなケースは deterministic で拾わない。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("PR A Commit 7: 「12時に新宿で高橋とランチ」 → null (人名連結 「と」)", () => {
    // mid = "新宿で高橋と" → 「と」 hit → null
    // index map: 1(0) 2(1) 時(2) に(3) 新(4) 宿(5) で(6) 高(7) 橋(8) と(9) ラ(10)
    const result = extractExplicitPlace(
      "12時に新宿で高橋とランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 10 },
    );
    expect(result).toBeNull();
  });

  it("PR A Commit 7: 「12時に新宿で30分だけランチ」 → null (明示 duration 「分」)", () => {
    // mid = "新宿で30分だけ" → 「分」 hit → null
    const result = extractExplicitPlace(
      "12時に新宿で30分だけランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 12 },
    );
    expect(result).toBeNull();
  });

  it("PR A Commit 7: 「12時に新宿で2時間ランチ」 → null (明示 duration 「時間」)", () => {
    // mid = "新宿で2時間" → 「時間」 hit → null
    const result = extractExplicitPlace(
      "12時に新宿で2時間ランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 10 },
    );
    expect(result).toBeNull();
  });

  it("PR A Commit 7: 「12時に電車で新宿に行ってランチ」 → null (transport keyword 「電車」)", () => {
    // mid = "電車で新宿に行って" → 「電車」 hit → null
    const result = extractExplicitPlace(
      "12時に電車で新宿に行ってランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 13 },
    );
    expect(result).toBeNull();
  });

  it("PR A Commit 7: 「12時に新宿三丁目でランチ」 → 新宿三丁目 (詳細地名 OK)", () => {
    // mid = "新宿三丁目で" → strip 「で」 → 「新宿三丁目」 (5 文字、neg pattern なし)
    const result = extractExplicitPlace(
      "12時に新宿三丁目でランチ",
      { value: "12:00", span: "12時", index: 0 },
      { span: "ランチ", index: 10 },
    );
    expect(result).toBe("新宿三丁目");
  });
});
