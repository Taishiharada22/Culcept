/**
 * Phase 3-L L-4d-b2 — FlowTab 7 day 全件 movement display wiring tests
 *
 * 設計書: docs/alter-plan-phase3-l-4d-b-readiness-audit.md §8.2 (= L-4d-b2 scope)
 *
 * 検証範囲 (= file grep + module import で機械検証):
 *
 *   §1. FlowTab 改修 (= L-4d-b1 → L-4d-b2 への発展)
 *     - useFlowWeekMovementDisplay を import (= L-4d-b1 の useMapTabMovementDisplay 単独 import を置換)
 *     - visibleWeekAnchors dedupe ロジックが存在
 *     - usePlanGeocode を visibleWeekAnchors で 1 回呼出 (= todayAnchors limit ではない)
 *     - L-4d-b1 の todayAnchors / todayResolutions / todayMovementDisplay 変数は削除済
 *     - days.map 内で movementDisplayByDay.get(iso) を FlowDaySection に渡す
 *     - isToday 判定による override 切替は削除済 (= 7 day 全件で表示)
 *
 *   §2. useFlowWeekMovementDisplay hook
 *     - "use client" directive
 *     - bridge / pipeline / providers を import
 *     - useEffect + cancelled flag (= stale 防御)
 *     - Promise.all で並列実行
 *     - per-day fail-safe (= EMPTY_DAY_DISPLAY)
 *     - fetch / localStorage / Arrival Risk 0
 *
 *   §3. K-3c-iii 階調保護
 *
 *   §4. L-4b NG 文言 不使用
 *
 *   §5. PlanClient core 改変なし
 *
 *   §6. 新規 endpoint 0 (= 既存 _usePlanGeocode のみ)
 *
 *   §7. CalendarTab 無変更 (= L-4d-b2 で touch しない)
 *
 *   §8. MapTab 無変更 (= L-4d 既存挙動維持)
 *
 *   §9. Module level smoke
 *     - useFlowWeekMovementDisplay は function として named export
 *
 * 不変原則:
 *   - LLM 不使用 / 新規 endpoint なし / localStorage 不使用 / DB / env / dependency 変更 0
 *   - K phase 既存 file 変更 0
 *   - L-1〜L-4d-b1 lib 全 freeze 維持
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";
const HOOK_PATH = "app/(culcept)/plan/tabs/_useFlowWeekMovementDisplay.ts";
const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const PLAN_CLIENT_PATH = "app/(culcept)/plan/PlanClient.tsx";

const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");
const hookContent = readFileSync(HOOK_PATH, "utf-8");
const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");
const mapTabContent = readFileSync(MAP_TAB_PATH, "utf-8");
const planClientContent = readFileSync(PLAN_CLIENT_PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. FlowTab 改修 (= L-4d-b1 → L-4d-b2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. FlowTab — L-4d-b2 改修", () => {
  it("useFlowWeekMovementDisplay を import (= 新 hook)", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*useFlowWeekMovementDisplay\s*\}\s+from\s+["']\.\/_useFlowWeekMovementDisplay["']/,
    );
  });

  it("useMapTabMovementDisplay の単独 import は削除済 (= L-4d-b1 path 廃止)", () => {
    // FlowTab は L-4d-b1 で useMapTabMovementDisplay を使っていたが、 b2 で削除
    expect(flowTabContent).not.toMatch(
      /import\s+\{\s*useMapTabMovementDisplay\s*\}\s+from\s+["']\.\/_useMapTabMovementDisplay["']/,
    );
  });

  it("visibleWeekAnchors の dedupe ロジック存在", () => {
    expect(flowTabContent).toMatch(/visibleWeekAnchors\s*=\s*useMemo/);
    expect(flowTabContent).toMatch(/new\s+Set<string>\(\)/);
    expect(flowTabContent).toMatch(/dayAnchorsMap\.values\(\)/);
  });

  it("usePlanGeocode を visibleWeekAnchors で呼ぶ (= 1 batch fetch)", () => {
    expect(flowTabContent).toMatch(
      /usePlanGeocode\s*\(\s*visibleWeekAnchors\s*\)/,
    );
  });

  it("usePlanGeocode(todayAnchors) (= L-4d-b1 path) は削除済", () => {
    expect(flowTabContent).not.toMatch(/usePlanGeocode\s*\(\s*todayAnchors\s*\)/);
  });

  it("useFlowWeekMovementDisplay を呼出 (= dayAnchorsMap + weekResolutions)", () => {
    expect(flowTabContent).toMatch(/useFlowWeekMovementDisplay\s*\(/);
    expect(flowTabContent).toMatch(
      /movementDisplayByDay\s*=\s*useFlowWeekMovementDisplay/,
    );
  });

  it("days.map で movementDisplayByDay.get(iso) を渡す", () => {
    expect(flowTabContent).toMatch(/movementDisplayByDay\.get\(iso\)/);
  });

  it("isToday 判定による override 切替は削除済 (= 7 day 全件で表示)", () => {
    // L-4d-b1 で `isToday ? todayMovementDisplay : undefined` を使っていたが、 b2 で削除
    expect(flowTabContent).not.toMatch(
      /isToday\s*\?\s*todayMovementDisplayByTransitionIndex/,
    );
  });

  it("todayAnchors / todayResolutions / todayMovementDisplay 変数は削除済", () => {
    expect(flowTabContent).not.toMatch(/const\s+todayAnchors\s*=/);
    expect(flowTabContent).not.toMatch(/todayResolutions/);
    expect(flowTabContent).not.toMatch(/todayMovementDisplayByTransitionIndex/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. useFlowWeekMovementDisplay hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. useFlowWeekMovementDisplay hook", () => {
  it("'use client' directive", () => {
    expect(hookContent).toMatch(/^["']use client["'];/);
  });

  it("buildCoordsByAnchorIdFromGeocodeResults を import (= L-4c-mapbridge 再利用)", () => {
    expect(hookContent).toMatch(
      /import\s+\{\s*buildCoordsByAnchorIdFromGeocodeResults\s*\}\s+from\s+["']@\/lib\/plan\/transport\/mapTabCoordsBridge["']/,
    );
  });

  it("runMovementDisplayPipeline を import (= L-4c-pure 再利用)", () => {
    expect(hookContent).toMatch(
      /import\s+\{\s*runMovementDisplayPipeline\s*\}\s+from\s+["']@\/lib\/plan\/transport\/movementDisplayPipeline["']/,
    );
  });

  it("3 providers を import (= manual_user / heuristic / unresolved)", () => {
    expect(hookContent).toMatch(/createManualUserProvider/);
    expect(hookContent).toMatch(/createHeuristicDistanceProvider/);
    expect(hookContent).toMatch(/createUnresolvedProvider/);
  });

  it("useEffect + cancelled flag で stale 防御", () => {
    expect(hookContent).toMatch(/let\s+cancelled\s*=\s*false/);
    expect(hookContent).toMatch(/cancelled\s*=\s*true/);
  });

  it("Promise.all で並列実行", () => {
    expect(hookContent).toMatch(/Promise\.all/);
  });

  it("per-day fail-safe (= EMPTY_DAY_DISPLAY)", () => {
    expect(hookContent).toMatch(/EMPTY_DAY_DISPLAY/);
  });

  it("全体 fail-safe (= EMPTY_DAY_MAP)", () => {
    expect(hookContent).toMatch(/EMPTY_DAY_MAP/);
  });

  it("fetch 呼出 0 (= 既存 endpoint の re-use only)", () => {
    expect(hookContent).not.toMatch(/\bfetch\s*\(/);
  });

  it("localStorage 実コール 0", () => {
    expect(hookContent).not.toMatch(/localStorage\.[A-Za-z]/);
    expect(hookContent).not.toMatch(/sessionStorage\.[A-Za-z]/);
  });

  it("default export なし (= named export 強制)", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useFlowWeekMovementDisplay"
    );
    expect((mod as Record<string, unknown>).default).toBeUndefined();
    expect(mod.useFlowWeekMovementDisplay).toBeDefined();
    expect(typeof mod.useFlowWeekMovementDisplay).toBe("function");
  });

  it("Arrival Risk / runtime telemetry sink 0", () => {
    expect(hookContent).not.toMatch(/[Aa]rrivalRisk/);
    expect(hookContent).not.toMatch(/telemetrySink|telemetryWrite|recordTelemetry/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. K-3c-iii 階調保護 — amber/orange/red 不使用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. K-3c-iii 階調保護", () => {
  it("FlowTab に amber / orange / red の class 不使用", () => {
    expect(flowTabContent).not.toMatch(/text-amber-/);
    expect(flowTabContent).not.toMatch(/text-orange-/);
    expect(flowTabContent).not.toMatch(/text-red-/);
    expect(flowTabContent).not.toMatch(/bg-amber-/);
    expect(flowTabContent).not.toMatch(/bg-orange-/);
    expect(flowTabContent).not.toMatch(/bg-red-/);
  });

  it("hook に amber / orange / red の class 不使用", () => {
    expect(hookContent).not.toMatch(/text-amber-/);
    expect(hookContent).not.toMatch(/text-orange-/);
    expect(hookContent).not.toMatch(/text-red-/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. L-4b NG 文言 不使用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. L-4b NG 文言 — render path 不含有", () => {
  const ngWordings = ["早めに", "お急ぎ", "快適", "注意", "歩いて", "km"];
  for (const ng of ngWordings) {
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

  it("PlanClient に useFlowWeekMovementDisplay の import / 呼出が存在しない", () => {
    expect(planClientContent).not.toMatch(/useFlowWeekMovementDisplay/);
  });

  it("PlanClient に movement display 関連 import が存在しない", () => {
    expect(planClientContent).not.toMatch(/movementDisplay/i);
  });

  it("PlanClient に geocode state が存在しない", () => {
    expect(planClientContent).not.toMatch(
      /geocodeResults|resolutionsByAnchorId|coordsByAnchor/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. 新規 endpoint 0 — 既存 _usePlanGeocode のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. 新規 endpoint なし、 既存 _usePlanGeocode の限定利用", () => {
  it("FlowTab に直接 fetch( call なし", () => {
    const fetchMatches = flowTabContent.match(/\bfetch\s*\(/g) ?? [];
    expect(fetchMatches.length).toBe(0);
  });

  it("FlowTab に新規 endpoint URL なし", () => {
    expect(flowTabContent).not.toMatch(/["']\/api\//);
  });

  it("hook に直接 fetch( call なし", () => {
    expect(hookContent).not.toMatch(/\bfetch\s*\(/);
  });

  it("hook に新規 endpoint URL なし", () => {
    expect(hookContent).not.toMatch(/["']\/api\//);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. CalendarTab 無変更 (= L-4d-b2 で touch しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. CalendarTab — L-4d-b2 で touch していない", () => {
  it("CalendarTab で useFlowWeekMovementDisplay を import しない", () => {
    expect(calendarTabContent).not.toMatch(/useFlowWeekMovementDisplay/);
  });

  it("CalendarTab は引き続き useMapTabMovementDisplay (= L-4d-b1 path) を使う", () => {
    expect(calendarTabContent).toMatch(/useMapTabMovementDisplay/);
  });

  it("CalendarTab は selectedDayAnchors で usePlanGeocode を呼ぶ (= L-4d-b1 維持)", () => {
    expect(calendarTabContent).toMatch(
      /usePlanGeocode\s*\(\s*selectedDayAnchors\s*\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. MapTab 無変更 (= L-4d 既存挙動維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. MapTab — L-4d 既存挙動維持", () => {
  it("MapTab で useMapTabMovementDisplay (= L-4d hook) を引き続き使う", () => {
    expect(mapTabContent).toMatch(/useMapTabMovementDisplay/);
  });

  it("MapTab で useFlowWeekMovementDisplay を import しない", () => {
    expect(mapTabContent).not.toMatch(/useFlowWeekMovementDisplay/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. Module-level smoke
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. hook module-level smoke", () => {
  it("useFlowWeekMovementDisplay は function として export", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useFlowWeekMovementDisplay"
    );
    expect(typeof mod.useFlowWeekMovementDisplay).toBe("function");
    // signature: (dayAnchorsMap, resolutions) → ReadonlyMap
    expect(mod.useFlowWeekMovementDisplay.length).toBe(2);
  });
});
