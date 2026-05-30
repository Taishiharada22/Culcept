import { describe, it, expect } from "vitest";
import {
  buildShiftImportPlan,
  isShiftImportReady,
} from "@/lib/plan/shift/shiftImportAdapter";
import type { ShiftRosterProjection } from "@/lib/plan/shift/shiftRosterProjection";
import { projectShiftRoster } from "@/lib/plan/shift/shiftRosterProjection";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import {
  validateCreateExternalAnchorInput,
  type CreateOneOffAnchorInput,
} from "@/lib/plan/external-anchor-input";

const PROJECTION: ShiftRosterProjection = {
  timedEvents: [
    {
      date: "2025-07-04",
      title: "日勤",
      startTime: "09:00",
      endTime: "18:00",
      endsNextDay: false,
      semanticType: "work_day",
      rawCode: "E-18",
    },
    {
      date: "2025-07-06",
      title: "夜勤",
      startTime: "18:00",
      endTime: "06:45", // 翌日跨ぎ（endTime < startTime）
      endsNextDay: true,
      semanticType: "work_night",
      rawCode: "N",
    },
    {
      date: "2025-07-05",
      title: "遅番",
      startTime: "13:00",
      endTime: null, // 終了未確定
      endsNextDay: false,
      semanticType: "work_late",
      rawCode: "L",
    },
  ],
  dayIndicators: [
    {
      date: "2025-07-03",
      label: "公休",
      semanticType: "public_holiday",
      rawCode: "H",
      countsAsPublicHoliday: true,
    },
    {
      date: "2025-07-01",
      label: "休み",
      semanticType: "blank_day",
      rawCode: "BD",
      countsAsPublicHoliday: false,
    },
  ],
  candidates: [
    {
      date: "2025-07-02",
      label: "希望休",
      semanticType: "off_request",
      rawCode: "HREQ",
    },
  ],
  unresolved: [{ date: "2025-07-09", rawCode: "???", reason: "unknown_code" }],
};

describe("buildShiftImportPlan", () => {
  it("勤務 → one_off anchor（sourceType=shift_image, 既定 rigidity=hard）", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    expect(plan.anchorInputs).toHaveLength(3);
    for (const a of plan.anchorInputs as CreateOneOffAnchorInput[]) {
      expect(a.anchorKind).toBe("one_off");
      expect(a.sourceType).toBe("shift_image");
      expect(a.rigidity).toBe("hard");
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("翌日跨ぎは endTime<startTime のまま渡す（endsNextDay 専用 field を持たせない）", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    const night = (plan.anchorInputs as CreateOneOffAnchorInput[]).find(
      (a) => a.date === "2025-07-06"
    )!;
    expect(night.startTime).toBe("18:00");
    expect(night.endTime).toBe("06:45");
    expect("endsNextDay" in night).toBe(false);
  });

  it("endTime 無しの勤務は endTime キーを生やさない", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    const late = (plan.anchorInputs as CreateOneOffAnchorInput[]).find(
      (a) => a.date === "2025-07-05"
    )!;
    expect("endTime" in late).toBe(false);
  });

  it("休み → day indicator(kind=off, 公休フラグ保持)、anchor にしない", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    const off = plan.dayIndicators.filter((d) => d.kind === "off");
    expect(off).toHaveLength(2);
    const koukyuu = off.find((d) => d.rawCode === "H")!;
    expect(koukyuu.countsAsPublicHoliday).toBe(true);
    const bd = off.find((d) => d.rawCode === "BD")!;
    expect(bd.countsAsPublicHoliday).toBe(false);
    // 休みは anchor 化されない（勤務 3 件のみ）
    expect(plan.anchorInputs).toHaveLength(3);
  });

  it("希望休 → day indicator(kind=off_request, 公休フラグ常に false)", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    const req = plan.dayIndicators.filter((d) => d.kind === "off_request");
    expect(req).toHaveLength(1);
    expect(req[0].rawCode).toBe("HREQ");
    expect(req[0].countsAsPublicHoliday).toBe(false);
  });

  it("unresolved は保存せず skipped に集約、isShiftImportReady=false", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("unknown_code");
    expect(isShiftImportReady(plan)).toBe(false);
  });

  it("unresolved が無ければ isShiftImportReady=true", () => {
    const clean: ShiftRosterProjection = { ...PROJECTION, unresolved: [] };
    expect(isShiftImportReady(buildShiftImportPlan(clean))).toBe(true);
  });

  it("rigidity を override できる", () => {
    const plan = buildShiftImportPlan(PROJECTION, { rigidity: "soft" });
    expect(
      (plan.anchorInputs as CreateOneOffAnchorInput[]).every(
        (a) => a.rigidity === "soft"
      )
    ).toBe(true);
  });

  it("生成した anchorInput は全て実 validator を通る（DB 保存可能性の保証）", () => {
    const plan = buildShiftImportPlan(PROJECTION);
    for (const input of plan.anchorInputs) {
      const result = validateCreateExternalAnchorInput(input);
      expect(result.valid).toBe(true);
    }
  });

  it("空 projection → 空 plan（落ちない）", () => {
    const empty: ShiftRosterProjection = {
      timedEvents: [],
      dayIndicators: [],
      candidates: [],
      unresolved: [],
    };
    const plan = buildShiftImportPlan(empty);
    expect(plan.anchorInputs).toHaveLength(0);
    expect(plan.dayIndicators).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(isShiftImportReady(plan)).toBe(true);
  });
});

describe("projectShiftRoster → buildShiftImportPlan（end-to-end）", () => {
  it("HARADA 辞書で実セルを通すと勤務/休み/希望休が正しく分かれ、anchor は valid", () => {
    const cells = [
      { date: "2025-07-01", rawCode: "BD" }, // 休み
      { date: "2025-07-02", rawCode: "HREQ" }, // 希望休
      { date: "2025-07-03", rawCode: "H" }, // 公休
      { date: "2025-07-06", rawCode: "N" }, // 夜勤（跨ぎ）
      { date: "2025-07-25", rawCode: "" }, // 空セル → 何も生成しない
    ];
    const projection = projectShiftRoster(cells, HARADA_SPRIX_DICTIONARY);
    const plan = buildShiftImportPlan(projection);

    // 夜勤 1 件のみ anchor、全て valid
    expect(plan.anchorInputs.length).toBeGreaterThanOrEqual(1);
    for (const input of plan.anchorInputs) {
      expect(validateCreateExternalAnchorInput(input).valid).toBe(true);
    }
    // 休み(BD/H) は day indicator、希望休(HREQ) は off_request、空セルは無視
    expect(plan.dayIndicators.some((d) => d.kind === "off")).toBe(true);
    expect(plan.dayIndicators.some((d) => d.kind === "off_request")).toBe(true);
    // sourceType は全て shift_image
    expect(
      plan.anchorInputs.every((a) => a.sourceType === "shift_image")
    ).toBe(true);
  });
});
