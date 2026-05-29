import { describe, it, expect } from "vitest";

import {
  OutfitItemView,
  toOutfitItemAsset,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/OutfitItemView";
import type { OutfitItemAssetSource } from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";

/**
 * Slice 2 (Option A) — outfit asset fallback foundation。
 * 「画像がなくても破綻しない、 画像が来たら一気に強くなる」器が 3 状態へ正しく分岐するかを固定する。
 * 3 分岐 (withImage / placeholder / missing) が全て live であること (= 死んだ JSX でない) を担保。
 */
describe("toOutfitItemAsset — 3 状態の判別", () => {
  it("imageUrl があれば withImage を返す (実画像表示, color→colorHint)", () => {
    const src: OutfitItemAssetSource = {
      id: "i1",
      label: "ネイビー ジャケット",
      category: "アウター",
      shape: "outer",
      color: "#3b4a63",
      imageUrl: "data:image/png;base64,Zm9v",
    };
    const asset = toOutfitItemAsset(src);
    expect(asset.kind).toBe("withImage");
    if (asset.kind === "withImage") {
      expect(asset.imageUrl).toBe(src.imageUrl);
      expect(asset.colorHint).toBe("#3b4a63");
      expect(asset.label).toBe("ネイビー ジャケット");
      expect(asset.category).toBe("アウター");
    }
  });

  it("画像なし + shape + color なら placeholder を返す (SVG シルエット)", () => {
    const src: OutfitItemAssetSource = {
      id: "i2",
      label: "オフホワイト ブラウス",
      category: "トップス",
      shape: "blouse",
      color: "#f1ede6",
    };
    const asset = toOutfitItemAsset(src);
    expect(asset.kind).toBe("placeholder");
    if (asset.kind === "placeholder") {
      expect(asset.shape).toBe("blouse");
      expect(asset.color).toBe("#f1ede6");
    }
  });

  it("画像も shape/color も無ければ missing を返す (中立シルエット)", () => {
    const src: OutfitItemAssetSource = { id: "i3", label: "不明アイテム" };
    expect(toOutfitItemAsset(src).kind).toBe("missing");
  });

  it("color はあるが shape が無い場合も missing (シルエットを描けない)", () => {
    const src: OutfitItemAssetSource = { id: "i4", label: "色だけ既知", color: "#cccccc" };
    expect(toOutfitItemAsset(src).kind).toBe("missing");
  });

  it("空文字の imageUrl は withImage にしない (placeholder へフォールバック)", () => {
    const src: OutfitItemAssetSource = {
      id: "i5",
      label: "空URL",
      category: "トップス",
      shape: "top",
      color: "#e3d6c3",
      imageUrl: "",
    };
    expect(toOutfitItemAsset(src).kind).toBe("placeholder");
  });

  it("現行 mock 形 (shape+color 必須) はそのまま placeholder へ落ちる (見た目不変の保証)", () => {
    const vmLike: OutfitItemAssetSource = {
      id: "of-blouse",
      label: "オフホワイト ブラウス",
      category: "トップス",
      shape: "blouse",
      color: "#f1ede6",
    };
    expect(toOutfitItemAsset(vmLike).kind).toBe("placeholder");
  });
});

describe("OutfitItemView export 健全性", () => {
  it("OutfitItemView がコンポーネントとして export されている (import 健全性)", () => {
    expect(typeof OutfitItemView).toBe("function");
  });
});
