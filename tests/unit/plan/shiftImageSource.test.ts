import { describe, it, expect } from "vitest";

import {
  shiftImageSourceIds,
  isImportedShiftAnchor,
} from "@/lib/plan/shiftImageSource";
import { SOURCE_TYPE_LABEL } from "@/lib/plan/anchor-detail-format";
import type {
  ExternalAnchorSource,
  ExternalAnchorSourceType,
} from "@/lib/plan/external-anchor-source";

function makeSource(
  id: string,
  sourceType: ExternalAnchorSourceType
): ExternalAnchorSource {
  return {
    id,
    userId: "u1",
    sourceType,
    capturedAt: "2026-06-01T00:00:00.000Z",
    rawRetention: "discarded",
  };
}

describe("shiftImageSource", () => {
  // GPT test 点 1: ExternalAnchorSourceType に shift_image が含まれる
  //   （sourceType: "shift_image" が型エラーなく構築できる = union に存在する証左）
  it("ExternalAnchorSourceType が shift_image を許容する（型 + runtime）", () => {
    const s = makeSource("s-shift", "shift_image");
    expect(s.sourceType).toBe("shift_image");
  });

  // GPT test 点 2: shift_image source label が "シフト取込"
  it("SOURCE_TYPE_LABEL[shift_image] が 'シフト取込'", () => {
    expect(SOURCE_TYPE_LABEL.shift_image).toBe("シフト取込");
  });

  // GPT test 点 3: helper が正しく動く
  describe("shiftImageSourceIds()", () => {
    it("shift_image source の id のみ集合化する", () => {
      const sources = [
        makeSource("a", "manual"),
        makeSource("b", "shift_image"),
        makeSource("c", "image"), // 汎用画像 import は対象外
        makeSource("d", "shift_image"),
        makeSource("e", "ics"),
      ];
      const ids = shiftImageSourceIds(sources);
      expect(ids.has("b")).toBe(true);
      expect(ids.has("d")).toBe(true);
      expect(ids.has("a")).toBe(false);
      expect(ids.has("c")).toBe(false); // image ≠ shift_image
      expect(ids.has("e")).toBe(false);
      expect(ids.size).toBe(2);
    });

    it("空 sources は空 Set", () => {
      expect(shiftImageSourceIds([]).size).toBe(0);
    });

    it("shift_image が無ければ空 Set", () => {
      const ids = shiftImageSourceIds([
        makeSource("a", "manual"),
        makeSource("c", "image"),
      ]);
      expect(ids.size).toBe(0);
    });
  });

  describe("isImportedShiftAnchor()", () => {
    const set = shiftImageSourceIds([
      makeSource("src-shift", "shift_image"),
      makeSource("src-manual", "manual"),
    ]);

    it("sourceId が shift_image 集合に含まれれば true", () => {
      expect(isImportedShiftAnchor({ sourceId: "src-shift" }, set)).toBe(true);
    });

    it("非 shift_image source の anchor は false", () => {
      expect(isImportedShiftAnchor({ sourceId: "src-manual" }, set)).toBe(
        false
      );
    });

    it("未知の sourceId は false", () => {
      expect(isImportedShiftAnchor({ sourceId: "unknown" }, set)).toBe(false);
    });
  });
});
