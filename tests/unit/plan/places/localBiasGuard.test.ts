import { describe, it, expect } from "vitest";
import { rankByLocalBias, type LocalBiasGuardCandidate } from "@/lib/plan/places/localBiasGuard";

function c(
  name: string,
  address: string | null,
  distanceMeters: number | null,
): LocalBiasGuardCandidate {
  return { name, address, distanceMeters };
}

describe("rankByLocalBias — 入力エリア/距離で local 優先に再ランク", () => {
  it("localityText 一致（船橋）を最上位へ（東京の有名店を降格）", () => {
    const results = [
      c("スターバックス 渋谷店", "東京都渋谷区...", 30000),
      c("スターバックス 船橋店", "千葉県船橋市...", 2000),
      c("スターバックス 新宿店", "東京都新宿区...", 28000),
    ];
    const ranked = rankByLocalBias(results, { localityText: "船橋" });
    expect(ranked[0]!.name).toBe("スターバックス 船橋店");
  });

  it("bias 半径内を優先・近い順（locality 無し）", () => {
    const results = [
      c("遠いカフェ", "東京都...", 40000),
      c("近いカフェ", "千葉県船橋市...", 1500),
      c("中間カフェ", "千葉県...", 18000),
    ];
    const ranked = rankByLocalBias(results, { biasRadiusMeters: 20000 });
    expect(ranked.map((r) => r.name)).toEqual(["近いカフェ", "中間カフェ", "遠いカフェ"]);
  });

  it("localityHit は bias 距離より強い（入力エリア最優先）", () => {
    const results = [
      c("近いが別エリア", "東京都...", 1000),
      c("遠いが船橋", "千葉県船橋市...", 25000),
    ];
    const ranked = rankByLocalBias(results, { localityText: "船橋", biasRadiusMeters: 5000 });
    expect(ranked[0]!.name).toBe("遠いが船橋");
  });

  it("bias も locality も無ければ元順を保持（安定・退化なし）", () => {
    const results = [c("A", "x", null), c("B", "y", null), c("C", "z", null)];
    const ranked = rankByLocalBias(results, {});
    expect(ranked.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("2 文字未満の localityText は無視（部分一致暴発を防ぐ）", () => {
    // bias 無し → distanceMeters は null（route と同じ）。localityText 1 文字は無効 → 元順保持。
    const results = [c("X店", "東京都", null), c("Y店", "千葉県", null)];
    const ranked = rankByLocalBias(results, { localityText: "千" });
    expect(ranked.map((r) => r.name)).toEqual(["X店", "Y店"]);
  });

  it("元配列を破壊しない（新配列を返す）", () => {
    const results = [c("A", "東京都", 100), c("B", "千葉県船橋市", 200)];
    const copy = [...results];
    rankByLocalBias(results, { localityText: "船橋" });
    expect(results).toEqual(copy);
  });
});
