/**
 * resolveNearAnchorPlaces — Block 2-(c) find_near_anchor intent テスト
 *
 * CEO方針 2026-04-17:
 *   「サドヤ近くのカフェないかな？」のような疑問形で placeSearchHint が設定された
 *   セグメントに対して、anchor 座標周辺を Places API で検索し、候補を
 *   needsConfirmation に積む。勝手に採用せず常に medium confidence。
 *
 * テスト観点:
 *   1. anchor 座標が取れないとスキップ（needsConfirmation 空）
 *   2. anchor 座標 + 複数候補 → confidence=medium / bestCandidate 暫定セット
 *   3. 候補 0 件 → confidence=low / bestCandidate undefined
 *   4. Places API 未設定 → fail-open（何もしない）
 *   5. searchCategory 無し / 既 resolved → スキップ
 *   6. 距離スコアで降順ソート
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  resolveNearAnchorPlaces,
} from "@/lib/alter-morning/placeResolver";
import type { PlanSegment } from "@/lib/alter-morning/planState";

vi.mock("server-only", () => ({}));

// Places API モック
vi.mock("@/lib/alter-morning/placesApiClient", () => ({
  searchPlacesByText: vi.fn(),
  isPlacesApiAvailable: vi.fn(() => true),
}));

// 他の依存（resolveNearAnchorPlaces は呼ばないが同モジュール内で参照される）
vi.mock("@/lib/stargazer/perspectiveEngine", () => ({
  executeSearch: vi.fn(),
}));
vi.mock("@/lib/alter-morning/placeCacheStore", () => ({
  readFromSupabase: vi.fn(() => Promise.resolve(null)),
  writeToSupabase: vi.fn(() => Promise.resolve()),
}));

import {
  searchPlacesByText,
  isPlacesApiAvailable,
} from "@/lib/alter-morning/placesApiClient";
const mockPlacesTextSearch = vi.mocked(searchPlacesByText);
const mockPlacesAvailable = vi.mocked(isPlacesApiAvailable);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** resolved な anchor segment を作る（デフォルト: confidence=high） */
function makeAnchorSegment(
  id: string,
  name: string,
  lat: number,
  lng: number,
  confidence: "high" | "medium" | "low" = "high",
): PlanSegment {
  return {
    id,
    order: 1,
    activity: "ディナー",
    activityCanonical: "ディナー",
    activityCategory: "social_meal",
    estimatedDurationMin: 120,
    place: name,
    placeCanonical: name,
    placeCategory: "restaurant",
    placeType: "exact_proper_noun",
    resolvedPlaceName: name,
    resolvedLat: lat,
    resolvedLng: lng,
    resolvedAddress: `${name} の住所`,
    resolutionConfidence: confidence,
    anchorScore: 5,
    companions: [],
    status: "tentative",
  };
}

/** placeSearchHint を持つ未解決 segment を作る */
function makeHintSegment(
  id: string,
  hint: PlanSegment["placeSearchHint"],
): PlanSegment {
  return {
    id,
    order: 2,
    activity: "カフェ",
    activityCanonical: "カフェ",
    activityCategory: "social_meal",
    estimatedDurationMin: 60,
    placeSearchHint: hint,
    anchorScore: 1,
    companions: [],
    status: "tentative",
  };
}

/** Places API モック応答生成 */
function mockPlace(
  id: string,
  name: string,
  lat: number,
  lng: number,
  address = "東京都渋谷区xxx",
) {
  return {
    id,
    displayName: { text: name, languageCode: "ja" },
    formattedAddress: address,
    shortFormattedAddress: address,
    location: { latitude: lat, longitude: lng },
    types: ["cafe"],
    businessStatus: "OPERATIONAL",
  } as any;
}

beforeEach(() => {
  mockPlacesTextSearch.mockReset();
  mockPlacesAvailable.mockReset();
  mockPlacesAvailable.mockReturnValue(true);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveNearAnchorPlaces", () => {
  test("anchor + searchCategory + 複数候補 → confidence=medium / ベスト候補セット", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
      originalQuery: "サドヤ近くのカフェないかな？",
    });
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("pid_A", "カフェ A", 35.6635, 138.5685), // 約 60m
      mockPlace("pid_B", "カフェ B", 35.6700, 138.5700), // 約 800m
      mockPlace("pid_C", "カフェ C", 35.6720, 138.5780), // 約 1350m（<1500m 内）
    ]);

    const { resolved, needsConfirmation } = await resolveNearAnchorPlaces(
      [anchor, hint],
    );

    expect(needsConfirmation.length).toBe(1);
    const nc = needsConfirmation[0];
    expect(nc.segmentId).toBe("seg_2");
    expect(nc.resolution.confidence).toBe("medium");
    expect(nc.resolution.candidates.length).toBe(3);
    // 近い順（A → B → C）
    expect(nc.resolution.candidates[0].name).toBe("カフェ A");
    expect(nc.resolution.bestCandidate?.name).toBe("カフェ A");

    // resolved[1] に暫定セットされる
    const updated = resolved.find(s => s.id === "seg_2")!;
    expect(updated.resolvedPlaceName).toBe("カフェ A");
    expect(updated.resolvedPlaceId).toBe("pid_A");
    expect(updated.resolvedLat).toBeCloseTo(35.6635, 4);
    expect(updated.resolutionConfidence).toBe("medium");

    // Places API 呼び出し引数の検証
    expect(mockPlacesTextSearch).toHaveBeenCalledTimes(1);
    const callArg = mockPlacesTextSearch.mock.calls[0][0] as any;
    expect(callArg.textQuery).toBe("カフェ");
    expect(callArg.locationBias?.radius).toBe(1500);
    expect(callArg.locationBias?.lat).toBeCloseTo(35.6630, 4);
  });

  test("anchor 座標が取れない（同名 segment なし）+ area geocode も失敗 → スキップ", async () => {
    // CEO方針 2026-04-18 Bug A Step 3: 同名 segment が無くても area geocode を試すようになった。
    //   このテストは geocode も 0 件で返す設定 → 最終的にスキップを確認する。
    const hint = makeHintSegment("seg_1", {
      nearAnchorLabel: "存在しない地名xyz",
      searchCategory: "カフェ",
      originalQuery: "存在しない地名xyz近くのカフェ",
    });
    mockPlacesTextSearch.mockResolvedValueOnce([]); // geocode 0 件

    const { needsConfirmation } = await resolveNearAnchorPlaces([hint]);

    expect(needsConfirmation).toEqual([]);
    // geocode 試行で 1 回は呼ばれる（Step 3）
    expect(mockPlacesTextSearch).toHaveBeenCalledTimes(1);
    const callArg = mockPlacesTextSearch.mock.calls[0][0] as any;
    expect(callArg.textQuery).toBe("存在しない地名xyz");
    // 近傍探索用の locationBias は付かない（geocode クエリは単純な textQuery のみ）
    expect(callArg.locationBias).toBeUndefined();
  });

  test("CEO方針 2026-04-18 Bug A Step 3: area geocode で広域地名 anchor を解決", async () => {
    // 「カフェを甲府にして」— 甲府 は plan 内の resolved segment ではないが、
    // geocode して甲府中心座標を取り、1500m 円内でカフェを探索する。
    const hint = makeHintSegment("seg_1", {
      nearAnchorLabel: "甲府",
      searchCategory: "カフェ",
      originalQuery: "甲府のカフェ",
    });
    // 1 回目: geocode クエリ（甲府中心を返す）
    // 2 回目: 近傍検索（カフェ候補を返す）
    mockPlacesTextSearch
      .mockResolvedValueOnce([mockPlace("pid_kofu", "甲府", 35.664, 138.568)])
      .mockResolvedValueOnce([
        mockPlace("pid_A", "甲府カフェ A", 35.6645, 138.5685),
        mockPlace("pid_B", "甲府カフェ B", 35.6650, 138.5690),
      ]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([hint]);

    expect(needsConfirmation.length).toBe(1);
    expect(mockPlacesTextSearch).toHaveBeenCalledTimes(2);
    // 2 回目の呼び出しは locationBias 付き
    const secondCall = mockPlacesTextSearch.mock.calls[1][0] as any;
    expect(secondCall.textQuery).toBe("カフェ");
    expect(secondCall.locationBias?.radius).toBe(1500);
    expect(secondCall.locationBias?.lat).toBeCloseTo(35.664, 3);
    // 候補が取れる
    expect(needsConfirmation[0].resolution.candidates.length).toBeGreaterThan(0);
    expect(needsConfirmation[0].resolution.confidence).toBe("medium");
  });

  test("候補 0 件 → confidence=low / reason が near_anchor_zero 形式", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "ラウンジ",
      originalQuery: "サドヤ近くのラウンジ",
    });
    mockPlacesTextSearch.mockResolvedValue([]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation.length).toBe(1);
    const r = needsConfirmation[0].resolution;
    expect(r.confidence).toBe("low");
    expect(r.bestCandidate).toBeUndefined();
    expect(r.candidates).toEqual([]);
    // GPT rule 4: reason は "near_anchor_zero:<category>@<anchor>:radius=<m>" 形式
    expect(r.reason).toBeDefined();
    expect(r.reason!.startsWith("near_anchor_zero:")).toBe(true);
    expect(r.reason).toContain("ラウンジ");
    expect(r.reason).toContain("@サドヤ");
    expect(r.reason).toMatch(/:radius=\d+$/);
  });

  test("Places API 未設定 → fail-open（何もしない）", async () => {
    mockPlacesAvailable.mockReturnValue(false);
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });

    const { resolved, needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    expect(resolved).toEqual([anchor, hint]);
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("searchCategory 無し → スキップ", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      // searchCategory undefined
    });

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("既 resolvedPlaceName がある → スキップ（上書き禁止）", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint: PlanSegment = {
      ...makeHintSegment("seg_2", {
        nearAnchorLabel: "サドヤ",
        searchCategory: "カフェ",
      }),
      resolvedPlaceName: "既存カフェ",
    };

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("searchPlacesByText 例外 → fail-open でスキップ", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    mockPlacesTextSearch.mockRejectedValue(new Error("API error"));

    const { resolved, needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    // resolved 側は元のまま（更新なし）
    const updated = resolved.find(s => s.id === "seg_2")!;
    expect(updated.resolvedPlaceName).toBeUndefined();
  });

  test("CLOSED_PERMANENTLY は候補から除外", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    const openA = mockPlace("pid_A", "カフェ A", 35.6635, 138.5685);
    const closedB = { ...mockPlace("pid_B", "カフェ B", 35.6640, 138.5690), businessStatus: "CLOSED_PERMANENTLY" };
    const openC = mockPlace("pid_C", "カフェ C", 35.6650, 138.5700);
    mockPlacesTextSearch.mockResolvedValue([openA, closedB, openC]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation[0].resolution.candidates.length).toBe(2);
    const names = needsConfirmation[0].resolution.candidates.map(c => c.name);
    expect(names).not.toContain("カフェ B");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GPT 追加ルール 2026-04-17
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("rule 1: segment anchor confidence=medium → near search を走らせない（既存ルール維持）", async () => {
    // CEO方針 2026-04-18 Step 3 後も変更なし:
    //   プラン内の既解決 segment が medium 確信なら、その 1 点の周辺を探索するのは危険。
    //   area_geocode 経路（medium 許可）は segment 経路とは別の話。
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680, "medium");
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("rule 1: anchor confidence=low → near search を走らせない", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680, "low");
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation).toEqual([]);
    expect(mockPlacesTextSearch).not.toHaveBeenCalled();
  });

  test("rule 2: 同 placeId の重複候補は 1 件に dedupe", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    // 同じ placeId の候補を 3 回
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("pid_SAME", "カフェ A", 35.6635, 138.5685),
      mockPlace("pid_SAME", "カフェ A (dup)", 35.6636, 138.5686),
      mockPlace("pid_OTHER", "カフェ B", 35.6700, 138.5700),
    ]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    const candidates = needsConfirmation[0].resolution.candidates;
    expect(candidates.length).toBe(2);
    const ids = candidates.map(c => c.placeId);
    expect(ids).toEqual(["pid_SAME", "pid_OTHER"]); // 距離順
  });

  test("rule 2: 同 address の表記揺れ dedupe（placeId 欠落 fallback）", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    // placeId を欠落させて address 重複を突く
    const p1 = { ...mockPlace("", "カフェ A", 35.6635, 138.5685, "渋谷区道玄坂1-2-3"), id: "" };
    const p2 = { ...mockPlace("", "カフェ A（別名）", 35.6636, 138.5686, "渋谷区道玄坂1-2-3"), id: "" };
    const p3 = mockPlace("pid_C", "カフェ C", 35.6700, 138.5700, "渋谷区神南1-1-1");
    mockPlacesTextSearch.mockResolvedValue([p1, p2, p3]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    const candidates = needsConfirmation[0].resolution.candidates;
    // address 重複で 1 件化 → 2 件
    expect(candidates.length).toBe(2);
  });

  test("rule 3: searchCategory=公園 → radius 2000m が locationBias に渡る", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "公園",
    });
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("p1", "代々木公園", 35.6700, 138.5700),
    ]);

    await resolveNearAnchorPlaces([anchor, hint]);

    const callArg = mockPlacesTextSearch.mock.calls[0][0] as any;
    expect(callArg.locationBias?.radius).toBe(2000);
  });

  test("rule 3: searchCategory=駅 → radius 3000m", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "駅",
    });
    mockPlacesTextSearch.mockResolvedValue([]);

    await resolveNearAnchorPlaces([anchor, hint]);

    const callArg = mockPlacesTextSearch.mock.calls[0][0] as any;
    expect(callArg.locationBias?.radius).toBe(3000);
  });

  test("rule 3: 未知カテゴリ → デフォルト radius 1500m", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "寺社仏閣", // どのマップにも無い
    });
    mockPlacesTextSearch.mockResolvedValue([]);

    await resolveNearAnchorPlaces([anchor, hint]);

    const callArg = mockPlacesTextSearch.mock.calls[0][0] as any;
    expect(callArg.locationBias?.radius).toBe(1500);
  });

  test("複数 hint セグメント → 各々 Places API を呼び出す", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hintA = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    const hintB = makeHintSegment("seg_3", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "バー",
    });
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("pid_X", "X", 35.6635, 138.5685),
    ]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hintA, hintB]);

    expect(needsConfirmation.length).toBe(2);
    expect(mockPlacesTextSearch).toHaveBeenCalledTimes(2);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO方針 2026-04-18 Week 1 Step 6b: Hard 距離制約化
  //   半径(radius)外の候補は matchScore を下げるのではなく、即棄却する。
  //   「真逆のカフェを採用」事故の直接原因だった soft 距離制約を撤廃。
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  test("Step 6b: 1500m 外の候補は候補リストから hard 棄却される", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("pid_near", "カフェ 近い", 35.6635, 138.5685),   // 約 60m: 採用
      mockPlace("pid_edge", "カフェ 縁", 35.6720, 138.5780),    // 約 1350m: 採用
      mockPlace("pid_far",  "カフェ 遠い", 35.6800, 138.5900), // 約 2700m: 棄却
      mockPlace("pid_opp",  "真逆のカフェ", 35.6500, 138.5500), // 約 2200m 反対側: 棄却
    ]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation.length).toBe(1);
    const candidates = needsConfirmation[0].resolution.candidates;
    // 1500m 以内の 2 件のみ残る
    const names = candidates.map(c => c.name);
    expect(names).toContain("カフェ 近い");
    expect(names).toContain("カフェ 縁");
    expect(names).not.toContain("カフェ 遠い");
    expect(names).not.toContain("真逆のカフェ");
  });

  test("Step 6b: 半径内候補が 0 件になった場合は low confidence に落ちる", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    // API は返すが全部 radius 外（1500m 超）
    mockPlacesTextSearch.mockResolvedValue([
      mockPlace("pid_far1", "カフェ 遠い1", 35.6800, 138.5900), // 約 2700m
      mockPlace("pid_far2", "カフェ 遠い2", 35.7000, 138.6000), // 約 5000m
    ]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    expect(needsConfirmation.length).toBe(1);
    const r = needsConfirmation[0].resolution;
    // Safety Gate に引っかかるよう confidence=low
    expect(r.confidence).toBe("low");
    expect(r.bestCandidate).toBeUndefined();
    expect(r.candidates).toEqual([]);
    // reason は near_anchor_zero 形式（UI 側で「範囲を広げる／別カテゴリ」の clarify）
    expect(r.reason?.startsWith("near_anchor_zero:")).toBe(true);
  });

  test("Step 6b: 座標欠落候補も棄却される", async () => {
    const anchor = makeAnchorSegment("seg_1", "サドヤ", 35.6630, 138.5680);
    const hint = makeHintSegment("seg_2", {
      nearAnchorLabel: "サドヤ",
      searchCategory: "カフェ",
    });
    const withCoords = mockPlace("pid_A", "カフェ A", 35.6635, 138.5685);
    const noCoords = { ...mockPlace("pid_B", "カフェ B", 0, 0), location: undefined };
    mockPlacesTextSearch.mockResolvedValue([withCoords, noCoords]);

    const { needsConfirmation } = await resolveNearAnchorPlaces([anchor, hint]);

    const candidates = needsConfirmation[0].resolution.candidates;
    expect(candidates.length).toBe(1);
    expect(candidates[0].name).toBe("カフェ A");
  });
});
