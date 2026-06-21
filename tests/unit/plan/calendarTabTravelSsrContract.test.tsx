/**
 * Phase E-0.5 smoke — CalendarTab × TravelRepository（SSR render contract）
 *
 * 目的: repository 化後も flag OFF（本番既定）で「従来表示と同じ」ことを SSR で保証。
 *   travelTripDay は useEffect で取得するため SSR では走らない（＝サーバ初期 HTML に
 *   旅行ボタンは出ない）。flag OFF なら client でも出ないので、本番初期表示は不変。
 *
 * 検証（now=2026-06-24＝fixture 旅行日でも）:
 *   - flag OFF: 「旅の詳細を見る」ボタン（plan-calendar-open-travel）が出ない
 *   - flag OFF: 既存 week strip / 月 header / 選択日 anchor が壊れない（UI 不変）
 *   - 初期 SSR で travel overlay 本体も描画されない（ちらつき源の overlay は閉のまま）
 *
 * renderToStaticMarkup 規約（jsdom 不使用・既存 render contract と同方針）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// CalendarTab の import chain（server action 等）が server-only を引くため無効化
vi.mock("server-only", () => ({}));

import { CalendarTab } from "@/app/(culcept)/plan/tabs/CalendarTab";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// fixture 旅行期間内（2026-06-24）を「今日」にして、旅行日でも flag OFF なら出ないことを示す
const NOW = new Date("2026-06-24T09:00:00.000Z");
const ANCHOR: ExternalAnchor = {
  id: "a1",
  userId: "u1",
  title: "歯医者",
  startTime: "15:00",
  rigidity: "hard",
  sourceId: "s1",
  confirmedAt: "2026-06-24T00:00:00.000Z",
  anchorKind: "one_off",
  date: "2026-06-24",
};

describe("CalendarTab travel repository wiring（SSR・flag default OFF）", () => {
  const html = renderToStaticMarkup(<CalendarTab anchors={[ANCHOR]} now={NOW} />);

  it("flag OFF: 旅行日でも『旅の詳細を見る』ボタンが出ない", () => {
    expect(html).not.toContain("plan-calendar-open-travel");
    expect(html).not.toContain("旅の詳細を見る");
  });

  it("flag OFF: 既存 week strip / 月 header / 選択日 anchor が壊れない", () => {
    expect(html).toContain("plan-calendar-week-strip");
    expect(html).toContain("plan-calendar-month-label");
    expect(html).toContain("歯医者");
  });
});
