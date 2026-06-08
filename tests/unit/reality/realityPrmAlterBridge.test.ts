/**
 * A1-7-36 PRM ⇄ Alter Bridge（pure）— resolvePrmContext relevance gating + buildPrmTendencyBlock 非断定。
 *   fail-closed(band 不明→[])・band 一致のみ・rejected/薄い/counter 支配 除外・上位 K・
 *   block は断定語/ trait 語なし・counter/訂正 併記・「現在発話優先」「確信上げない」「verbatim 禁止」明記。
 */
import { describe, it, expect } from "vitest";
import {
  resolvePrmContext,
  buildPrmTendencyBlock,
  bandFromHour,
  DEFAULT_PRM_BRIDGE_CONFIG,
} from "@/lib/plan/reality/learning/prm-alter-bridge";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";

function t(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return {
    contextDimension: "band",
    contextValue: "evening",
    tendencyDirection: "non_adoption",
    favoredHypothesis: "not_now",
    stillPossible: ["not_selected"],
    evidenceCount: 6,
    counterCount: 1,
    certainty: "tentative",
    reviewed: true,
    userCorrection: null,
    ...over,
  };
}
const ASSERT = /あなたは.*です|必ず|絶対|間違いなく|に決まって|すべきだ/;
const TRAIT = /性格|怠惰|だらしな|人格/;

describe("A1-7-36 resolvePrmContext — fail-closed relevance gating", () => {
  it("band 不明/none → [](注入しない・fail-closed)", () => {
    expect(resolvePrmContext([t()], {})).toEqual([]);
    expect(resolvePrmContext([t()], { band: "none" })).toEqual([]);
  });
  it("band 一致のみ通す（不一致 band は除外）", () => {
    const r = resolvePrmContext([t({ contextValue: "evening" }), t({ contextValue: "morning" })], { band: "evening" });
    expect(r).toHaveLength(1);
    expect(r[0]!.contextValue).toBe("evening");
  });
  it("band 以外の dimension は除外", () => {
    expect(resolvePrmContext([t({ contextDimension: "durationBucket" })], { band: "evening" })).toEqual([]);
  });
  it("rejected / 薄い evidence / counter 支配 を除外", () => {
    expect(resolvePrmContext([t({ userCorrection: "rejected" })], { band: "evening" })).toEqual([]);
    expect(resolvePrmContext([t({ evidenceCount: 3 })], { band: "evening" })).toEqual([]); // < E_MIN(4)
    expect(resolvePrmContext([t({ evidenceCount: 4, counterCount: 4 })], { band: "evening" })).toEqual([]); // counter 非劣
  });
  it("evidence 上位 K(=2) に制限", () => {
    const r = resolvePrmContext(
      [t({ evidenceCount: 5 }), t({ evidenceCount: 9 }), t({ evidenceCount: 7 })],
      { band: "evening" },
      DEFAULT_PRM_BRIDGE_CONFIG,
    );
    expect(r.map((x) => x.evidenceCount)).toEqual([9, 7]);
  });
  it("direction_adjusted/context_refined は残す（rejected のみ除外）", () => {
    expect(resolvePrmContext([t({ userCorrection: "direction_adjusted" })], { band: "evening" })).toHaveLength(1);
    expect(resolvePrmContext([t({ userCorrection: "context_refined" })], { band: "evening" })).toHaveLength(1);
  });
});

describe("A1-7-36 buildPrmTendencyBlock — 非断定・内部参照", () => {
  it("空 → null", () => {
    expect(buildPrmTendencyBlock([])).toBeNull();
  });
  it("断定語/ trait 語を含まない", () => {
    const block = buildPrmTendencyBlock([t(), t({ contextValue: "evening", tendencyDirection: "deferral" })])!;
    expect(block).not.toMatch(ASSERT);
    expect(block).not.toMatch(TRAIT);
  });
  it("counter / 現在発話優先 / 確信上げない / verbatim 禁止 を明記", () => {
    const block = buildPrmTendencyBlock([t({ counterCount: 2 })])!;
    expect(block).toContain("反証 2 件");
    expect(block).toContain("今この人が言っていることを最優先");
    expect(block).toContain("確信を上げない");
    expect(block).toContain("そのまま引用しない");
  });
  it("方向動詞マップ（adoption 取り入れ / non_adoption 見送り / deferral 後回し）", () => {
    expect(buildPrmTendencyBlock([t({ tendencyDirection: "adoption" })])!).toContain("取り入れやすい");
    expect(buildPrmTendencyBlock([t({ tendencyDirection: "non_adoption" })])!).toContain("見送りやすい");
    expect(buildPrmTendencyBlock([t({ tendencyDirection: "deferral" })])!).toContain("後回しにしやすい");
  });
  it("user_correction を併記", () => {
    expect(buildPrmTendencyBlock([t({ userCorrection: "direction_adjusted" })])!).toContain("向きを調整");
    expect(buildPrmTendencyBlock([t({ userCorrection: "context_refined" })])!).toContain("文脈を補った");
  });
});

describe("A1-7-36 bandFromHour", () => {
  it("時刻→band（深夜/NaN は none＝注入しない）", () => {
    expect(bandFromHour(9)).toBe("morning");
    expect(bandFromHour(14)).toBe("afternoon");
    expect(bandFromHour(20)).toBe("evening");
    expect(bandFromHour(2)).toBe("none");
    expect(bandFromHour(23)).toBe("none");
    expect(bandFromHour(Number.NaN)).toBe("none");
  });
});
