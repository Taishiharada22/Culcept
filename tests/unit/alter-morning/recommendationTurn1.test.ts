/**
 * Turn 1 Recommendation Classifier 統合 — W2-4 (CEO方針 2026-04-19)
 *
 * applyRecommendationClassifierToState() の挙動検証:
 *   - recommendation_request の発話は target segment に attach
 *   - explicit_place を含む segment は破壊しない (CEO 条件 1)
 *   - 場所無し activity segment があればそこに attach
 *   - segment が無ければ add する
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  normalizeLLMOutput,
  applyRecommendationClassifierToState,
} from "@/lib/alter-morning/llmPlanExtractor";

describe("W2-4 Turn 1 — applyRecommendationClassifierToState", () => {
  test("『サドヤ近くでおすすめのカフェない？』 → カフェ segment に intent", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "カフェ" },
      ],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "サドヤ近くでおすすめのカフェない？",
    );
    expect(updated.segments[0].recommendationIntent).toBeDefined();
    expect(updated.segments[0].recommendationIntent!.strategy).toBe(
      "anchor_proximity",
    );
    expect(updated.segments[0].recommendationIntent!.anchorHint).toBe("サドヤ");
  });

  test("CEO条件(1): explicit place 付き segment は破壊しない", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ランチ", place: "叙々苑" },
      ],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "おすすめある？",
    );
    // 既存 segment は変化せず、代わりに新規 segment 追加
    expect(updated.segments).toHaveLength(2);
    const existingLunch = updated.segments.find((s) => s.place === "叙々苑")!;
    expect(existingLunch.recommendationIntent).toBeUndefined();

    const newSeg = updated.segments.find((s) => s.place !== "叙々苑")!;
    expect(newSeg.recommendationIntent).toBeDefined();
  });

  test("explicit な発話 (「渋谷のスタバで」) → state 変化なし", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [{ order: 1, activity: "作業", place: "スタバ" }],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "渋谷のスタバで作業",
    );
    expect(updated.segments[0].recommendationIntent).toBeUndefined();
  });

  test("『いい店ない？』 単独 placeless segment → attach", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [{ order: 1, activity: "ランチ" }],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "いい店ない？",
    );
    expect(updated.segments[0].recommendationIntent).toBeDefined();
  });

  test("recommendation_request でない発話 → state そのまま", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [{ order: 1, activity: "仕事", place: "自宅" }],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "今日は家で仕事",
    );
    expect(updated).toBe(state); // reference equality — no change
  });

  test("segment 0 件 + recommendation_request → 新規 segment", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [],
    });
    const updated = applyRecommendationClassifierToState(
      state,
      "おすすめのカフェある？",
    );
    expect(updated.segments).toHaveLength(1);
    expect(updated.segments[0].recommendationIntent).toBeDefined();
    expect(updated.segments[0].activity).toBe("カフェ");
  });
});
