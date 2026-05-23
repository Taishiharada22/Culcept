/**
 * Phase 3-M-3d CalendarTab selected day Feasibility Disclosure wiring tests
 *
 * 設計書:
 *   - docs/alter-plan-phase3-m-3d-readiness-audit.md (= M-3d 全体)
 *   - docs/alter-plan-phase3-m-3c-ui-readiness-audit.md (= MapTab pattern source)
 *
 * 検証範囲 (= file grep + module import で機械検証、 既存 M-3c-ui test pattern と整合):
 *
 *   §1. CalendarTab 既存 import (= L-4d-b1 wiring 不変)
 *   §2. M-3d 新規 import (= feasibility hook + adapter)
 *   §3. useState(resetAllDisclosures) for default hidden
 *   §4. useEffect([selectedDate]) で reset
 *   §5. handleToggleFeasibilityDisclosure callback
 *   §6. DayGraphTimeline に 3 props pass
 *   §7. _useCalendarTabFeasibilityDisplay hook 構造
 *   §8. Privacy grep — transitionIndex only
 *   §9. 警告色 / icon / amber/orange/red なし
 *   §10. month / grid 全件展開なし (= 構造的確認)
 *   §11. MapTab / FlowTab に影響なし (= backward compat)
 *   §12. Module shape
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase / L 全 file 変更 0
 *   - M-1 / M-2 / M-3a / M-3b-pure / M-3c-pure-harden / M-3c-ui 既存 file 改変 0
 *   - DayGraphTimeline 改変 0 (= M-3c-ui 3 props 拡張をそのまま再利用)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const HOOK_PATH = "app/(culcept)/plan/tabs/_useCalendarTabFeasibilityDisplay.ts";
const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";
const DAY_GRAPH_TIMELINE_PATH =
  "app/(culcept)/plan/components/DayGraphTimeline.tsx";

const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");
const hookContent = readFileSync(HOOK_PATH, "utf-8");
const mapTabContent = readFileSync(MAP_TAB_PATH, "utf-8");
const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");
const dayGraphContent = readFileSync(DAY_GRAPH_TIMELINE_PATH, "utf-8");

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const calendarTabCode = stripComments(calendarTabContent);
const hookCode = stripComments(hookContent);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. CalendarTab 既存 import (= L-4d-b1 wiring 不変)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. CalendarTab L-4d-b1 wiring 不変", () => {
  it("useMapTabMovementDisplay import 継続", () => {
    expect(calendarTabContent).toMatch(
      /import\s+\{\s*useMapTabMovementDisplay\s*\}\s+from\s+["']\.\/_useMapTabMovementDisplay["']/,
    );
  });

  it("calendarMovementDisplayByTransitionIndex を DayGraphTimeline に渡している", () => {
    expect(calendarTabContent).toMatch(
      /movementDisplayByTransitionIndex=\{calendarMovementDisplayByTransitionIndex\}/,
    );
  });

  it("usePlanGeocode で selectedDayResolutions 取得 (= 不変)", () => {
    expect(calendarTabContent).toMatch(
      /usePlanGeocode\(selectedDayAnchors\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. M-3d 新規 import (= feasibility hook + adapter)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. CalendarTab M-3d 新規 import", () => {
  it("useCalendarTabFeasibilityDisplay を import", () => {
    expect(calendarTabContent).toMatch(
      /import\s+\{\s*useCalendarTabFeasibilityDisplay\s*\}\s+from\s+["']\.\/_useCalendarTabFeasibilityDisplay["']/,
    );
  });

  it("M-3c-pure-harden adapter を import", () => {
    expect(calendarTabContent).toMatch(/applyDisclosureAction/);
    expect(calendarTabContent).toMatch(/getDisclosureStateForIndex/);
    expect(calendarTabContent).toMatch(/resetAllDisclosures/);
    expect(calendarTabContent).toMatch(/ExpandedTransitionIndices/);
  });

  it("useCallback / useEffect を import", () => {
    expect(calendarTabContent).toMatch(
      /import\s+\{\s*useCallback,\s*useEffect,\s*useMemo,\s*useState\s*\}/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. useState(resetAllDisclosures) for default hidden
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. useState(resetAllDisclosures) default hidden", () => {
  it("useState<ExpandedTransitionIndices>(resetAllDisclosures) で React lazy initial state", () => {
    expect(calendarTabContent).toMatch(
      /useState<\s*\n?\s*ExpandedTransitionIndices\s*\n?\s*>\s*\(\s*resetAllDisclosures\s*\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. useEffect([selectedDate]) で reset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. useEffect([selectedDate]) reset", () => {
  it("selectedDate 変化で setExpandedTransitionIndices(resetAllDisclosures())", () => {
    expect(calendarTabContent).toMatch(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setExpandedTransitionIndices\(resetAllDisclosures\(\)\)[\s\S]*?\},\s*\[selectedDate\]/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. handleToggleFeasibilityDisclosure callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. handleToggleFeasibilityDisclosure", () => {
  it("useCallback で handleToggleFeasibilityDisclosure 定義", () => {
    expect(calendarTabContent).toMatch(/handleToggleFeasibilityDisclosure/);
    expect(calendarTabContent).toMatch(/useCallback/);
  });

  it("applyDisclosureAction(current, transitionIndex, action) 経由で state 更新", () => {
    expect(calendarTabContent).toMatch(
      /applyDisclosureAction\(current,\s*transitionIndex,\s*action\)/,
    );
  });

  it("getDisclosureStateForIndex で current state 取得", () => {
    expect(calendarTabContent).toMatch(
      /getDisclosureStateForIndex\(current,\s*transitionIndex\)/,
    );
  });

  it("expanded → request_collapse、 hidden → request_expand", () => {
    expect(calendarTabContent).toMatch(
      /currentState\s*===\s*["']expanded["']\s*\?\s*["']request_collapse["']\s*:\s*["']request_expand["']/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. DayGraphTimeline に 3 props pass
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. DayGraphTimeline 3 props pass", () => {
  it("feasibilityDisplayByTransitionIndex prop 渡している", () => {
    expect(calendarTabContent).toMatch(
      /feasibilityDisplayByTransitionIndex=\{calendarFeasibilityDisplayByTransitionIndex\}/,
    );
  });

  it("expandedTransitionIndices prop 渡している", () => {
    expect(calendarTabContent).toMatch(
      /expandedTransitionIndices=\{expandedTransitionIndices\}/,
    );
  });

  it("onToggleFeasibilityDisclosure prop 渡している", () => {
    expect(calendarTabContent).toMatch(
      /onToggleFeasibilityDisclosure=\{handleToggleFeasibilityDisclosure\}/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. _useCalendarTabFeasibilityDisplay hook 構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. _useCalendarTabFeasibilityDisplay hook", () => {
  it("'use client' directive 存在", () => {
    expect(hookContent).toMatch(/^"use client";/);
  });

  it("buildDayGraph + resolveMovementSegmentOverlay + runFeasibilityDisplayPipeline import", () => {
    expect(hookContent).toMatch(/import\s+\{\s*buildDayGraph\s*\}/);
    expect(hookContent).toMatch(/import\s+\{\s*resolveMovementSegmentOverlay\s*\}/);
    expect(hookContent).toMatch(/import\s+\{\s*runFeasibilityDisplayPipeline\s*\}/);
  });

  it("useEffect + cancelled flag (= stale 防御)", () => {
    expect(hookContent).toMatch(/useEffect/);
    expect(hookContent).toMatch(/let cancelled = false/);
    expect(hookContent).toMatch(/cancelled = true/);
    expect(hookContent).toMatch(/if \(cancelled\) return/);
  });

  it("localStorage / sessionStorage を使っていない (= comment 除外)", () => {
    expect(hookCode).not.toMatch(/localStorage/);
    expect(hookCode).not.toMatch(/sessionStorage/);
  });

  it("fetch / XMLHttpRequest / navigator を使っていない (= comment 除外)", () => {
    expect(hookCode).not.toMatch(/\bfetch\s*\(/);
    expect(hookCode).not.toMatch(/XMLHttpRequest/);
    expect(hookCode).not.toMatch(/navigator\./);
  });

  it("console / telemetry sink なし (= comment 除外)", () => {
    expect(hookCode).not.toMatch(/console\.(log|warn|error|info)/);
    expect(hookCode).not.toMatch(/telemetry/i);
    expect(hookCode).not.toMatch(/Sentry/);
  });

  it("returns ReadonlyMap<number, FeasibilityDisplayView>", () => {
    expect(hookContent).toMatch(
      /ReadonlyMap<number,\s*FeasibilityDisplayView>/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Privacy grep — transitionIndex only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Privacy — transitionIndex only", () => {
  it("CalendarTab で disclosure state は ExpandedTransitionIndices (= number Set) のみ", () => {
    expect(calendarTabContent).toMatch(
      /useState<\s*\n?\s*ExpandedTransitionIndices\s*\n?\s*>/,
    );
  });

  it("hook で anchorId / locationText / title / userId を state に出さない", () => {
    expect(hookContent).not.toMatch(/setDisplayMap.*anchorId/);
    expect(hookContent).not.toMatch(/locationText/);
    expect(hookContent).not.toMatch(/userId/);
    expect(hookContent).not.toMatch(/anchor\.title/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. 警告色 / icon / amber/orange/red なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. 警告色 / icon なし (= comment 除外)", () => {
  it("CalendarTab に amber/orange/red 警告色なし", () => {
    expect(calendarTabCode).not.toMatch(/\bbg-amber-/);
    expect(calendarTabCode).not.toMatch(/\bbg-orange-/);
    expect(calendarTabCode).not.toMatch(/\bbg-red-/);
    // 既存 baseline source label (= text-amber-600 italic) は L-4d-b1 で確立済、 M-3d で追加なし
    // 但し本テストは "M-3d 新規追加 0" を確認するため hook のみ厳格チェック
  });

  it("hook に amber/orange/red 警告色なし", () => {
    expect(hookCode).not.toMatch(/\bamber-\d/);
    expect(hookCode).not.toMatch(/\borange-\d/);
    expect(hookCode).not.toMatch(/\bred-\d/);
  });

  it("hook に警告系文言なし", () => {
    expect(hookCode).not.toMatch(/危険/);
    expect(hookCode).not.toMatch(/警告/);
    expect(hookCode).not.toMatch(/おすすめ/);
    expect(hookCode).not.toMatch(/推奨/);
    expect(hookCode).not.toMatch(/最適/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. month / grid 全件展開なし (= 構造的確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. month / grid 不変", () => {
  it("DayGraphTimeline は selected day section 内 1 箇所のみ render", () => {
    // CalendarTab で <DayGraphTimeline は selected day detail (= line 600 周辺) のみ
    const matches = calendarTabContent.match(/<DayGraphTimeline/g);
    expect(matches?.length).toBe(1);
  });

  it("month grid (= CalendarMonth / WeekStrip) は disclosure UI を出さない", () => {
    // calendar の月 grid (= weekStrip / month grid) は disclosure 3 props を渡さない
    // 構造的確認: 「feasibilityDisplayByTransitionIndex=」 は DayGraphTimeline 1 件のみ
    const matches = calendarTabContent.match(/feasibilityDisplayByTransitionIndex=/g);
    expect(matches?.length).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. MapTab / FlowTab に影響なし (= backward compat)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§11. Backward compat — 他 tab", () => {
  it("MapTab は useCalendarTabFeasibilityDisplay を呼ばない", () => {
    expect(mapTabContent).not.toMatch(/useCalendarTabFeasibilityDisplay/);
  });

  it("FlowTab は useCalendarTabFeasibilityDisplay を呼ばない", () => {
    expect(flowTabContent).not.toMatch(/useCalendarTabFeasibilityDisplay/);
  });

  it("MapTab は M-3c-ui で確立した useMapTabFeasibilityDisplay 経由 (= 不変)", () => {
    expect(mapTabContent).toMatch(/useMapTabFeasibilityDisplay/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §12. Module shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§12. Module shape", () => {
  it("_useCalendarTabFeasibilityDisplay は named export 'useCalendarTabFeasibilityDisplay'", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useCalendarTabFeasibilityDisplay"
    );
    expect(mod.useCalendarTabFeasibilityDisplay).toBeDefined();
    expect(typeof mod.useCalendarTabFeasibilityDisplay).toBe("function");
  });

  it("default export を持たない", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useCalendarTabFeasibilityDisplay"
    );
    expect((mod as Record<string, unknown>).default).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §13. DayGraphTimeline 不変 (= M-3c-ui 3 props 再利用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§13. DayGraphTimeline 不変 (= M-3c-ui 拡張 そのまま)", () => {
  it("DayGraphTimeline に M-3c-ui 拡張 3 props は既に存在", () => {
    expect(dayGraphContent).toMatch(/feasibilityDisplayByTransitionIndex\?\s*:\s*ReadonlyMap/);
    expect(dayGraphContent).toMatch(/expandedTransitionIndices\?\s*:\s*ReadonlySet/);
    expect(dayGraphContent).toMatch(/onToggleFeasibilityDisclosure\?\s*:/);
  });

  it("FeasibilityDisclosureLine subcomponent も既存 (= M-3c-ui で確立)", () => {
    expect(dayGraphContent).toMatch(/function FeasibilityDisclosureLine\(/);
  });
});
