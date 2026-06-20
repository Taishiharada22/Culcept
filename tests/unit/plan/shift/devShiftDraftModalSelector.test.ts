/**
 * SR B1b-2C-8-c-4 — selectImportModalProps pure 検証
 *
 * 不変条件:
 *   ① cells_loaded 以外（idle / extracting / error / saved 等）→ null（mount しない）
 *   ② cells_loaded.reviewOpen=false → null（CEO 補正: Modal 自動 open 禁止）
 *   ③ cells_loaded.reviewOpen=true → props 一式（open=true）
 *   ④ riskReviewEnabled=true（dev host hardcode・本流ではない）
 *   ⑤ chunkBoundaries=[15]（B1b-1R 92.8% 最良値・hardcode）
 *   ⑥ saveEnabled は opts.saveEnabled の素通し / 既定 false（hardcode true 禁止）
 *   ⑦ imageSrc は cells_loaded.imageObjectUrl（review に元画像必須）
 *   ⑧ year / month / cells を素通し
 */
import { describe, it, expect } from "vitest";

import {
  DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES,
  selectImportModalProps,
  type CellsLoadedShape,
} from "@/lib/plan/shift/devShiftDraftModalSelector";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";
import type {
  AssistedRowSelection,
  GridCalibration,
} from "@/lib/plan/shift/assistedRowSelection";

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "N", confidence: 1 },
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 1 },
];

const URL_OBJ = "blob:http://localhost/abc-123";

const CELLS_LOADED = (reviewOpen: boolean): CellsLoadedShape => ({
  kind: "cells_loaded",
  year: 2025,
  month: 7,
  cells: CELLS,
  imageObjectUrl: URL_OBJ,
  reviewOpen,
});

/**
 * S-geo-2C-1 用 selection（day列中心 X あり）。
 * 2025-07（31 日）+ first=300.75 / last=1845.75 で colWidth=51.5・gridLeft=275 と HARADA に一致。
 * personRowBand{298,350} で cropTop=298・cropHeight=52。
 */
const SELECTION_VALID: AssistedRowSelection = {
  imageW: 1860,
  imageH: 846,
  headerBand: { top: 180, bottom: 226 },
  personRowBand: { top: 298, bottom: 350 },
  dayColumns: { firstDayCenterX: 300.75, lastDayCenterX: 1845.75 },
};

/** selection 付き cells_loaded（reviewOpen=true 固定）。month で dayCount を変えられる。 */
const CELLS_LOADED_SEL = (
  selection: AssistedRowSelection | undefined,
  month = 7
): CellsLoadedShape => ({
  kind: "cells_loaded",
  year: 2025,
  month,
  cells: CELLS,
  imageObjectUrl: URL_OBJ,
  reviewOpen: true,
  selection,
});

describe("selectImportModalProps — non cells_loaded 状態は全て null", () => {
  it.each([
    { kind: "idle" },
    { kind: "image_loaded", imageObjectUrl: URL_OBJ, imageMeta: {} },
    {
      kind: "row_selected",
      imageObjectUrl: URL_OBJ,
      imageMeta: {},
      selection: {},
    },
    {
      kind: "extracting",
      imageObjectUrl: URL_OBJ,
      imageMeta: {},
      selection: {},
      year: 2025,
      month: 7,
    },
    {
      kind: "error",
      imageObjectUrl: URL_OBJ,
      imageMeta: {},
      selection: {},
      year: 2025,
      month: 7,
      message: "x",
    },
    { kind: "saved", year: 2025, month: 7, cellCount: 2 },
    null,
    undefined,
    "wrong_shape",
    { foo: "bar" },
  ])("state=%j → null", (s) => {
    expect(selectImportModalProps(s, { saveEnabled: true })).toBeNull();
  });
});

describe("selectImportModalProps — cells_loaded.reviewOpen=false（CEO 補正: 自動 open 禁止）", () => {
  it("reviewOpen=false → null（Modal mount しない）", () => {
    expect(selectImportModalProps(CELLS_LOADED(false))).toBeNull();
  });

  it("saveEnabled=true でも reviewOpen=false なら null（保存導線を勝手に出さない）", () => {
    expect(
      selectImportModalProps(CELLS_LOADED(false), { saveEnabled: true })
    ).toBeNull();
  });
});

describe("selectImportModalProps — cells_loaded.reviewOpen=true → props 一式", () => {
  it("open=true / year / month / cells を素通し", () => {
    const props = selectImportModalProps(CELLS_LOADED(true));
    expect(props).not.toBeNull();
    expect(props?.open).toBe(true);
    expect(props?.year).toBe(2025);
    expect(props?.month).toBe(7);
    expect(props?.cells).toBe(CELLS); // 参照同一（複製しない・pure）
  });

  it("riskReviewEnabled=true hardcode（dev host 検証用・本流ではない）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true));
    expect(props?.riskReviewEnabled).toBe(true);
  });

  it("chunkBoundaries=[15] hardcode（B1b-1R 92.8% 最良値）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true));
    expect(props?.chunkBoundaries).toEqual([15]);
    expect(props?.chunkBoundaries).toBe(DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES);
  });

  it("imageSrc は cells_loaded.imageObjectUrl（review に元画像必須）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true));
    expect(props?.imageSrc).toBe(URL_OBJ);
  });
});

describe("selectImportModalProps — saveEnabled は server prop 由来 / 既定 false", () => {
  it("opts 省略 → saveEnabled=false（dormant）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true));
    expect(props?.saveEnabled).toBe(false);
  });

  it("opts.saveEnabled 未指定 → saveEnabled=false（既定）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), {});
    expect(props?.saveEnabled).toBe(false);
  });

  it("opts.saveEnabled=false → false 素通し", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), { saveEnabled: false });
    expect(props?.saveEnabled).toBe(false);
  });

  it("opts.saveEnabled=true → true 素通し（server-side flag が true のとき）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), { saveEnabled: true });
    expect(props?.saveEnabled).toBe(true);
  });

  it("opts.saveEnabled=undefined → false（明示 undefined でも既定 false）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), { saveEnabled: undefined });
    expect(props?.saveEnabled).toBe(false);
  });
});

describe("selectImportModalProps — props に raw / base64 / Blob が混入しない", () => {
  it("戻り値 JSON 化で base64 / data:image / blob: の痕跡なし（imageSrc 自体は除外）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), { saveEnabled: false });
    // imageSrc を除いた残りに blob: が紛れ込んでいないこと
    const { imageSrc: _is, cells: _cs, ...rest } = props!;
    const json = JSON.stringify(rest);
    expect(json).not.toMatch(/base64|data:image|blob:/i);
  });

  it("戻り値の keys は固定セット（想定外 field なし）", () => {
    const props = selectImportModalProps(CELLS_LOADED(true), { saveEnabled: false });
    expect(Object.keys(props!).sort()).toEqual(
      [
        "cells",
        "chunkBoundaries",
        "geometry",
        "gridCalibration",
        "imageSrc",
        "month",
        "open",
        "riskReviewEnabled",
        "saveEnabled",
        "year",
      ].sort()
    );
  });
});

describe("selectImportModalProps — S-geo-2C-1 geometry（geometry のみ・blankDays 非接触）", () => {
  it("valid dayColumns → geometry defined（gridLeft/colWidth 期待値）", () => {
    const props = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID));
    expect(props?.geometry).toBeDefined();
    // colWidth = (1845.75-300.75)/(31-1) = 51.5、gridLeft = 300.75 - 51.5/2 = 275
    expect(props?.geometry?.colWidth).toBeCloseTo(51.5, 6);
    expect(props?.geometry?.gridLeft).toBeCloseTo(275, 6);
  });

  it("imageW/imageH/personRowBand が input 通り反映される", () => {
    const g = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID))?.geometry;
    expect(g?.imageWidth).toBe(1860);
    expect(g?.imageHeight).toBe(846);
    expect(g?.cropTop).toBe(298); // personRowBand.top
    expect(g?.cropHeight).toBe(52); // personRowBand.bottom - top = 350 - 298
  });

  it("dayCount は daysInMonth(year, month) 由来（month を変えると colWidth が変わる）", () => {
    const jul = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID, 7))?.geometry; // 31 日
    const jun = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID, 6))?.geometry; // 30 日
    expect(jul?.colWidth).toBeCloseTo(1545 / 30, 6);
    expect(jun?.colWidth).toBeCloseTo(1545 / 29, 6);
    expect(jul?.colWidth).not.toBeCloseTo(jun?.colWidth ?? 0, 6);
  });

  it("missing dayColumns → geometry undefined（fail-soft・modal props は返る）", () => {
    const { dayColumns: _omit, ...noX } = SELECTION_VALID;
    const props = selectImportModalProps(CELLS_LOADED_SEL(noX));
    expect(props).not.toBeNull();
    expect(props?.geometry).toBeUndefined();
    expect(props?.open).toBe(true); // modal は壊さない
    expect(props?.cells).toBe(CELLS);
  });

  it("selection 自体なし → geometry undefined（fail-soft・props は返る）", () => {
    const props = selectImportModalProps(CELLS_LOADED_SEL(undefined));
    expect(props).not.toBeNull();
    expect(props?.geometry).toBeUndefined();
    expect(props?.open).toBe(true);
  });

  it("invalid dayColumns（順序逆 first>last）→ geometry undefined", () => {
    const reversed: AssistedRowSelection = {
      ...SELECTION_VALID,
      dayColumns: { firstDayCenterX: 1845.75, lastDayCenterX: 300.75 },
    };
    expect(
      selectImportModalProps(CELLS_LOADED_SEL(reversed))?.geometry
    ).toBeUndefined();
  });

  it("invalid dayColumns（lastDayCenterX が imageW 外）→ geometry undefined", () => {
    const oob: AssistedRowSelection = {
      ...SELECTION_VALID,
      dayColumns: { firstDayCenterX: 300.75, lastDayCenterX: 5000 },
    };
    expect(selectImportModalProps(CELLS_LOADED_SEL(oob))?.geometry).toBeUndefined();
  });

  it("malformed selection（NaN 寸法）でも throw せず geometry undefined", () => {
    const bad = { ...SELECTION_VALID, imageW: Number.NaN } as AssistedRowSelection;
    expect(() => selectImportModalProps(CELLS_LOADED_SEL(bad))).not.toThrow();
    expect(selectImportModalProps(CELLS_LOADED_SEL(bad))?.geometry).toBeUndefined();
  });

  it("blankDays は selector output に存在しない（packing 補正は ShiftReviewGrid 正本）", () => {
    expect(selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID))).not.toHaveProperty(
      "blankDays"
    );
    expect(selectImportModalProps(CELLS_LOADED_SEL(undefined))).not.toHaveProperty(
      "blankDays"
    );
  });

  it("geometry 出力は数値 6 field のみ（raw/url 非混入）", () => {
    const g = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID))?.geometry;
    expect(Object.keys(g!).sort()).toEqual(
      ["colWidth", "cropHeight", "cropTop", "gridLeft", "imageHeight", "imageWidth"].sort()
    );
    for (const v of Object.values(g!)) expect(typeof v).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────
// S-geo Persist-2: effectiveGeometry（gridCalibration 優先）+ gridCalibration 素通し
// ─────────────────────────────────────────────────────────────

// SELECTION_VALID コンテキスト（imageW 1860 / imageH 846 / July=31）に整合する校正値。
// dayColumns 由来（gridLeft 275 / colWidth 51.5）とは別値（260 / 49）で識別する。
const CAL_VALID: GridCalibration = {
  gridLeft: 260,
  colWidth: 49,
  source: "manual_overlay",
  imageW: 1860,
  imageH: 846,
  dayCount: 31,
};

describe("selectImportModalProps — Persist-2 geometry=effective / gridCalibration 素通し", () => {
  it("valid+整合 gridCalibration → geometry は calibration 由来（dayColumns より優先）", () => {
    const sel: AssistedRowSelection = { ...SELECTION_VALID, gridCalibration: CAL_VALID };
    const props = selectImportModalProps(CELLS_LOADED_SEL(sel, 7));
    expect(props?.geometry?.gridLeft).toBe(260); // cal（dayColumns 275 ではない）
    expect(props?.geometry?.colWidth).toBe(49); // cal（dayColumns 51.5 ではない）
    expect(props?.geometry?.cropTop).toBe(298); // personRowBand 由来は維持
    expect(props?.geometry?.cropHeight).toBe(52);
    expect(props?.geometry?.imageWidth).toBe(1860);
  });

  it("gridCalibration は raw 素通し（適用有無に関わらず selection の値そのもの・参照同一）", () => {
    const sel: AssistedRowSelection = { ...SELECTION_VALID, gridCalibration: CAL_VALID };
    const props = selectImportModalProps(CELLS_LOADED_SEL(sel, 7));
    expect(props?.gridCalibration).toBe(CAL_VALID); // 参照同一（複製しない）
  });

  it("dayCount 不整合（cal=31 / June=30）→ geometry は dayColumns fallback。ただし gridCalibration は raw 素通し", () => {
    const sel: AssistedRowSelection = { ...SELECTION_VALID, gridCalibration: CAL_VALID };
    const props = selectImportModalProps(CELLS_LOADED_SEL(sel, 6)); // June 30 ≠ cal.dayCount 31
    expect(props?.geometry?.gridLeft).not.toBe(260); // calibration 不採用
    expect(props?.geometry?.colWidth).toBeCloseTo(1545 / 29, 6); // June dayColumns 由来
    expect(props?.gridCalibration).toBe(CAL_VALID); // 正本表示は raw（適用とは独立）
  });

  it("gridCalibration なし → props.gridCalibration undefined / geometry は dayColumns 由来", () => {
    const props = selectImportModalProps(CELLS_LOADED_SEL(SELECTION_VALID, 7));
    expect(props?.gridCalibration).toBeUndefined();
    expect(props?.geometry?.gridLeft).toBeCloseTo(275, 6); // dayColumns 由来
  });

  it("dayColumns なし + 整合 gridCalibration → calibration 単独で geometry 成立", () => {
    const { dayColumns: _omit, ...noDc } = SELECTION_VALID;
    const sel: AssistedRowSelection = { ...noDc, gridCalibration: CAL_VALID };
    const props = selectImportModalProps(CELLS_LOADED_SEL(sel, 7));
    expect(props?.geometry?.gridLeft).toBe(260);
    expect(props?.geometry?.colWidth).toBe(49);
    expect(props?.gridCalibration).toBe(CAL_VALID);
  });
});
