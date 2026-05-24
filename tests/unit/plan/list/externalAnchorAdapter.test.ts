/**
 * Phase 3-N List impl sub-phase 8a-pre — externalAnchorAdapter contract test
 *
 * 検証範囲 (= pure module 変換固定、 8a 最小範囲):
 *   §1 single anchor 変換 (= id / title / startTime / endTime / location / category 直接 mapping)
 *   §2 list 変換 (= startTime asc 整列、 入力 mutate なし)
 *   §3 endTime あり/なし
 *   §4 location あり/なし + sensitive 除外
 *   §5 category mapping (= LocationCategory 全 8 値 + undefined → EventCategory 5 値)
 *   §6 sourceModel 固定 (= origin: 'user', authority: 'user_owned')
 *   §7 time 正規化 (= "HH:MM" / "HH:MM:SS" / ISO 8601 / 不正)
 *   §8 8a 範囲外確認 (= alterNote undefined / executionLayerCounts undefined)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 入力 mutate なし (= test で input オブジェクト 改変なし確認)
 *
 * 設計書:
 *   - lib/plan/list/adapters/externalAnchorAdapter.ts
 *   - lib/plan/external-anchor.ts
 *   - lib/plan/list/sourceProvenance.ts
 */

import { describe, expect, it } from "vitest";
import type { OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import {
  convertExternalAnchorToEventCard,
  convertExternalAnchorListToTimelineEvents,
  convertExternalAnchorListToTransitions,
} from "@/lib/plan/list/adapters/externalAnchorAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test helper: minimal OneOff anchor 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeAnchor(overrides: Partial<OneOffExternalAnchor> & { id: string }): OneOffExternalAnchor {
  return {
    id: overrides.id,
    userId: 'user-1',
    title: overrides.title ?? 'タイトル',
    startTime: overrides.startTime ?? '09:00',
    rigidity: overrides.rigidity ?? 'hard',
    sourceId: 'source-1',
    confirmedAt: '2026-05-24T00:00:00Z',
    anchorKind: 'one_off',
    date: overrides.date ?? '2026-05-24',
    ...(overrides.endTime !== undefined ? { endTime: overrides.endTime } : {}),
    ...(overrides.locationText !== undefined ? { locationText: overrides.locationText } : {}),
    ...(overrides.locationCategory !== undefined
      ? { locationCategory: overrides.locationCategory }
      : {}),
    ...(overrides.sensitiveCategory !== undefined
      ? { sensitiveCategory: overrides.sensitiveCategory }
      : {}),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 single anchor 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §1. single anchor 変換", () => {
  it("§1.1 id / title / startTime / endTime / location が直接 mapping", () => {
    const anchor = makeAnchor({
      id: 'a1',
      title: 'カフェ作業',
      startTime: '09:00',
      endTime: '11:00',
      locationText: '甲府駅前',
      locationCategory: 'cafe',
    });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.id).toBe('a1');
    expect(event.title).toBe('カフェ作業');
    expect(event.startTime).toBe('09:00');
    expect(event.endTime).toBe('11:00');
    expect(event.location).toBe('甲府駅前');
    expect(event.category).toBe('cafe');
  });

  it("§1.2 入力 anchor を mutate しない (= pure 検証)", () => {
    const anchor = makeAnchor({
      id: 'a2',
      title: 'タイトル',
      startTime: '10:00',
      locationCategory: 'office',
    });
    const snapshot = JSON.parse(JSON.stringify(anchor));
    convertExternalAnchorToEventCard(anchor);
    expect(anchor).toEqual(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 list 変換 (= startTime asc 整列、 入力 mutate なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §2. list 変換", () => {
  it("§2.1 startTime asc 整列 (= 入力順無関係)", () => {
    const anchors = [
      makeAnchor({ id: 'b1', startTime: '14:00' }),
      makeAnchor({ id: 'b2', startTime: '09:00' }),
      makeAnchor({ id: 'b3', startTime: '11:30' }),
    ];
    const events = convertExternalAnchorListToTimelineEvents(anchors);
    expect(events.map((e) => e.id)).toEqual(['b2', 'b3', 'b1']);
    expect(events.map((e) => e.startTime)).toEqual(['09:00', '11:30', '14:00']);
  });

  it("§2.2 空配列 → 空配列", () => {
    const events = convertExternalAnchorListToTimelineEvents([]);
    expect(events).toEqual([]);
  });

  it("§2.3 入力配列を mutate しない (= pure 検証)", () => {
    const anchors = [
      makeAnchor({ id: 'c1', startTime: '14:00' }),
      makeAnchor({ id: 'c2', startTime: '09:00' }),
    ];
    const beforeIds = anchors.map((a) => a.id);
    convertExternalAnchorListToTimelineEvents(anchors);
    expect(anchors.map((a) => a.id)).toEqual(beforeIds);
  });

  it("§2.4 同 startTime は安定 (= 入力順維持、 stable sort)", () => {
    const anchors = [
      makeAnchor({ id: 'd1', startTime: '10:00' }),
      makeAnchor({ id: 'd2', startTime: '10:00' }),
      makeAnchor({ id: 'd3', startTime: '10:00' }),
    ];
    const events = convertExternalAnchorListToTimelineEvents(anchors);
    expect(events.map((e) => e.id)).toEqual(['d1', 'd2', 'd3']);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 endTime あり/なし
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §3. endTime あり/なし", () => {
  it("§3.1 endTime あり → 設定", () => {
    const anchor = makeAnchor({ id: 'e1', startTime: '09:00', endTime: '11:00' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.endTime).toBe('11:00');
  });

  it("§3.2 endTime なし → undefined", () => {
    const anchor = makeAnchor({ id: 'e2', startTime: '12:00' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.endTime).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 location あり/なし + sensitive 除外 (= privacy 配慮)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §4. location あり/なし + sensitive 除外", () => {
  it("§4.1 locationText 定義あり → 設定", () => {
    const anchor = makeAnchor({ id: 'f1', locationText: '甲府駅前' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.location).toBe('甲府駅前');
  });

  it("§4.2 locationText 未定義 → undefined", () => {
    const anchor = makeAnchor({ id: 'f2' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.location).toBeUndefined();
  });

  it("§4.3 locationText 空文字 → undefined", () => {
    const anchor = makeAnchor({ id: 'f3', locationText: '' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.location).toBeUndefined();
  });

  it("§4.4 sensitive category 定義あり → location 出さない (= privacy 配慮)", () => {
    const anchor = makeAnchor({
      id: 'f4',
      locationText: '某クリニック',
      locationCategory: 'public',
      sensitiveCategory: 'medical',
    });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.location).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 category mapping (= LocationCategory 全 8 値 + undefined → EventCategory 5 値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §5. category mapping", () => {
  it("§5.1 home → home", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g1', locationCategory: 'home' }),
    );
    expect(event.category).toBe('home');
  });

  it("§5.2 office → work", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g2', locationCategory: 'office' }),
    );
    expect(event.category).toBe('work');
  });

  it("§5.3 school → work (= 学校も work-like 扱い、 8a 最小)", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g3', locationCategory: 'school' }),
    );
    expect(event.category).toBe('work');
  });

  it("§5.4 cafe → cafe", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g4', locationCategory: 'cafe' }),
    );
    expect(event.category).toBe('cafe');
  });

  it("§5.5 outdoor → other", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g5', locationCategory: 'outdoor' }),
    );
    expect(event.category).toBe('other');
  });

  it("§5.6 public → other", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g6', locationCategory: 'public' }),
    );
    expect(event.category).toBe('other');
  });

  it("§5.7 transit → other", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g7', locationCategory: 'transit' }),
    );
    expect(event.category).toBe('other');
  });

  it("§5.8 unknown → other", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'g8', locationCategory: 'unknown' }),
    );
    expect(event.category).toBe('other');
  });

  it("§5.9 undefined (= locationCategory 未設定) → other", () => {
    const event = convertExternalAnchorToEventCard(makeAnchor({ id: 'g9' }));
    expect(event.category).toBe('other');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 sourceModel 固定 (= origin: 'user', authority: 'user_owned')
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §6. sourceModel 固定", () => {
  it("§6.1 全 anchor を user origin (= createUserEvent 由来) として変換 (= 8a 最小)", () => {
    const anchor = makeAnchor({ id: 'h1', locationCategory: 'office' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.sourceModel.origin).toBe('user');
    expect(event.sourceModel.authority).toBe('user_owned');
  });

  it("§6.2 clonedFrom なし (= 純粋 user 作成扱い)", () => {
    const anchor = makeAnchor({ id: 'h2' });
    const event = convertExternalAnchorToEventCard(anchor);
    expect(event.sourceModel.origin).toBe('user');
    if (event.sourceModel.origin === 'user') {
      expect(event.sourceModel.clonedFrom).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 time 正規化 (= "HH:MM" / "HH:MM:SS" / ISO 8601 / 不正)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §7. time 正規化", () => {
  it("§7.1 \"HH:MM\" → そのまま", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'i1', startTime: '09:00' }),
    );
    expect(event.startTime).toBe('09:00');
  });

  it("§7.2 \"HH:MM:SS\" → \"HH:MM\" に丸める", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'i2', startTime: '09:00:30' }),
    );
    expect(event.startTime).toBe('09:00');
  });

  it("§7.3 ISO 8601 (= \"2026-05-24T09:00:00Z\") → UTC HH:MM 抽出", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'i3', startTime: '2026-05-24T09:00:00Z' }),
    );
    expect(event.startTime).toBe('09:00');
  });

  it("§7.4 不正 (= 2 文字未満 or HH:MM パターン外) → \"00:00\" fallback", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'i4', startTime: 'invalid' }),
    );
    expect(event.startTime).toBe('00:00');
  });

  it("§7.5 endTime も同様に正規化 (= ISO 8601)", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({
        id: 'i5',
        startTime: '2026-05-24T09:00:00Z',
        endTime: '2026-05-24T11:30:00Z',
      }),
    );
    expect(event.startTime).toBe('09:00');
    expect(event.endTime).toBe('11:30');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 8b 範囲外確認 (= executionLayerCounts undefined、 alterNote は §9 参照)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §8. 8b 範囲外 (= executionLayerCounts undefined)", () => {
  it("§8.1 executionLayerCounts は undefined (= 8b では確認のみ、 future)", () => {
    const event = convertExternalAnchorToEventCard(makeAnchor({ id: 'j2' }));
    expect(event.executionLayerCounts).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9 alterNote 注入 (= 8b-2 追加、 categoryMeaning 経由)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §9. alterNote 注入 (= 8b-2、 categoryMeaning 経由)", () => {
  it("§9.1 cafe 朝 (= morning) → 「集中しやすい時間」", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'k1', startTime: '08:00', locationCategory: 'cafe' }),
    );
    expect(event.alterNote).toBe('集中しやすい時間');
  });

  it("§9.2 office (= work) 午後 → 「午後の集中タイム」", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'k2', startTime: '14:00', locationCategory: 'office' }),
    );
    expect(event.alterNote).toBe('午後の集中タイム');
  });

  it("§9.3 home 夜 → 「自分の余白に戻る時間」", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'k3', startTime: '19:30', locationCategory: 'home' }),
    );
    expect(event.alterNote).toBe('自分の余白に戻る時間');
  });

  it("§9.4 'other' 相当 (= locationCategory undefined) → alterNote undefined", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'k4', startTime: '15:00' }),
    );
    expect(event.alterNote).toBeUndefined();
  });

  it("§9.5 transit (= LocationCategory) → 'other' (= EventCategory) → alterNote undefined", () => {
    const event = convertExternalAnchorToEventCard(
      makeAnchor({ id: 'k5', startTime: '10:00', locationCategory: 'transit' }),
    );
    expect(event.alterNote).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10 convertExternalAnchorListToTransitions (= 8b-2 追加、 隣り合う events から生成)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorAdapter §10. transitions 生成 (= 8b-2)", () => {
  it("§10.1 連続 events から transitions 生成 (= 余白あり)", () => {
    const anchors = [
      makeAnchor({ id: 'm1', startTime: '09:00', endTime: '11:00' }),
      makeAnchor({ id: 'm2', startTime: '12:00', endTime: '13:00' }),
      makeAnchor({ id: 'm3', startTime: '14:00', endTime: '18:00' }),
    ];
    const transitions = convertExternalAnchorListToTransitions(anchors);
    expect(transitions).toEqual([
      { fromTime: '11:00', toTime: '12:00', label: '移動' },
      { fromTime: '13:00', toTime: '14:00', label: '移動' },
    ]);
  });

  it("§10.2 endTime 未定義 event の後は transition 出さない", () => {
    const anchors = [
      makeAnchor({ id: 'n1', startTime: '09:00' }), // endTime 未定義
      makeAnchor({ id: 'n2', startTime: '14:00', endTime: '15:00' }),
    ];
    const transitions = convertExternalAnchorListToTransitions(anchors);
    expect(transitions).toEqual([]);
  });

  it("§10.3 隣 event.startTime <= 現 event.endTime (= 重複 / 連続) は skip", () => {
    const anchors = [
      makeAnchor({ id: 'o1', startTime: '09:00', endTime: '11:00' }),
      makeAnchor({ id: 'o2', startTime: '11:00', endTime: '12:00' }), // 直結 (= ==)
      makeAnchor({ id: 'o3', startTime: '10:30', endTime: '12:30' }), // 重複
    ];
    const transitions = convertExternalAnchorListToTransitions(anchors);
    // o1 (= 11:00 end) → o2 (= 11:00 start) は ==、 skip
    // o2 sort 順は startTime=11:00 で o3 (= 10:30) より後にならない、 整列後: o3, o1, o2
    // o3 (= 12:30 end) → o1 (= 09:00 start) は 09:00 < 12:30、 skip
    // o1 (= 11:00 end) → o2 (= 11:00 start) は ==、 skip
    expect(transitions).toEqual([]);
  });

  it("§10.4 anchors 1 件 → 空配列", () => {
    const anchors = [
      makeAnchor({ id: 'p1', startTime: '09:00', endTime: '11:00' }),
    ];
    expect(convertExternalAnchorListToTransitions(anchors)).toEqual([]);
  });

  it("§10.5 anchors 0 件 → 空配列", () => {
    expect(convertExternalAnchorListToTransitions([])).toEqual([]);
  });

  it("§10.6 入力配列を mutate しない (= pure 検証)", () => {
    const anchors = [
      makeAnchor({ id: 'q1', startTime: '14:00', endTime: '15:00' }),
      makeAnchor({ id: 'q2', startTime: '09:00', endTime: '11:00' }),
    ];
    const beforeIds = anchors.map((a) => a.id);
    convertExternalAnchorListToTransitions(anchors);
    expect(anchors.map((a) => a.id)).toEqual(beforeIds);
  });

  it("§10.7 startTime asc 整列順で生成 (= 入力順無関係)", () => {
    const anchors = [
      makeAnchor({ id: 'r1', startTime: '14:00', endTime: '15:00' }), // 入力 1
      makeAnchor({ id: 'r2', startTime: '09:00', endTime: '11:00' }), // 入力 2
    ];
    // 整列後: r2 (= 09:00-11:00), r1 (= 14:00-15:00)
    // r2.endTime (= 11:00) → r1.startTime (= 14:00) で 1 transition
    const transitions = convertExternalAnchorListToTransitions(anchors);
    expect(transitions).toEqual([
      { fromTime: '11:00', toTime: '14:00', label: '移動' },
    ]);
  });

  it("§10.8 label は '移動' 固定 (= GPT 「truth なき semantics 主張禁止」、 距離 / mode の主張なし)", () => {
    const anchors = [
      makeAnchor({ id: 's1', startTime: '09:00', endTime: '11:00' }),
      makeAnchor({ id: 's2', startTime: '12:00', endTime: '13:00' }),
    ];
    const transitions = convertExternalAnchorListToTransitions(anchors);
    for (const t of transitions) {
      expect(t.label).toBe('移動');
    }
  });
});
