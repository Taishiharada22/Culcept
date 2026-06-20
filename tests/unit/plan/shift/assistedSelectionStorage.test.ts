/**
 * SR S-geo Persist-3 — assistedSelectionStorage（localStorage IO 層）
 *
 * 不変条件:
 *   - 既存 pure 契約（toStoredPayload/parseStoredPayload/makeStorageKey）に乗せる（新 serialize なし）。
 *   - 座標メタデータのみ保存。raw 画像/base64/dataURI/blob は write/read 両方向で構造排除。
 *   - per-image fingerprint key。reset（gridCalibration を外した再保存）で stored から calibration が消え、
 *     dayColumns は残る。
 *   - SSR / localStorage 不可 / 破損 JSON でも throw しない（read=null / write=no-op）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  saveAssistedSelection,
  loadAssistedSelection,
  removeAssistedSelection,
} from "@/lib/plan/shift/assistedSelectionStorage";
import {
  makeStorageKey,
  type AssistedRowSelection,
  type GridCalibration,
} from "@/lib/plan/shift/assistedRowSelection";

// ── in-memory localStorage mock（jsdom 不使用・node env で globalThis に注入） ──
class MemoryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.m.keys())[i] ?? null;
  }
}

function installStorage(): MemoryStorage {
  const mem = new MemoryStorage();
  (globalThis as { localStorage?: Storage }).localStorage =
    mem as unknown as Storage;
  return mem;
}
function uninstallStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

const FP = "240000_1800x1260_abcd1234";
const SEL: AssistedRowSelection = {
  imageW: 1800,
  imageH: 1260,
  headerBand: { top: 100, bottom: 140 },
  personRowBand: { top: 490, bottom: 527 },
  dayColumns: { firstDayCenterX: 222, lastDayCenterX: 1585 },
  imageFingerprint: FP,
};
const CAL: GridCalibration = {
  gridLeft: 400,
  colWidth: 40,
  source: "manual_overlay",
  imageW: 1800,
  imageH: 1260,
  dayCount: 30,
};

describe("assistedSelectionStorage — roundtrip（座標のみ）", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = installStorage();
  });
  afterEach(() => {
    uninstallStorage();
  });

  it("save → load roundtrip（gridCalibration を含む selection が復元される）", () => {
    saveAssistedSelection({ ...SEL, gridCalibration: CAL }, "2026-06-05T00:00:00.000Z");
    const loaded = loadAssistedSelection(FP);
    expect(loaded).not.toBeNull();
    expect(loaded?.imageFingerprint).toBe(FP);
    expect(loaded?.gridCalibration).toEqual(CAL); // 座標 + context 完全一致
    expect(loaded?.dayColumns).toEqual({ firstDayCenterX: 222, lastDayCenterX: 1585 });
  });

  it("makeStorageKey 由来の per-image key に書かれる（別 fingerprint には混ざらない）", () => {
    saveAssistedSelection({ ...SEL, gridCalibration: CAL }, "t");
    expect(mem.getItem(makeStorageKey(FP))).not.toBeNull();
    expect(loadAssistedSelection("other_fingerprint")).toBeNull();
  });

  it("imageFingerprint 不在 → save no-op（toStoredPayload null）→ load null", () => {
    const { imageFingerprint: _omit, ...noFp } = SEL;
    saveAssistedSelection({ ...noFp, gridCalibration: CAL }, "t");
    expect(mem.length).toBe(0);
  });
});

describe("assistedSelectionStorage — reset 相当（calibration を外した再保存）", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = installStorage();
  });
  afterEach(() => {
    uninstallStorage();
  });

  it("save(cal) → save(cal なし) で stored から gridCalibration が消える（dayColumns は残る）", () => {
    saveAssistedSelection({ ...SEL, gridCalibration: CAL }, "t1");
    expect(loadAssistedSelection(FP)?.gridCalibration).toEqual(CAL);
    // reset 相当: gridCalibration を外した selection を同 fingerprint で再保存。
    saveAssistedSelection({ ...SEL }, "t2");
    const after = loadAssistedSelection(FP);
    expect(after).not.toBeNull();
    expect(after?.gridCalibration).toBeUndefined(); // calibration 消滅
    expect(after?.dayColumns).toEqual({ firstDayCenterX: 222, lastDayCenterX: 1585 }); // dayColumns 残存
    // 念のため raw localStorage 文字列にも gridCalibration 痕跡なし
    expect(mem.getItem(makeStorageKey(FP))).not.toMatch(/gridCalibration/);
  });

  it("removeAssistedSelection で key ごと消える（load null）", () => {
    saveAssistedSelection({ ...SEL, gridCalibration: CAL }, "t");
    expect(loadAssistedSelection(FP)).not.toBeNull();
    removeAssistedSelection(FP);
    expect(loadAssistedSelection(FP)).toBeNull();
    expect(mem.length).toBe(0);
  });
});

describe("assistedSelectionStorage — raw 画像/base64 を保存しない", () => {
  beforeEach(() => {
    installStorage();
  });
  afterEach(() => {
    uninstallStorage();
  });

  it("write 側: selection に混入した raw/base64 風 field は localStorage 文字列に出ない", () => {
    const tainted = {
      ...SEL,
      gridCalibration: {
        ...CAL,
        // 型外の混入を強制（実コードでは型で禁止）。
        rawImage: "iVBORw0KGgoAAAANSUhEUgAA",
        dataUri: "data:image/png;base64,AAAA",
        blob: { size: 1 },
      },
      imageBase64: "data:image/png;base64,BBBB",
    } as unknown as AssistedRowSelection;
    saveAssistedSelection(tainted, "t");
    const raw = (globalThis as { localStorage?: Storage }).localStorage!.getItem(
      makeStorageKey(FP)
    )!;
    expect(raw).not.toMatch(/base64|data:image|iVBORw0|rawImage|imageBase64|blob/i);
    // 座標は通る
    const loaded = loadAssistedSelection(FP);
    expect(loaded?.gridCalibration?.gridLeft).toBe(400);
    expect(loaded?.gridCalibration).not.toHaveProperty("rawImage");
    expect(loaded).not.toHaveProperty("imageBase64");
  });

  it("read 側: 手で raw を混ぜた JSON を直接 setItem しても load は座標のみ取り出す", () => {
    const tainted = {
      imageFingerprint: FP,
      imageW: 1800,
      imageH: 1260,
      headerBand: { top: 100, bottom: 140 },
      personRowBand: { top: 490, bottom: 527 },
      updatedAt: "t",
      dayColumns: { firstDayCenterX: 222, lastDayCenterX: 1585 },
      gridCalibration: {
        ...CAL,
        rawImage: "iVBORw0KGgo",
        dataUri: "data:image/png;base64,ZZZ",
      },
      imageBase64: "data:image/png;base64,QQQ",
    };
    (globalThis as { localStorage?: Storage }).localStorage!.setItem(
      makeStorageKey(FP),
      JSON.stringify(tainted)
    );
    const loaded = loadAssistedSelection(FP);
    expect(loaded?.gridCalibration).toEqual(CAL); // 座標 + context のみ
    expect(loaded?.gridCalibration).not.toHaveProperty("rawImage");
    expect(loaded).not.toHaveProperty("imageBase64");
  });
});

describe("assistedSelectionStorage — SSR / 破損 / 例外でも throw しない", () => {
  afterEach(() => {
    uninstallStorage();
  });

  it("localStorage 不在（SSR 相当）→ save/load/remove は no-op・throw しない", () => {
    uninstallStorage(); // localStorage 未定義
    expect(() =>
      saveAssistedSelection({ ...SEL, gridCalibration: CAL }, "t")
    ).not.toThrow();
    expect(loadAssistedSelection(FP)).toBeNull();
    expect(() => removeAssistedSelection(FP)).not.toThrow();
  });

  it("破損 JSON → load は null（throw しない）", () => {
    installStorage();
    (globalThis as { localStorage?: Storage }).localStorage!.setItem(
      makeStorageKey(FP),
      "{ this is : not json"
    );
    expect(loadAssistedSelection(FP)).toBeNull();
  });

  it("空 fingerprint → load null / save・remove no-op", () => {
    installStorage();
    expect(loadAssistedSelection("")).toBeNull();
    expect(() => saveAssistedSelection({ ...SEL, imageFingerprint: "" }, "t")).not.toThrow();
    expect(() => removeAssistedSelection("")).not.toThrow();
  });
});
