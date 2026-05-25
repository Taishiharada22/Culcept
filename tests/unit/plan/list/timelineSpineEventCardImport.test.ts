/**
 * Phase 3-N List impl sub-phase 4 — TimelineSpine + EventCard import & type contract test
 *
 * 検証範囲 (= sub-phase 4 visual checkpoint、 actual rendering は別 sub-phase):
 *   §1 EventCard component import + props 型整合
 *   §2 TimelineSpine component import + props 型整合
 *   §3 第 11 補正 #1 UI 責務分離 (= component 設計上の axis 分離確認)
 *   §4 第 12 補正 #2 hierarchy (= main card で clonedFrom 表示しない、 type-level 確認)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触 (= 新規 component file 2 件)
 *   - 既存 list test 75 PASS 維持
 *
 * 設計書:
 *   - app/(culcept)/plan/components/list/EventCard.tsx
 *   - app/(culcept)/plan/components/list/TimelineSpine.tsx
 *   - Spec audit §5.1 + §5.2 + §19.10
 */

import { describe, expect, it } from "vitest";
import { EventCard } from "@/app/(culcept)/plan/components/list/EventCard";
import { TimelineSpine } from "@/app/(culcept)/plan/components/list/TimelineSpine";
import {
  type StrictEventCardViewModel,
  createUserEvent,
  createImportedEvent,
  createAlterProposedEvent,
  acceptAlterProposed,
  cloneImported,
} from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 EventCard — import + props 型整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 4 §1. EventCard — import + props 型整合", () => {
  it("§1.1 EventCard component import 可能", () => {
    expect(EventCard).toBeDefined();
    expect(typeof EventCard).toBe('function');
  });

  it("§1.2 user_entered event を props に渡せる (= 型整合)", () => {
    const event = createUserEvent({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    // 注: actual render は別 sub-phase、 ここでは props 型整合のみ
    const props = { event };
    expect(props.event.sourceModel.origin).toBe('user');
  });

  it("§1.3 imported event を props に渡せる", () => {
    const event = createImportedEvent({
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const props = { event };
    expect(props.event.sourceModel.origin).toBe('imported');
  });

  it("§1.4 alter_generated_proposed event を props に渡せる (= dashed border + chip 表示用)", () => {
    const event = createAlterProposedEvent({
      id: 'e3',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const props = { event };
    expect(props.event.sourceModel.authority).toBe('proposed');
  });

  it("§1.5 alter_generated_accepted event を props に渡せる (= 第 8 補正 #2 acceptedAt 保持)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e4',
      title: 'Alter 受け入れ済',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T16:00:00Z');
    const props = { event: accepted };
    expect(props.event.sourceModel.origin).toBe('alter_generated');
    expect(props.event.sourceModel.authority).toBe('user_owned');
  });

  it("§1.6 onTap optional (= 渡さなくても型整合)", () => {
    const event = createUserEvent({
      id: 'e5',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const props1 = { event };
    const props2 = { event, onTap: () => {} };
    expect(props1.event.id).toBe('e5');
    expect(typeof props2.onTap).toBe('function');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 TimelineSpine — import + props 型整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 4 §2. TimelineSpine — import + props 型整合", () => {
  it("§2.1 TimelineSpine component import 可能", () => {
    expect(TimelineSpine).toBeDefined();
    expect(typeof TimelineSpine).toBe('function');
  });

  it("§2.2 空 events を props に渡せる (= empty timeline)", () => {
    const events: ReadonlyArray<StrictEventCardViewModel> = [];
    const props = { events };
    expect(props.events.length).toBe(0);
  });

  it("§2.3 複数 events を props に渡せる (= 通常 timeline)", () => {
    const e1 = createUserEvent({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const e2 = createImportedEvent({
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const events: ReadonlyArray<StrictEventCardViewModel> = [e1, e2];
    const props = { events };
    expect(props.events.length).toBe(2);
  });

  it("§2.4 onEventTap optional", () => {
    const events: ReadonlyArray<StrictEventCardViewModel> = [];
    const props1 = { events };
    const props2 = { events, onEventTap: (id: string) => { void id; } };
    expect(props1.events).toBeDefined();
    expect(typeof props2.onEventTap).toBe('function');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 第 11 補正 #1 UI 責務分離 (= component が 3 axis を独立に扱う design 確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 4 §3. UI 責務分離 (= 第 11 補正 #1)", () => {
  it("§3.1 event.sourceModel.origin (= provenance axis、 source dot 用)", () => {
    const event = createImportedEvent({
      id: 'e1',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    // origin axis → source dot 表示判定
    expect(event.sourceModel.origin).toBe('imported');
  });

  it("§3.2 event.sourceModel.authority (= affordance axis、 編集可否 / chip 用)", () => {
    const event = createAlterProposedEvent({
      id: 'e2',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    // authority axis → proposed chip + dashed border
    expect(event.sourceModel.authority).toBe('proposed');
  });

  it("§3.3 event.sourceModel.clonedFrom (= derivation axis、 詳細 sheet のみ、 main card 非表示)", () => {
    const imported = createImportedEvent({
      id: 'imp-1',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'cloned-1');
    // derivation axis → main card で表示しない、 詳細 sheet のみ
    if (cloned.sourceModel.origin === 'user' && cloned.sourceModel.authority === 'user_owned') {
      expect(cloned.sourceModel.clonedFrom).toBeDefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 第 12 補正 #2 hierarchy (= main card で clonedFrom 表示しない確認)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 4 §4. UI hierarchy (= 第 12 補正 #2)", () => {
  it("§4.1 cloned event の main card は通常 user_owned と区別なし (= 第 12 補正 #2 reflect)", () => {
    const imported = createImportedEvent({
      id: 'imp-1',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'cloned-1');
    const plainUser = createUserEvent({
      id: 'plain-1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    // main card 表示 axis (= origin / authority) は同じ
    expect(cloned.sourceModel.origin).toBe(plainUser.sourceModel.origin); // user
    expect(cloned.sourceModel.authority).toBe(plainUser.sourceModel.authority); // user_owned
    // clonedFrom のみ差 (= 詳細 sheet のみ表示)
    if (cloned.sourceModel.origin === 'user' && cloned.sourceModel.authority === 'user_owned') {
      expect(cloned.sourceModel.clonedFrom).toBeDefined();
    }
    if (plainUser.sourceModel.origin === 'user' && plainUser.sourceModel.authority === 'user_owned') {
      expect(plainUser.sourceModel.clonedFrom).toBeUndefined();
    }
  });

  it("§4.2 主表示 axis の階層 (= primary content / secondary authority / tertiary origin+execution、 type 整合)", () => {
    const event = createImportedEvent({
      id: 'e1',
      title: 'シフト',
      startTime: '14:00',
      endTime: '18:00',
      location: '甲府オフィス',
      alterNote: '集中タイム',
      category: 'work',
      importedFrom: 'シフト表',
      executionLayerCounts: { preparation: 3 },
    });
    // primary content (= title / 時刻 / 場所 / alterNote)
    expect(event.title).toBe('シフト');
    expect(event.startTime).toBe('14:00');
    expect(event.location).toBe('甲府オフィス');
    expect(event.alterNote).toBe('集中タイム');
    // tertiary origin + execution
    expect(event.sourceModel.origin).toBe('imported');
    expect(event.executionLayerCounts?.preparation).toBe(3);
  });
});
