import { describe, it, expect } from "vitest";

import {
  type ComposeTimeConstraint,
  DEFAULT_BLOCK_MIN,
  resolvePlacement,
  visualBlock,
} from "@/lib/plan/compose/composeTimeResolver";

const t = (
  mode: ComposeTimeConstraint["mode"],
  startMin?: number,
  endMin?: number,
): ComposeTimeConstraint => ({ mode, startMin, endMin });

describe("resolvePlacement — 未定 (none)", () => {
  it("drop 位置が開始、end は未保存(null)", () => {
    const r = resolvePlacement(t("none"), { dropStartMin: 905 });
    expect(r).toEqual({
      startMin: 905,
      endMin: null,
      crossesMidnight: false,
      edgeClamped: false,
    });
  });

  it("drop を当日 [0,1439] に clamp", () => {
    expect(resolvePlacement(t("none"), { dropStartMin: -10 }).startMin).toBe(0);
    expect(resolvePlacement(t("none"), { dropStartMin: 5000 }).startMin).toBe(1439);
  });
});

describe("resolvePlacement — 開始のみ (start)", () => {
  it("開始入力が上端、end は未保存(null)。drop は無視", () => {
    const r = resolvePlacement(t("start", 540), { dropStartMin: 900 });
    expect(r.startMin).toBe(540);
    expect(r.endMin).toBeNull();
    expect(r.crossesMidnight).toBe(false);
  });
});

describe("resolvePlacement — 終了のみ (end)", () => {
  it("start = end − 既定長(60)、end は保存", () => {
    const r = resolvePlacement(t("end", undefined, 1020)); // 17:00
    expect(r.startMin).toBe(1020 - DEFAULT_BLOCK_MIN); // 960 = 16:00
    expect(r.endMin).toBe(1020);
    expect(r.crossesMidnight).toBe(false);
    expect(r.edgeClamped).toBe(false);
  });

  it("end < 既定長 → start を 0 に clamp（edgeClamped）", () => {
    const r = resolvePlacement(t("end", undefined, 30)); // 0:30
    expect(r.startMin).toBe(0);
    expect(r.endMin).toBe(30);
    expect(r.edgeClamped).toBe(true);
    expect(r.crossesMidnight).toBe(false); // 0:00–0:30 は当日で有効
  });

  it("end=0(0:00) は退化 → crossesMidnight で退避", () => {
    const r = resolvePlacement(t("end", undefined, 0));
    expect(r.startMin).toBe(0);
    expect(r.endMin).toBe(0);
    expect(r.crossesMidnight).toBe(true);
  });

  it("既定長は opts で上書き可", () => {
    const r = resolvePlacement(t("end", undefined, 1020), { defaultBlockMin: 90 });
    expect(r.startMin).toBe(1020 - 90); // 930 = 15:30
  });
});

describe("resolvePlacement — 開始＋終了 (both)", () => {
  it("15:00–17:00 は end−start=120分。60で上書きしない（CEO 条件4）", () => {
    const r = resolvePlacement(t("both", 900, 1020));
    expect(r.startMin).toBe(900);
    expect(r.endMin).toBe(1020);
    expect(r.endMin! - r.startMin).toBe(120);
    expect(r.crossesMidnight).toBe(false);
    expect(r.edgeClamped).toBe(false);
  });

  it("end ≤ start（23:30–00:30 等）は日跨ぎ → crossesMidnight で退避（CEO 条件3）", () => {
    const wrap = resolvePlacement(t("both", 1410, 30)); // 23:30 → 0:30
    expect(wrap.crossesMidnight).toBe(true);
    const degenerate = resolvePlacement(t("both", 900, 900)); // 0 長
    expect(degenerate.crossesMidnight).toBe(true);
  });
});

describe("visualBlock", () => {
  it("end=null（未定/開始のみ）は既定長で仮描画（保存値ではない）", () => {
    const r = resolvePlacement(t("none"), { dropStartMin: 900 });
    expect(visualBlock(r)).toEqual({ startMin: 900, endMin: 960 });
  });

  it("end=null の仮長は 1440 を超えない", () => {
    const r = resolvePlacement(t("start", 1410)); // 23:30
    expect(visualBlock(r)).toEqual({ startMin: 1410, endMin: 1440 });
  });

  it("end 確定（開始＋終了）はそのまま（60で上書きしない）", () => {
    const r = resolvePlacement(t("both", 900, 1020));
    expect(visualBlock(r)).toEqual({ startMin: 900, endMin: 1020 });
  });
});
