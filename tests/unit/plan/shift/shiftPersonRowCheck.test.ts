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
