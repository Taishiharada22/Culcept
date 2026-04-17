/**
 * Block 2-(b): gapFillEngine × Places Nearby — 近傍候補付与テスト
 *
 * CEO方針 2026-04-17:
 *   1. anchor が高確信で解決済みの時だけ Nearby を使う
 *   2. 勝手に自動採用しない（medium 相当、resolved* は触らない）
 *   3. objective function をそのまま効かせる（距離・近傍・往復）
 *   4. gap fill の主題を壊さない（non-proposal / 対象外 category は不変）
 *
 * 最小スコープ:
 *   - category: life_rest（カフェ）/ social_meal（レストラン）
 *   - top 1-3 件
 *   - hardAnchors が空 or API 失敗なら fail-open
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Places API モック
vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: vi.fn(),
  isPlacesApiAvailable: vi.fn(() => true),
}));

import {
  searchPlacesByText,
  isPlacesApiAvailable,
  type PlacesApiPlace,
} from "@/lib/alter-morning/placesApiClient";
import { attachNearbyPlacesToProposals } from "@/lib/alter-morning/gapFillPlaceEnricher";
import type { PlanItem } from "@/lib/alter-morning/types";
import type { HardAnchor } from "@/lib/alter-morning/objectiveFunction";

const mockTextSearch = vi.mocked(searchPlacesByText);
const mockAvailable = vi.mocked(isPlacesApiAvailable);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 甲府駅近辺の緯度経度（テストで一貫した数値を使う） */
const KOFU_STATION: { lat: number; lng: number } = { lat: 35.664, lng: 138.569 };

function makeProposal(
  id: string,
  startTime: string,
  category: "life_rest" | "social_meal" | "exercise_walk" | "study_reading",
  text = "カフェで一息",
): PlanItem {
  return {
    id,
    kind: "todo",
    text,
    what: text,
    startTime,
    durationMin: 25,
    fixedStart: false,
    orderHint: 9990,
    sourceTurnIndex: -1,
    activityCategory: category,
    completed: false,
    proposal: true,
    proposalReason: "一息入れよう",
    proposalTaxonomy: "recovery",
  };
}

function makeFixedItem(id: string, startTime: string, text: string): PlanItem {
  return {
    id,
    kind: "fixed",
    text,
    what: text,
    startTime,
    durationMin: 60,
    fixedStart: true,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
}

function makeAnchor(
  segmentId: string,
  order: number,
  startTime: string,
  coords: { lat: number; lng: number } = KOFU_STATION,
  label = "アンカー",
): HardAnchor {
  return {
    segmentId,
    order,
    anchorScore: 5,
    coords,
    label,
    startTime,
  };
}

function makePlace(
  id: string,
  name: string,
  lat: number,
  lng: number,
  status: string = "OPERATIONAL",
): PlacesApiPlace {
  return {
    id,
    displayName: { text: name, languageCode: "ja" },
    shortFormattedAddress: `${name} の住所`,
    location: { latitude: lat, longitude: lng },
    types: ["cafe"],
    businessStatus: status,
  };
}

beforeEach(() => {
  mockTextSearch.mockReset();
  mockAvailable.mockReset();
  mockAvailable.mockReturnValue(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 基本挙動
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — 基本挙動", () => {
  test("life_rest proposal + anchor 有 → proposedPlaceCandidates が添付される", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("cafe_1", "スタバ甲府駅前", 35.6645, 138.5695),
      makePlace("cafe_2", "コメダ珈琲", 35.665, 138.57),
    ]);

    const items = [
      makeFixedItem("meet", "10:00", "ミーティング"),
      makeProposal("prop_1", "11:00", "life_rest", "カフェで一息"),
      makeFixedItem("lunch", "12:00", "ランチ"),
    ];
    const anchors = [
      makeAnchor("seg_meet", 1, "10:00"),
      makeAnchor("seg_lunch", 2, "12:00"),
    ];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const proposal = result.find(i => i.id === "prop_1")!;

    expect(proposal.proposedPlaceCandidates).toBeDefined();
    expect(proposal.proposedPlaceCandidates!.length).toBeGreaterThan(0);
    expect(proposal.proposedPlaceCandidates![0].name).toBeTruthy();
    expect(proposal.proposedPlaceCandidates![0].placeId).toBeTruthy();

    // 他のアイテムは不変
    expect(result[0]).toBe(items[0]);
    expect(result[2]).toBe(items[2]);
  });

  test("social_meal proposal も対象（レストラン検索）", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("r_1", "甲州ほうとう", 35.664, 138.569),
    ]);

    const items = [
      makeFixedItem("m", "11:00", "仕事"),
      makeProposal("prop", "12:00", "social_meal", "軽い食事"),
      makeFixedItem("m2", "13:30", "打ち合わせ"),
    ];
    const anchors = [
      makeAnchor("seg_a", 1, "11:00"),
      makeAnchor("seg_b", 2, "13:30"),
    ];

    await attachNearbyPlacesToProposals(items, anchors);
    expect(mockTextSearch).toHaveBeenCalledTimes(1);
    const call = mockTextSearch.mock.calls[0][0];
    expect(call.textQuery).toBe("レストラン");
  });

  test("category が life_rest / social_meal 以外 → API 呼ばずスキップ", async () => {
    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop_walk", "11:00", "exercise_walk", "散歩"),
      makeProposal("prop_read", "14:00", "study_reading", "読書"),
      makeFixedItem("m2", "16:00", "帰宅"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);

    expect(mockTextSearch).not.toHaveBeenCalled();
    // プラン不変
    expect(result).toEqual(items);
    expect(result.find(i => i.id === "prop_walk")?.proposedPlaceCandidates).toBeUndefined();
    expect(result.find(i => i.id === "prop_read")?.proposedPlaceCandidates).toBeUndefined();
  });

  test("非 proposal アイテム（ユーザー固定予定）は絶対に変更しない", async () => {
    mockTextSearch.mockResolvedValue([makePlace("c", "カフェ", 35.664, 138.569)]);

    const fixedCafe: PlanItem = {
      id: "user_cafe",
      kind: "todo",
      text: "ユーザー指定カフェ",
      what: "ユーザー指定カフェ",
      startTime: "11:00",
      durationMin: 30,
      fixedStart: false,
      orderHint: 0,
      sourceTurnIndex: 0, // ← -1 じゃない = ユーザー由来
      activityCategory: "life_rest",
      completed: false,
      // proposal フラグ無し
    };

    const items = [makeFixedItem("m", "10:00", "仕事"), fixedCafe];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(result[1]).toBe(fixedCafe);
    expect((result[1] as PlanItem).proposedPlaceCandidates).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Guard 条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — guard 条件", () => {
  test("Places API 未設定 → fail-open（API 呼ばず items 返す）", async () => {
    mockAvailable.mockReturnValue(false);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(result).toBe(items);
  });

  test("hardAnchors 空 → API 呼ばずスキップ", async () => {
    const items = [makeProposal("prop", "11:00", "life_rest")];
    const result = await attachNearbyPlacesToProposals(items, []);

    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(result).toBe(items);
  });

  test("Places API 失敗 → fail-open（その proposal はスキップ、他は継続）", async () => {
    mockTextSearch.mockRejectedValue(new Error("Places API 500"));

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    expect(result.find(i => i.id === "prop")?.proposedPlaceCandidates).toBeUndefined();
  });

  test("proposal に startTime 無し → スキップ", async () => {
    const items: PlanItem[] = [
      makeFixedItem("m", "10:00", "仕事"),
      {
        ...makeProposal("prop", "11:00", "life_rest"),
        startTime: undefined as unknown as string,
      },
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(result.find(i => i.id === "prop")?.proposedPlaceCandidates).toBeUndefined();
  });

  test("anchor に座標 or startTime 欠落 → スキップ（位置基準が取れない）", async () => {
    const items = [makeProposal("prop", "11:00", "life_rest")];
    // startTime 無し anchor のみ
    const brokenAnchors: HardAnchor[] = [
      {
        segmentId: "seg",
        order: 1,
        anchorScore: 5,
        coords: KOFU_STATION,
        label: "X",
        // startTime なし
      },
    ];

    const result = await attachNearbyPlacesToProposals(items, brokenAnchors);
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(result.find(i => i.id === "prop")?.proposedPlaceCandidates).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 候補品質（dedupe / top N / CLOSED）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — 候補品質", () => {
  test("CLOSED_PERMANENTLY は除外される", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("open", "オープンカフェ", 35.664, 138.569, "OPERATIONAL"),
      makePlace("closed", "閉店カフェ", 35.664, 138.569, "CLOSED_PERMANENTLY"),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const prop = result.find(i => i.id === "prop")!;
    expect(prop.proposedPlaceCandidates!.every(c => c.name !== "閉店カフェ")).toBe(true);
  });

  test("同じ placeId は dedupe される", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("same", "スタバ", 35.664, 138.569),
      makePlace("same", "スタバ (重複)", 35.664, 138.569), // 同 placeId
      makePlace("diff", "コメダ", 35.665, 138.57),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const prop = result.find(i => i.id === "prop")!;
    const placeIds = prop.proposedPlaceCandidates!.map(c => c.placeId);
    expect(new Set(placeIds).size).toBe(placeIds.length);
    expect(prop.proposedPlaceCandidates!.length).toBe(2);
  });

  test("top 3 件までにクランプされる", async () => {
    const many: PlacesApiPlace[] = Array.from({ length: 5 }, (_, i) =>
      makePlace(`p${i}`, `カフェ${i}`, 35.664 + i * 0.001, 138.569 + i * 0.001),
    );
    mockTextSearch.mockResolvedValue(many);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const prop = result.find(i => i.id === "prop")!;
    expect(prop.proposedPlaceCandidates!.length).toBeLessThanOrEqual(3);
  });

  test("全候補 CLOSED → proposedPlaceCandidates を添付しない（空配列にしない）", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("c1", "閉店1", 35.664, 138.569, "CLOSED_PERMANENTLY"),
      makePlace("c2", "閉店2", 35.664, 138.569, "CLOSED_PERMANENTLY"),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const prop = result.find(i => i.id === "prop")!;
    expect(prop.proposedPlaceCandidates).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// objective function 連携（距離・近傍）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — objective function 連携", () => {
  test("遠方の候補より anchor 近傍の候補が上位にソートされる", async () => {
    // anchor = 甲府駅、候補 A = 駅前（近い）、候補 B = 20km 離れた山梨市
    mockTextSearch.mockResolvedValue([
      makePlace("far", "山梨市カフェ", 35.69, 138.8), // 遠方
      makePlace("near", "駅前カフェ", 35.6645, 138.5695), // 近傍
    ]);

    const items = [
      makeFixedItem("m", "10:00", "打ち合わせ"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00", KOFU_STATION)];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const prop = result.find(i => i.id === "prop")!;
    expect(prop.proposedPlaceCandidates![0].name).toBe("駅前カフェ");
  });

  test("API に渡す locationBias は anchor 座標 + category radius", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("c", "カフェ", 35.664, 138.569),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00", KOFU_STATION)];

    await attachNearbyPlacesToProposals(items, anchors);
    const call = mockTextSearch.mock.calls[0][0];
    expect(call.locationBias).toEqual({
      lat: KOFU_STATION.lat,
      lng: KOFU_STATION.lng,
      radius: 1000, // life_rest = 1000m
    });
  });

  test("social_meal は radius 1500m", async () => {
    mockTextSearch.mockResolvedValue([makePlace("r", "店", 35.664, 138.569)]);

    const items = [
      makeFixedItem("m", "11:00", "仕事"),
      makeProposal("prop", "12:00", "social_meal"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "11:00")];

    await attachNearbyPlacesToProposals(items, anchors);
    const call = mockTextSearch.mock.calls[0][0];
    expect(call.locationBias?.radius).toBe(1500);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// recommendReason 生成（Phase 2: UI 合流の下支え）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — recommendReason", () => {
  test("anchor ラベル + 距離が recommendReason に反映される", async () => {
    // 甲府駅から約 100m の候補（徒歩圏）
    mockTextSearch.mockResolvedValue([
      makePlace("c", "駅前カフェ", 35.6649, 138.5691), // ~100m
    ]);

    const items = [
      makeFixedItem("m", "10:00", "打ち合わせ"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [
      makeAnchor("seg_a", 1, "10:00", KOFU_STATION, "打ち合わせ"),
    ];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const cand = result.find(i => i.id === "prop")!.proposedPlaceCandidates![0];

    expect(cand.anchorLabel).toBe("打ち合わせ");
    expect(cand.recommendReason).toBeDefined();
    expect(cand.recommendReason).toContain("打ち合わせ");
    expect(cand.distanceM).toBeDefined();
    // distanceM は 50m 刻みで丸められる
    expect(cand.distanceM! % 50).toBe(0);
  });

  test("anchor ラベル無し → 「予定の近く」にフォールバック", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("c", "カフェ", 35.6645, 138.5695),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    // label 無しの anchor
    const anchors: HardAnchor[] = [
      {
        segmentId: "seg",
        order: 1,
        anchorScore: 5,
        coords: KOFU_STATION,
        startTime: "10:00",
        // label: undefined
      },
    ];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const cand = result.find(i => i.id === "prop")!.proposedPlaceCandidates![0];

    expect(cand.recommendReason).toContain("予定の近く");
  });

  test("距離が丸められ、recommendReason に距離表記が乗る", async () => {
    // 甲府駅から約 1.5km の候補
    mockTextSearch.mockResolvedValue([
      makePlace("c", "遠めカフェ", 35.677, 138.569),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [
      makeAnchor("seg_a", 1, "10:00", KOFU_STATION, "仕事"),
    ];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const cand = result.find(i => i.id === "prop")!.proposedPlaceCandidates![0];

    expect(cand.recommendReason).toMatch(/(徒歩|約).*m/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 不変条件: resolved* は触らない / 主題は壊さない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("attachNearbyPlacesToProposals — 不変条件", () => {
  test("proposal の reason / taxonomy / startTime / durationMin / category は変わらない", async () => {
    mockTextSearch.mockResolvedValue([makePlace("c", "カフェ", 35.664, 138.569)]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const before = items[1];
    const result = await attachNearbyPlacesToProposals(items, anchors);
    const after = result.find(i => i.id === "prop")!;

    expect(after.proposalReason).toBe(before.proposalReason);
    expect(after.proposalTaxonomy).toBe(before.proposalTaxonomy);
    expect(after.startTime).toBe(before.startTime);
    expect(after.durationMin).toBe(before.durationMin);
    expect(after.activityCategory).toBe(before.activityCategory);
    expect(after.proposal).toBe(true);
  });

  test("resolvedPlaceName / resolvedLat / resolvedLng は絶対に書き込まない", async () => {
    mockTextSearch.mockResolvedValue([
      makePlace("c", "スタバ", 35.664, 138.569),
    ]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    const after = result.find(i => i.id === "prop")! as any;

    expect(after.resolvedPlaceName).toBeUndefined();
    expect(after.resolvedLat).toBeUndefined();
    expect(after.resolvedLng).toBeUndefined();
  });

  test("items 配列は mutate しない（新しい配列を返す）", async () => {
    mockTextSearch.mockResolvedValue([makePlace("c", "カフェ", 35.664, 138.569)]);

    const items = [
      makeFixedItem("m", "10:00", "仕事"),
      makeProposal("prop", "11:00", "life_rest"),
    ];
    const anchors = [makeAnchor("seg_a", 1, "10:00")];

    const result = await attachNearbyPlacesToProposals(items, anchors);
    expect(result).not.toBe(items);
    expect(items[1].proposedPlaceCandidates).toBeUndefined(); // 元は不変
  });
});
