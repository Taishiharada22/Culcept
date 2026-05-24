/**
 * Phase 3-N List impl sub-phase 6 — SourceIndicator render contract test
 *
 * 検証範囲 (= 第 7 補正 #1 多軸表現 + 第 12 補正 #2 hierarchy、 react-dom/server で string HTML 検査):
 *   §1 user origin → null (= compact + full 両方、 default、 visual noise 回避)
 *   §2 imported origin (= compact dot + icon、 full +label)
 *   §3 alter_generated_proposed (= compact dot + icon、 full +「提案中」 label)
 *   §4 alter_generated_accepted (= compact null per 第 12 補正 #2、 full caption)
 *   §5 a11y (= aria-label + aria-hidden 多軸併用)
 *
 * 不変原則:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ使用)
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *
 * 設計書:
 *   - Spec audit §3.1 + §5.6 + §19.10.2 + §19.13
 *   - lib/plan/list/sourceProvenance.ts (= 2 軸 source model)
 *   - app/(culcept)/plan/components/list/SourceIndicator.tsx
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceIndicator } from "@/app/(culcept)/plan/components/list/SourceIndicator";
import {
  createUserEvent,
  createImportedEvent,
  createAlterProposedEvent,
  acceptAlterProposed,
  cloneImported,
} from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 user origin → null (= compact + full 両 variant)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SourceIndicator §1. user origin → null", () => {
  it("§1.1 compact variant returns null (= 空 HTML)", () => {
    const event = createUserEvent({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toBe('');
  });

  it("§1.2 full variant returns null (= 空 HTML)", () => {
    const event = createUserEvent({
      id: 'e2',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="full" />,
    );
    expect(html).toBe('');
  });

  it("§1.3 cloned event (= origin user, clonedFrom 定義あり) も compact null (= 第 12 補正 #2 clonedFrom は origin 軸ではない)", () => {
    const imported = createImportedEvent({
      id: 'imp-1',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'cloned-1');
    const compactHtml = renderToStaticMarkup(
      <SourceIndicator sourceModel={cloned.sourceModel} variant="compact" />,
    );
    expect(compactHtml).toBe('');
    // full でも origin 軸的には null (= clonedFrom は別軸の表現)
    const fullHtml = renderToStaticMarkup(
      <SourceIndicator sourceModel={cloned.sourceModel} variant="full" />,
    );
    expect(fullHtml).toBe('');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 imported origin (= compact dot + icon、 full +label)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SourceIndicator §2. imported origin", () => {
  it("§2.1 compact: slate-500 dot + 📄 icon + aria-label に importedFrom 名 (= label は出さない)", () => {
    const event = createImportedEvent({
      id: 'e3',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toContain('bg-slate-500');
    expect(html).toContain('📄');
    expect(html).toContain('aria-label="source: シフト表 imported"');
    // compact なので label (= 「シフト表から」) は出さない
    expect(html).not.toContain('シフト表から');
    expect(html).toContain('data-testid="plan-list-source-indicator-imported"');
  });

  it("§2.2 full: slate-500 dot + 📄 icon + 「${importedFrom}から」 label", () => {
    const event = createImportedEvent({
      id: 'e4',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="full" />,
    );
    expect(html).toContain('bg-slate-500');
    expect(html).toContain('📄');
    expect(html).toContain('aria-label="source: シフト表 imported"');
    expect(html).toContain('シフト表から');
  });

  it("§2.3 importedFrom 名が aria-label に反映 (= 別 source 名でも形式維持)", () => {
    const event = createImportedEvent({
      id: 'e5',
      title: '時間割',
      startTime: '09:00',
      category: 'work',
      importedFrom: '大学時間割PDF',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toContain('aria-label="source: 大学時間割PDF imported"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 alter_generated_proposed (= compact dot + icon、 full +「提案中」 label)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SourceIndicator §3. alter_generated_proposed", () => {
  it("§3.1 compact: indigo-400 dot + ✨ icon + aria-label", () => {
    const event = createAlterProposedEvent({
      id: 'e6',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toContain('bg-indigo-400');
    expect(html).toContain('✨');
    expect(html).toContain('aria-label="source: Alter proposed"');
    expect(html).not.toContain('提案中');
    expect(html).toContain('data-testid="plan-list-source-indicator-alter-proposed"');
  });

  it("§3.2 full: indigo-400 dot + ✨ icon + 「提案中」 label", () => {
    const event = createAlterProposedEvent({
      id: 'e7',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="full" />,
    );
    expect(html).toContain('bg-indigo-400');
    expect(html).toContain('✨');
    expect(html).toContain('aria-label="source: Alter proposed"');
    expect(html).toContain('提案中');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 alter_generated_accepted (= compact null per 第 12 補正 #2、 full caption)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SourceIndicator §4. alter_generated_accepted (= 第 12 補正 #2 hierarchy)", () => {
  it("§4.1 compact: null (= main card で dot 消滅、 user_owned 同等)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e8',
      title: 'Alter 受け入れ',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T16:00:00Z');
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={accepted.sourceModel} variant="compact" />,
    );
    expect(html).toBe('');
  });

  it("§4.2 full: 「Alter 提案を受け入れ済」 caption (= 詳細 sheet で由来表示、 永遠保持)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e9',
      title: 'Alter 受け入れ',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T16:00:00Z');
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={accepted.sourceModel} variant="full" />,
    );
    expect(html).toContain('Alter 提案を受け入れ済');
    expect(html).toContain('data-testid="plan-list-source-indicator-alter-accepted"');
    // dot は出さない (= compact / full 共通で main card 同様 user_owned 表現)
    expect(html).not.toContain('bg-indigo-400');
    expect(html).not.toContain('✨');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 a11y (= 第 7 補正 #1 多軸併用、 色覚多様性対応)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SourceIndicator §5. a11y", () => {
  it("§5.1 imported: dot は aria-hidden (= 色だけで意味伝達禁止、 icon が aria-label 持ち)", () => {
    const event = createImportedEvent({
      id: 'e10',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="img"');
  });

  it("§5.2 proposed: dot は aria-hidden、 icon が aria-label 持ち", () => {
    const event = createAlterProposedEvent({
      id: 'e11',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(
      <SourceIndicator sourceModel={event.sourceModel} variant="compact" />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="img"');
  });
});
