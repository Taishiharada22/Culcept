/**
 * Phase 3-L L-4d MapTab-only UI 接続 — wiring + structural tests
 *
 * 設計書:
 *   - docs/alter-plan-phase3-l-4-readiness-audit.md (= L-4 全体責務分解)
 *   - docs/alter-plan-phase3-l-4c-mapbridge-readiness-audit.md (= bridge)
 *
 * 検証範囲 (= file grep + module import で機械検証、 既存 K-3a test pattern と整合):
 *
 *   §1. DayGraphTimeline component
 *     - movementDisplayByTransitionIndex prop が DayGraphTimelineProps に追加されている
 *     - TransitionItem が displayOverride prop を受け取る
 *     - displayOverride?.displayText で label を override
 *     - buildAriaLabelFromDisplay helper が存在
 *     - className は K-3c-iii (= view.className) をそのまま使う (= 階調保護)
 *     - amber/orange/red を file 内で使っていない (= K-3c-iii 階調 維持)
 *     - NG 文言 (= 早めに / 快適 / 注意 / 歩いて / km) を含まない
 *
 *   §2. _useMapTabMovementDisplay hook
 *     - "use client" directive
 *     - bridge + pipeline を import
 *     - useEffect + cancelled flag (= stale 防御)
 *     - localStorage / fetch を使わない
 *     - providers は 3 種 (= manual_user / heuristic / unresolved sentinel)
 *
 *   §3. MapTab wiring
 *     - useMapTabMovementDisplay を import している
 *     - DayGraphTimeline に movementDisplayByTransitionIndex prop を渡している
 *
 *   §4. CalendarTab / FlowTab に MapTab-only 影響なし
 *     - useMapTabMovementDisplay を呼んでいない
 *     - movementDisplayByTransitionIndex prop を渡していない
 *
 *   §5. Privacy grep (= 既存 PII patterns)
 *     - DayGraphTimeline / hook / MapTab で raw locationText 等を直接 render していない
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file (= dayGraph types / buildDayGraph) 変更 0
 *   - L-1/L-2/L-3/L-4a/L-4b/L-4c-pure/L-4c-mapbridge 既存 file 変更 0
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// File contents (= structural grep)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_GRAPH_TIMELINE_PATH =
  "app/(culcept)/plan/components/DayGraphTimeline.tsx";
const HOOK_PATH = "app/(culcept)/plan/tabs/_useMapTabMovementDisplay.ts";
const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";

const dayGraphContent = readFileSync(DAY_GRAPH_TIMELINE_PATH, "utf-8");
const hookContent = readFileSync(HOOK_PATH, "utf-8");
const mapTabContent = readFileSync(MAP_TAB_PATH, "utf-8");
const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");
const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. DayGraphTimeline component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. DayGraphTimeline component — L-4d optional prop 追加", () => {
  it("MovementDisplayView 型を import している", () => {
    expect(dayGraphContent).toMatch(
      /import\s+type\s+\{\s*MovementDisplayView\s*\}\s+from\s+["']@\/lib\/plan\/transport\/movementDisplayFormatter["']/,
    );
  });

  it("movementDisplayByTransitionIndex prop が optional として宣言されている", () => {
    expect(dayGraphContent).toMatch(
      /readonly\s+movementDisplayByTransitionIndex\?\s*:\s*ReadonlyMap<\s*number\s*,\s*MovementDisplayView\s*>/,
    );
  });

  it("TransitionItem が displayOverride prop を受け取る", () => {
    expect(dayGraphContent).toMatch(
      /readonly\s+displayOverride\?\s*:\s*MovementDisplayView/,
    );
  });

  it("displayOverride?.displayText で view.label を override する", () => {
    expect(dayGraphContent).toMatch(
      /displayOverride\?\.displayText\s*\?\?\s*view\.label/,
    );
  });

  it("buildAriaLabelFromDisplay helper 関数が存在", () => {
    expect(dayGraphContent).toMatch(/function\s+buildAriaLabelFromDisplay/);
  });

  it("ariaLabel が duration_only で「場所の移動、 約 N 分」 形式に変換される", () => {
    expect(dayGraphContent).toMatch(/`場所の移動、\s*\$\{suffix\}`/);
  });

  it("TransitionItem の className は view.className のまま (= K-3c-iii 階調保護)", () => {
    expect(dayGraphContent).toMatch(/className=\{\s*view\.className\s*\}/);
  });

  it("data-variant 属性で variant が露出 (= debug / test 用)", () => {
    expect(dayGraphContent).toMatch(/data-variant=\{displayOverride\?\.variant/);
  });

  it("transitionIndexByFromNodeId pre-compute が存在 (= K view 改変なしで index 取得)", () => {
    expect(dayGraphContent).toMatch(
      /transitionIndexByFromNodeId\s*=\s*new\s+Map<\s*string\s*,\s*number\s*>\(\)/,
    );
  });
});

describe("§1b. K-3c-iii 階調保護 — amber/orange/red 不使用", () => {
  // 既存 K-3a test と同 pattern (= file-level grep で禁止 color を確認)
  const forbiddenColorPatterns = [
    /text-amber-/,
    /bg-amber-/,
    /border-amber-/,
    /text-orange-/,
    /bg-orange-/,
    /border-orange-/,
    /text-red-/,
    /bg-red-/,
    /border-red-/,
  ];

  for (const pattern of forbiddenColorPatterns) {
    it(`DayGraphTimeline に ${pattern.source} が含まれない`, () => {
      expect(dayGraphContent).not.toMatch(pattern);
    });
  }
});

describe("§1c. L-4b NG 文言 list — DayGraphTimeline に含まれない", () => {
  // L-4b で禁止された substring が DayGraphTimeline file 内で displayable な位置にない
  // (= comment 含めて grep するが、 component が render する文字列に変換されることはない)
  const ngWordings = ["早めに", "お急ぎ", "快適", "注意", "歩いて", "km"];
  for (const ng of ngWordings) {
    it(`DayGraphTimeline 内に NG 文言 "${ng}" が render path に含まれない`, () => {
      // 一部 NG word は comment / 説明には現れる可能性があるため、
      // 「JSX 内に直接 literal として書かれていない」 を確認:
      // {`${ng}` ... } や > ${ng} < や = "${ng}" 等のレンダラ可能 pattern を禁止
      const renderablePatterns = [
        new RegExp(`>\\s*${ng}\\s*<`),
        new RegExp(`["']${ng}["']`),
        new RegExp("`" + ng + "`"),
      ];
      for (const p of renderablePatterns) {
        expect(dayGraphContent).not.toMatch(p);
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. _useMapTabMovementDisplay hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. _useMapTabMovementDisplay hook", () => {
  it("'use client' directive", () => {
    expect(hookContent).toMatch(/^["']use client["'];/);
  });

  it("buildCoordsByAnchorIdFromGeocodeResults を import (= L-4c-mapbridge)", () => {
    expect(hookContent).toMatch(
      /import\s+\{\s*buildCoordsByAnchorIdFromGeocodeResults\s*\}\s+from\s+["']@\/lib\/plan\/transport\/mapTabCoordsBridge["']/,
    );
  });

  it("runMovementDisplayPipeline を import (= L-4c-pure)", () => {
    expect(hookContent).toMatch(
      /import\s+\{\s*runMovementDisplayPipeline\s*\}\s+from\s+["']@\/lib\/plan\/transport\/movementDisplayPipeline["']/,
    );
  });

  it("createManualUserProvider / createHeuristicDistanceProvider / createUnresolvedProvider を import", () => {
    expect(hookContent).toMatch(/createManualUserProvider/);
    expect(hookContent).toMatch(/createHeuristicDistanceProvider/);
    expect(hookContent).toMatch(/createUnresolvedProvider/);
  });

  it("useEffect + cancelled flag で stale 防御", () => {
    expect(hookContent).toMatch(/let\s+cancelled\s*=\s*false/);
    expect(hookContent).toMatch(/cancelled\s*=\s*true/);
  });

  it("fetch を呼ばない (= 新規 geocode call なし)", () => {
    expect(hookContent).not.toMatch(/fetch\s*\(/);
  });

  it("localStorage / sessionStorage / IndexedDB を実呼出しない (= comment 言及のみ許可)", () => {
    // 実コードでの呼出 (= `.getItem` / `.setItem` 等のプロパティアクセス) のみ禁止。
    // doc comment の「localStorage 不使用」 等の記述は許容。
    expect(hookContent).not.toMatch(/localStorage\.[A-Za-z]/);
    expect(hookContent).not.toMatch(/sessionStorage\.[A-Za-z]/);
    expect(hookContent).not.toMatch(/indexedDB\.[A-Za-z]/);
    expect(hookContent).not.toMatch(/window\.localStorage/);
    expect(hookContent).not.toMatch(/window\.sessionStorage/);
  });

  it("default export なし (= named export 強制)", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useMapTabMovementDisplay"
    );
    expect((mod as Record<string, unknown>).default).toBeUndefined();
    expect(mod.useMapTabMovementDisplay).toBeDefined();
    expect(typeof mod.useMapTabMovementDisplay).toBe("function");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. MapTab wiring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. MapTab wiring — hook + prop", () => {
  it("useMapTabMovementDisplay を import", () => {
    expect(mapTabContent).toMatch(
      /import\s+\{\s*useMapTabMovementDisplay\s*\}\s+from\s+["']\.\/_useMapTabMovementDisplay["']/,
    );
  });

  it("useMapTabMovementDisplay(dayAnchors, ..., resolutions) で呼ぶ", () => {
    // 引数 3 つ: dayAnchors / date string / resolutions
    expect(mapTabContent).toMatch(/useMapTabMovementDisplay\s*\(/);
    expect(mapTabContent).toMatch(/movementDisplayByTransitionIndex\s*=\s*useMapTabMovementDisplay/);
  });

  it("DayGraphTimeline に movementDisplayByTransitionIndex prop を渡す", () => {
    expect(mapTabContent).toMatch(
      /movementDisplayByTransitionIndex=\{movementDisplayByTransitionIndex\}/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. CalendarTab / FlowTab は MapTab-only 影響なし (= 既存挙動維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. CalendarTab — MapTab-only 影響なし", () => {
  it("useMapTabMovementDisplay を import しない", () => {
    expect(calendarTabContent).not.toMatch(/useMapTabMovementDisplay/);
  });

  it("movementDisplayByTransitionIndex prop を渡さない", () => {
    expect(calendarTabContent).not.toMatch(/movementDisplayByTransitionIndex/);
  });
});

describe("§4b. FlowTab — MapTab-only 影響なし", () => {
  it("useMapTabMovementDisplay を import しない", () => {
    expect(flowTabContent).not.toMatch(/useMapTabMovementDisplay/);
  });

  it("movementDisplayByTransitionIndex prop を渡さない", () => {
    expect(flowTabContent).not.toMatch(/movementDisplayByTransitionIndex/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Privacy grep — render path に raw PII を含めない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Privacy grep — visible render path で raw PII を漏らさない", () => {
  it("DayGraphTimeline の JSX children (= visible text) に raw locationText / title を出さない", () => {
    // JSX children として `>{node.locationText}<` 等を直接書いていないこと
    // (= K-3a で displayLabel 経由が確立、 raw fields は data-* attribute のみ許可される)
    // 注: `data-anchor-id={node.anchorId}` 等の attribute は visual render ではないため対象外
    expect(dayGraphContent).not.toMatch(/>\s*\{\s*node\.locationText\s*\}\s*</);
    expect(dayGraphContent).not.toMatch(/>\s*\{\s*node\.title\s*\}\s*</);
    expect(dayGraphContent).not.toMatch(/>\s*\{\s*node\.anchorId\s*\}\s*</);
  });

  it("hook が raw locationText / resolvedName を扱わない (= bridge で破棄済)", () => {
    expect(hookContent).not.toMatch(/locationText/);
    expect(hookContent).not.toMatch(/resolvedName/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Module-level integration smoke (= hook が pipeline / bridge 経由で動く)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. hook + pipeline + bridge module-level smoke", () => {
  it("hook module export shape: useMapTabMovementDisplay function", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useMapTabMovementDisplay"
    );
    expect(typeof mod.useMapTabMovementDisplay).toBe("function");
    // hook の signature: (anchors, date, resolutions) → ReadonlyMap
    expect(mod.useMapTabMovementDisplay.length).toBe(3);
  });

  it("MovementDisplayView type が L-4a から正しく re-routable", async () => {
    const mod = await import(
      "@/lib/plan/transport/movementDisplayFormatter"
    );
    expect(mod.formatOverlaySegmentForDisplay).toBeDefined();
    expect(typeof mod.formatOverlaySegmentForDisplay).toBe("function");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Existing K-3a structural invariants 維持確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. K-3a invariants 維持 (= regression guard)", () => {
  it("'use client' directive 維持", () => {
    expect(dayGraphContent).toMatch(/^["']use client["'];/);
  });

  it("buildTimelineView を import 維持", () => {
    expect(dayGraphContent).toMatch(/buildTimelineView/);
  });

  it("result null guard 維持", () => {
    expect(dayGraphContent).toMatch(/if\s*\(\s*!\s*props\.result\s*\)\s*return\s+null/);
  });

  it("data-testid='day-graph-transition' 維持", () => {
    expect(dayGraphContent).toMatch(/data-testid=["']day-graph-transition["']/);
  });
});
