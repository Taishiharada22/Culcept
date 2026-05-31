import { describe, it, expect } from "vitest";
import {
  toDayIndicatorVariant,
  toDayIndicatorViewModel,
  dayIndicatorsByDate,
} from "@/lib/plan/dayIndicatorView";
import type { PlanDayIndicator } from "@/lib/plan/planDayIndicatorReader";

function ind(over: Partial<PlanDayIndicator>): PlanDayIndicator {
  return {
    id: "i",
    date: "2025-07-01",
    kind: "off",
    label: "休み",
    countsAsPublicHoliday: false,
    rawCode: null,
    semanticType: null,
    sourceType: "shift_image",
    sourceId: null,
    ...over,
  };
}

describe("toDayIndicatorVariant — H / BD / HREQ を潰さない", () => {
  it("H = 公休（off, counts=true）→ public_holiday", () => {
    expect(
      toDayIndicatorVariant(ind({ kind: "off", countsAsPublicHoliday: true }))
    ).toBe("public_holiday");
  });
  it("BD = 休み / blank day（off, counts=false）→ off", () => {
    expect(
      toDayIndicatorVariant(ind({ kind: "off", countsAsPublicHoliday: false }))
    ).toBe("off");
  });
  it("HREQ = 希望休（off_request）→ requested_off", () => {
    expect(
      toDayIndicatorVariant(ind({ kind: "off_request", countsAsPublicHoliday: false }))
    ).toBe("requested_off");
  });
});

describe("toDayIndicatorViewModel", () => {
  it("公休: label 尊重 + 確定 tone（isTentative=false）", () => {
    const vm = toDayIndicatorViewModel(
      ind({ kind: "off", countsAsPublicHoliday: true, label: "公休" })
    );
    expect(vm.variant).toBe("public_holiday");
    expect(vm.label).toBe("公休");
    expect(vm.isTentative).toBe(false);
    expect(vm.countsAsPublicHoliday).toBe(true);
  });
  it("希望休: 控えめ tone（isTentative=true）", () => {
    const vm = toDayIndicatorViewModel(ind({ kind: "off_request", label: "希望休" }));
    expect(vm.variant).toBe("requested_off");
    expect(vm.isTentative).toBe(true);
  });
  it("BD = 休み", () => {
    const vm = toDayIndicatorViewModel(
      ind({ kind: "off", countsAsPublicHoliday: false, label: "休み" })
    );
    expect(vm.variant).toBe("off");
    expect(vm.label).toBe("休み");
  });
  it("label 空白なら variant 既定にフォールバック", () => {
    expect(
      toDayIndicatorViewModel(
        ind({ kind: "off", countsAsPublicHoliday: true, label: "  " })
      ).label
    ).toBe("公休");
    expect(
      toDayIndicatorViewModel(ind({ kind: "off_request", label: "" })).label
    ).toBe("希望休");
  });
  it("sourceType を保持（MVP 表示は同一だが provenance を残す）", () => {
    expect(toDayIndicatorViewModel(ind({ sourceType: "manual" })).sourceType).toBe("manual");
    expect(
      toDayIndicatorViewModel(ind({ sourceType: "shift_image" })).sourceType
    ).toBe("shift_image");
  });
});

describe("dayIndicatorsByDate", () => {
  it("date → viewModel の Map（1 日 1 印・H/BD/HREQ を保持）", () => {
    const map = dayIndicatorsByDate([
      ind({ date: "2025-07-03", kind: "off", countsAsPublicHoliday: true, label: "公休" }),
      ind({ date: "2025-07-05", kind: "off_request", label: "希望休" }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get("2025-07-03")?.variant).toBe("public_holiday");
    expect(map.get("2025-07-05")?.variant).toBe("requested_off");
    expect(map.get("2025-07-04")).toBeUndefined();
  });
  it("同日重複は last-wins（DB UNIQUE で通常発生しないが防御）", () => {
    const map = dayIndicatorsByDate([
      ind({ date: "2025-07-03", label: "A" }),
      ind({ date: "2025-07-03", label: "B" }),
    ]);
    expect(map.size).toBe(1);
    expect(map.get("2025-07-03")?.label).toBe("B");
  });
});
