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
