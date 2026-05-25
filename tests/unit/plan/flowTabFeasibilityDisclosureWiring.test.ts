/**
 * Phase 3-M-3d FlowTab 7-day Feasibility Disclosure wiring tests
 *
 * 設計書:
 *   - docs/alter-plan-phase3-m-3d-readiness-audit.md (= 革新 M-3d-1/2/3: per-day state + week reset + curry)
 *   - docs/alter-plan-phase3-m-3c-ui-readiness-audit.md (= MapTab pattern source)
 *
 * 検証範囲:
 *
 *   §1. FlowTab 既存 import (= L-4d-b2 wiring 不変)
 *   §2. M-3d 新規 import (= 7-day feasibility hook + adapter + ExpandedTransitionIndices)
 *   §3. per-day disclosure state (= Record<isoDate, ExpandedTransitionIndices>)
 *   §4. useEffect([weekKey]) で全 day reset (= 「観測の幕間」 week-level)
 *   §5. handleToggleFeasibilityDisclosureForDay curry callback
 *   §6. FlowDaySection に per-day 3 props pass
 *   §7. _useFlowWeekFeasibilityDisplay hook 構造
 *   §8. Privacy grep — isoDate (= 非 PII) + number のみ
 *   §9. 警告色 / icon / amber/orange/red なし
 *   §10. visible 7 days のみ (= 月全件 / 別 week 不在)
 *   §11. MapTab / CalendarTab に影響なし
 *   §12. Module shape
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase / L 全 file 変更 0
 *   - M-1〜M-3c-ui 既存 file 改変 0
 *   - DayGraphTimeline 改変 0 (= M-3c-ui 3 props 拡張をそのまま再利用)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";
const HOOK_PATH = "app/(culcept)/plan/tabs/_useFlowWeekFeasibilityDisplay.ts";
const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";

const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");
const hookContent = readFileSync(HOOK_PATH, "utf-8");
const mapTabContent = readFileSync(MAP_TAB_PATH, "utf-8");
const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const flowTabCode = stripComments(flowTabContent);
const hookCode = stripComments(hookContent);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. FlowTab 既存 import (= L-4d-b2 wiring 不変)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. FlowTab L-4d-b2 wiring 不変", () => {
  it("useFlowWeekMovementDisplay import 継続", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*useFlowWeekMovementDisplay\s*\}\s+from\s+["']\.\/_useFlowWeekMovementDisplay["']/,
    );
  });

  it("movementDisplayByDay を FlowDaySection に per-day で渡している", () => {
    expect(flowTabContent).toMatch(/dayMovementDisplay = movementDisplayByDay\.get\(iso\)/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. M-3d 新規 import
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. FlowTab M-3d 新規 import", () => {
  it("useFlowWeekFeasibilityDisplay を import", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*useFlowWeekFeasibilityDisplay\s*\}\s+from\s+["']\.\/_useFlowWeekFeasibilityDisplay["']/,
    );
  });

  it("M-3c-pure-harden adapter を import", () => {
    expect(flowTabContent).toMatch(/applyDisclosureAction/);
    expect(flowTabContent).toMatch(/getDisclosureStateForIndex/);
    expect(flowTabContent).toMatch(/resetAllDisclosures/);
    expect(flowTabContent).toMatch(/ExpandedTransitionIndices/);
  });

  it("FeasibilityDisplayView type import", () => {
    expect(flowTabContent).toMatch(/import\s+type\s+\{\s*FeasibilityDisplayView\s*\}/);
  });

  it("useCallback / useEffect / useState を import", () => {
    expect(flowTabContent).toMatch(
      /import\s+\{\s*useCallback,\s*useEffect,\s*useMemo,\s*useState\s*\}/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. per-day disclosure state (= Record<isoDate, ExpandedTransitionIndices>)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. per-day disclosure state (= 革新 M-3d-1)", () => {
  it("useState<Record<string, ExpandedTransitionIndices>>({}) で初期空 record", () => {
    expect(flowTabContent).toMatch(
      /useState<\s*\n?\s*Record<string,\s*ExpandedTransitionIndices>\s*\n?\s*>\s*\(\s*\{\}\s*\)/,
    );
  });

  it("setExpandedByDay state setter 存在", () => {
    expect(flowTabContent).toMatch(/setExpandedByDay/);
  });

  // === M-3d-bugfix regression (= 2026-05-23 CEO smoke FAIL 訂正) ===

  it("stableEmptyExpanded (= useMemo) で per-day undefined fallback 提供", () => {
    // 「詳細」 hint が tap 前から表示されるための必須 wiring
    expect(flowTabContent).toMatch(
      /const stableEmptyExpanded\s*=\s*useMemo\(\(\)\s*=>\s*resetAllDisclosures\(\),\s*\[\]\)/,
    );
  });

  it("dayExpanded = expandedByDay[iso] ?? stableEmptyExpanded で fallback chain", () => {
    expect(flowTabContent).toMatch(
      /const dayExpanded\s*=\s*expandedByDay\[iso\]\s*\?\?\s*stableEmptyExpanded/,
    );
  });

  it("dayExpanded は決して undefined にならない (= disclosure UI activatable from initial state)", () => {
    // dayExpanded が undefined になる path がないことを構造的確認
    // (= ?? stableEmptyExpanded で必ず Set instance に解決される)
    expect(flowTabContent).not.toMatch(
      /const dayExpanded\s*=\s*expandedByDay\[iso\];/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. useEffect([weekKey]) で全 day reset
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. week 切替で全 day reset (= 革新 M-3d-2)", () => {
  it("weekKey = isoDate(today) で reset trigger", () => {
    expect(flowTabContent).toMatch(/const weekKey\s*=\s*isoDate\(today\)/);
  });

  it("useEffect([weekKey]) で setExpandedByDay({})", () => {
    expect(flowTabContent).toMatch(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setExpandedByDay\(\{\}\)[\s\S]*?\},\s*\[weekKey\]/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. handleToggleFeasibilityDisclosureForDay curry callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. per-day curry handler (= 革新 M-3d-3)", () => {
  it("handleToggleFeasibilityDisclosureForDay 定義", () => {
    expect(flowTabContent).toMatch(/handleToggleFeasibilityDisclosureForDay/);
  });

  it("curry pattern: (iso) => (transitionIndex) => void", () => {
    expect(flowTabContent).toMatch(
      /\(iso:\s*string\)\s*=>\s*\(transitionIndex:\s*number\)\s*=>\s*\{/,
    );
  });

  it("per-day applyDisclosureAction (= state update via M-3c-pure-harden)", () => {
    expect(flowTabContent).toMatch(
      /applyDisclosureAction\(dayExpanded,\s*transitionIndex,\s*action\)/,
    );
  });

  it("該当日 expanded 不在時は resetAllDisclosures() で初期化", () => {
    expect(flowTabContent).toMatch(
      /current\[iso\]\s*\?\?\s*resetAllDisclosures\(\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. FlowDaySection に per-day 3 props pass
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. FlowDaySection per-day 3 props pass", () => {
  it("feasibilityDisplayByTransitionIndex prop (= dayFeasibilityDisplay) 渡している", () => {
    expect(flowTabContent).toMatch(
      /feasibilityDisplayByTransitionIndex=\{dayFeasibilityDisplay\}/,
    );
  });

  it("expandedTransitionIndices prop (= dayExpanded) 渡している", () => {
    expect(flowTabContent).toMatch(
      /expandedTransitionIndices=\{dayExpanded\}/,
    );
  });

  it("onToggleFeasibilityDisclosure prop (= dayOnToggleDisclosure、 per-day bound) 渡している", () => {
    expect(flowTabContent).toMatch(
      /onToggleFeasibilityDisclosure=\{dayOnToggleDisclosure\}/,
    );
  });

  it("FlowDaySection 内で DayGraphTimeline に同 3 props を再 pass", () => {
    // FlowDaySection 内の DayGraphTimeline 呼出で 3 props を継承
    expect(flowTabContent).toMatch(/feasibilityDisplayByTransitionIndex=\{feasibilityDisplayByTransitionIndex\}/);
    expect(flowTabContent).toMatch(/expandedTransitionIndices=\{expandedTransitionIndices\}/);
    expect(flowTabContent).toMatch(/onToggleFeasibilityDisclosure=\{onToggleFeasibilityDisclosure\}/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. _useFlowWeekFeasibilityDisplay hook 構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. _useFlowWeekFeasibilityDisplay hook", () => {
  it("'use client' directive 存在", () => {
    expect(hookContent).toMatch(/^"use client";/);
  });

  it("buildDayGraph + resolveMovementSegmentOverlay + runFeasibilityDisplayPipeline import", () => {
    expect(hookContent).toMatch(/import\s+\{\s*buildDayGraph\s*\}/);
    expect(hookContent).toMatch(/import\s+\{\s*resolveMovementSegmentOverlay\s*\}/);
    expect(hookContent).toMatch(/import\s+\{\s*runFeasibilityDisplayPipeline\s*\}/);
  });

  it("Promise.all で per-day 並列実行 (= isolation)", () => {
    expect(hookContent).toMatch(/Promise\.all/);
  });

  it("useEffect + cancelled flag (= stale 防御)", () => {
    expect(hookContent).toMatch(/let cancelled = false/);
    expect(hookContent).toMatch(/cancelled = true/);
  });

  it("localStorage / fetch / network なし (= comment 除外)", () => {
    expect(hookCode).not.toMatch(/localStorage/);
    expect(hookCode).not.toMatch(/sessionStorage/);
    expect(hookCode).not.toMatch(/\bfetch\s*\(/);
    expect(hookCode).not.toMatch(/XMLHttpRequest/);
  });

  it("returns ReadonlyMap<string, ReadonlyMap<number, FeasibilityDisplayView>>", () => {
    expect(hookContent).toMatch(
      /ReadonlyMap<\s*\n?\s*string,\s*\n?\s*ReadonlyMap<number,\s*FeasibilityDisplayView>\s*\n?\s*>/,
    );
  });

  it("per-day catch で fail-safe (= 該当 day EMPTY_DAY_DISPLAY)", () => {
    expect(hookContent).toMatch(/EMPTY_DAY_DISPLAY/);
  });

  it("全体 catch で fail-safe (= EMPTY_DAY_MAP)", () => {
    expect(hookContent).toMatch(/EMPTY_DAY_MAP/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Privacy grep — isoDate + number のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Privacy — isoDate + number のみ", () => {
  it("FlowTab で disclosure state は Record<string, ExpandedTransitionIndices>", () => {
    expect(flowTabContent).toMatch(
      /Record<string,\s*ExpandedTransitionIndices>/,
    );
  });

  it("hook で anchorId / locationText / title / userId を state に出さない", () => {
    expect(hookContent).not.toMatch(/setByDay.*anchorId/);
    expect(hookContent).not.toMatch(/locationText/);
    expect(hookContent).not.toMatch(/userId/);
    expect(hookContent).not.toMatch(/anchor\.title/);
  });

  it("hook の indexed Map<number, FeasibilityDisplayView> は number key", () => {
    expect(hookContent).toMatch(/new Map<number,\s*FeasibilityDisplayView>/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. 警告色 / icon なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. 警告色 / icon なし (= comment 除外)", () => {
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
// §10. visible 7 days のみ (= 月全件 / 別 week 不在)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. visible 7 days only (= scope 不変)", () => {
  it("dayAnchorsMap (= 7 day) のみが feasibility hook 入力", () => {
    expect(flowTabContent).toMatch(
      /useFlowWeekFeasibilityDisplay\(\s*dayAnchorsMap,/,
    );
  });

  it("hook は dayAnchorsMap.entries() の per-day 並列のみ", () => {
    expect(hookContent).toMatch(/dayAnchorsMap\.entries\(\)/);
  });

  it("hook 内で month grid / past week / future week への展開なし", () => {
    expect(hookCode).not.toMatch(/monthAnchors/);
    expect(hookCode).not.toMatch(/pastWeek/);
    expect(hookCode).not.toMatch(/futureWeek/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. MapTab / CalendarTab に影響なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§11. Backward compat — 他 tab", () => {
  it("MapTab は useFlowWeekFeasibilityDisplay を呼ばない", () => {
    expect(mapTabContent).not.toMatch(/useFlowWeekFeasibilityDisplay/);
  });

  it("CalendarTab は useFlowWeekFeasibilityDisplay を呼ばない", () => {
    expect(calendarTabContent).not.toMatch(/useFlowWeekFeasibilityDisplay/);
  });

  it("MapTab は M-3c-ui で確立した useMapTabFeasibilityDisplay (= 不変)", () => {
    expect(mapTabContent).toMatch(/useMapTabFeasibilityDisplay/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §12. Module shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§12. Module shape", () => {
  it("_useFlowWeekFeasibilityDisplay は named export 'useFlowWeekFeasibilityDisplay'", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useFlowWeekFeasibilityDisplay"
    );
    expect(mod.useFlowWeekFeasibilityDisplay).toBeDefined();
    expect(typeof mod.useFlowWeekFeasibilityDisplay).toBe("function");
  });

  it("default export を持たない", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useFlowWeekFeasibilityDisplay"
    );
    expect((mod as Record<string, unknown>).default).toBeUndefined();
  });
});
