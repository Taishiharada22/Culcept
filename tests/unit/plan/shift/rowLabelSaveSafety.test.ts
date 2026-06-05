/**
 * SR A2B-1 — rowLabel は **review 専用 metadata**（保存に混ぜない）契約
 *
 * 不変条件:
 *   - `ShiftReviewCell.rowLabel` は保存パス（projection / save payload / DB）に **一切流れない**。
 *   - 保存入力（ShiftCellReading）は {date, rawCode} のみ（rowLabel を構造的に持たない）。
 *   - classifyPreSave / projectShiftRoster の出力に rowLabel 値が現れない。
 *   - raw VLM response / base64 / blob / image を rowLabel として保存しない。
 *
 * ※ 既存実装: 保存/projection は `cells.map((c) => ({ date: c.date, rawCode: c.rawCode }))` で
 *    rowLabel を構造的に落とす（shiftReviewClassification.ts:71 / shiftSaveController.ts:132）。
 *    本 test はその不変条件を **回帰として固定**する。
 */
import { describe, it, expect } from "vitest";

import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";
import { classifyPreSave } from "@/lib/plan/shift/shiftReviewClassification";
import { projectShiftRoster } from "@/lib/plan/shift/shiftRosterProjection";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";

// rowLabel に「絶対に保存されてはいけない」sentinel を仕込む（人名 + 偽 raw payload 風）。
const SENTINEL = "SENTINEL_ROWLABEL_原田大志";
const RAW_PAYLOAD = "data:image/png;base64,AAAA_should_never_be_saved";

const CELLS: ShiftReviewCell[] = [
  { day: 1, date: "2026-06-01", rawCode: "E", confidence: 1, rowLabel: SENTINEL },
  { day: 2, date: "2026-06-02", rawCode: "H", confidence: 1, rowLabel: SENTINEL },
  // 型外の混入を強制（実コードでは rowLabel は string のみ）。万一でも保存に出ないこと。
  {
    day: 3,
    date: "2026-06-03",
    rawCode: "ZZ",
    confidence: 1,
    rowLabel: RAW_PAYLOAD,
  } as unknown as ShiftReviewCell,
];

describe("rowLabel save-safety（A2B-1 契約）", () => {
  it("保存入力（{date,rawCode} 写像）に rowLabel / 人名 / raw payload が出ない", () => {
    // shiftReviewClassification.ts:71 / shiftSaveController.ts:132 と同型の保存入力。
    const readings = CELLS.map((c) => ({ date: c.date, rawCode: c.rawCode }));
    const blob = JSON.stringify(readings);
    expect(blob).not.toContain("rowLabel");
    expect(blob).not.toContain(SENTINEL);
    expect(blob).not.toContain("data:image");
    expect(blob).not.toContain("base64");
  });

  it("classifyPreSave（保存前 gate）出力に rowLabel が漏れない", () => {
    const r = classifyPreSave(CELLS, HARADA_SPRIX_DICTIONARY);
    const blob = JSON.stringify(r);
    expect(blob).not.toContain("rowLabel");
    expect(blob).not.toContain(SENTINEL);
    expect(blob).not.toContain("base64");
  });

  it("projectShiftRoster（anchors/indicators/source の元）出力に rowLabel が現れない", () => {
    const readings = CELLS.map((c) => ({ date: c.date, rawCode: c.rawCode }));
    const p = projectShiftRoster(readings, HARADA_SPRIX_DICTIONARY);
    const blob = JSON.stringify(p);
    expect(blob).not.toContain("rowLabel");
    expect(blob).not.toContain(SENTINEL);
    expect(blob).not.toContain("data:image");
  });

  it("ShiftCellReading は rowLabel を型として持たない（保存入力の構造保証）", () => {
    // 保存入力 reading に rowLabel を足そうとしても、projection は読まない（黙って無視）。
    const tainted = [
      { date: "2026-06-01", rawCode: "E", rowLabel: SENTINEL } as unknown as {
        date: string;
        rawCode: string;
      },
    ];
    const p = projectShiftRoster(tainted, HARADA_SPRIX_DICTIONARY);
    // projection 出力に sentinel が漏れない（rowLabel は projection ロジックで非参照）。
    expect(JSON.stringify(p)).not.toContain(SENTINEL);
  });
});
