/**
 * Phase 3-K-3c-ii — FlowTab DayGraphTimeline integration tests
 *
 * 設計書: K-3c 設計提案 §4 / K-3b CalendarTab integration と同 pattern
 *
 * 検証範囲:
 *   1. DayGraphTimeline import 配線
 *   2. dayGraphByDate prop active 利用 (= _dayGraphByDate underscore 廃止)
 *   3. 各 day card で dayGraphByDate[iso] lookup + dayGraphResult prop drilling
 *   4. FlowDaySection で dayGraphResult を render
 *   5. section append style (= mx-4 mt-3 mb-1 / pt-3 / border-t)
 *   6. onEventClick → anchors.find → onAnchorClick bridge
 *   7. 既存 FlowTab UI 不変 (= 7 day list / sticky header / empty state / FAB / static ALTER card)
 *   8. 全 7 day 共通の data-testid 'plan-flow-day-graph-section-{iso}' で識別可能
 *   9. warning color / 推奨文言なし
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PATH = "app/(culcept)/plan/tabs/FlowTab.tsx";
const content = readFileSync(PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. import 確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — import wiring", () => {
  it("DayGraphTimeline を import している", () => {
    expect(content).toMatch(
      /import\s+\{\s*DayGraphTimeline\s*\}\s+from\s+["']\.\.\/components\/DayGraphTimeline["']/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. dayGraphByDate prop active 利用 (= underscore 廃止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — dayGraphByDate active usage", () => {
  it("`_dayGraphByDate` underscore 廃止", () => {
    expect(content).not.toMatch(/dayGraphByDate:\s*_dayGraphByDate/);
    expect(content).not.toMatch(/_dayGraphByDate/);
  });

  it("`dayGraphByDate` を destructure している", () => {
    expect(content).toMatch(/^\s*dayGraphByDate,\s*$/m);
  });

  it("dayGraphByDate?.[iso] で lookup + ?? null fallback", () => {
    expect(content).toMatch(/dayGraphByDate\?\.\[iso\]\s*\?\?\s*null/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. dayGraphResult prop drilling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — dayGraphResult prop drilling", () => {
  it("FlowDaySection に dayGraphResult prop を pass", () => {
    expect(content).toMatch(/dayGraphResult=\{dayGraphResult\}/);
  });

  it("FlowDaySection の props 型に dayGraphResult が含まれる", () => {
    expect(content).toMatch(/dayGraphResult\?:\s*import\(/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. timeline section append
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — timeline section render", () => {
  it("data-testid に iso 付き 'plan-flow-day-graph-section-{iso}' 形式", () => {
    expect(content).toMatch(
      /data-testid=\{`plan-flow-day-graph-section-\$\{iso\}`\}/,
    );
  });

  it("section は controlled append style (= mt-3 / pt-3 / border-t)", () => {
    expect(content).toMatch(/mx-4\s+mt-3\s+mb-1\s+pt-3\s+border-t/);
  });

  it("dayGraphResult が truthy のみ render (= null/undefined skip)", () => {
    expect(content).toMatch(/\{dayGraphResult\s*&&\s*\(/);
  });

  it("DayGraphTimeline component を render", () => {
    expect(content).toMatch(/<DayGraphTimeline/);
  });

  it("view='user_self' 指定", () => {
    expect(content).toMatch(/view=["']user_self["']/);
  });

  it("dataTestId に iso 付き 'plan-flow-day-graph-timeline-{iso}' 形式", () => {
    expect(content).toMatch(
      /dataTestId=\{`plan-flow-day-graph-timeline-\$\{iso\}`\}/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. onEventClick bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — onEventClick bridge", () => {
  it("onEventClick で anchors.find(a => a.id === anchorId) を実施", () => {
    expect(content).toMatch(
      /onEventClick=\{\(anchorId:\s*string\)\s*=>\s*\{[\s\S]{0,500}?anchors\.find/,
    );
  });

  it("onEventClick → onAnchorClick(anchor) bridge", () => {
    expect(content).toMatch(
      /onEventClick=\{[\s\S]{0,800}?onAnchorClick\(anchor\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. 既存 FlowTab UI 不変
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — 既存 UI 不変", () => {
  it("7-day list (= daysToRender.map / days.map) 維持", () => {
    // sub-phase 8b-7-B 以降: LIST_NEW_TIMELINE_ENABLED 分岐により `daysToRender` 経由で render
    // OFF path = days (= 旧 7-day 全配列) / ON path = daysToRender (= 選択日 1 件) 両対応
    expect(content).toMatch(/(daysToRender|days)\.map\(\(day\)/);
  });

  it("FlowDaySection sticky header 維持", () => {
    expect(content).toMatch(/sticky top-0/);
  });

  it("AnchorRow + anchor list (= ul) 維持", () => {
    expect(content).toMatch(/<AnchorRow/);
    expect(content).toMatch(/anchors\.map\(\(a\)/);
  });

  it("empty state 'plan-flow-empty-' 維持", () => {
    expect(content).toMatch(/data-testid=\{`plan-flow-empty-\$\{iso\}`\}/);
  });

  it("FAB (= plan-flow-fab) 維持", () => {
    expect(content).toMatch(/data-testid=["']plan-flow-fab["']/);
  });

  it("StaticAlterSuggestionCard 維持", () => {
    expect(content).toMatch(/<StaticAlterSuggestionCard/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. UI 方針 (= warning color / 推奨文言禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-ii — UI 方針", () => {
  it("K-3c-ii 追加範囲で amber / orange / red shade なし", () => {
    // 既存 FlowTab には rose-300 (= ErrorState 風) があり得るため、 新規追加部分のみ確認
    const section = content.match(/plan-flow-day-graph-section[\s\S]{0,800}/);
    if (section) {
      expect(section[0]).not.toMatch(/amber-/);
      expect(section[0]).not.toMatch(/orange-/);
      expect(section[0]).not.toMatch(/-red-\d/);
    }
  });

  it("K-3c-ii section 周辺で 推奨 / 最適化 / 予測 / 警告 文言なし", () => {
    const section = content.match(/plan-flow-day-graph-section[\s\S]{0,1000}/);
    if (section) {
      expect(section[0]).not.toMatch(/推奨/);
      expect(section[0]).not.toMatch(/最適化/);
      expect(section[0]).not.toMatch(/予測/);
      expect(section[0]).not.toMatch(/警告/);
      expect(section[0]).not.toMatch(/予想/);
    }
  });

  it("K-3c-ii section 周辺で Transport / Risk / duration 表示文言なし", () => {
    const section = content.match(/plan-flow-day-graph-section[\s\S]{0,1000}/);
    if (section) {
      expect(section[0]).not.toMatch(/分の移動/);
      expect(section[0]).not.toMatch(/電車|徒歩|車|タクシー/);
      expect(section[0]).not.toMatch(/遅刻/);
      expect(section[0]).not.toMatch(/risk/i);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. React.memo 適用確認 (= K-3c-ii、 7 timeline 性能担保)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphTimeline React.memo 適用確認 (= K-3c-ii)", () => {
  it("DayGraphTimeline.tsx で React.memo 適用", () => {
    const componentContent = readFileSync(
      "app/(culcept)/plan/components/DayGraphTimeline.tsx",
      "utf-8",
    );
    expect(componentContent).toMatch(/memo\(DayGraphTimelineInner\)/);
  });

  it("DayGraphTimeline.displayName が設定されている (= dev tooling)", () => {
    const componentContent = readFileSync(
      "app/(culcept)/plan/components/DayGraphTimeline.tsx",
      "utf-8",
    );
    expect(componentContent).toMatch(
      /DayGraphTimeline\.displayName\s*=\s*["']DayGraphTimeline["']/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-iii: compact={true} 配線確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FlowTab K-3c-iii — compact prop 配線", () => {
  it("FlowDaySection で DayGraphTimeline に compact={true} を渡す", () => {
    expect(content).toMatch(/compact=\{true\}/);
  });

  it("compact prop は FlowTab に限定 (= CalendarTab / MapTab には渡さない)", () => {
    // 既存 CalendarTab / MapTab を直接 grep
    const calendarTab = readFileSync(
      "app/(culcept)/plan/tabs/CalendarTab.tsx",
      "utf-8",
    );
    const mapTab = readFileSync(
      "app/(culcept)/plan/tabs/MapTab.tsx",
      "utf-8",
    );
    // K-3c-iii では Calendar/Map に compact を渡さない (= default false で既存挙動維持)
    expect(calendarTab).not.toMatch(/compact=\{true\}/);
    expect(mapTab).not.toMatch(/compact=\{true\}/);
  });
});
