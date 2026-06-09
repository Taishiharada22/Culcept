/**
 * Life Ops L-2 — 周期(cadence)模型（pure）。
 *   MVP=美容院(カット/カラー)・眉・経過段階は中立・履歴なし/異常→unknown(捏造しない)・now 注入(pure)。
 */
import { describe, it, expect } from "vitest";
import {
  cadenceKey,
  getCadenceSpec,
  listMvpCadences,
  daysBetween,
  computeCadenceStatus,
  type CadenceSpec,
} from "@/lib/lifeops/cadence-model";

const cut = getCadenceSpec("beauty_salon", "cut")!; // typical 42

describe("L-2 cadence 定数 / key", () => {
  it("MVP は 5 件（美容 3 + 生活維持補充 2）", () => {
    const keys = listMvpCadences().map((s) => cadenceKey(s.categoryId, s.menu)).sort();
    expect(keys).toEqual(["beauty_salon:color", "beauty_salon:cut", "daily_necessities", "eyebrow", "groceries"]);
  });
  it("補充 cadence: 食料品4日・日用品14日", () => {
    expect(getCadenceSpec("groceries")!.typicalIntervalDays).toBe(4);
    expect(getCadenceSpec("daily_necessities")!.typicalIntervalDays).toBe(14);
  });
  it("cadenceKey は menu 有無で形が変わる", () => {
    expect(cadenceKey("beauty_salon", "cut")).toBe("beauty_salon:cut");
    expect(cadenceKey("eyebrow")).toBe("eyebrow");
  });
  it("カラー>カット>眉（周期日数）", () => {
    expect(getCadenceSpec("beauty_salon", "color")!.typicalIntervalDays).toBe(56);
    expect(getCadenceSpec("beauty_salon", "cut")!.typicalIntervalDays).toBe(42);
    expect(getCadenceSpec("eyebrow")!.typicalIntervalDays).toBe(28);
  });
  it("未知 cadence は undefined（runtime 防御）", () => {
    expect(getCadenceSpec("beauty_salon", "treatment")).toBeUndefined(); // MVP 外
    expect(getCadenceSpec("nail")).toBeUndefined();
    expect(getCadenceSpec("unknown_xyz")).toBeUndefined();
  });
});

describe("L-2 daysBetween", () => {
  it("正常な経過日数（floor）", () => {
    expect(daysBetween("2026-05-01", "2026-06-01")).toBe(31);
    expect(daysBetween("2026-05-01T00:00:00Z", "2026-05-01T23:00:00Z")).toBe(0); // 同日
  });
  it("不正 ISO → null（捏造しない）", () => {
    expect(daysBetween("not-a-date", "2026-06-01")).toBeNull();
    expect(daysBetween("2026-05-01", "garbage")).toBeNull();
  });
});

describe("L-2 computeCadenceStatus — unknown を優先（断定しない）", () => {
  it("履歴なし(null) → unknown（elapsed/ratio は null・typical は保持）", () => {
    const s = computeCadenceStatus(cut, null, "2026-06-01");
    expect(s.phase).toBe("unknown");
    expect(s.elapsedDays).toBeNull();
    expect(s.ratio).toBeNull();
    expect(s.typicalIntervalDays).toBe(42);
  });
  it("未来日(elapsed<0) → unknown", () => {
    expect(computeCadenceStatus(cut, "2026-07-01", "2026-06-01").phase).toBe("unknown");
  });
  it("不正 ISO → unknown", () => {
    expect(computeCadenceStatus(cut, "broken", "2026-06-01").phase).toBe("unknown");
  });
  it("typical≤0 の異常 spec → unknown", () => {
    const bad: CadenceSpec = { ...cut, typicalIntervalDays: 0 };
    expect(computeCadenceStatus(bad, "2026-01-01", "2026-06-01").phase).toBe("unknown");
  });
});

describe("L-2 computeCadenceStatus — 経過段階の境界（cut: typical42 / nearing0.8 / beyond1.0）", () => {
  // 起点 2026-05-01 からの経過で検証
  const from = "2026-05-01";
  function phaseAfter(days: number) {
    const ms = Date.parse(from) + days * 86_400_000;
    const nowISO = new Date(ms).toISOString();
    return computeCadenceStatus(cut, from, nowISO).phase;
  }
  it("30日(<0.8) → within_typical", () => expect(phaseAfter(30)).toBe("within_typical"));
  it("35日(0.83) → nearing", () => expect(phaseAfter(35)).toBe("nearing"));
  it("45日(1.07) → beyond_typical", () => expect(phaseAfter(45)).toBe("beyond_typical"));
  it("70日(1.67) → well_beyond", () => expect(phaseAfter(70)).toBe("well_beyond"));
  it("ちょうど境界: 42日(1.0)=beyond / 63日(1.5)=well_beyond", () => {
    expect(phaseAfter(42)).toBe("beyond_typical");
    expect(phaseAfter(63)).toBe("well_beyond");
  });
});

describe("L-2 CadenceStatus は事実のみ（action を持たない）", () => {
  it("ratio が正しく算出され、行動指示フィールドが存在しない", () => {
    const s = computeCadenceStatus(cut, "2026-05-01", "2026-06-12"); // 42日 → ratio 1.0
    expect(s.elapsedDays).toBe(42);
    expect(s.ratio).toBeCloseTo(1.0, 5);
    expect(Object.keys(s).sort()).toEqual(["elapsedDays", "phase", "ratio", "typicalIntervalDays"]);
  });
});
