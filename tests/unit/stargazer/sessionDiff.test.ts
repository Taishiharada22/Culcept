import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import {
  computeSessionDiff,
  buildSessionDiffPromptBlock,
  buildSessionDiffAnalytics,
} from "@/lib/stargazer/sessionDiff";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// ── helpers ──

type Scores = Partial<Record<TraitAxisKey, number>>;

function scores(overrides: Record<string, number> = {}): Scores {
  return overrides as Scores;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeSessionDiff
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeSessionDiff", () => {
  it("変化なし → 空配列", () => {
    const prev = scores({ independence_vs_harmony: 0.5 });
    const curr = scores({ independence_vs_harmony: 0.5 });
    expect(computeSessionDiff(prev, curr)).toEqual([]);
  });

  it("小さすぎる変化（< 0.1）→ フィルタ除外", () => {
    const prev = scores({ independence_vs_harmony: 0.5 });
    const curr = scores({ independence_vs_harmony: 0.58 });
    expect(computeSessionDiff(prev, curr)).toEqual([]);
  });

  it("有意な変化（>= 0.1）→ 検出", () => {
    const prev = scores({ independence_vs_harmony: 0.3 });
    const curr = scores({ independence_vs_harmony: 0.5 });
    const result = computeSessionDiff(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].axis).toBe("independence_vs_harmony");
    expect(result[0].delta).toBeCloseTo(0.2);
    expect(result[0].direction).toBe("up");
  });

  it("負の変化 → direction = 'down'", () => {
    const prev = scores({ cautious_vs_bold: 0.7 });
    const curr = scores({ cautious_vs_bold: 0.4 });
    const result = computeSessionDiff(prev, curr);
    expect(result[0].direction).toBe("down");
  });

  it("最大3軸まで", () => {
    const prev = scores({
      independence_vs_harmony: 0.2,
      cautious_vs_bold: 0.2,
      detail_vs_big_picture: 0.2,
      emotional_regulation: 0.2,
      change_embrace_vs_resist: 0.2,
    });
    const curr = scores({
      independence_vs_harmony: 0.5,
      cautious_vs_bold: 0.6,
      detail_vs_big_picture: 0.7,
      emotional_regulation: 0.8,
      change_embrace_vs_resist: 0.4,
    });
    expect(computeSessionDiff(prev, curr).length).toBeLessThanOrEqual(3);
  });

  it("変化量の大きい順にソート", () => {
    const prev = scores({
      independence_vs_harmony: 0.5,
      cautious_vs_bold: 0.5,
    });
    const curr = scores({
      independence_vs_harmony: 0.6, // delta = 0.1
      cautious_vs_bold: 0.8,       // delta = 0.3
    });
    const result = computeSessionDiff(prev, curr);
    expect(result[0].axis).toBe("cautious_vs_bold");
  });

  it("片方に軸がない → スキップ", () => {
    const prev = scores({ independence_vs_harmony: 0.5 });
    const curr = scores({ cautious_vs_bold: 0.8 });
    expect(computeSessionDiff(prev, curr)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSessionDiffPromptBlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSessionDiffPromptBlock", () => {
  it("変化なし → null", () => {
    const prev = scores({ independence_vs_harmony: 0.5 });
    const curr = scores({ independence_vs_harmony: 0.5 });
    expect(buildSessionDiffPromptBlock(prev, curr)).toBeNull();
  });

  it("変化あり → ヘッダーと表出禁止ルール", () => {
    const prev = scores({ independence_vs_harmony: 0.3 });
    const curr = scores({ independence_vs_harmony: 0.5 });
    const result = buildSessionDiffPromptBlock(prev, curr)!;
    expect(result).toContain("前回からの変化");
    expect(result).toContain("表出禁止");
    expect(result).toContain("直接指摘しない");
  });

  it("変化が大きい → 'はっきりと'", () => {
    const prev = scores({ cautious_vs_bold: 0.3 });
    const curr = scores({ cautious_vs_bold: 0.6 });
    const result = buildSessionDiffPromptBlock(prev, curr)!;
    expect(result).toContain("はっきりと");
  });

  it("変化が小さめ → '少しだけ'", () => {
    const prev = scores({ cautious_vs_bold: 0.4 });
    const curr = scores({ cautious_vs_bold: 0.55 });
    const result = buildSessionDiffPromptBlock(prev, curr)!;
    expect(result).toContain("少しだけ");
  });

  it("体感言語で方向が表現される", () => {
    const prev = scores({ independence_vs_harmony: 0.3 });
    const curr = scores({ independence_vs_harmony: 0.6 });
    const result = buildSessionDiffPromptBlock(prev, curr)!;
    // independence_vs_harmony の右極（up方向）に動いたので右側のラベル
    expect(result).toContain("寄りに動いている");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildSessionDiffAnalytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildSessionDiffAnalytics", () => {
  it("差分なし → カウント0", () => {
    const analytics = buildSessionDiffAnalytics([], false);
    expect(analytics.session_diff_injected).toBe(false);
    expect(analytics.session_diff_axes_count).toBe(0);
    expect(analytics.session_diff_max_delta).toBe(0);
  });

  it("差分あり → カウントと最大delta", () => {
    const deltas = computeSessionDiff(
      scores({ independence_vs_harmony: 0.3, cautious_vs_bold: 0.5 }),
      scores({ independence_vs_harmony: 0.6, cautious_vs_bold: 0.7 }),
    );
    const analytics = buildSessionDiffAnalytics(deltas, true);
    expect(analytics.session_diff_injected).toBe(true);
    expect(analytics.session_diff_axes_count).toBe(2);
    expect(analytics.session_diff_max_delta).toBeCloseTo(0.3);
  });
});
