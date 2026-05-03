/**
 * originAnchorExtractor unit tests (= CEO/GPT 2026-05-03 PR #75 C 案 訂正後)
 *
 * 重要 (= CEO 2026-05-03 訂正):
 *   旧 (PR #73): bare 「Xから」 で X を journeyOrigin に extract
 *     → 過剰昇格 (= 「明日8時東京駅から渋谷へ」 で「東京駅」 が day-level journeyOrigin に)
 *   新 (PR #75 C 案): 明示 day-origin signal のみ catch
 *     - 「Xから一日を始める」「Xから1日を始める」「Xから今日を始める」「Xからスタート」
 *     - 「Xを出発地にして」「Xを起点に」「Xを始点に」
 *     - 「X集合で...そのまま|直接|連れて」
 *
 *   bare 「XからY」 構文は本関数では catch しない (= fromToTravelEdgeReconciler が travel edge として扱う)。
 */

import { describe, it, expect } from "vitest";
import {
  extractOriginAnchorFromUtterance,
  stripTemporalPrefix,
} from "@/lib/alter-morning/journey/originAnchorExtractor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Positive (= 明示 day-origin signal のみ採用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Positive] 明示 day-origin signal extract", () => {
  it("「東京駅から一日を始める」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅から一日を始める");
    expect(r?.kind).toBe("known_label_only");
    if (r?.kind === "known_label_only") {
      expect(r.label).toBe("東京駅");
      expect(r.source).toBe("user_declared");
    }
  });

  it("「東京駅から1日を始める」 → 東京駅 (= 算用数字)", () => {
    const r = extractOriginAnchorFromUtterance("東京駅から1日を始める");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });

  it("「東京駅から今日を始める」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅から今日を始める");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });

  it("「東京駅からスタート」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅からスタート");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });

  it("「東京駅を出発地にして渋谷へ」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅を出発地にして渋谷へ");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });

  it("「東京駅を起点に動く」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅を起点に動く");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });

  it("「東京駅集合でそのまま渋谷へ」 → 東京駅", () => {
    const r = extractOriginAnchorFromUtterance("東京駅集合でそのまま渋谷へ");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Negative (= bare 「XからY」 構文は travel edge 扱い、 ここでは catch しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Negative C 案] bare 「XからY」 構文は catch しない (= travel edge 扱い)", () => {
  it("「東京駅から渋谷へ」 → null (= 単純 travel、 day-origin signal なし)", () => {
    expect(extractOriginAnchorFromUtterance("東京駅から渋谷へ")).toBeNull();
  });

  it("「明日8時東京駅から渋谷へ」 → null (= 単純 travel)", () => {
    expect(
      extractOriginAnchorFromUtterance("明日8時東京駅から渋谷へ"),
    ).toBeNull();
  });

  it("「成田空港から行きます」 → null (= bare から、 day-origin signal なし)", () => {
    expect(extractOriginAnchorFromUtterance("成田空港から行きます")).toBeNull();
  });

  it("「東京駅を出て渋谷へ」 → null (= 旧 PATTERN_OUT 削除、 travel edge 扱い)", () => {
    expect(extractOriginAnchorFromUtterance("東京駅を出て渋谷へ")).toBeNull();
  });

  it("「東京駅発で渋谷へ」 → null (= 旧 PATTERN_HATSU 削除、 travel edge 扱い)", () => {
    expect(extractOriginAnchorFromUtterance("東京駅発で渋谷へ")).toBeNull();
  });
});

describe("[Negative] 誤爆防止 (= 既存)", () => {
  it("「これから一日を始める」 → null (= 「これ」 ambiguous)", () => {
    expect(extractOriginAnchorFromUtterance("これから一日を始める")).toBeNull();
  });

  it("「明日から始める」 → null (= temporal strip → empty)", () => {
    expect(extractOriginAnchorFromUtterance("明日から始める")).toBeNull();
  });

  it("「カフェからスタート」 → null (= 「カフェ」 generic、 採用するが要件次第)", () => {
    // 注: 「カフェ」 は generic_category。 day-origin signal なら採用してもよいが、
    // 現実的には generic だけで day-origin にするのは過剰。 classifyLabel public_poi のみ採用が
    // 安全側。 本関数は public_poi_proper_noun のみ採用 → null
    const r = extractOriginAnchorFromUtterance("カフェからスタート");
    expect(r).toBeNull();
  });

  it("「あそこからスタート」 → null (= 「あそこ」 ambiguous)", () => {
    expect(extractOriginAnchorFromUtterance("あそこからスタート")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[Edge] edge cases", () => {
  it("空文字 → null", () => {
    expect(extractOriginAnchorFromUtterance("")).toBeNull();
  });

  it("「から」 単独 → null", () => {
    expect(extractOriginAnchorFromUtterance("から")).toBeNull();
  });

  it("「、東京駅から一日を始める」 → 東京駅 (= 句読点 delimiter)", () => {
    const r = extractOriginAnchorFromUtterance("、東京駅から一日を始める");
    expect(r?.kind === "known_label_only" ? r.label : null).toBe("東京駅");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// stripTemporalPrefix (= 既存ヘルパ、 引き続き使用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[stripTemporalPrefix]", () => {
  it("「明日東京駅」 → 東京駅", () => {
    expect(stripTemporalPrefix("明日東京駅")).toBe("東京駅");
  });

  it("「明日 8 時東京駅」 → 東京駅", () => {
    expect(stripTemporalPrefix("明日 8 時東京駅")).toBe("東京駅");
  });

  it("「明日8時30分東京駅」 → 東京駅", () => {
    expect(stripTemporalPrefix("明日8時30分東京駅")).toBe("東京駅");
  });

  it("「朝東京駅」 → 東京駅", () => {
    expect(stripTemporalPrefix("朝東京駅")).toBe("東京駅");
  });

  it("「東京駅」 → 東京駅 (= no temporal、unchanged)", () => {
    expect(stripTemporalPrefix("東京駅")).toBe("東京駅");
  });

  it("「明日 8 時」 → 空文字", () => {
    expect(stripTemporalPrefix("明日 8 時")).toBe("");
  });
});
