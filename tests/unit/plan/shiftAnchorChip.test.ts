/**
 * shiftAnchorChip — 勤務 anchor → 原稿コード chip（strict 逆引き）test（M3-b polish 案1）
 *
 * 固定:
 *   - displayLabel 完全一致 → rawCode（早番→E / 早番ロング→E-18 / 夜勤→N / 遅番→L / 日勤→G）, tone=work
 *   - 非シフト anchor（会議 等）→ null（fallback は呼び出し側）
 *   - **fuzzy 一致しない**（部分一致 / 前後付き / 空 → null）
 *   - 休み系 displayLabel は work 逆引き対象外 → null
 */
import { describe, it, expect } from "vitest";

import { resolveShiftAnchorChip } from "@/lib/plan/shift/shiftAnchorChip";
import type {
  ExternalAnchor,
  OneOffExternalAnchor,
} from "@/lib/plan/external-anchor";

function anchor(title: string): ExternalAnchor {
  return {
    id: "a",
    userId: "u",
    sourceId: "s",
    confirmedAt: "2025-06-01T00:00:00.000Z",
    title,
    startTime: "09:00",
    rigidity: "hard",
    anchorKind: "one_off",
    date: "2025-06-10",
  } as OneOffExternalAnchor;
}

describe("resolveShiftAnchorChip — strict 逆引き", () => {
  it.each([
    ["早番", "E"],
    ["早番ロング", "E-18"],
    ["夜勤", "N"],
    ["遅番", "L"],
    ["日勤", "G"],
  ])("displayLabel %s → rawCode %s（tone=work）", (title, code) => {
    const chip = resolveShiftAnchorChip(anchor(title));
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe(code);
    expect(chip!.tone).toBe("work");
  });

  it("非シフト anchor（会議）→ null", () => {
    expect(resolveShiftAnchorChip(anchor("会議"))).toBeNull();
  });

  it("fuzzy 一致しない（部分一致 / 前後付き / 空 → null）", () => {
    expect(resolveShiftAnchorChip(anchor("早"))).toBeNull();
    expect(resolveShiftAnchorChip(anchor("早番A"))).toBeNull();
    expect(resolveShiftAnchorChip(anchor("夜勤明け"))).toBeNull();
    expect(resolveShiftAnchorChip(anchor(""))).toBeNull();
  });

  it("休み系 displayLabel は work 逆引き対象外（公休 / 休み → null）", () => {
    expect(resolveShiftAnchorChip(anchor("公休"))).toBeNull();
    expect(resolveShiftAnchorChip(anchor("休み"))).toBeNull();
  });
});
