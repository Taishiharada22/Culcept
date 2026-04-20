/**
 * Recommendation Delta — W2-4 (CEO方針 2026-04-19)
 *
 * CEO 条件:
 *   (1) emit 条件を厳しくする: recommendation_request だけ recommendationIntent 発火
 *   (2) pre-classifier を先に置く: LLM より先に決定論で判定
 *   (3) delta でも同じ意味論: llmDeltaParser でも explicit place を破壊しない
 *
 * 検証項目:
 *   - detectDelta が recommendation 発話を LLM を経由せず emit する
 *   - applyDelta で recommendationIntent が target segment に attach される
 *   - 既存 explicit place を持つ segment は上書きされない
 *   - 適合 segment が無いときは add_segment で新規作成される
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// runAI は使わないはずだが、呼ばれたら失敗させて可視化する
vi.mock("@/lib/ai", () => ({
  runAI: vi.fn(async () => {
    throw new Error("LLM should not be called for recommendation pre-classifier");
  }),
}));

import {
  detectDelta,
  applyDelta,
} from "@/lib/alter-morning/llmDeltaParser";
import {
  resetSegmentCounter,
  type PlanState,
  type PlanSegment,
} from "@/lib/alter-morning/planState";

function mkSeg(
  partial: Partial<PlanSegment> & { id: string; activity: string },
): PlanSegment {
  return {
    order: 1,
    companions: [],
    status: "tentative",
    ...partial,
  };
}

function mkState(segments: PlanSegment[]): PlanState {
  return {
    targetDate: "2099-01-01",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments,
    status: "clarifying",
    missingFields: [],
  };
}

beforeEach(() => {
  resetSegmentCounter();
});

describe("W2-4 detectDelta — 純粋な提案要求を LLM を経由せず emit", () => {
  test("『おすすめある？』(category 単独 segment) → attach intent to existing segment", async () => {
    const state = mkState([
      mkSeg({ id: "s1", activity: "カフェ" }),
    ]);
    const delta = await detectDelta("おすすめある？", state);
    expect(delta).not.toBeNull();
    expect(delta!.turnType).toBe("addition");
    expect(delta!.changes).toHaveLength(1);
    const c = delta!.changes[0];
    expect(c.type).toBe("set");
    expect(c.field).toBe("recommendationIntent");
    expect(c.segmentId).toBe("s1");

    const next = applyDelta(state, delta!);
    const seg = next.segments[0];
    expect(seg.recommendationIntent).toBeDefined();
    expect(seg.recommendationIntent!.strategy).toBe("category_only");
  });

  test("『サドヤ近くでおすすめのカフェない？』 → anchor_proximity + attach to カフェ seg", async () => {
    const state = mkState([
      mkSeg({ id: "s1", activity: "ミーティング", place: "スタバ", resolvedPlaceName: "スタバ渋谷" }),
      mkSeg({ id: "s2", order: 2, activity: "カフェ" }),
    ]);
    const delta = await detectDelta("サドヤ近くでおすすめのカフェない？", state);
    expect(delta).not.toBeNull();
    const c = delta!.changes[0];
    expect(c.field).toBe("recommendationIntent");
    expect(c.segmentId).toBe("s2"); // カフェ segment

    const next = applyDelta(state, delta!);
    const s2 = next.segments.find((s) => s.id === "s2")!;
    expect(s2.recommendationIntent?.strategy).toBe("anchor_proximity");
    expect(s2.recommendationIntent?.anchorHint).toBe("サドヤ");
    expect(s2.recommendationIntent?.categoryHint).toBe("カフェ");

    // CEO条件(1): explicit place (スタバ) を持つ s1 は触らない
    const s1 = next.segments.find((s) => s.id === "s1")!;
    expect(s1.recommendationIntent).toBeUndefined();
    expect(s1.resolvedPlaceName).toBe("スタバ渋谷");
  });

  test("CEO条件(1): 全 segment が explicit place → add_segment で新規作成", async () => {
    const state = mkState([
      mkSeg({
        id: "s1",
        activity: "ランチ",
        place: "叙々苑",
        resolvedPlaceName: "叙々苑 渋谷店",
      }),
    ]);
    const delta = await detectDelta("おすすめある？", state);
    expect(delta).not.toBeNull();
    expect(delta!.changes[0].type).toBe("add_segment");

    const next = applyDelta(state, delta!);
    expect(next.segments).toHaveLength(2);
    const newSeg = next.segments.find((s) => s.id !== "s1")!;
    expect(newSeg.recommendationIntent).toBeDefined();
    expect(newSeg.recommendationIntent!.source).toBe("explicit_ask");

    // 既存 s1 は完全に無傷
    const s1 = next.segments.find((s) => s.id === "s1")!;
    expect(s1.resolvedPlaceName).toBe("叙々苑 渋谷店");
    expect(s1.recommendationIntent).toBeUndefined();
  });

  test("『どこかいい店ない？』 + 単独 placeless segment → attach", async () => {
    const state = mkState([mkSeg({ id: "s1", activity: "ランチ" })]);
    const delta = await detectDelta("どこかいい店ない？", state);
    expect(delta).not.toBeNull();
    expect(delta!.changes[0].segmentId).toBe("s1");

    const next = applyDelta(state, delta!);
    expect(next.segments[0].recommendationIntent).toBeDefined();
  });
});

describe("W2-4 detectDelta — explicit 発話では emit しない", () => {
  test("『渋谷のスタバで作業』 → recommendation 経路にならず LLM フォールスルー (mock で error)", async () => {
    const state = mkState([]);
    // explicit_place なので recommendation 短絡は起きず、LLM 呼び出しに流れる。
    // mock が throw するので reject 確認で LLM へ到達したことを示す。
    await expect(detectDelta("渋谷のスタバで作業", state)).rejects.toThrow(
      /LLM should not be called/,
    );
  });

  test("『スタバでおすすめある？』 (explicit + phrase) → explicit_place 判定で LLM へ", async () => {
    const state = mkState([]);
    await expect(detectDelta("スタバでおすすめある？", state)).rejects.toThrow();
  });
});

describe("W2-4 applyDelta recommendationIntent 安全弁", () => {
  test("置換対象 seg に place が後付けで入っていた場合、intent を付けない", async () => {
    // target segment が途中で place を得てしまった状況を模擬
    const state = mkState([
      mkSeg({
        id: "s1",
        activity: "カフェ",
        place: "タリーズ", // 後付けで place が入った
        placeCanonical: "タリーズ",
      }),
    ]);
    // 手動で delta を作成: classifier は「カフェ」segment を候補にしうるが、
    // 実際 buildRecommendationDelta は place あり seg を除外。
    // ここでは直接 set を試みて applyFieldChange の安全弁を確認する。
    const delta = {
      turnType: "addition" as const,
      changes: [
        {
          type: "set" as const,
          segmentId: "s1",
          field: "recommendationIntent",
          newValue: {
            source: "explicit_ask",
            originalQuery: "おすすめ？",
            strategy: "category_only",
          } as unknown as Record<string, unknown>,
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    // 安全弁が効いて recommendationIntent は attach されない
    expect(next.segments[0].recommendationIntent).toBeUndefined();
    expect(next.segments[0].place).toBe("タリーズ");
  });
});

describe("W2-4 detectDelta — 文言揺れ", () => {
  test("『オススメある？』 (カタカナ)", async () => {
    const state = mkState([mkSeg({ id: "s1", activity: "ランチ" })]);
    const delta = await detectDelta("オススメある？", state);
    expect(delta).not.toBeNull();
    expect(delta!.changes[0].field).toBe("recommendationIntent");
  });

  test("『お薦めある？』 (漢字)", async () => {
    const state = mkState([mkSeg({ id: "s1", activity: "ランチ" })]);
    const delta = await detectDelta("お薦めある？", state);
    expect(delta).not.toBeNull();
  });

  test("『どこがいい？』", async () => {
    const state = mkState([mkSeg({ id: "s1", activity: "ディナー" })]);
    const delta = await detectDelta("どこがいい？", state);
    expect(delta).not.toBeNull();
  });
});
