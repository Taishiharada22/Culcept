/**
 * Phase 3-M-3c-ui MapTab-only UI 接続 — wiring + structural tests
 *
 * 設計書:
 *   - docs/alter-plan-phase3-m-3c-ui-readiness-audit.md (= M-3c-ui 全体責務分解)
 *   - docs/alter-plan-phase3-m-3c-readiness-audit.md (= per-transition disclosure)
 *   - docs/alter-plan-phase3-m-3b-readiness-audit.md (= observational disclosure 思想)
 *
 * 検証範囲 (= file grep + module import で機械検証、 既存 L-4d test pattern と整合):
 *
 *   §1. DayGraphTimeline component
 *     - 3 つ新 optional props を DayGraphTimelineProps に追加
 *     - FeasibilityDisplayView 型 import
 *     - TransitionItem が 4 新 prop を受け取る (= feasibilityView / isExpanded / onToggleDisclosure / transitionIndex)
 *     - 「詳細」 / 「閉じる」 textual hint render コード存在
 *     - FeasibilityDisclosureLine subcomponent 存在
 *     - conditional render (= expanded 時のみ DOM に出す) コード存在
 *     - aria-expanded / aria-controls / tabIndex / cursor-pointer 付与
 *     - amber/orange/red / icon / badge / warning box を file 内で使っていない
 *     - 警告系文言 (= 危険 / 不足しています / 注意 / 警告) を含まない
 *     - 既存 K-3c-iii / L-4d 階層を侵さない (= text-xs italic text-slate-400 維持)
 *
 *   §2. _useMapTabFeasibilityDisplay hook
 *     - "use client" directive
 *     - buildDayGraph + resolveMovementSegmentOverlay + runFeasibilityDisplayPipeline を import
 *     - useEffect + cancelled flag (= stale 防御)
 *     - localStorage / fetch / network を使わない
 *     - runtime telemetry sink なし
 *
 *   §3. MapTab wiring
 *     - useMapTabFeasibilityDisplay を import
 *     - resetAllDisclosures / applyDisclosureAction / getDisclosureStateForIndex を import
 *     - useState(resetAllDisclosures) (= React lazy initial state)
 *     - useEffect([selectedDate]) で reset
 *     - DayGraphTimeline に 3 新 props を渡している
 *
 *   §4. CalendarTab / FlowTab に MapTab-only 影響なし (= backward compat)
 *     - useMapTabFeasibilityDisplay を呼んでいない
 *     - feasibilityDisplayByTransitionIndex prop を渡していない
 *     - expandedTransitionIndices prop を渡していない
 *     - onToggleFeasibilityDisclosure prop を渡していない
 *
 *   §5. Privacy grep
 *     - anchorId / locationText / title / userId / nodeId を state / trace に出さない
 *     - transitionIndex のみ key として使用
 *
 *   §6. CEO 補正反映 (= 2026-05-23)
 *     - hidden 時 DOM 不在 (= conditional render、 視覚 hidden 禁止)
 *     - hover-only 禁止 (= tap / keyboard のみ)
 *     - 3 props セットで disclosure 有効化 (= backward compat 100%)
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase / L 全 file 変更 0
 *   - M-1 / M-2 / M-3a / M-3b-pure / M-3c-pure-harden 変更 0
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// File contents (= structural grep)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DAY_GRAPH_TIMELINE_PATH =
  "app/(culcept)/plan/components/DayGraphTimeline.tsx";
const HOOK_PATH = "app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts";
const MAP_TAB_PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const CALENDAR_TAB_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const FLOW_TAB_PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";

const dayGraphContent = readFileSync(DAY_GRAPH_TIMELINE_PATH, "utf-8");
const hookContent = readFileSync(HOOK_PATH, "utf-8");
const mapTabContent = readFileSync(MAP_TAB_PATH, "utf-8");
const calendarTabContent = readFileSync(CALENDAR_TAB_PATH, "utf-8");
const flowTabContent = readFileSync(FLOW_TAB_PATH, "utf-8");

/**
 * JSDoc / line comments を除いた本体だけ抽出する helper。
 *
 * 用途: 「警告系文言は user-facing render に含まれない」 を検証する際、
 *   JSDoc で禁止項目を documentation として書いている記述を除外する。
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments / JSDoc
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const dayGraphCode = stripComments(dayGraphContent);
const hookCode = stripComments(hookContent);
const mapTabCode = stripComments(mapTabContent);

/**
 * FeasibilityDisclosureLine 関数本体のみを抽出する helper。
 *
 * 使い方: 「補助行コンポーネントの内部に PII / icon / 警告色がない」 を検証する。
 */
function extractFeasibilityDisclosureLineBody(content: string): string {
  const startMarker = "function FeasibilityDisclosureLine";
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return "";
  // 次の "// ━━━" block separator or end of file まで
  const endMarker = "// ━━━";
  const endIdx = content.indexOf(endMarker, startIdx);
  return content.slice(startIdx, endIdx === -1 ? undefined : endIdx);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. DayGraphTimeline component — M-3c-ui 拡張
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. DayGraphTimeline component — M-3c-ui 拡張", () => {
  it("FeasibilityDisplayView 型を import している", () => {
    expect(dayGraphContent).toMatch(
      /import\s+type\s+\{\s*FeasibilityDisplayView\s*\}\s+from\s+["']@\/lib\/plan\/feasibility\/feasibilityDisplayFormatter["']/,
    );
  });

  it("DayGraphTimelineProps に feasibilityDisplayByTransitionIndex prop 追加", () => {
    expect(dayGraphContent).toMatch(
      /feasibilityDisplayByTransitionIndex\?\s*:\s*ReadonlyMap<number,\s*FeasibilityDisplayView>/,
    );
  });

  it("DayGraphTimelineProps に expandedTransitionIndices prop 追加", () => {
    expect(dayGraphContent).toMatch(
      /expandedTransitionIndices\?\s*:\s*ReadonlySet<number>/,
    );
  });

  it("DayGraphTimelineProps に onToggleFeasibilityDisclosure prop 追加", () => {
    expect(dayGraphContent).toMatch(
      /onToggleFeasibilityDisclosure\?\s*:\s*\(transitionIndex:\s*number\)\s*=>\s*void/,
    );
  });

  it("TransitionItem に feasibilityView / isExpanded / onToggleDisclosure / transitionIndex 拡張 props", () => {
    expect(dayGraphContent).toMatch(/feasibilityView\?\s*:\s*FeasibilityDisplayView/);
    expect(dayGraphContent).toMatch(/isExpanded\?\s*:\s*boolean/);
    expect(dayGraphContent).toMatch(/onToggleDisclosure\?\s*:\s*\(\)\s*=>\s*void/);
    // transitionIndex は同名 prop が L-4d でも使われるが、 TransitionItemProps に明示
    expect(dayGraphContent).toMatch(/transitionIndex\?\s*:\s*number/);
  });

  it("「詳細」 / 「閉じる」 textual hint render コード存在", () => {
    expect(dayGraphContent).toContain("詳細");
    expect(dayGraphContent).toContain("閉じる");
    expect(dayGraphContent).toMatch(/expanded\s*\?\s*["']閉じる["']\s*:\s*["']詳細["']/);
  });

  it("FeasibilityDisclosureLine subcomponent 存在", () => {
    expect(dayGraphContent).toMatch(/function FeasibilityDisclosureLine\(/);
    expect(dayGraphContent).toMatch(/id=\{`feasibility-disclosure-\$\{transitionIndex\}`\}/);
  });

  it("conditional render — expanded 時のみ補助行を DOM に出す", () => {
    // expanded && canDisclose && feasibilityView の条件で <FeasibilityDisclosureLine> render
    expect(dayGraphContent).toMatch(
      /canDisclose\s*&&\s*isExpanded\s*&&\s*feasibilityView\s*&&\s*\(/,
    );
    expect(dayGraphContent).toMatch(/<FeasibilityDisclosureLine/);
  });

  it("aria-expanded / aria-controls / tabIndex / onClick / onKeyDown 付与", () => {
    expect(dayGraphContent).toMatch(/aria-expanded=\{isInteractive\s*\?\s*expanded\s*:\s*undefined\}/);
    expect(dayGraphContent).toMatch(/aria-controls=\{ariaControlsId\}/);
    expect(dayGraphContent).toMatch(/tabIndex=\{isInteractive\s*\?\s*0\s*:\s*undefined\}/);
    expect(dayGraphContent).toMatch(/onClick=\{isInteractive\s*\?\s*onToggleDisclosure\s*:\s*undefined\}/);
    expect(dayGraphContent).toMatch(/onKeyDown=\{handleKeyDown\}/);
  });

  it("keyboard Enter / Space で toggle (= hover-only 禁止)", () => {
    expect(dayGraphContent).toMatch(/e\.key\s*===\s*["']Enter["']\s*\|\|\s*e\.key\s*===\s*["'] ["']/);
    expect(dayGraphContent).toMatch(/onToggleDisclosure\?\.\(\)/);
  });

  it("amber / orange / red 警告色を使っていない", () => {
    // L-4d でも同 grep。 M-3c-ui で追加した部分でも amber/orange/red を使わない
    expect(dayGraphContent).not.toMatch(/\bamber-\d/);
    expect(dayGraphContent).not.toMatch(/\borange-\d/);
    expect(dayGraphContent).not.toMatch(/\bred-\d/);
    expect(dayGraphContent).not.toMatch(/\byellow-\d/);
  });

  it("警告系文言 (= 危険 / 不足しています / 注意 / 警告 / 危ない) を含まない (= comment 除外)", () => {
    // JSDoc / comment は禁止リスト documentation で含むため stripComments で除外
    expect(dayGraphCode).not.toMatch(/危険/);
    expect(dayGraphCode).not.toMatch(/不足しています/);
    expect(dayGraphCode).not.toMatch(/注意/);
    expect(dayGraphCode).not.toMatch(/警告/);
    expect(dayGraphCode).not.toMatch(/危ない/);
    expect(dayGraphCode).not.toMatch(/ヤバ/);
  });

  it("recommendation / optimization 文言を含まない (= comment 除外)", () => {
    expect(dayGraphCode).not.toMatch(/おすすめ/);
    expect(dayGraphCode).not.toMatch(/推奨/);
    expect(dayGraphCode).not.toMatch(/最適/);
    expect(dayGraphCode).not.toMatch(/効率/);
  });

  it("FeasibilityDisclosureLine の styling は K-3c-iii tier_2 同階調 (= text-xs italic text-slate-400)", () => {
    expect(dayGraphContent).toMatch(/className="text-xs italic text-slate-400 pl-8"/);
  });

  it("FeasibilityDisclosureLine に icon / badge / background / border なし", () => {
    const content = extractFeasibilityDisclosureLineBody(dayGraphContent);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toMatch(/\bbg-/);
    expect(content).not.toMatch(/\bborder-/);
    expect(content).not.toMatch(/\brounded-/);
    expect(content).not.toMatch(/<svg/);
    expect(content).not.toMatch(/Icon/);
  });

  it("hint textual は aria-hidden で screen reader 二重読み上げ回避", () => {
    expect(dayGraphContent).toMatch(/<span[\s\S]*?aria-hidden="true"[\s\S]*?>\s*\{hintText\}\s*<\/span>/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. _useMapTabFeasibilityDisplay hook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. _useMapTabFeasibilityDisplay hook", () => {
  it("'use client' directive 存在", () => {
    expect(hookContent).toMatch(/^"use client";/);
  });

  it("buildDayGraph + resolveMovementSegmentOverlay + runFeasibilityDisplayPipeline を import", () => {
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

  it("providers は manual_user / heuristic / unresolved sentinel の 3 種", () => {
    expect(hookContent).toMatch(/createManualUserProvider/);
    expect(hookContent).toMatch(/createHeuristicDistanceProvider/);
    expect(hookContent).toMatch(/createUnresolvedProvider/);
  });

  it("returns ReadonlyMap<number, FeasibilityDisplayView>", () => {
    expect(hookContent).toMatch(
      /ReadonlyMap<number,\s*FeasibilityDisplayView>/,
    );
  });

  it("EMPTY_DISPLAY_MAP fallback で「詳細」 hint も補助行も出ない", () => {
    expect(hookContent).toMatch(/EMPTY_DISPLAY_MAP/);
    expect(hookContent).toMatch(/new Map\(\)/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. MapTab wiring — feasibility hook + state + reset + handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. MapTab wiring", () => {
  it("useMapTabFeasibilityDisplay を import している", () => {
    expect(mapTabContent).toMatch(
      /import\s+\{\s*useMapTabFeasibilityDisplay\s*\}\s+from\s+["']\.\/_useMapTabFeasibilityDisplay["']/,
    );
  });

  it("resetAllDisclosures / applyDisclosureAction / getDisclosureStateForIndex を import", () => {
    expect(mapTabContent).toMatch(/resetAllDisclosures/);
    expect(mapTabContent).toMatch(/applyDisclosureAction/);
    expect(mapTabContent).toMatch(/getDisclosureStateForIndex/);
    expect(mapTabContent).toMatch(/ExpandedTransitionIndices/);
  });

  it("useState(resetAllDisclosures) で default hidden を機械保証 (= React lazy initial state)", () => {
    expect(mapTabContent).toMatch(
      /useState<\s*ExpandedTransitionIndices\s*>\s*\(\s*resetAllDisclosures\s*\)/,
    );
  });

  it("useEffect([selectedDate]) で reset (= 「観測の幕間」)", () => {
    expect(mapTabContent).toMatch(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setExpandedTransitionIndices\(resetAllDisclosures\(\)\)[\s\S]*?\},\s*\[selectedDate\]/,
    );
  });

  it("handleToggleFeasibilityDisclosure callback 経由で state 更新", () => {
    expect(mapTabContent).toMatch(/handleToggleFeasibilityDisclosure/);
    expect(mapTabContent).toMatch(/useCallback/);
    expect(mapTabContent).toMatch(/applyDisclosureAction\(current,\s*transitionIndex,\s*action\)/);
  });

  it("DayGraphTimeline に 3 新 props を渡している", () => {
    expect(mapTabContent).toMatch(/feasibilityDisplayByTransitionIndex=\{feasibilityDisplayByTransitionIndex\}/);
    expect(mapTabContent).toMatch(/expandedTransitionIndices=\{expandedTransitionIndices\}/);
    expect(mapTabContent).toMatch(/onToggleFeasibilityDisclosure=\{handleToggleFeasibilityDisclosure\}/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. CalendarTab / FlowTab — MapTab hook 独立性 + tab 独立性 (= post-M-3d)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 注: M-3d (= 2026-05-23) で CalendarTab / FlowTab も feasibility disclosure を持つようになった。
//     ただし、 各 tab は **独立 hook** (= useCalendarTabFeasibilityDisplay / useFlowWeekFeasibilityDisplay)
//     を持ち、 MapTab の hook (= useMapTabFeasibilityDisplay) を再利用していない。
//     よって本 §4 は「MapTab hook が他 tab に拡散していないこと」 を検証する形に再定義。

describe("§4. MapTab hook 独立性 + tab 独立性 (= post-M-3d)", () => {
  it("CalendarTab は MapTab 固有の useMapTabFeasibilityDisplay を呼ばない (= 独立 hook 経由)", () => {
    expect(calendarTabContent).not.toMatch(/useMapTabFeasibilityDisplay/);
  });

  it("FlowTab は MapTab 固有の useMapTabFeasibilityDisplay を呼ばない (= 独立 hook 経由)", () => {
    expect(flowTabContent).not.toMatch(/useMapTabFeasibilityDisplay/);
  });

  it("CalendarTab は useCalendarTabFeasibilityDisplay を呼ぶ (= M-3d 独立 hook)", () => {
    expect(calendarTabContent).toMatch(/useCalendarTabFeasibilityDisplay/);
  });

  it("FlowTab は useFlowWeekFeasibilityDisplay を呼ぶ (= M-3d 独立 hook)", () => {
    expect(flowTabContent).toMatch(/useFlowWeekFeasibilityDisplay/);
  });

  it("MapTab は useCalendarTabFeasibilityDisplay / useFlowWeekFeasibilityDisplay を呼ばない", () => {
    expect(mapTabContent).not.toMatch(/useCalendarTabFeasibilityDisplay/);
    expect(mapTabContent).not.toMatch(/useFlowWeekFeasibilityDisplay/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Privacy grep — transitionIndex only、 PII 不在
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Privacy grep — transitionIndex only", () => {
  it("hook で anchorId / locationText / title / userId を state / trace に出さない", () => {
    // anchorId は ExternalAnchor 経由で来るが、 state には Map<number, FeasibilityDisplayView> のみ保持
    // hook 内で anchorId / locationText 等を直接 state 化しない
    expect(hookContent).not.toMatch(/anchorId.*setDisplayMap/);
    expect(hookContent).not.toMatch(/locationText/);
    expect(hookContent).not.toMatch(/userId/);
    expect(hookContent).not.toMatch(/anchor\.title/);
  });

  it("DayGraphTimeline の FeasibilityDisclosureLine は view.displayText のみ render", () => {
    const content = extractFeasibilityDisclosureLineBody(dayGraphContent);
    expect(content.length).toBeGreaterThan(0);
    expect(content).not.toMatch(/anchor/i);
    expect(content).not.toMatch(/location/i);
    expect(content).not.toMatch(/title/i);
    // "user" は一般語 (= aria-label にも含み得る) なので個別禁止せず、 anchor/location/title だけ厳格チェック
    // view.displayText / view.variant / view.tier のみ
    expect(content).toMatch(/view\.displayText/);
  });

  it("MapTab の disclosure state は number のみ key", () => {
    // ExpandedTransitionIndices = ReadonlySet<number> 型遵守
    expect(mapTabContent).toMatch(
      /useState<\s*ExpandedTransitionIndices\s*>/,
    );
    // anchor.id / locationText 等を state に入れない
    expect(mapTabContent).not.toMatch(/setExpandedTransitionIndices\([^)]*anchor\.id/);
    expect(mapTabContent).not.toMatch(/setExpandedTransitionIndices\([^)]*locationText/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. CEO 補正反映 (= 2026-05-23): hidden 時 DOM 不在 + hover-only 禁止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. CEO 補正反映 — hidden 時 DOM 不在 + hover-only 禁止", () => {
  it("hidden 時に FeasibilityDisclosureLine を DOM に出さない (= conditional render)", () => {
    // {canDisclose && isExpanded && feasibilityView && (<FeasibilityDisclosureLine ...>)}
    // CSS hidden / display:none ではなく、 React conditional で完全不在化
    expect(dayGraphContent).toMatch(
      /canDisclose\s*&&\s*isExpanded\s*&&\s*feasibilityView\s*&&\s*\(/,
    );
  });

  it("display:none / visibility:hidden / aria-hidden で隠さない (= conditional render のみ)", () => {
    const lineContent = extractFeasibilityDisclosureLineBody(dayGraphContent);
    expect(lineContent.length).toBeGreaterThan(0);
    expect(lineContent).not.toMatch(/display:\s*['"]?none/);
    expect(lineContent).not.toMatch(/visibility:\s*['"]?hidden/);
    // aria-hidden は親 li では false / 不在、 hint span のみ aria-hidden="true" (= 二重読み上げ回避)
    // FeasibilityDisclosureLine 自体は aria-hidden="true" にしない (= screen reader が読む)
    expect(lineContent).not.toMatch(/aria-hidden=["']true["']/);
  });

  it("hover-only 禁止 — onMouseEnter / onMouseOver で toggle しない", () => {
    expect(dayGraphContent).not.toMatch(/onMouseEnter=\{[^}]*Disclosure/);
    expect(dayGraphContent).not.toMatch(/onMouseOver=\{[^}]*Disclosure/);
    // hover で onToggleDisclosure を呼ばない
    expect(dayGraphContent).not.toMatch(/:hover[^}]*onToggleDisclosure/);
  });

  it("3 props 全件指定で初めて disclosure UI 有効化 (= backward compat 100%)", () => {
    // canDisclose = 3 props 全部 + feasibilityView 存在 の AND
    expect(dayGraphContent).toMatch(
      /canDisclose\s*=[\s\S]*feasibilityDisplayByTransitionIndex\s*!==\s*undefined[\s\S]*expandedTransitionIndices\s*!==\s*undefined[\s\S]*onToggleFeasibilityDisclosure\s*!==\s*undefined/,
    );
  });

  it("「不足 N 分」 / 「余白 N 分」 を勝手に常時表示する code path がない", () => {
    // FeasibilityDisclosureLine は expanded 時のみ render される
    // 「常時表示する」 unconditional な <FeasibilityDisclosureLine ... /> がない
    const matches = dayGraphContent.match(/<FeasibilityDisclosureLine/g);
    expect(matches?.length).toBe(1);
    // その 1 件は canDisclose && isExpanded gated
    expect(dayGraphContent).toMatch(
      /isExpanded\s*&&\s*feasibilityView\s*&&\s*\(\s*\n\s*<FeasibilityDisclosureLine/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. Module shape (= named export 整合性)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. Module shape", () => {
  it("_useMapTabFeasibilityDisplay は named export 'useMapTabFeasibilityDisplay'", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay"
    );
    expect(mod.useMapTabFeasibilityDisplay).toBeDefined();
    expect(typeof mod.useMapTabFeasibilityDisplay).toBe("function");
  });

  it("_useMapTabFeasibilityDisplay は default export を持たない", async () => {
    const mod = await import(
      "@/app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay"
    );
    expect((mod as Record<string, unknown>).default).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. K phase / L / M-1〜M-3c-pure-harden 既存 file 改変 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. 既存 file 改変 0", () => {
  it("M-3c-pure-harden の feasibilityDisclosureAdapter.ts に EMPTY_EXPANDED_INDICES export なし (= harden 規約継承)", () => {
    const adapter = readFileSync(
      "lib/plan/feasibility/feasibilityDisclosureAdapter.ts",
      "utf-8",
    );
    // export const EMPTY_EXPANDED_INDICES は存在しない (= harden で削除済)
    expect(adapter).not.toMatch(/^export const EMPTY_EXPANDED_INDICES/m);
  });

  it("M-3a feasibilityDisplayPipeline.ts は M-3c-ui 着地で改変なし", () => {
    const pipeline = readFileSync(
      "lib/plan/feasibility/feasibilityDisplayPipeline.ts",
      "utf-8",
    );
    // 既存 export 健在
    expect(pipeline).toMatch(/export function runFeasibilityDisplayPipeline/);
  });

  it("M-3b-pure feasibilityDisclosureState.ts は M-3c-ui 着地で改変なし", () => {
    const state = readFileSync(
      "lib/plan/feasibility/feasibilityDisclosureState.ts",
      "utf-8",
    );
    // 既存 export 健在
    expect(state).toMatch(/export type FeasibilityDisclosureState/);
    expect(state).toMatch(/export const DEFAULT_DISCLOSURE_STATE/);
  });
});
