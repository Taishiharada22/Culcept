/**
 * Phase 3-N List impl sub-phase 8b-3 — TimelineSpine render contract test
 *
 * 検証範囲 (= 8b-3 spine icon 追加、 GPT 「アイコンは飾りではなく節点マーカー」 整合):
 *   §1 spine circle category icon (= 各 category emoji が circle 内に出る)
 *   §2 events 0 件 → empty placeholder (= sub-phase 4 既存動作)
 *   §3 events 1+ → spine + events render
 *
 * 不変原則:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ使用)
 *   - LLM / API / DB / network 不使用
 *
 * 設計書:
 *   - Spec audit §5.2 + §4.3 + §19.13
 *   - decision-log (= sub-phase 8b redefine + spine icon 節点マーカー)
 *   - app/(culcept)/plan/components/list/TimelineSpine.tsx
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineSpine } from "@/app/(culcept)/plan/components/list/TimelineSpine";
import { createUserEvent } from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 spine circle category icon (= 8b-3 追加)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TimelineSpine render contract §1. spine category icon (= 8b-3)", () => {
  it("§1.1 cafe → ☕ icon が spine circle 内に出る", () => {
    const event = createUserEvent({
      id: 'icon-cafe',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('☕');
    expect(html).toContain('bg-indigo-500'); // category circle bg
  });

  it("§1.2 meal → 🍴 icon", () => {
    const event = createUserEvent({
      id: 'icon-meal',
      title: 'ランチ',
      startTime: '12:00',
      category: 'meal',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('🍴');
    expect(html).toContain('bg-orange-500');
  });

  it("§1.3 work → 💼 icon", () => {
    const event = createUserEvent({
      id: 'icon-work',
      title: 'オフィス',
      startTime: '14:00',
      category: 'work',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('💼');
    expect(html).toContain('bg-blue-500');
  });

  it("§1.4 home → 🏠 icon", () => {
    const event = createUserEvent({
      id: 'icon-home',
      title: '帰宅',
      startTime: '18:30',
      category: 'home',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('🏠');
    expect(html).toContain('bg-emerald-500');
  });

  it("§1.5 other → · (= 中点、 中立)", () => {
    const event = createUserEvent({
      id: 'icon-other',
      title: 'その他',
      startTime: '10:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('·');
    expect(html).toContain('bg-slate-500');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 events 0 件 → empty placeholder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TimelineSpine render contract §2. events 0 件 → empty placeholder", () => {
  it("§2.1 events 空配列 → empty testid 出力", () => {
    const html = renderToStaticMarkup(<TimelineSpine events={[]} />);
    expect(html).toContain('plan-list-timeline-spine-empty');
    expect(html).not.toContain('plan-list-timeline-spine"'); // 通常 spine は出ない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 events 1+ → spine + events render
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TimelineSpine render contract §3. events 1+ → spine + events render", () => {
  it("§3.1 1 event で spine + 時刻 + EventCard 全部 render", () => {
    const event = createUserEvent({
      id: 'multi-1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<TimelineSpine events={[event]} />);
    expect(html).toContain('plan-list-timeline-spine'); // spine container
    expect(html).toContain('09:00'); // 時刻 label (= 左 column)
    expect(html).toContain('カフェ'); // EventCard title
  });

  it("§3.2 複数 event で全 spine row が render", () => {
    const events = [
      createUserEvent({ id: 'mult-1', title: 'A', startTime: '09:00', category: 'cafe' }),
      createUserEvent({ id: 'mult-2', title: 'B', startTime: '12:00', category: 'meal' }),
      createUserEvent({ id: 'mult-3', title: 'C', startTime: '14:00', category: 'work' }),
    ];
    const html = renderToStaticMarkup(<TimelineSpine events={events} />);
    expect(html).toContain('A');
    expect(html).toContain('B');
    expect(html).toContain('C');
    expect(html).toContain('☕'); // cafe icon
    expect(html).toContain('🍴'); // meal icon
    expect(html).toContain('💼'); // work icon
  });
});
