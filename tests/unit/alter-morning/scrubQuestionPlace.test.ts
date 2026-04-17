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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO方針 2026-04-17 P1-a: 平叙文「近くのカフェ」→ placeSearchHint 昇格
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// scrubQuestionPlace は疑問形（「〜ないかな？」等）のみを対象とする。
// 平叙文（「その後18時から高橋さんと近くのカフェでミーティング」の「近くのカフェ」）は
// LLM がそのまま place に入れると、resolver が generic_place として処理し、
// userArea（居住地）を query に付けて遠方を検索してしまう。
//
// P1-a は normalizeLLMOutput の post-process で、こうした declarative 近接表現を
// placeSearchHint に昇格し、place をクリアする。nearAnchorLabel は prefix か
// 直前セグメントの place を使う。anchorScore も下げる（anchor になってはいけない）。

describe("P1-a: applyDeclarativeNearAnchorHints（平叙文 near-anchor）", () => {
  test("直前 segment あり: 「近くのカフェ」→ nearAnchorLabel=直前の place、searchCategory=カフェ", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ランチ", startTime: "12:00", place: "サドヤ", companions: ["田中さん"] },
        { order: 2, activity: "ミーティング", startTime: "18:00", place: "近くのカフェ", companions: ["高橋さん"] },
      ],
      goOut: true,
    });
    const seg2 = state.segments[1];
    // place はクリアされる（resolver が generic_place として userArea を付けないように）
    expect(seg2.place).toBeUndefined();
    // placeSearchHint が立つ
    expect(seg2.placeSearchHint).toBeDefined();
    expect(seg2.placeSearchHint!.searchCategory).toBe("カフェ");
    // prefix 空 → 直前 segment の place（サドヤ）が nearAnchorLabel になる
    expect(seg2.placeSearchHint!.nearAnchorLabel).toBe("サドヤ");
    expect(seg2.placeSearchHint!.originalQuery).toBe("近くのカフェ");
    // placeType も無効化
    expect(seg2.placeType).toBeUndefined();
  });

  test("prefix あり: 「サドヤの付近のレストラン」→ nearAnchorLabel=サドヤ", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ディナー", startTime: "19:00", place: "サドヤの付近のレストラン" },
      ],
      goOut: true,
    });
    const seg = state.segments[0];
    expect(seg.place).toBeUndefined();
    expect(seg.placeSearchHint).toBeDefined();
    expect(seg.placeSearchHint!.nearAnchorLabel).toBe("サドヤ");
    expect(seg.placeSearchHint!.searchCategory).toBe("レストラン");
  });

  test("PLACE_CATEGORY_KEYWORDS に無いカテゴリ（「近くの田中さん」等）は昇格しない（誤爆防止）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "合流", place: "近くの田中さん" },
      ],
      goOut: true,
    });
    const seg = state.segments[0];
    // category と確定できないなら hint 化せず、place もそのまま保持
    expect(seg.placeSearchHint).toBeUndefined();
    expect(seg.place).toBe("近くの田中さん");
  });

  test("既存 placeSearchHint（疑問文 scrub 済み）は上書きしない", () => {
    // 疑問形 + 近接表現 → scrubQuestionPlace で先に hint 化される。
    // その後 P1-a post-process が走っても上書きされないこと。
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "休憩", place: "サドヤ近くのカフェないかな？" },
      ],
      goOut: true,
    });
    const seg = state.segments[0];
    expect(seg.placeSearchHint).toBeDefined();
    // scrubQuestionPlace 由来の originalQuery（疑問形）が保持されている
    expect(seg.placeSearchHint!.originalQuery).toContain("ないかな");
  });

  test("平叙文 hint 化された segment の anchorScore は下がる（anchor 化されない）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ランチ", startTime: "12:00", place: "サドヤ", companions: ["田中さん"] },
        { order: 2, activity: "ミーティング", startTime: "18:00", place: "近くのカフェ", companions: ["高橋さん"] },
      ],
      goOut: true,
    });
    const seg2 = state.segments[1];
    // anchorScore は anchor 化閾値 (HARD_ANCHOR_THRESHOLD=4) を下回っていなければならない
    expect((seg2.anchorScore ?? 0)).toBeLessThan(4);
  });

  test("prefix も直前 segment も無い単独の「近くのカフェ」は hint だけ立ち、resolver 側防御に委ねる", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "休憩", place: "近くのカフェ" },
      ],
      goOut: true,
    });
    const seg = state.segments[0];
    expect(seg.place).toBeUndefined();
    expect(seg.placeSearchHint).toBeDefined();
    expect(seg.placeSearchHint!.searchCategory).toBe("カフェ");
    // anchor が見つからないケースは nearAnchorLabel は undefined のまま
    expect(seg.placeSearchHint!.nearAnchorLabel).toBeUndefined();
  });
});
