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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 transitions interleave (= 8b-4 追加、 events 間に TransitionChip 挿入)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TimelineSpine render contract §4. transitions interleave (= 8b-4)", () => {
  it("§4.1 transitions undefined → 既存挙動 (= 後方互換、 transition render なし)", () => {
    const events = [
      createUserEvent({ id: 'e1', title: 'A', startTime: '09:00', endTime: '11:00', category: 'cafe' }),
      createUserEvent({ id: 'e2', title: 'B', startTime: '12:00', endTime: '13:00', category: 'meal' }),
    ];
    const html = renderToStaticMarkup(<TimelineSpine events={events} />);
    expect(html).not.toContain('plan-list-transition');
    expect(html).not.toContain('aria-label="transition:');
  });

  it("§4.2 transitions 一致 (= fromTime == 前 endTime, toTime == 次 startTime) → 挿入", () => {
    const events = [
      createUserEvent({ id: 'e3', title: 'A', startTime: '09:00', endTime: '11:00', category: 'cafe' }),
      createUserEvent({ id: 'e4', title: 'B', startTime: '12:00', endTime: '13:00', category: 'meal' }),
    ];
    const transitions = [
      { fromTime: '11:00', toTime: '12:00', label: '移動' as const },
    ];
    const html = renderToStaticMarkup(
      <TimelineSpine events={events} transitions={transitions} />,
    );
    expect(html).toContain('plan-list-transition-11:00-12:00');
    expect(html).toContain('aria-label="transition: 移動 11:00-12:00"');
    expect(html).toContain('移動');
  });

  it("§4.3 transitions 不一致 → silent skip (= throw しない、 何も出ない)", () => {
    const events = [
      createUserEvent({ id: 'e5', title: 'A', startTime: '09:00', endTime: '11:00', category: 'cafe' }),
      createUserEvent({ id: 'e6', title: 'B', startTime: '12:00', endTime: '13:00', category: 'meal' }),
    ];
    const transitions = [
      { fromTime: '99:99', toTime: '99:99', label: '移動' as const }, // 完全不一致
    ];
    const html = renderToStaticMarkup(
      <TimelineSpine events={events} transitions={transitions} />,
    );
    expect(html).not.toContain('plan-list-transition');
  });

  it("§4.4 events 1 件 → transition 出ない (= 隣り合うペアなし)", () => {
    const events = [
      createUserEvent({ id: 'e7', title: 'A', startTime: '09:00', endTime: '11:00', category: 'cafe' }),
    ];
    const transitions = [
      { fromTime: '11:00', toTime: '12:00', label: '移動' as const },
    ];
    const html = renderToStaticMarkup(
      <TimelineSpine events={events} transitions={transitions} />,
    );
    expect(html).not.toContain('plan-list-transition');
  });

  it("§4.5 複数 transitions で全 interleave", () => {
    const events = [
      createUserEvent({ id: 'e8', title: 'A', startTime: '09:00', endTime: '11:00', category: 'cafe' }),
      createUserEvent({ id: 'e9', title: 'B', startTime: '12:00', endTime: '13:00', category: 'meal' }),
      createUserEvent({ id: 'e10', title: 'C', startTime: '14:00', endTime: '15:00', category: 'work' }),
    ];
    const transitions = [
      { fromTime: '11:00', toTime: '12:00', label: '移動' as const },
      { fromTime: '13:00', toTime: '14:00', label: '移動' as const },
    ];
    const html = renderToStaticMarkup(
      <TimelineSpine events={events} transitions={transitions} />,
    );
    expect(html).toContain('plan-list-transition-11:00-12:00');
    expect(html).toContain('plan-list-transition-13:00-14:00');
  });
});
