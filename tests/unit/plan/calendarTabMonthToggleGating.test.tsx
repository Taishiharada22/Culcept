/**
 * CalendarTab month toggle gating — render contract（Plan 月ビュー M3-a）
 *
 * CEO 必須（flag default OFF 状態で）:
 *   - flag OFF: 「週 | 月」toggle が出ない
 *   - flag OFF: 既存 week strip 表示が壊れない（= UI 完全不変）
 *   - MonthGridView はまだ render されない（month grid 本体は M3-b）
 *
 * 注: flag ON 時に toggle が出ることは calendarViewMode.test（pure）+
 *     calendarViewToggleRenderContract（component）+ M3-b visual smoke で担保。
 *     flag は client const のため、ここでは module mock せず default OFF を検証する。
 *
 * renderToStaticMarkup 規約（jsdom 不使用）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// CalendarTab の import chain（server action 等）が server-only を引くため無効化
// （既存 dayIndicatorCoexistenceRenderContract.test.tsx と同方針）
vi.mock("server-only", () => ({}));

import { CalendarTab } from "@/app/(culcept)/plan/tabs/CalendarTab";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

const NOW = new Date("2025-07-06T09:00:00.000Z");
const ANCHOR: ExternalAnchor = {
  id: "a1",
  userId: "u1",
  title: "歯医者",
  startTime: "15:00",
  rigidity: "hard",
  sourceId: "s1",
  confirmedAt: "2025-07-06T00:00:00.000Z",
  anchorKind: "one_off",
  date: "2025-07-06",
};

describe("CalendarTab month toggle gating（flag default OFF）", () => {
  const html = renderToStaticMarkup(<CalendarTab anchors={[ANCHOR]} now={NOW} />);

  it("flag OFF: 週|月 toggle が出ない", () => {
    expect(html).not.toContain("plan-calendar-view-toggle");
  });

  it("flag OFF: 既存 week strip 表示が壊れない", () => {
    expect(html).toContain("plan-calendar-week-strip");
    expect(html).toContain("plan-calendar-month-label"); // 月 header も健在
    expect(html).toContain("歯医者"); // 選択日 anchor も健在
  });

  it("MonthGridView はまだ render されない", () => {
    expect(html).not.toContain("plan-month-grid");
  });
});
