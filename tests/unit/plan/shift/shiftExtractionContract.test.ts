import { describe, it, expect } from "vitest";
import {
  validateExtractedCells,
  extractedToCellReadings,
  filterByPersonRow,
  type ExtractedShiftCell,
} from "@/lib/plan/shift/shiftExtractionContract";
import {
  buildShiftExtractionPrompt,
  SHIFT_EXTRACTION_JSON_SCHEMA,
} from "@/lib/plan/shift/shiftExtractionPrompt";

describe("validateExtractedCells", () => {
  it("正常な配列を通す", () => {
    const raw = [
      { date: "2025-07-01", rawCode: "BD", rowLabel: "原田 大志", confidence: 0.9 },
      { date: "2025-07-02", rawCode: "", rowLabel: "原田 大志" }, // 空セル許容
    ];
    const { cells, errors } = validateExtractedCells(raw);
    expect(errors).toHaveLength(0);
    expect(cells).toHaveLength(2);
    expect(cells[0].confidence).toBe(0.9);
  });

  it("date 不正・rawCode 欠落を弾く（沈黙させない）", () => {
    const raw = [
      { date: "2025/07/01", rawCode: "G", rowLabel: "原田" }, // date 形式不正
      { date: "2025-07-02", rowLabel: "原田" }, // rawCode 欠落
      { date: "2025-07-03", rawCode: "N", rowLabel: "原田" }, // OK
    ];
    const { cells, errors } = validateExtractedCells(raw);
    expect(cells).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].field).toBe("date");
    expect(errors[1].field).toBe("rawCode");
  });

  it("配列でない入力は root error", () => {
    const { errors } = validateExtractedCells({ foo: 1 });
    expect(errors[0].field).toBe("root");
  });
});

describe("extractedToCellReadings", () => {
  it("projection 入力へ写像（colorHint→rawColor）", () => {
    const cells: ExtractedShiftCell[] = [
      { date: "2025-07-08", rawCode: "G", rowLabel: "原田", colorHint: "green" },
    ];
    expect(extractedToCellReadings(cells)).toEqual([
      { date: "2025-07-08", rawCode: "G", rawColor: "green" },
    ]);
  });
});

describe("filterByPersonRow", () => {
  it("空白揺れを吸収して本人行のみ残す", () => {
    const cells: ExtractedShiftCell[] = [
      { date: "2025-07-01", rawCode: "G", rowLabel: "原田大志" },
      { date: "2025-07-01", rawCode: "N", rowLabel: "石原 陽太郎" },
    ];
    const out = filterByPersonRow(cells, "原田 大志");
    expect(out).toHaveLength(1);
    expect(out[0].rowLabel).toBe("原田大志");
  });
});

describe("buildShiftExtractionPrompt", () => {
  it("本人行限定・rawCode そのまま・空セル指示を含む", () => {
    const p = buildShiftExtractionPrompt({
      personName: "原田 大志",
      year: 2025,
      month: 7,
      daysInMonth: 31,
      knownCodes: ["H", "N", "E-18"],
    });
    expect(p).toContain("原田 大志");
    expect(p).toContain("2025-07");
    expect(p).toContain("31");
    expect(p).toContain('"E-18" を "E" に縮めない');
    expect(p).toContain("E-18"); // 凡例参照
  });

  it("JSON schema はセル配列を強制する", () => {
    expect(SHIFT_EXTRACTION_JSON_SCHEMA.type).toBe("array");
    expect(SHIFT_EXTRACTION_JSON_SCHEMA.items.required).toContain("rawCode");
  });
});
