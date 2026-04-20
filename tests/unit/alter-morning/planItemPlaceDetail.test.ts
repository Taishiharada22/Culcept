/**
 * planStateToPlanItems — place detail 伝播テスト
 *
 * CEO方針 2026-04-17 plan display redesign:
 *   PlanSegment の resolvedAddress / resolvedLat / resolvedLng / propertyHints が
 *   PlanItem.location に伝播することを保証する。
 *   bottom sheet で地図と性質情報を表示する根拠となる。
 */
import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

let planStateToPlanItems: typeof import("@/lib/alter-morning/llmPlanExtractor").planStateToPlanItems;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();
  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  planStateToPlanItems = ext.planStateToPlanItems;
});

function makeState(segOverrides: Partial<import("@/lib/alter-morning/planState").PlanSegment>) {
  return {
    targetDate: "2026-04-17",
    segments: [
      {
        id: "seg_1",
        order: 1,
        activity: "仕事",
        activityCanonical: "仕事",
        activityCategory: "work_general" as const,
        estimatedDurationMin: 120,
        place: "スターバックス",
        placeCanonical: "スターバックス",
        placeCategory: "cafe" as const,
        placeType: "exact_proper_noun" as const,
        anchorScore: 4,
        companions: [],
        status: "tentative" as const,
        ...segOverrides,
      },
    ],
    missingFields: [],
    goOut: true,
  } as any;
}

describe("planStateToPlanItems — place detail propagation", () => {
  test("resolvedAddress / resolvedLat / resolvedLng が PlanItem.location に伝播する", () => {
    const state = makeState({
      resolvedPlaceName: "スターバックス渋谷店",
      resolvedAddress: "東京都渋谷区道玄坂1-2-3",
      resolvedPlaceId: "ChIJxxxxxx",
      resolvedLat: 35.658,
      resolvedLng: 139.701,
    });
    const items = planStateToPlanItems(state);
    const loc = items[0].location;
    expect(loc).toBeDefined();
    expect(loc!.resolvedName).toBe("スターバックス渋谷店");
    expect(loc!.address).toBe("東京都渋谷区道玄坂1-2-3");
    expect(loc!.placeId).toBe("ChIJxxxxxx");
    expect(loc!.lat).toBe(35.658);
    expect(loc!.lng).toBe(139.701);
  });

  test("placeCanonical だけあれば propertyHints が derive される（仕事 × cafe + traits）", () => {
    const state = makeState({});
    const items = planStateToPlanItems(state);
    const loc = items[0].location;
    expect(loc).toBeDefined();
    // activity=work × cafe(traits: workFriendly=true, longStayOk=true)
    expect(loc!.propertyHints).toBeDefined();
    expect(loc!.propertyHints!.outlets).toBe("yes"); // workFriendly → outlets yes
    expect(loc!.propertyHints!.wifi).toBe("yes");
    expect(loc!.propertyHints!.longStayOk).toBe("yes");
  });

  test("traits が placeTable から引かれて location に含まれる", () => {
    const state = makeState({});
    const items = planStateToPlanItems(state);
    const loc = items[0].location;
    expect(loc!.traits).toBeDefined();
    // スターバックス → workFriendly: true
    expect(loc!.traits!.workFriendly).toBe(true);
  });

  test("place なしの segment は location undefined（regression check）", () => {
    const state = makeState({ place: undefined, placeCanonical: undefined });
    const items = planStateToPlanItems(state);
    expect(items[0].location).toBeUndefined();
  });

  test("ミーティング × cafe では quietness/private/wifi が要求される", () => {
    const state = makeState({
      activity: "ミーティング",
      activityCanonical: "ミーティング",
      activityCategory: "work_meeting" as const,
    });
    const items = planStateToPlanItems(state);
    const hints = items[0].location!.propertyHints;
    expect(hints).toBeDefined();
    expect(hints!.wifi).toBe("yes");
    // meeting は atmosphere / budget を要求しない
    expect(hints!.atmosphere).toBeUndefined();
    expect(hints!.budget).toBeUndefined();
  });
});
