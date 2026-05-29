import { describe, it, expect } from "vitest";

import {
  shapeToSlot,
  collagePlacements,
  type OutfitSlot,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitCollagePlacement";
import type { CalendarOutfitItemShape } from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";

describe("shapeToSlot", () => {
  const cases: Array<[CalendarOutfitItemShape, OutfitSlot]> = [
    ["top", "top"],
    ["blouse", "top"],
    ["outer", "outer"],
    ["bottom", "bottom"],
    ["skirt", "bottom"],
    ["shoes", "shoes"],
    ["heels", "shoes"],
    ["bag", "bag"],
    ["watch", "accessory"],
  ];
  it.each(cases)("%s → %s", (shape, slot) => {
    expect(shapeToSlot(shape)).toBe(slot);
  });
});

describe("collagePlacements", () => {
  const item = (id: string, shape: CalendarOutfitItemShape) => ({ id, shape });

  it("入力順を保ち、 各アイテムに 1 配置を返す", () => {
    const items = [item("a", "blouse"), item("b", "bottom"), item("c", "shoes")];
    const out = collagePlacements(items);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out.map((p) => p.slot)).toEqual(["top", "bottom", "shoes"]);
  });

  it("座標は 0..100、 scale は正、 回転は有限", () => {
    const out = collagePlacements([
      item("a", "outer"),
      item("b", "top"),
      item("c", "bottom"),
      item("d", "shoes"),
      item("e", "bag"),
      item("f", "watch"),
    ]);
    for (const p of out) {
      expect(p.leftPct).toBeGreaterThanOrEqual(0);
      expect(p.leftPct).toBeLessThanOrEqual(100);
      expect(p.topPct).toBeGreaterThanOrEqual(0);
      expect(p.topPct).toBeLessThanOrEqual(100);
      expect(p.scale).toBeGreaterThan(0);
      expect(Number.isFinite(p.rotateDeg)).toBe(true);
    }
  });

  it("主役(top/outer)は脇役(shoes/bag)より大きく、 小物(accessory)が最前面", () => {
    const out = collagePlacements([
      item("top", "top"),
      item("shoes", "shoes"),
      item("acc", "watch"),
    ]);
    const byId = Object.fromEntries(out.map((p) => [p.id, p]));
    expect(byId.top.scale).toBeGreaterThan(byId.shoes.scale);
    expect(byId.acc.z).toBeGreaterThan(byId.top.z); // 小物は最前面
  });

  it("同一 slot 重複時は 2 つ目を背面(低 z)・小さめ・ずらして配置（破綻させない）", () => {
    const out = collagePlacements([item("t1", "top"), item("t2", "blouse")]);
    expect(out[0].slot).toBe("top");
    expect(out[1].slot).toBe("top");
    expect(out[1].z).toBeLessThan(out[0].z); // 背面へ
    expect(out[1].scale).toBeLessThan(out[0].scale); // 小さく
    expect(out[1].leftPct).not.toBe(out[0].leftPct); // ずらす
  });

  it("空入力 → 空配列", () => {
    expect(collagePlacements([])).toEqual([]);
  });

  it("未知 shape は extra slot に落ちる（型外れ防御）", () => {
    const out = collagePlacements([{ id: "x", shape: "zzz" as CalendarOutfitItemShape }]);
    expect(out[0].slot).toBe("extra");
  });
});
