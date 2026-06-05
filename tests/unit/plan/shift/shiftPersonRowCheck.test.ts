/**
 * SR A2A — shiftPersonRowCheck（本人行 rowLabel cross-check）
 *
 * 不変条件:
 *   - ownerLabel と rowLabel が（normalize 後）一致 → match。
 *   - 全角/半角/空白差を normalize して一致扱い。
 *   - rowLabel 欠落 → missing（**hard block しない**・低優先 note）。
 *   - mismatch → high-priority warning（**hard block しない**）。
 *   - block は常に false（hard 化は smoke 後 CEO 判断）。throw しない。
 */
import { describe, it, expect } from "vitest";

import {
  normalizePersonLabel,
  crossCheckRowLabel,
  representativeRowLabel,
} from "@/lib/plan/shift/shiftPersonRowCheck";

const OWNER = "原田 大志";

describe("normalizePersonLabel", () => {
  it("空白を除去（半角/全角スペース両方）", () => {
    expect(normalizePersonLabel("原田 大志")).toBe("原田大志");
    expect(normalizePersonLabel("原田　大志")).toBe("原田大志"); // 全角スペース U+3000
    expect(normalizePersonLabel("  原田  大志  ")).toBe("原田大志");
  });

  it("NFKC で全角英数字 → 半角（混在名でも安定）", () => {
    expect(normalizePersonLabel("ＡＢＣ")).toBe("ABC");
  });

  it("非 string → ''（throw しない）", () => {
    expect(normalizePersonLabel(null)).toBe("");
    expect(normalizePersonLabel(undefined)).toBe("");
    expect(normalizePersonLabel(123)).toBe("");
  });
});

describe("crossCheckRowLabel", () => {
  it("owner と row が一致 → match / severity none / block false（CEO #6）", () => {
    const r = crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: "原田大志" });
    expect(r.status).toBe("match");
    expect(r.severity).toBe("none");
    expect(r.block).toBe(false);
  });

  it("全角スペース差を normalize して一致（CEO #7）", () => {
    expect(crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: "原田　大志" }).status).toBe("match");
    expect(crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: " 原田 大志 " }).status).toBe("match");
  });

  it("row が owner を包含（余分な文字あり）→ match（既存 filterByPersonRow と同方向）", () => {
    const r = crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: "原田大志（社員）" });
    expect(r.status).toBe("match");
  });

  it("rowLabel 欠落（空 / 空白 / undefined）→ missing・note・**block しない**（CEO #8）", () => {
    for (const row of ["", "   ", undefined, null]) {
      const r = crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: row });
      expect(r.status).toBe("missing");
      expect(r.severity).toBe("note");
      expect(r.block).toBe(false);
    }
  });

  it("明らかに別人名 → mismatch・warning（high-priority）・**block しない**（CEO #9）", () => {
    const r = crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: "佐藤 花子" });
    expect(r.status).toBe("mismatch");
    expect(r.severity).toBe("warning");
    expect(r.block).toBe(false);
    expect(r.message).toContain("佐藤"); // 不一致の手掛かりを safe copy で示す
  });

  it("row が owner の一部しか持たない（owner ⊄ row）→ mismatch warning（本人行欠落の疑い）", () => {
    // 「原田」だけでは owner「原田大志」を包含しない → filter なら drop される＝要確認。
    const r = crossCheckRowLabel({ ownerLabel: OWNER, rowLabel: "原田" });
    expect(r.status).toBe("mismatch");
    expect(r.severity).toBe("warning");
  });

  it("block は常に false（A2A は hard block しない）", () => {
    const cases = [
      { ownerLabel: OWNER, rowLabel: "原田大志" },
      { ownerLabel: OWNER, rowLabel: "" },
      { ownerLabel: OWNER, rowLabel: "別人" },
    ];
    for (const c of cases) expect(crossCheckRowLabel(c).block).toBe(false);
  });

  it("throw しない（owner/row 非 string・null・undefined）（CEO #10）", () => {
    expect(() =>
      crossCheckRowLabel({ ownerLabel: null as unknown as string, rowLabel: 42 as unknown as string })
    ).not.toThrow();
    // owner も row も空 → missing（row 空が先に効く）
    const r = crossCheckRowLabel({ ownerLabel: undefined, rowLabel: undefined });
    expect(r.status).toBe("missing");
  });

  it("deterministic（同入力 → 同出力）", () => {
    const input = { ownerLabel: OWNER, rowLabel: "原田大志" };
    expect(crossCheckRowLabel(input)).toEqual(crossCheckRowLabel(input));
  });
});

describe("representativeRowLabel（A2B-1・代表 rowLabel + 混在検出）", () => {
  it("最頻の非空 rowLabel を返す（representative = raw / normalizedRepresentative）", () => {
    const s = representativeRowLabel([
      { rowLabel: "原田 大志" },
      { rowLabel: "原田 大志" },
      { rowLabel: "佐藤" },
    ]);
    expect(s.representative).toBe("原田 大志");
    expect(s.normalizedRepresentative).toBe("原田大志");
  });

  it("2 種以上混在 → hasConflict=true（隣接行混入の兆候）", () => {
    const s = representativeRowLabel([{ rowLabel: "原田大志" }, { rowLabel: "佐藤花子" }]);
    expect(s.hasConflict).toBe(true);
    expect(s.uniqueNormalizedLabels).toEqual(["佐藤花子", "原田大志"].sort());
  });

  it("全角/半角/空白差は同一視 → hasConflict=false", () => {
    const s = representativeRowLabel([
      { rowLabel: "原田 大志" },
      { rowLabel: "原田　大志" }, // 全角スペース
      { rowLabel: "原田大志" },
    ]);
    expect(s.uniqueNormalizedLabels).toEqual(["原田大志"]);
    expect(s.hasConflict).toBe(false);
  });

  it("空/空白/欠落/非 string は無視（全部空 → representative undefined）", () => {
    const s = representativeRowLabel([
      { rowLabel: "" },
      { rowLabel: "   " },
      {},
      { rowLabel: null },
      { rowLabel: 123 as unknown as string },
    ]);
    expect(s.representative).toBeUndefined();
    expect(s.normalizedRepresentative).toBe("");
    expect(s.uniqueNormalizedLabels).toEqual([]);
    expect(s.hasConflict).toBe(false);
  });

  it("同点は先に出現したグループを representative に", () => {
    const s = representativeRowLabel([{ rowLabel: "Aさん" }, { rowLabel: "Bさん" }]);
    expect(s.representative).toBe("Aさん");
  });

  it("throw しない（null / undefined / 非配列要素）", () => {
    expect(() => representativeRowLabel(null)).not.toThrow();
    expect(() => representativeRowLabel(undefined)).not.toThrow();
    expect(representativeRowLabel(null).hasConflict).toBe(false);
    expect(representativeRowLabel([]).normalizedRepresentative).toBe("");
  });
});
