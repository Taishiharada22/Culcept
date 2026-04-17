/**
 * Block 1-(2) 安全弁: 疑問文 place の scrub + placeSearchHint 生成
 *
 * CEO方針 2026-04-17:
 *   ユーザーが「サドヤ近くのカフェないかな？」のように疑問形で場所を探してほしいと言った場合、
 *   LLM がその疑問文を place にそのまま入れてしまうと predicate literal として扱われ、
 *   place confirm dialog に「サドヤ近くのカフェないかな？であってる？」が出る失敗に繋がる。
 *
 *   本テストは normalizeLLMOutput が post-filter で scrub し、
 *   - place を表示可能な label（疑問マーカー除去）に整える
 *   - placeSearchHint を付与（Block 2 で find_near_anchor エンジンが拾う）
 *   - detectMissingFields が segmentPlace を missing 扱いしない
 *   の 3 点を保証する。
 */

import { describe, test, expect, beforeAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();

  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
});

describe("Block 1-(2) 安全弁: scrubQuestionPlace", () => {
  test("「サドヤ近くのカフェないかな？」 → place=サドヤ近くのカフェ + placeSearchHint", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", place: "サドヤ近くのカフェないかな？" },
      ],
    });
    const seg = state.segments[0];
    // place は疑問マーカー除去された表示ラベル
    expect(seg.place).toBe("サドヤ近くのカフェ");
    // placeSearchHint が付与される
    expect(seg.placeSearchHint).toBeDefined();
    expect(seg.placeSearchHint!.nearAnchorLabel).toBe("サドヤ");
    expect(seg.placeSearchHint!.searchCategory).toBe("カフェ");
    expect(seg.placeSearchHint!.originalQuery).toBe("サドヤ近くのカフェないかな？");
  });

  test("「〜ある？」パターンも scrub される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ランチ", place: "新宿駅付近のレストランある？" },
      ],
    });
    const seg = state.segments[0];
    expect(seg.placeSearchHint).toBeDefined();
    expect(seg.placeSearchHint!.nearAnchorLabel).toBe("新宿駅");
    expect(seg.placeSearchHint!.searchCategory).toBe("レストラン");
  });

  test("普通の固有名詞は scrub されない（passthrough）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", place: "スターバックス渋谷店" },
      ],
    });
    const seg = state.segments[0];
    expect(seg.place).toBe("スターバックス渋谷店");
    expect(seg.placeSearchHint).toBeUndefined();
  });

  test("「自宅」のような known_base も scrub されない", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", place: "自宅" },
      ],
    });
    const seg = state.segments[0];
    expect(seg.place).toBe("自宅");
    expect(seg.placeSearchHint).toBeUndefined();
  });

  test("疑問文 place は anchor にならない（anchorScore が下がる）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", place: "サドヤ近くのカフェないかな？" },
      ],
    });
    const seg = state.segments[0];
    // 疑問文は固有名詞扱いしないため、placeType が exact_proper_noun になってはいけない
    expect(seg.placeType).not.toBe("exact_proper_noun");
  });

  test("placeSearchHint がある segment は detectMissingFields で segmentPlace 扱いにならない", () => {
    // 打ち合わせ + placeSearchHint → 「どこで？」を聞かずに Block 2 に委ねる
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", place: "サドヤ近くのカフェないかな？", companions: ["Aさん"] },
      ],
      goOut: true,
    });
    // missingFields に segmentPlace が入っていないこと
    const segmentPlaceMissing = state.missingFields?.filter((f) => f.startsWith("segmentPlace:")) ?? [];
    expect(segmentPlaceMissing).toEqual([]);
  });

  test("placeSearchHint なし + 打ち合わせ + place なし → segmentPlace が missing になる（レグレッション防止）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", companions: ["Aさん"] },
      ],
      goOut: true,
    });
    const segmentPlaceMissing = state.missingFields?.filter((f) => f.startsWith("segmentPlace:")) ?? [];
    expect(segmentPlaceMissing.length).toBe(1);
  });
});
