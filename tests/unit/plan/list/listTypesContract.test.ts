/**
 * Phase 3-N Plan List impl foundation — Pure type contract test
 *
 * 検証範囲:
 *   §1 SourceType union 完全性 (= 4 source)
 *   §2 SourceProvenance metadata (= 第 8 補正 #2 alterAcceptedAt 確保)
 *   §3 EventCardViewModel structural 整合 (= 全 required + optional の type-only check)
 *   §4 TransitionViewModel structural 整合
 *   §5 TimelineSpineViewModel structural 整合
 *   §6 ConfirmedState + EventCategory union 完全性
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - regression test 永続化
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md (= `6bc20c49`)
 *   - docs/alter-plan-list-map-ia-audit.md (= `4d1c3e7d`)
 */

import { describe, expect, it } from "vitest";
import {
  type SourceType,
  type SourceProvenance,
  type EventCategory,
  type ConfirmedState,
  type EventCardViewModel,
  type TransitionViewModel,
  type TimelineSpineViewModel,
} from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 SourceType — union 完全性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §1. SourceType — union 完全性", () => {
  it("§1.1 4 source 全てが valid (= IA 拘束 #1 + #12 state machine)", () => {
    const sources: ReadonlyArray<SourceType> = [
      'user_entered',
      'imported',
      'alter_generated_proposed',
      'alter_generated_accepted',
    ];
    expect(sources.length).toBe(4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 SourceProvenance (= 第 8 補正 #2 alterAcceptedAt 確保)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §2. SourceProvenance — metadata 整合", () => {
  it("§2.1 user_entered (= 最小、 importedFrom と alterAcceptedAt なし)", () => {
    const p: SourceProvenance = { source: 'user_entered' };
    expect(p.source).toBe('user_entered');
    expect(p.importedFrom).toBeUndefined();
    expect(p.alterAcceptedAt).toBeUndefined();
  });

  it("§2.2 imported (= importedFrom 付き)", () => {
    const p: SourceProvenance = {
      source: 'imported',
      importedFrom: 'シフト表',
    };
    expect(p.importedFrom).toBe('シフト表');
  });

  it("§2.3 alter_generated_proposed (= proposal 段階、 metadata 不要)", () => {
    const p: SourceProvenance = { source: 'alter_generated_proposed' };
    expect(p.source).toBe('alter_generated_proposed');
  });

  it("§2.4 alter_generated_accepted (= alterAcceptedAt metadata 確保、 第 8 補正 #2、 完全消失防止)", () => {
    const p: SourceProvenance = {
      source: 'alter_generated_accepted',
      alterAcceptedAt: '2026-05-24T14:00:00Z',
    };
    expect(p.alterAcceptedAt).toBeDefined();
    expect(p.alterAcceptedAt).toBe('2026-05-24T14:00:00Z');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 EventCardViewModel — structural 整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §3. EventCardViewModel — 構造整合", () => {
  it("§3.1 最小 valid view model 構築可能 (= required field のみ)", () => {
    const vm: EventCardViewModel = {
      id: 'event-1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
      provenance: { source: 'user_entered' },
      confirmedState: 'confirmed',
    };
    expect(vm.id).toBe('event-1');
    expect(vm.confirmedState).toBe('confirmed');
    expect(vm.executionLayerCounts).toBeUndefined();
  });

  it("§3.2 完全 view model (= 全 optional 付き、 第 8 補正 #3 executionLayerCounts)", () => {
    const vm: EventCardViewModel = {
      id: 'event-2',
      title: 'ランチ',
      startTime: '12:00',
      endTime: '13:00',
      location: '甲府駅周辺',
      alterNote: '地元の美味しいランチ',
      category: 'meal',
      provenance: { source: 'imported', importedFrom: 'シフト表' },
      confirmedState: 'confirmed',
      executionLayerCounts: { preparation: 3, post: 1 },
    };
    expect(vm.executionLayerCounts?.preparation).toBe(3);
    expect(vm.executionLayerCounts?.post).toBe(1);
  });

  it("§3.3 proposed state (= 拘束 #5 + #12、 dashed border + opacity 0.7 想定)", () => {
    const vm: EventCardViewModel = {
      id: 'event-3',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
      provenance: { source: 'alter_generated_proposed' },
      confirmedState: 'proposed',
    };
    expect(vm.confirmedState).toBe('proposed');
    expect(vm.provenance.source).toBe('alter_generated_proposed');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 TransitionViewModel — structural 整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §4. TransitionViewModel — 構造整合", () => {
  it("§4.1 移動 transition (= default label)", () => {
    const t: TransitionViewModel = {
      fromTime: '11:00',
      toTime: '12:00',
      label: '移動',
    };
    expect(t.label).toBe('移動');
  });

  it("§4.2 移動・リフレッシュ transition (= 参考画像踏襲、 第 2 補正 revert)", () => {
    const t: TransitionViewModel = {
      fromTime: '13:00',
      toTime: '14:00',
      label: '移動・リフレッシュ',
    };
    expect(t.label).toBe('移動・リフレッシュ');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 TimelineSpineViewModel — 構造統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §5. TimelineSpineViewModel — 統合", () => {
  it("§5.1 空 timeline (= empty 日 想定)", () => {
    const t: TimelineSpineViewModel = { events: [], transitions: [] };
    expect(t.events.length).toBe(0);
    expect(t.transitions.length).toBe(0);
  });

  it("§5.2 1 event + 0 transition", () => {
    const event: EventCardViewModel = {
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
      provenance: { source: 'user_entered' },
      confirmedState: 'confirmed',
    };
    const t: TimelineSpineViewModel = { events: [event], transitions: [] };
    expect(t.events.length).toBe(1);
  });

  it("§5.3 2 events + 1 transition (= 通常の 1 日 構造)", () => {
    const events: ReadonlyArray<EventCardViewModel> = [
      {
        id: 'e1',
        title: 'A',
        startTime: '09:00',
        category: 'cafe',
        provenance: { source: 'user_entered' },
        confirmedState: 'confirmed',
      },
      {
        id: 'e2',
        title: 'B',
        startTime: '12:00',
        category: 'meal',
        provenance: { source: 'user_entered' },
        confirmedState: 'confirmed',
      },
    ];
    const transitions: ReadonlyArray<TransitionViewModel> = [
      { fromTime: '11:00', toTime: '12:00', label: '移動' },
    ];
    const t: TimelineSpineViewModel = { events, transitions };
    expect(t.events.length).toBe(2);
    expect(t.transitions.length).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 ConfirmedState + EventCategory union 完全性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List foundation §6. ConfirmedState + EventCategory — union 完全性", () => {
  it("§6.1 ConfirmedState 2 値 (= 拘束 #5)", () => {
    const states: ReadonlyArray<ConfirmedState> = ['confirmed', 'proposed'];
    expect(states.length).toBe(2);
  });

  it("§6.2 EventCategory 5 値 (= cafe / meal / work / home / other、 Spec §8.2 対応)", () => {
    const cats: ReadonlyArray<EventCategory> = ['cafe', 'meal', 'work', 'home', 'other'];
    expect(cats.length).toBe(5);
  });
});
