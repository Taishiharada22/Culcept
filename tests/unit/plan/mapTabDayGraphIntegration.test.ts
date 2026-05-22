/**
 * Phase 3-K-3c-i — MapTab DayGraphTimeline integration tests
 *
 * 設計書: K-3c 設計提案 §3 / K-3b CalendarTab integration と同 pattern
 *
 * 検証範囲:
 *   1. DayGraphTimeline import 配線
 *   2. dayGraphByDate prop の active 利用 (= _dayGraphByDate underscore 廃止)
 *   3. SelectedAnchorCard 直後に section append (= mt-6 pt-4 border-t、 控えめ)
 *   4. selectedDate → isoDate(selectedDate) で lookup
 *   5. onEventClick → dayAnchors.find → onAnchorClick bridge
 *   6. 既存 SelectedAnchorCard / Map / CategoryGrid / FAB 不変
 *   7. warning color / 推奨文言なし
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PATH = "app/(culcept)/plan/tabs/MapTab.tsx";
const content = readFileSync(PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. import 確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — import wiring", () => {
  it("DayGraphTimeline を import している", () => {
    expect(content).toMatch(
      /import\s+\{\s*DayGraphTimeline\s*\}\s+from\s+["']\.\.\/components\/DayGraphTimeline["']/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. dayGraphByDate prop active 利用 (= underscore 廃止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — dayGraphByDate active usage", () => {
  it("`_dayGraphByDate` underscore 廃止 (= active 利用へ)", () => {
    expect(content).not.toMatch(/dayGraphByDate:\s*_dayGraphByDate/);
    expect(content).not.toMatch(/_dayGraphByDate/);
  });

  it("`dayGraphByDate` を destructure している", () => {
    expect(content).toMatch(/^\s*dayGraphByDate,\s*$/m);
  });

  it("dayGraphByDate?.[isoDate(selectedDate)] で lookup", () => {
    expect(content).toMatch(/dayGraphByDate\?\.\[isoDate\(selectedDate\)\]/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. section append style
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — timeline section append", () => {
  it("section data-testid='plan-map-day-graph-section'", () => {
    expect(content).toMatch(/data-testid=["']plan-map-day-graph-section["']/);
  });

  it("section は controlled append style (= mt-6 / pt-4 / border-t)", () => {
    const forward =
      /data-testid=["']plan-map-day-graph-section["'][\s\S]{0,200}?(mt-6|pt-4|border-t)/;
    const reverse =
      /(mt-6|pt-4|border-t)[\s\S]{0,200}?data-testid=["']plan-map-day-graph-section["']/;
    expect(forward.test(content) || reverse.test(content)).toBe(true);
  });

  it("subtle heading '1 日の構造' + slate-500 italic", () => {
    expect(content).toMatch(/1 日の構造/);
    // MapTab には複数 italic があり得るが、 timeline section 周辺で確認
    const section = content.match(
      /plan-map-day-graph-section[\s\S]{0,500}/,
    );
    expect(section).not.toBeNull();
    if (section) {
      expect(section[0]).toMatch(/text-slate-500.*italic|italic.*text-slate-500/);
    }
  });

  it("DayGraphTimeline component を render", () => {
    expect(content).toMatch(/<DayGraphTimeline/);
  });

  it("view='user_self' を指定 (= MapTab は自分の view)", () => {
    const section = content.match(
      /plan-map-day-graph-section[\s\S]{0,800}/,
    );
    if (section) {
      expect(section[0]).toMatch(/view=["']user_self["']/);
    }
  });

  it("dataTestId='plan-map-day-graph-timeline'", () => {
    expect(content).toMatch(/dataTestId=["']plan-map-day-graph-timeline["']/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. onEventClick bridge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — onEventClick bridge", () => {
  it("onEventClick callback で dayAnchors.find(a => a.id === anchorId) を実施", () => {
    expect(content).toMatch(
      /onEventClick=\{\(anchorId:\s*string\)\s*=>\s*\{[\s\S]{0,500}?dayAnchors\.find/,
    );
  });

  it("onEventClick → onAnchorClick(anchor) bridge", () => {
    expect(content).toMatch(
      /onEventClick=\{[\s\S]{0,800}?onAnchorClick\(anchor\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 既存 MapTab UI 不変
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — 既存 UI 不変", () => {
  it("SelectedAnchorCard render 維持", () => {
    expect(content).toMatch(/<SelectedAnchorCard/);
  });

  it("CategoryGrid 維持", () => {
    expect(content).toMatch(/<CategoryGrid/);
  });

  it("UnresolvedAnchorsSection 維持", () => {
    expect(content).toMatch(/<UnresolvedAnchorsSection/);
  });

  it("FAB (= plan-map-fab) 維持", () => {
    expect(content).toMatch(/data-testid=["']plan-map-fab["']/);
  });

  it("proposal hint (= ProposalChip) 経路維持", () => {
    expect(content).toMatch(/<ProposalChip|onProposalAccept/);
  });

  it("DaySwitcher 維持", () => {
    // DaySwitcher で前日/今日/翌日切替
    expect(content).toMatch(/前日|翌日|今日|DaySwitcher/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. UI 方針 (= warning color / 推奨文言禁止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MapTab K-3c-i — UI 方針 (K-3c-i 追加範囲)", () => {
  it("K-3c-i section 周辺で 推奨 / 最適化 / 予測 / 警告 文言なし", () => {
    const section = content.match(
      /plan-map-day-graph-section[\s\S]{0,1000}/,
    );
    if (section) {
      expect(section[0]).not.toMatch(/推奨/);
      expect(section[0]).not.toMatch(/最適化/);
      expect(section[0]).not.toMatch(/予測/);
      expect(section[0]).not.toMatch(/警告/);
      expect(section[0]).not.toMatch(/予想/);
    }
  });

  it("K-3c-i section 周辺で Transport / Risk / duration 表示文言なし", () => {
    const section = content.match(
      /plan-map-day-graph-section[\s\S]{0,1000}/,
    );
    if (section) {
      expect(section[0]).not.toMatch(/分の移動/);
      expect(section[0]).not.toMatch(/電車|徒歩|車|タクシー/);
      expect(section[0]).not.toMatch(/遅刻/);
      expect(section[0]).not.toMatch(/risk/i);
    }
  });
});
