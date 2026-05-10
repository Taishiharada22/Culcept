/**
 * detectMorningIntent unit tests (= CEO/GPT 2026-05-03 whitespace tolerant 修正)
 *
 * 検証:
 *   - whitespace 入りでも detect する (= 「明日 8 時」 / 「今日 14 時」 等)
 *   - whitespace なしも引き続き detect する (= 既存挙動 維持)
 *   - 非対象 input (= 「うん」「OK」) は none を返す
 */

import { describe, it, expect } from "vitest";
import { detectMorningIntent } from "@/lib/alter-morning/morningProtocol";

describe("[detectMorningIntent] whitespace tolerant", () => {
  it("「明日8時東京駅から渋谷へ」 → strong (= 既存、whitespace なし)", () => {
    expect(detectMorningIntent("明日8時東京駅から渋谷へ")).toBe("strong");
  });

  it("「明日 8 時東京駅から渋谷へ」 → strong (= CEO 2026-05-03 修正、半角 space)", () => {
    expect(detectMorningIntent("明日 8 時東京駅から渋谷へ")).toBe("strong");
  });

  it("「明日 8時東京駅から渋谷へ」 → strong (= 数字直前のみ space)", () => {
    expect(detectMorningIntent("明日 8時東京駅から渋谷へ")).toBe("strong");
  });

  it("「明日8 時東京駅から渋谷へ」 → strong (= 数字直後のみ space)", () => {
    expect(detectMorningIntent("明日8 時東京駅から渋谷へ")).toBe("strong");
  });

  it("「今日14時に歯医者」 → strong (= 既存)", () => {
    expect(detectMorningIntent("今日14時に歯医者")).toBe("strong");
  });

  it("「今日 14 時に歯医者」 → strong (= space 入り)", () => {
    expect(detectMorningIntent("今日 14 時に歯医者")).toBe("strong");
  });

  it("「14時に歯医者」 → strong (= 既存、今日なしでも時刻+予定)", () => {
    expect(detectMorningIntent("14時に歯医者")).toBe("strong");
  });

  it("「14 時に歯医者」 → strong (= space 入り、今日なし)", () => {
    expect(detectMorningIntent("14 時に歯医者")).toBe("strong");
  });

  it("「うん」 → none (= 対象外)", () => {
    expect(detectMorningIntent("うん")).toBe("none");
  });

  it("「ありがとう」 → none (= 対象外)", () => {
    expect(detectMorningIntent("ありがとう")).toBe("none");
  });

  it("「明日のプランを立てて」 → strong (= 既存 計画 pattern)", () => {
    expect(detectMorningIntent("明日のプランを立てて")).toBe("strong");
  });

  it("「明日 のプランを立てて」 → strong (= space あり 計画 pattern)", () => {
    expect(detectMorningIntent("明日 のプランを立てて")).toBe("strong");
  });
});
