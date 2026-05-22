/**
 * Phase 3-L L-4d-b1 — Calendar / Flow selected-day / today-only wiring tests
 *
 * 設計書: docs/alter-plan-phase3-l-4d-b-readiness-audit.md §8 / §11
 *
 * 検証範囲 (= file grep + module import で機械検証):
 *
 *   §1. CalendarTab (= selected day detail のみ拡張)
 *     - useMapTabMovementDisplay / usePlanGeocode を import している
 *     - selectedDayAnchors を usePlanGeocode に渡している
 *     - DayGraphTimeline に movementDisplayByTransitionIndex prop を渡している
 *     - 「月 grid 全件 geocode」 を行っていない (= 7 day 全件 / 月 grid 全件展開なし)
 *
 *   §2. FlowTab (= today section のみ拡張)
 *     - useMapTabMovementDisplay / usePlanGeocode を import している
 *     - todayAnchors のみを usePlanGeocode に渡している (= 7 day 全件ではない)
 *     - FlowDaySection に movementDisplayByTransitionIndex prop を渡している
 *     - today section のみ override される (= isToday 判定で他 6 day は undefined)
 *
 *   §3. K-3c-iii 階調保護 (= amber/orange/red 不使用 維持)
 *
 *   §4. L-4b NG 文言 (= 早めに/快適/注意/歩いて/km/from) 不使用
 *
 *   §5. PlanClient core 改変なし (= geocode state 引き上げ 0)
 *
 *   §6. 新規 fetch / endpoint 呼出なし (= 既存 _usePlanGeocode の利用のみ)
 *
 *   §7. localStorage / Arrival Risk Memory / runtime telemetry sink 0
 *
 * 不変原則:
 *   - LLM 不使用 / 新規 endpoint なし / localStorage 不使用 / DB / env / dependency 変更 0
 *   - K phase 既存 file 変更 0
 *   - L-1〜L-4d-b1 着手前の既存 file (= movement* lib + L-4d hook + Phase 2-C geocode) 改変 0
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// File contents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";
const PLAN_CLIENT_PATH = "app/(culcept)/plan/PlanClient.tsx";

const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");
const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");
const planClientContent = readFileSync(PLAN_CLIENT_PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. CalendarTab — selected day detail のみ拡張
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. CalendarTab — selected day detail のみ拡張", () => {
  it("useMapTabMovementDisplay を import", () => {
    expect(calendarTabContent).toMatch(
      /import\s+\{\s*useMapTabMovementDisplay\s*\}\s+from\s+["']\.\/_useMapTabMovementDisplay["']/,
    );
  });

  it("usePlanGeocode を import (= 既存 hook 流用、 新規 endpoint なし)", () => {
    expect(calendarTabContent).toMatch(
      /import\s+\{\s*usePlanGeocode\s*\}\s+from\s+["']\.\/_usePlanGeocode["']/,
    );
  });

  it("selectedDayAnchors を usePlanGeocode に渡す (= 最小 subset 利用)", () => {
    expect(calendarTabContent).toMatch(/usePlanGeocode\s*\(\s*selectedDayAnchors\s*\)/);
  });

  it("useMapTabMovementDisplay を 3 引数で呼ぶ (= anchors / date / resolutions)", () => {
    expect(calendarTabContent).toMatch(
      /useMapTabMovementDisplay\s*\(\s*selectedDayAnchors\s*,/,
    );
  });

  it("DayGraphTimeline に movementDisplayByTransitionIndex prop を渡す", () => {
    expect(calendarTabContent).toMatch(
      /movementDisplayByTransitionIndex=\{calendarMovementDisplayByTransitionIndex\}/,
    );
  });

  it("月 grid 全件 (= anchors 全件) を usePlanGeocode に渡していない", () => {
    // `usePlanGeocode(anchors)` (= 全件) や `usePlanGeocode(allAnchors)` 等の pattern を禁止
    expect(calendarTabContent).not.toMatch(/usePlanGeocode\s*\(\s*anchors\s*\)/);
    expect(calendarTabContent).not.toMatch(/usePlanGeocode\s*\(\s*allAnchors/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. FlowTab — L-4d-b2 着地後 7 day 全件に拡張 (= 旧 today only path は置換)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// L-4d-b1 時点では FlowTab は today section のみ拡張だった。
// L-4d-b2 着地 (= 2026-05-22 CEO 承認) で 7 day 全件に発展:
//   - useMapTabMovementDisplay (= 1 day 用) から useFlowWeekMovementDisplay (= 7 day 用) に置換
//   - todayAnchors only → visibleWeekAnchors (= dedupe 後 1 batch) に置換
//   - isToday 判定削除、 各 day timeline に movement display を配る
//
// 但し:
//   - usePlanGeocode は引き続き利用 (= 既存 endpoint、 新規 endpoint なし)
//   - PlanClient core 引き上げなし
//   - Calendar 月 grid / L-4d-b3 は引き続き禁止

describe("§2. FlowTab — L-4d-b2 着地後 7 day 全件拡張", () => {
  it("useFlowWeekMovementDisplay を import (= 新 hook、 7 day 用)", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*useFlowWeekMovementDisplay\s*\}\s+from\s+["']\.\/_useFlowWeekMovementDisplay["']/,
    );
  });

  it("usePlanGeocode を import (= 既存 hook、 新規 endpoint なし)", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*usePlanGeocode\s*\}\s+from\s+["']\.\/_usePlanGeocode["']/,
    );
  });

  it("visibleWeekAnchors を usePlanGeocode に渡す (= 1 batch resolve、 dedupe 後)", () => {
    expect(flowTabContent).toMatch(/usePlanGeocode\s*\(\s*visibleWeekAnchors\s*\)/);
  });

  it("L-4d-b1 の todayAnchors only path は削除済", () => {
    expect(flowTabContent).not.toMatch(/usePlanGeocode\s*\(\s*todayAnchors\s*\)/);
    expect(flowTabContent).not.toMatch(/const\s+todayAnchors\s*=/);
  });

  it("FlowDaySection に movementDisplayByTransitionIndex prop を渡す", () => {
    expect(flowTabContent).toMatch(/movementDisplayByTransitionIndex=\{/);
  });

  it("L-4d-b1 の isToday 判定は削除済 (= 7 day 全件で表示)", () => {
    expect(flowTabContent).not.toMatch(
      /isToday\s*\?\s*todayMovementDisplayByTransitionIndex/,
    );
  });

  it("movementDisplayByDay.get(iso) で 7 day 全件に prop drilling", () => {
    expect(flowTabContent).toMatch(/movementDisplayByDay\.get\(iso\)/);
  });

  it("FlowDaySection の props 定義に movementDisplayByTransitionIndex が optional として残る", () => {
    expect(flowTabContent).toMatch(
      /movementDisplayByTransitionIndex\?\s*:\s*ReadonlyMap<\s*number\s*,\s*MovementDisplayView\s*>/,
    );
  });

  it("FlowDaySection 内 DayGraphTimeline へ prop transmit (= L-4d-b1 から継続)", () => {
    const sectionInnerMatch = flowTabContent.match(
      /<DayGraphTimeline[\s\S]+?movementDisplayByTransitionIndex=\{movementDisplayByTransitionIndex\}/,
    );
    expect(sectionInnerMatch).not.toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. K-3c-iii 階調保護 — amber/orange/red 不使用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. K-3c-iii 階調保護", () => {
  it("CalendarTab は amber/orange/red を import / class で使用しない", () => {
    expect(calendarTabContent).not.toMatch(/text-amber-/);
    expect(calendarTabContent).not.toMatch(/text-orange-/);
    expect(calendarTabContent).not.toMatch(/text-red-/);
    expect(calendarTabContent).not.toMatch(/bg-amber-/);
    expect(calendarTabContent).not.toMatch(/bg-orange-/);
    expect(calendarTabContent).not.toMatch(/bg-red-/);
  });

  it("FlowTab は amber/orange/red を import / class で使用しない", () => {
    expect(flowTabContent).not.toMatch(/text-amber-/);
    expect(flowTabContent).not.toMatch(/text-orange-/);
    expect(flowTabContent).not.toMatch(/text-red-/);
    expect(flowTabContent).not.toMatch(/bg-amber-/);
    expect(flowTabContent).not.toMatch(/bg-orange-/);
    expect(flowTabContent).not.toMatch(/bg-red-/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. L-4b NG 文言 — render path 不含有
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. L-4b NG 文言 — render path 不含有", () => {
  const ngWordings = ["早めに", "お急ぎ", "快適", "注意", "歩いて", "km"];
  for (const ng of ngWordings) {
    it(`CalendarTab に NG 文言 "${ng}" の render path 不存在`, () => {
      const renderPatterns = [
        new RegExp(`>\\s*${ng}`),
        new RegExp(`["']${ng}["']`),
        new RegExp("`" + ng + "`"),
      ];
      for (const p of renderPatterns) {
        expect(calendarTabContent).not.toMatch(p);
      }
    });

    it(`FlowTab に NG 文言 "${ng}" の render path 不存在`, () => {
      const renderPatterns = [
        new RegExp(`>\\s*${ng}`),
        new RegExp(`["']${ng}["']`),
        new RegExp("`" + ng + "`"),
      ];
      for (const p of renderPatterns) {
        expect(flowTabContent).not.toMatch(p);
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. PlanClient core 改変なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. PlanClient core — geocode state 引き上げ 0", () => {
  it("PlanClient に usePlanGeocode の import / 呼出が存在しない", () => {
    expect(planClientContent).not.toMatch(/usePlanGeocode/);
  });

  it("PlanClient に useMapTabMovementDisplay の import / 呼出が存在しない", () => {
    expect(planClientContent).not.toMatch(/useMapTabMovementDisplay/);
  });

  it("PlanClient に geocode state が存在しない", () => {
    expect(planClientContent).not.toMatch(/geocodeResults|resolutionsByAnchorId|coordsByAnchor/);
  });

  it("PlanClient に movementDisplay 関連の import / 呼出が存在しない", () => {
    expect(planClientContent).not.toMatch(/movementDisplay/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. 新規 fetch / endpoint なし、 既存 endpoint の限定利用のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. 既存 endpoint 限定利用、 新規 fetch / endpoint なし", () => {
  it("CalendarTab に新規 fetch( call なし", () => {
    // 既存 fetch がもしあれば許容するが、 L-4d-b1 で新規追加していないことを確認
    // (= L-4d-b1 commit diff で fetch( 行が増えていないこと)
    // ここでは「直接 fetch( を呼ぶ pattern」 が存在しないことを確認
    const fetchMatches = calendarTabContent.match(/\bfetch\s*\(/g) ?? [];
    // CalendarTab は元々 fetch を持たない想定、 L-4d-b1 で追加していないことの sanity
    expect(fetchMatches.length).toBe(0);
  });

  it("FlowTab に新規 fetch( call なし", () => {
    const fetchMatches = flowTabContent.match(/\bfetch\s*\(/g) ?? [];
    expect(fetchMatches.length).toBe(0);
  });

  it("CalendarTab / FlowTab は新規 endpoint URL を含まない (= /api/plan/anchors/geocode 以外の新規 endpoint なし)", () => {
    // 既存 _usePlanGeocode が /api/plan/anchors/geocode を呼ぶが、 Calendar/Flow 直接は呼ばない
    expect(calendarTabContent).not.toMatch(/["']\/api\//);
    expect(flowTabContent).not.toMatch(/["']\/api\//);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. localStorage / telemetry sink / Arrival Risk 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. 永続禁止項目 — 各 Tab で 0 件", () => {
  it("CalendarTab に localStorage / sessionStorage / IndexedDB の実コール 0", () => {
    expect(calendarTabContent).not.toMatch(/localStorage\./);
    expect(calendarTabContent).not.toMatch(/sessionStorage\./);
    expect(calendarTabContent).not.toMatch(/indexedDB\./);
  });

  it("FlowTab に localStorage / sessionStorage / IndexedDB の実コール 0", () => {
    expect(flowTabContent).not.toMatch(/localStorage\./);
    expect(flowTabContent).not.toMatch(/sessionStorage\./);
    expect(flowTabContent).not.toMatch(/indexedDB\./);
  });

  it("CalendarTab に Arrival Risk / arrivalRisk 参照 0", () => {
    expect(calendarTabContent).not.toMatch(/[Aa]rrivalRisk/);
  });

  it("FlowTab に Arrival Risk / arrivalRisk 参照 0", () => {
    expect(flowTabContent).not.toMatch(/[Aa]rrivalRisk/);
  });

  it("CalendarTab に runtime telemetry sink 実装 0 (= tracingId は OK)", () => {
    expect(calendarTabContent).not.toMatch(/telemetrySink|telemetryWrite|recordTelemetry/);
  });

  it("FlowTab に runtime telemetry sink 実装 0", () => {
    expect(flowTabContent).not.toMatch(/telemetrySink|telemetryWrite|recordTelemetry/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. MapTab 既存挙動維持 (= regression guard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. MapTab regression — L-4d 既存挙動維持", () => {
  const mapTabContent = readFileSync(
    "app/(culcept)/plan/tabs/MapTab.tsx",
    "utf-8",
  );

  it("MapTab で useMapTabMovementDisplay 呼出維持 (= L-4d の継続)", () => {
    expect(mapTabContent).toMatch(/useMapTabMovementDisplay/);
  });

  it("MapTab で DayGraphTimeline への prop 渡し維持", () => {
    expect(mapTabContent).toMatch(/movementDisplayByTransitionIndex=\{movementDisplayByTransitionIndex\}/);
  });
});
