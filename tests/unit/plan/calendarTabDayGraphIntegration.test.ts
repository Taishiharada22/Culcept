/**
 * Phase 3-K-3b — CalendarTab DayGraphTimeline integration tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md K-3b 設計提案
 *
 * 検証方針:
 *   K-3b は CalendarTab に DayGraphTimeline を **静かに追加**するだけの統合。
 *   既存 anchor list / proposal chip 位置 / FAB / week strip 等は完全不変。
 *
 *   render 検証は presentation helper test + component test (K-3a) で完結済。
 *   本 file は **CalendarTab.tsx の structural invariant** を file-grep で検証。
 *
 * 検証範囲:
 *   1. DayGraphTimeline が import されている
 *   2. dayGraphByDate prop を **active 利用** (= _dayGraphByDate アンダースコア廃止)
 *   3. timeline は anchor list の **直後** + `mt-6 pt-4 border-t` で控えめ append
 *   4. onEventClick が onAnchorClick に bridge されている (= selectedDayAnchors.find + 呼出)
 *   5. proposal chip section / anchor list section は **不変** (= grep で構造保持確認)
 *   6. warning color / 推奨 / 最適化 文言なし (= 統合層でも維持)
 *   7. duration / mode / risk 表示なし
 *   8. Calendar test data-testid 'plan-calendar-day-graph-section' で識別可能
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
const content = readFileSync(PATH, "utf-8");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. import 確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — import wiring", () => {
  it("DayGraphTimeline を import している", () => {
    expect(content).toMatch(
      /import\s+\{\s*DayGraphTimeline\s*\}\s+from\s+["']\.\.\/components\/DayGraphTimeline["']/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. dayGraphByDate prop を active 利用 (= underscore 廃止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — dayGraphByDate active usage", () => {
  it("`_dayGraphByDate` underscore は廃止されている (= K-3b で実 active 利用へ)", () => {
    expect(content).not.toMatch(/dayGraphByDate:\s*_dayGraphByDate/);
    expect(content).not.toMatch(/_dayGraphByDate/);
  });

  it("`dayGraphByDate` を destructure している (= underscore なし)", () => {
    expect(content).toMatch(/^\s*dayGraphByDate,\s*$/m);
  });

  it("dayGraphByDate?.[selectedDate] で lookup している", () => {
    expect(content).toMatch(/dayGraphByDate\?\.\[selectedDate\]/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. timeline section の append 形 (= 静かな追加)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — timeline section append", () => {
  it("section data-testid='plan-calendar-day-graph-section' が存在", () => {
    expect(content).toMatch(/data-testid=["']plan-calendar-day-graph-section["']/);
  });

  it("section は controlled append style (= mt-6 pt-4 border-t、 控えめ)", () => {
    // className が data-testid より前 / 後 どちらでも match するように 2 方向 grep
    const forward = /data-testid=["']plan-calendar-day-graph-section["'][\s\S]{0,200}?(mt-6|pt-4|border-t)/;
    const reverse = /(mt-6|pt-4|border-t)[\s\S]{0,200}?data-testid=["']plan-calendar-day-graph-section["']/;
    expect(forward.test(content) || reverse.test(content)).toBe(true);
  });

  it("subtle heading '1 日の構造' が含まれる (= 控えめ italic / slate-500)", () => {
    expect(content).toMatch(/1 日の構造/);
    expect(content).toMatch(/text-slate-500 italic/);
  });

  it("DayGraphTimeline component を render している", () => {
    expect(content).toMatch(/<DayGraphTimeline/);
  });

  it("view=user_self を指定 (= shared_view ではない、 CalendarTab は自分の view)", () => {
    expect(content).toMatch(/view=["']user_self["']/);
  });

  it("dataTestId が個別指定されている (= 'plan-calendar-day-graph-timeline')", () => {
    expect(content).toMatch(/dataTestId=["']plan-calendar-day-graph-timeline["']/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. onEventClick bridge to onAnchorClick
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — onEventClick bridge", () => {
  it("onEventClick callback で selectedDayAnchors.find(a => a.id === anchorId) を実施", () => {
    expect(content).toMatch(
      /onEventClick=\{\(anchorId:\s*string\)\s*=>\s*\{[\s\S]{0,300}?selectedDayAnchors\.find/,
    );
  });

  it("onEventClick → onAnchorClick(anchor) bridge", () => {
    expect(content).toMatch(
      /onEventClick=\{[\s\S]{0,500}?onAnchorClick\(anchor\)/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. 既存 anchor list / proposal chip / FAB の不変確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — 既存 UI 不変", () => {
  it("anchor list section (= selectedDayAnchors.map) は維持", () => {
    expect(content).toMatch(/selectedDayAnchors\.map\(\(anchor\)/);
  });

  it("anchor 行 data-testid='plan-calendar-anchor-{id}' 維持", () => {
    expect(content).toMatch(/data-testid=\{`plan-calendar-anchor-\$\{anchor\.id\}`\}/);
  });

  it("empty state (= 予定なし) 維持", () => {
    expect(content).toMatch(/予定なし/);
    expect(content).toMatch(/data-testid=["']plan-calendar-empty-day["']/);
  });

  it("FAB (= 「+ Alter に教える」 button) 維持", () => {
    expect(content).toMatch(/data-testid=["']plan-calendar-fab["']/);
  });

  it("proposal chip (= ProposalChip / selectFirstProposalForDate) 経路維持", () => {
    expect(content).toMatch(/<ProposalChip/);
    expect(content).toMatch(/selectFirstProposalForDate/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. UI 方針 (= warning color / 推奨 文言禁止、 統合層でも維持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — UI 方針 (K-3b 追加範囲)", () => {
  it("K-3b で追加された section に warning color shade 含まれない", () => {
    // K-3b section 以下に absolute に絞った grep は難しいため、 全体で「DayGraphTimeline section」 関連の amber/orange の有無
    // 既存 CalendarTab 全体 grep でも warning shade 0 を確認 (= 既存 invariant 維持)
    expect(content).not.toMatch(/text-amber-/);
    expect(content).not.toMatch(/bg-amber-/);
    expect(content).not.toMatch(/border-amber-/);
    // 既存 CalendarTab には text-rose-700 (= ErrorState) があるため、 完全 0 とはせず、
    // K-3b で追加の amber / orange のみ禁止する範囲確認
  });

  it("K-3b section 内に 「推奨」 「最適化」 「予測」 「警告」 文言なし", () => {
    // K-3b section の周辺で確認 (= "1 日の構造" 後 1000 文字以内)
    const sectionMatch = content.match(/1 日の構造[\s\S]{0,1000}/);
    if (sectionMatch) {
      expect(sectionMatch[0]).not.toMatch(/推奨/);
      expect(sectionMatch[0]).not.toMatch(/最適化/);
      expect(sectionMatch[0]).not.toMatch(/予測/);
      expect(sectionMatch[0]).not.toMatch(/警告/);
      expect(sectionMatch[0]).not.toMatch(/予想/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. duration / mode / risk 表示なし (= K-3b scope 外)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CalendarTab K-3b — duration / mode / risk 表示なし", () => {
  it("K-3b section 周辺で Transport / Risk / Movement duration 表示文言なし", () => {
    const sectionMatch = content.match(/1 日の構造[\s\S]{0,1000}/);
    if (sectionMatch) {
      expect(sectionMatch[0]).not.toMatch(/分の移動/);
      expect(sectionMatch[0]).not.toMatch(/電車|徒歩|車|タクシー/);
      expect(sectionMatch[0]).not.toMatch(/遅刻/);
      expect(sectionMatch[0]).not.toMatch(/risk/i);
    }
  });
});
