import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DayIndicatorBadge } from "@/app/(culcept)/plan/components/DayIndicatorBadge";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

function vm(over: Partial<DayIndicatorViewModel>): DayIndicatorViewModel {
  return {
    date: "2025-07-03",
    variant: "off",
    label: "休み",
    isTentative: false,
    countsAsPublicHoliday: false,
    sourceType: "shift_image",
    ...over,
  };
}

describe("DayIndicatorBadge — H / BD / HREQ を潰さず区別", () => {
  it("公休（H）: label + variant=public_holiday + rose tone", () => {
    const html = renderToStaticMarkup(
      <DayIndicatorBadge
        indicator={vm({ variant: "public_holiday", label: "公休", countsAsPublicHoliday: true })}
      />
    );
    expect(html).toContain('data-variant="public_holiday"');
    expect(html).toContain("公休");
    expect(html).toContain("rose");
  });

  it("休み（BD）: variant=off + slate tone", () => {
    const html = renderToStaticMarkup(
      <DayIndicatorBadge indicator={vm({ variant: "off", label: "休み" })} />
    );
    expect(html).toContain('data-variant="off"');
    expect(html).toContain("休み");
    expect(html).toContain("slate");
  });

  it("希望休（HREQ）: variant=requested_off + violet + dashed + 控えめ aria", () => {
    const html = renderToStaticMarkup(
      <DayIndicatorBadge
        indicator={vm({ variant: "requested_off", label: "希望休", isTentative: true })}
      />
    );
    expect(html).toContain('data-variant="requested_off"');
    expect(html).toContain("希望休");
    expect(html).toContain("violet");
    expect(html).toContain("dashed");
    expect(html).toContain("希望"); // aria-label に「（希望）」
  });

  it("amber / orange は使わない（feasibility 色と分離）", () => {
    for (const v of ["public_holiday", "off", "requested_off"] as const) {
      const html = renderToStaticMarkup(<DayIndicatorBadge indicator={vm({ variant: v })} />);
      expect(html).not.toContain("amber");
      expect(html).not.toContain("orange");
    }
  });

  it("共通: data-testid を持つ（render contract）", () => {
    const html = renderToStaticMarkup(<DayIndicatorBadge indicator={vm({})} />);
    expect(html).toContain('data-testid="plan-day-indicator-badge"');
  });
});
