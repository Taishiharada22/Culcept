/**
 * Phase 3-N Map impl sub-phase 9a-pre — externalAnchorMapAdapter contract test
 *
 * 検証範囲 (= pure module 変換固定):
 *   §1 single anchor → MapPin 変換 (= id / category / coordinates / title / time / order)
 *   §2 unresolved (= resolution null) は pin 化しない (undefined return)
 *   §3 list 変換 (= startTime asc 整列 + order 付与 + unresolved skip)
 *   §4 category 4 段階優先順位 (= List sub-phase 8b-5 と同 logic、 重複コピー検証)
 *   §5 time 正規化
 *   §6 route segments 生成 (= 隣接接続、 1 pin 以下 → 空配列)
 *   §7 sheet 変換 (= timeRange / location / meaningText / imageUrl 常に undefined)
 *   §8 sensitive privacy (= location 出さない)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用 (= pure module)
 *   - 入力 mutate なし
 *
 * 設計書:
 *   - lib/plan/map/adapters/externalAnchorMapAdapter.ts
 *   - lib/plan/map/types.ts
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2
 */

import { describe, expect, it } from "vitest";
import type { OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import {
  type AnchorResolution,
  convertExternalAnchorToMapPin,
  convertExternalAnchorListToMapPins,
  convertMapPinsToRouteSegments,
  convertExternalAnchorToMapSheet,
} from "@/lib/plan/map/adapters/externalAnchorMapAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test helper
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

const resolution = (lat: number, lng: number, name = '解決名'): AnchorResolution => ({
  lat,
  lng,
  confidence: 'high',
  resolvedName: name,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 single anchor → MapPin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §1. single anchor → MapPin", () => {
  it("§1.1 全 field 設定 → MapPinViewModel 生成", () => {
    const anchor = makeAnchor({
      id: 'p1',
      title: 'カフェ作業',
      startTime: '09:00',
      locationCategory: 'cafe',
    });
    const pin = convertExternalAnchorToMapPin(anchor, resolution(35.6, 139.7), 1);
    expect(pin).toBeDefined();
    expect(pin!.id).toBe('p1');
    expect(pin!.category).toBe('cafe');
    expect(pin!.coordinates).toEqual({ lat: 35.6, lng: 139.7 });
    expect(pin!.title).toBe('カフェ作業');
    expect(pin!.time).toBe('09:00');
    expect(pin!.order).toBe(1);
  });

  it("§1.2 入力 anchor を mutate しない (= pure)", () => {
    const anchor = makeAnchor({ id: 'p2', locationCategory: 'office' });
    const snapshot = JSON.parse(JSON.stringify(anchor));
    convertExternalAnchorToMapPin(anchor, resolution(0, 0), 1);
    expect(anchor).toEqual(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 unresolved (= resolution null) → undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §2. unresolved skip", () => {
  it("§2.1 resolution null → undefined (= pin 化しない)", () => {
    const anchor = makeAnchor({ id: 'u1', locationCategory: 'cafe' });
    const pin = convertExternalAnchorToMapPin(anchor, null, 1);
    expect(pin).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 list 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §3. list 変換", () => {
  it("§3.1 startTime asc 整列 + order 付与 (= 1-indexed)", () => {
    const anchors = [
      makeAnchor({ id: 'l1', startTime: '14:00', locationCategory: 'office' }),
      makeAnchor({ id: 'l2', startTime: '09:00', locationCategory: 'cafe' }),
      makeAnchor({ id: 'l3', startTime: '12:00', locationCategory: 'home' }),
    ];
    const resolutions = new Map<string, AnchorResolution | null>([
      ['l1', resolution(35.7, 139.7)],
      ['l2', resolution(35.6, 139.6)],
      ['l3', resolution(35.65, 139.65)],
    ]);
    const pins = convertExternalAnchorListToMapPins(anchors, resolutions);
    expect(pins.map((p) => p.id)).toEqual(['l2', 'l3', 'l1']);
    expect(pins.map((p) => p.order)).toEqual([1, 2, 3]);
  });

  it("§3.2 unresolved (= resolutions に null or 不在) は skip、 ただし order は incremented", () => {
    // resolution null は 1 件 (= l-mid)、 不在 1 件 (= l-late)
    const anchors = [
      makeAnchor({ id: 'l-early', startTime: '09:00', locationCategory: 'cafe' }),
      makeAnchor({ id: 'l-mid', startTime: '12:00', locationCategory: 'public' }),
      makeAnchor({ id: 'l-late', startTime: '15:00', locationCategory: 'office' }),
    ];
    const resolutions = new Map<string, AnchorResolution | null>([
      ['l-early', resolution(35.6, 139.6)],
      ['l-mid', null], // unresolved
      // 'l-late' 不在
    ]);
    const pins = convertExternalAnchorListToMapPins(anchors, resolutions);
    expect(pins.map((p) => p.id)).toEqual(['l-early']);
    expect(pins[0].order).toBe(1); // 整列後 1 番目 = order 1
  });

  it("§3.3 空配列 → 空配列", () => {
    expect(convertExternalAnchorListToMapPins([], new Map())).toEqual([]);
  });

  it("§3.4 入力 anchors を mutate しない", () => {
    const anchors = [
      makeAnchor({ id: 'm1', startTime: '14:00' }),
      makeAnchor({ id: 'm2', startTime: '09:00' }),
    ];
    const beforeIds = anchors.map((a) => a.id);
    convertExternalAnchorListToMapPins(anchors, new Map());
    expect(anchors.map((a) => a.id)).toEqual(beforeIds);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 category 4 段階優先順位 (= List 8b-5 と同 logic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §4. category 4 段階優先順位", () => {
  it("§4.1 explicit office → work", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'c1', locationCategory: 'office' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.category).toBe('work');
  });

  it("§4.2 「週次ミーティング」 (= title heuristic) → work", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'c2', title: '週次ミーティング' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.category).toBe('work');
  });

  it("§4.3 「会食」 + locationText (= title 優先) → meal", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'c3', title: '会食', locationText: 'ふきぬき' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.category).toBe('meal');
  });

  it("§4.4 title 不在 + locationText 「居酒屋」 (= locationText heuristic) → meal", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'c4', title: '集まり', locationText: '居酒屋わら' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.category).toBe('meal');
  });

  it("§4.5 全 hit なし → 'other'", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'c5', title: '散歩' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.category).toBe('other');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 time 正規化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §5. time 正規化", () => {
  it("§5.1 「HH:MM」 → そのまま", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 't1', startTime: '09:00' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.time).toBe('09:00');
  });

  it("§5.2 「HH:MM:SS」 → 「HH:MM」", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 't2', startTime: '09:00:30' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.time).toBe('09:00');
  });

  it("§5.3 ISO 8601 → UTC HH:MM 抽出", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 't3', startTime: '2026-05-24T09:00:00Z' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.time).toBe('09:00');
  });

  it("§5.4 不正 → 「00:00」 fallback", () => {
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 't4', startTime: 'invalid' }),
      resolution(0, 0),
      1,
    );
    expect(pin!.time).toBe('00:00');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 route segments 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §6. route segments", () => {
  it("§6.1 3 pin → 2 segment", () => {
    const anchors = [
      makeAnchor({ id: 'r1', startTime: '09:00', locationCategory: 'cafe' }),
      makeAnchor({ id: 'r2', startTime: '12:00', locationCategory: 'office' }),
      makeAnchor({ id: 'r3', startTime: '18:00', locationCategory: 'home' }),
    ];
    const resolutions = new Map<string, AnchorResolution | null>([
      ['r1', resolution(35.6, 139.6)],
      ['r2', resolution(35.65, 139.65)],
      ['r3', resolution(35.7, 139.7)],
    ]);
    const pins = convertExternalAnchorListToMapPins(anchors, resolutions);
    const segments = convertMapPinsToRouteSegments(pins);
    expect(segments).toHaveLength(2);
    expect(segments[0].fromPinId).toBe('r1');
    expect(segments[0].toPinId).toBe('r2');
    expect(segments[0].from).toEqual({ lat: 35.6, lng: 139.6 });
    expect(segments[0].to).toEqual({ lat: 35.65, lng: 139.65 });
    expect(segments[1].fromPinId).toBe('r2');
    expect(segments[1].toPinId).toBe('r3');
  });

  it("§6.2 1 pin → 空配列", () => {
    const anchors = [makeAnchor({ id: 'r-solo', locationCategory: 'cafe' })];
    const pins = convertExternalAnchorListToMapPins(
      anchors,
      new Map([['r-solo', resolution(0, 0)]]),
    );
    expect(convertMapPinsToRouteSegments(pins)).toEqual([]);
  });

  it("§6.3 0 pin → 空配列", () => {
    expect(convertMapPinsToRouteSegments([])).toEqual([]);
  });

  it("§6.4 segment に 距離 / 交通手段 type なし (= 型レベルで ナビ精度主張禁止)", () => {
    const anchors = [
      makeAnchor({ id: 's1', startTime: '09:00' }),
      makeAnchor({ id: 's2', startTime: '12:00' }),
    ];
    const resolutions = new Map<string, AnchorResolution | null>([
      ['s1', resolution(0, 0)],
      ['s2', resolution(1, 1)],
    ]);
    const pins = convertExternalAnchorListToMapPins(anchors, resolutions);
    const segments = convertMapPinsToRouteSegments(pins);
    const seg = segments[0] as unknown as Record<string, unknown>;
    expect(seg.distance).toBeUndefined();
    expect(seg.mode).toBeUndefined();
    expect(seg.duration).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 sheet 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §7. sheet 変換", () => {
  it("§7.1 全 field 設定 + endTime → timeRange + location + meaningText", () => {
    const anchor = makeAnchor({
      id: 'sh1',
      title: 'カフェ作業',
      startTime: '09:00',
      endTime: '11:00',
      locationCategory: 'cafe',
      locationText: '甲府駅前カフェ',
    });
    const sheet = convertExternalAnchorToMapSheet(anchor);
    expect(sheet.pinId).toBe('sh1');
    expect(sheet.category).toBe('cafe');
    expect(sheet.timeRange).toBe('09:00-11:00');
    expect(sheet.title).toBe('カフェ作業');
    expect(sheet.location).toBe('甲府駅前カフェ');
    // meaningText は List getNarrative location 込み 5W1H pattern
    expect(sheet.meaningText).toBeDefined();
    expect(sheet.meaningText).toContain('甲府駅前カフェ');
  });

  it("§7.2 endTime 未指定 → timeRange は startTime のみ", () => {
    const sheet = convertExternalAnchorToMapSheet(
      makeAnchor({ id: 'sh2', startTime: '12:00', locationCategory: 'public' }),
    );
    expect(sheet.timeRange).toBe('12:00');
  });

  it("§7.3 imageUrl 常に undefined (= ExternalAnchor に image field なし、 fake 禁止)", () => {
    const sheet = convertExternalAnchorToMapSheet(
      makeAnchor({ id: 'sh3', locationCategory: 'cafe' }),
    );
    expect(sheet.imageUrl).toBeUndefined();
  });

  it("§7.4 sensitive category → location undefined (= privacy)", () => {
    const sheet = convertExternalAnchorToMapSheet(
      makeAnchor({
        id: 'sh4',
        locationText: '某クリニック',
        locationCategory: 'public',
        sensitiveCategory: 'medical',
      }),
    );
    expect(sheet.location).toBeUndefined();
  });

  it("§7.5 'other' category → meaningText undefined (= 解釈押し付けない)", () => {
    const sheet = convertExternalAnchorToMapSheet(
      makeAnchor({ id: 'sh5', title: '散歩' }),
    );
    expect(sheet.category).toBe('other');
    expect(sheet.meaningText).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 sensitive privacy 配慮
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("externalAnchorMapAdapter §8. sensitive privacy", () => {
  it("§8.1 sensitive anchor の locationText は sheet に出さない (= List adapter と整合)", () => {
    const sheet = convertExternalAnchorToMapSheet(
      makeAnchor({
        id: 'priv-1',
        title: '通院',
        locationText: '某クリニック',
        sensitiveCategory: 'medical',
      }),
    );
    expect(sheet.location).toBeUndefined();
  });

  it("§8.2 sensitive でも pin は出す (= map に座標表示は OK、 sheet で location 隠す)", () => {
    // pin 自体は location 文字列を含まないので privacy 違反なし、 sheet で隠せば OK
    const pin = convertExternalAnchorToMapPin(
      makeAnchor({ id: 'priv-2', title: '通院', sensitiveCategory: 'medical' }),
      resolution(35.6, 139.7),
      1,
    );
    expect(pin).toBeDefined();
    expect(pin!.title).toBe('通院'); // title はそのまま (= List 側で sensitive 用 placeholder 議論は別 sub-phase)
  });
});
