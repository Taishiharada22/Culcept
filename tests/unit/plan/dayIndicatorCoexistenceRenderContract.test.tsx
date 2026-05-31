/**
 * SR #216 D3 — day_indicator badge × anchor 共存 render contract
 *
 * CEO/GPT 要件:
 *   - anchor（timeline event）は不変。badge は day-level に「追加」するだけ。
 *   - 同じ日に anchor と day_indicator が共存できる（例: シフト休みだが 15 時に歯医者）。
 *   - dayIndicator なしなら badge は出ない（dormant / anchor 表示不変）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// FlowTab/CalendarTab の import chain（server action 等）が server-only を引くため無効化
//（既存 proposalPlanClientHelpers.test.ts と同方針）
vi.mock("server-only", () => ({}));

import { FlowTab } from "@/app/(culcept)/plan/tabs/FlowTab";
import { CalendarTab } from "@/app/(culcept)/plan/tabs/CalendarTab";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

const NOW = new Date("2025-07-06T09:00:00.000Z");
const ISO = "2025-07-06";

// 「シフト上は休みだが 15 時に歯医者」= anchor（手動予定）
const ANCHOR: ExternalAnchor = {
  id: "a1",
  userId: "u1",
  title: "歯医者",
  startTime: "15:00",
  rigidity: "hard",
  sourceId: "s1",
  confirmedAt: "2025-07-06T00:00:00.000Z",
  anchorKind: "one_off",
  date: ISO,
};

// 同じ日の公休（day-level indicator）
const PUBLIC_HOLIDAY: DayIndicatorViewModel = {
  date: ISO,
  variant: "public_holiday",
  label: "公休",
  isTentative: false,
  countsAsPublicHoliday: true,
  sourceType: "shift_image",
};

describe("FlowTab — badge × anchor 共存", () => {
  it("dayIndicator なし: anchor 表示・badge なし（anchor 不変）", () => {
    const html = renderToStaticMarkup(<FlowTab anchors={[ANCHOR]} now={NOW} />);
    expect(html).toContain("歯医者");
    expect(html).not.toContain(`plan-flow-day-indicator-${ISO}`);
  });

  it("同日に anchor + 公休: 両方表示（anchor を消さず badge を追加）", () => {
    const map = new Map([[ISO, PUBLIC_HOLIDAY]]);
    const html = renderToStaticMarkup(
      <FlowTab anchors={[ANCHOR]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).toContain("歯医者"); // anchor そのまま
    expect(html).toContain(`plan-flow-day-indicator-${ISO}`); // badge も
    expect(html).toContain("公休");
    expect(html).toContain('data-variant="public_holiday"');
  });
});

describe("CalendarTab — badge × anchor 共存", () => {
  it("dayIndicator なし: 選択日 anchor 表示・badge なし", () => {
    const html = renderToStaticMarkup(<CalendarTab anchors={[ANCHOR]} now={NOW} />);
    expect(html).toContain("歯医者");
    expect(html).not.toContain("plan-calendar-selected-day-indicator");
  });

  it("選択日に anchor + 公休: anchor + selected-day badge + 週セル dot", () => {
    const map = new Map([[ISO, PUBLIC_HOLIDAY]]);
    const html = renderToStaticMarkup(
      <CalendarTab anchors={[ANCHOR]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).toContain("歯医者"); // anchor そのまま
    expect(html).toContain("plan-calendar-selected-day-indicator"); // selected-day badge
    expect(html).toContain(`plan-calendar-day-indicator-${ISO}`); // 週セル dot
    expect(html).toContain("公休");
  });
});
