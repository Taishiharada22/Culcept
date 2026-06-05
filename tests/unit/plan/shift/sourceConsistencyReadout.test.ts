import { describe, it, expect, vi } from "vitest";

import {
  computeSourceConsistencyMismatches,
  buildBlankCellTargets,
  type SourceCellScoreReader,
  type SourceConsistencyInput,
} from "../../../../lib/plan/shift/sourceConsistencyReadout";
import type { ShiftGridGeometry } from "../../../../lib/plan/shift/shiftGridGeometry";

const GEO: ShiftGridGeometry = {
  imageWidth: 1000,
  imageHeight: 200,
  gridLeft: 10,
  colWidth: 20,
  cropTop: 50,
  cropHeight: 60,
};

const CELLS = [
  { day: 1, rawCode: "L" },
  { day: 2, rawCode: "" }, // blank
  { day: 3, rawCode: "H" },
  { day: 4, rawCode: "  " }, // blank (whitespace)
];
const BLANK_DAYS = [2, 4];

/** 指定 day に固定 score を返す fake reader。呼び出し targets を記録。 */
function fakeReader(
  scoreByDay: Record<number, number>,
  captured?: { targets?: readonly { day: number }[] }
): SourceCellScoreReader {
  return async (_src, _geo, targets) => {
    if (captured) captured.targets = targets;
    return targets.map((t) => ({ day: t.day, score: scoreByDay[t.day] ?? 0 }));
  };
}

const baseInput = (over: Partial<SourceConsistencyInput> = {}): SourceConsistencyInput => ({
  imageSrc: "blob:x",
  geometry: GEO,
  cells: CELLS,
  blankDays: BLANK_DAYS,
  ...over,
});

describe("sourceConsistencyReadout / dormant guards", () => {
  it("imageSrc なし → readout 未実行・issue なし", async () => {
    const reader = vi.fn(fakeReader({ 2: 0.9 }));
    const r = await computeSourceConsistencyMismatches(baseInput({ imageSrc: undefined }), reader);
    expect(r).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
  });

  it("geometry なし → readout 未実行・issue なし", async () => {
    const reader = vi.fn(fakeReader({ 2: 0.9 }));
    const r = await computeSourceConsistencyMismatches(baseInput({ geometry: undefined }), reader);
    expect(r).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
  });

  it("空欄セルなし（全て rawCode 非空）→ readout 未実行・issue なし", async () => {
    const reader = vi.fn(fakeReader({}));
    const r = await computeSourceConsistencyMismatches(
      baseInput({ cells: [{ day: 1, rawCode: "L" }, { day: 2, rawCode: "H" }] }),
      reader
    );
    expect(r).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
  });
});

describe("sourceConsistencyReadout / blank cells only", () => {
  it("rawCode 空欄セルだけが検査対象（reader は blank day のみ受け取る）", async () => {
    const captured: { targets?: readonly { day: number }[] } = {};
    const r = await computeSourceConsistencyMismatches(baseInput(), fakeReader({ 2: 0.0, 4: 0.0 }, captured));
    expect((captured.targets ?? []).map((t) => t.day).sort()).toEqual([2, 4]);
    expect(r).toEqual([]); // content 0 なので mismatch なし
  });

  it("buildBlankCellTargets は blank のみ・region を持つ", () => {
    const targets = buildBlankCellTargets(baseInput());
    expect(targets.map((t) => t.day).sort()).toEqual([2, 4]);
    for (const t of targets) {
      expect(t.region).toMatchObject({ width: GEO.colWidth, height: GEO.cropHeight });
    }
  });
});

describe("sourceConsistencyReadout / mismatch 算出", () => {
  it("blank + content 高 → P1 mismatch（blank_with_content）", async () => {
    const r = await computeSourceConsistencyMismatches(baseInput(), fakeReader({ 2: 0.95, 4: 0.0 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ day: 2, kind: "blank_with_content", severity: "soft" });
  });

  it("blank + content なし（score 0）→ mismatch なし", async () => {
    const r = await computeSourceConsistencyMismatches(baseInput(), fakeReader({ 2: 0.0, 4: 0.0 }));
    expect(r).toEqual([]);
  });

  it("reader が一部 day を欠落 → 欠落は score 0 扱い（mismatch なし）", async () => {
    const partial: SourceCellScoreReader = async () => [{ day: 2, score: 0.95 }]; // day4 欠落
    const r = await computeSourceConsistencyMismatches(baseInput(), partial);
    expect(r.map((h) => h.day)).toEqual([2]);
  });

  it("options（contentHighThreshold）を尊重する", async () => {
    const r = await computeSourceConsistencyMismatches(
      baseInput({ options: { contentHighThreshold: 0.99 } }),
      fakeReader({ 2: 0.95, 4: 0.0 })
    );
    expect(r).toEqual([]); // 0.95 < 0.99
  });
});

describe("sourceConsistencyReadout / fail-open", () => {
  it("reader が throw → 空配列（fail-open・throw しない）", async () => {
    const throwing: SourceCellScoreReader = async () => {
      throw new Error("canvas tainted");
    };
    await expect(computeSourceConsistencyMismatches(baseInput(), throwing)).resolves.toEqual([]);
  });

  it("reader が非配列を返す → 空配列", async () => {
    const bad = (async () => null) as unknown as SourceCellScoreReader;
    await expect(computeSourceConsistencyMismatches(baseInput(), bad)).resolves.toEqual([]);
  });
});

describe("sourceConsistencyReadout / VLM/DB/save 非接触", () => {
  it("戻り値は structured hint のみ（raw 画像/base64 を含まない）", async () => {
    const r = await computeSourceConsistencyMismatches(baseInput(), fakeReader({ 2: 0.95, 4: 0.0 }));
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/data:|base64|blob:/i);
    for (const h of r) {
      expect(Object.keys(h).sort()).toEqual(["day", "kind", "message", "severity"]);
    }
  });
});
