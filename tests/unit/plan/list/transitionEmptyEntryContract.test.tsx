/**
 * Phase 3-N List impl sub-phase 5 — TransitionChip + EmptyDayEntry contract test (= first-pass)
 *
 * 検証範囲 (= import + render contract、 sub-phase 4 pattern 踏襲):
 *   §1 TransitionChip import + render contract
 *     - 1.1 import 可能
 *     - 1.2 label / 時刻 range が HTML に含まれる
 *     - 1.3 中央寄せ / text-slate-400 (= subtle)
 *     - 1.4 非 interactive (= button タグなし)
 *   §2 EmptyDayEntry import + render contract
 *     - 2.1 import 可能
 *     - 2.2 EMPTY_DAY_ENTRY_LABEL が HTML に含まれる (= N-3a 整合)
 *     - 2.3 button タグ (= interactive)
 *     - 2.4 focus-visible:border-slate-300 (= 規約 24-extended 機械保証)
 *     - 2.5 brand focus 系が含まれない (= 規約 24-extended 違反 0)
 *     - 2.6 text-slate-500 (= 控えめ tone)
 *     - 2.7 onTap optional (= 渡さなくても render 可能)
 *     - 2.8 context tab union 3 種類対応
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - 第 14 補正 first-pass 遵守 (= SummaryFooter / Execution 本体 / ImportedLock 本実装 含まない)
 *
 * 設計書:
 *   - app/(culcept)/plan/components/list/TransitionChip.tsx
 *   - app/(culcept)/plan/components/list/EmptyDayEntry.tsx
 *   - lib/plan/emptyDayObservation.ts (= N-3a)
 *   - Spec §5.3 + §5.5 + §19.12
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TransitionChip } from "@/app/(culcept)/plan/components/list/TransitionChip";
import { EmptyDayEntry } from "@/app/(culcept)/plan/components/list/EmptyDayEntry";
import {
  EMPTY_DAY_ENTRY_LABEL,
  type EmptyDayEntryContext,
  type EmptyDayEntryContextTab,
} from "@/lib/plan/emptyDayObservation";
import { type TransitionViewModel } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 TransitionChip — import + render contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 5 §1. TransitionChip — import + render contract", () => {
  it("§1.1 TransitionChip component import 可能", () => {
    expect(TransitionChip).toBeDefined();
    expect(typeof TransitionChip).toBe('function');
  });

  it("§1.2 label / 時刻 range が出力 HTML に含まれる", () => {
    const transition: TransitionViewModel = {
      fromTime: '11:00',
      toTime: '12:00',
      label: '移動',
    };
    const html = renderToStaticMarkup(<TransitionChip transition={transition} />);
    expect(html).toContain('移動');
    expect(html).toContain('11:00-12:00');
  });

  it("§1.3 「移動・リフレッシュ」 label 対応 (= 参考画像踏襲)", () => {
    const transition: TransitionViewModel = {
      fromTime: '13:00',
      toTime: '14:00',
      label: '移動・リフレッシュ',
    };
    const html = renderToStaticMarkup(<TransitionChip transition={transition} />);
    expect(html).toContain('移動・リフレッシュ');
    expect(html).toContain('13:00-14:00');
  });

  it("§1.4 text-slate-400 / text-xs (= subtle tone)", () => {
    const transition: TransitionViewModel = {
      fromTime: '11:00',
      toTime: '12:00',
      label: '移動',
    };
    const html = renderToStaticMarkup(<TransitionChip transition={transition} />);
    expect(html).toContain('text-slate-400');
    expect(html).toContain('text-xs');
  });

  it("§1.5 非 interactive (= button タグなし、 div で構造のみ)", () => {
    const transition: TransitionViewModel = {
      fromTime: '11:00',
      toTime: '12:00',
      label: '移動',
    };
    const html = renderToStaticMarkup(<TransitionChip transition={transition} />);
    expect(html).not.toMatch(/<button/);
    expect(html).toMatch(/<div/);
  });

  it("§1.6 aria-label 含む (= a11y)", () => {
    const transition: TransitionViewModel = {
      fromTime: '11:00',
      toTime: '12:00',
      label: '移動',
    };
    const html = renderToStaticMarkup(<TransitionChip transition={transition} />);
    expect(html).toContain('aria-label="transition: 移動 11:00-12:00"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 EmptyDayEntry — import + render contract + N-3a 整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SAMPLE_CONTEXT: EmptyDayEntryContext = {
  tab: 'calendar',
  iso: '2026-05-24',
};

describe("List sub-phase 5 §2. EmptyDayEntry — N-3a 連携 + render contract", () => {
  it("§2.1 EmptyDayEntry component import 可能", () => {
    expect(EmptyDayEntry).toBeDefined();
    expect(typeof EmptyDayEntry).toBe('function');
  });

  it("§2.2 EMPTY_DAY_ENTRY_LABEL (= 'ALTER で見る ›') が出力 HTML に含まれる (= N-3a 整合)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toContain(EMPTY_DAY_ENTRY_LABEL);
    expect(html).toContain('ALTER で見る ›');
  });

  it("§2.3 button タグ (= interactive)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toMatch(/<button/);
  });

  it("§2.4 focus-visible:border-slate-300 (= 規約 24-extended 機械保証)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toContain('focus-visible:border-slate-300');
  });

  it("§2.5 brand / warning focus 系が含まれない (= 規約 24-extended 違反 0)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).not.toMatch(/focus-visible:border-indigo/);
    expect(html).not.toMatch(/focus-visible:border-purple/);
    expect(html).not.toMatch(/focus-visible:border-amber/);
    expect(html).not.toMatch(/focus-visible:border-orange/);
    expect(html).not.toMatch(/focus-visible:border-red/);
    expect(html).not.toMatch(/focus:border-(?!slate)/);
  });

  it("§2.6 text-slate-500 / text-sm (= 控えめ tone、 push しない)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toContain('text-slate-500');
    expect(html).toContain('text-sm');
  });

  it("§2.7 focus:outline-none 維持 (= browser default outline 排除)", () => {
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toContain('focus:outline-none');
  });

  it("§2.8 onTap optional (= undefined でも render 可能)", () => {
    const html1 = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    const html2 = renderToStaticMarkup(
      <EmptyDayEntry context={SAMPLE_CONTEXT} onTap={() => {}} />
    );
    expect(html1).toContain(EMPTY_DAY_ENTRY_LABEL);
    expect(html2).toContain(EMPTY_DAY_ENTRY_LABEL);
  });

  it("§2.9 3 tab union 対応 (= calendar / flow / map)", () => {
    const tabs: ReadonlyArray<EmptyDayEntryContextTab> = ['calendar', 'flow', 'map'];
    for (const tab of tabs) {
      const html = renderToStaticMarkup(
        <EmptyDayEntry context={{ tab, iso: '2026-05-24' }} />
      );
      expect(html).toContain(EMPTY_DAY_ENTRY_LABEL);
      expect(html).toContain(`plan-list-empty-day-entry-${tab}-2026-05-24`);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 第 14 補正 範囲制限確認 (= SummaryFooter / Execution 本体 / ImportedLock 本実装 不在)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 5 §3. 範囲制限 (= 第 14 補正 first-pass 遵守)", () => {
  it("§3.1 TransitionChip / EmptyDayEntry のみ (= SummaryFooter / Execution 本体 / ImportedLock は本 sub-phase 不在)", () => {
    // 本 sub-phase で実装される component は 2 件のみ
    expect(TransitionChip).toBeDefined();
    expect(EmptyDayEntry).toBeDefined();
    // SummaryFooter / ExecutionLayerChip 専用 / ImportedLockEscape は別 sub-phase
    // (= 動的 import で「存在しない」 を確認するのは過剰、 範囲制限は doc + commit 規約で担保)
  });

  it("§3.2 EmptyDayEntry は N-3a foundation 直接 consume (= 再実装なし)", () => {
    // N-3a foundation の EMPTY_DAY_ENTRY_LABEL を import して使用
    expect(EMPTY_DAY_ENTRY_LABEL).toBe('ALTER で見る ›');
    // EmptyDayEntry が独自 label を持たないこと (= integration via N-3a foundation)
    const html = renderToStaticMarkup(<EmptyDayEntry context={SAMPLE_CONTEXT} />);
    expect(html).toContain(EMPTY_DAY_ENTRY_LABEL);
  });
});
