// tests/unit/plan/postVisit/shadowFusion.test.ts
// 評価OS ②-2: shadow 融合集計（階層ベイズ・partial pooling）の検証。
//   B_u=grand mean・Q_p=baseline へ縮約・薄い場所ほど縮約強・多観測で rawMean へ収束・
//   shrinkage=k/(n+k)・I_{u,p}=0 凍結・決定論・観測ゼロは中立 0.5。
import { describe, it, expect } from "vitest";
import {
  computeUserBaseline,
  computePlacePosterior,
  buildShadowFusion,
  SHRINKAGE_PRIOR_STRENGTH,
  NEUTRAL_PRIOR,
} from "@/lib/plan/postVisit/shadowFusion";
import { buildPostVisitObservation, type PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";

function obs(place: string, resp: "keep" | "conditional" | "not_today" | "no_more" | null): PostVisitObservation {
  return buildPostVisitObservation({ placeDescriptor: place, lens: "focus_work", trigger: "past_plan", response: resp, at: 1 });
}
const FIT = { keep: 1.0, conditional: 0.6, not_today: 0.35, no_more: 0.0 };

describe("computeUserBaseline — B_u", () => {
  it("★全回答の grand mean", () => {
    const b = computeUserBaseline([obs("A", "keep"), obs("B", "no_more")]); // (1+0)/2
    expect(b.mean).toBeCloseTo(0.5);
    expect(b.n).toBe(2);
  });
  it("★観測ゼロ → 中立 prior 0.5・n=0", () => {
    const b = computeUserBaseline([]);
    expect(b.mean).toBe(NEUTRAL_PRIOR);
    expect(b.n).toBe(0);
  });
  it("★未回答は B_u に寄与しない", () => {
    expect(computeUserBaseline([obs("A", "keep"), obs("B", null)]).n).toBe(1);
  });
});

describe("computePlacePosterior — Q_p partial pooling", () => {
  const baseline = { mean: 0.5, n: 10 };
  const keyA = obs("A", "keep").placeKey; // ★hash 後の実 placeKey を使う
  it("★1件の場所は baseline へ強く縮約（過信しない）", () => {
    const p = computePlacePosterior([obs("A", "keep")], keyA, baseline); // rawMean=1.0
    // posterior = (1.0*1 + 0.5*2)/(1+2) = 2.0/3 ≈ 0.667（生の 1.0 より baseline 寄り）
    expect(p.rawMean).toBe(1.0);
    expect(p.posteriorMean).toBeCloseTo(2 / 3);
    expect(p.posteriorMean).toBeLessThan(p.rawMean!); // 縮約されている
    expect(p.shrinkage).toBeCloseTo(2 / 3);
    expect(p.state).toBe("tentative");
  });
  it("★観測が増えるほど rawMean へ収束（縮約弱まる）", () => {
    const many = Array.from({ length: 20 }, () => obs("A", "keep"));
    const p = computePlacePosterior(many, keyA, baseline);
    expect(p.n).toBe(20);
    expect(p.posteriorMean).toBeGreaterThan(0.9); // rawMean=1.0 にほぼ収束
    expect(p.shrinkage).toBeCloseTo(SHRINKAGE_PRIOR_STRENGTH / (20 + SHRINKAGE_PRIOR_STRENGTH));
    expect(p.state).toBe("observed");
  });
  it("★観測ゼロの場所 → posterior=baseline・state=insufficient・rawMean=null", () => {
    const p = computePlacePosterior([], keyA, baseline);
    expect(p.rawMean).toBeNull();
    expect(p.posteriorMean).toBeCloseTo(baseline.mean);
    expect(p.state).toBe("insufficient");
  });
});

describe("buildShadowFusion — 全 place + I_{u,p} 凍結", () => {
  it("★place ごとの Q_p を posteriorMean 降順で返す・interactionFrozen", () => {
    const data = [
      obs("Good", "keep"), obs("Good", "keep"), obs("Good", "keep"),
      obs("Bad", "no_more"), obs("Bad", "no_more"), obs("Bad", "no_more"),
    ];
    const f = buildShadowFusion(data);
    expect(f.interactionFrozen).toBe(true);
    expect(f.baseline.mean).toBeCloseTo(0.5); // (1*3+0*3)/6
    expect(f.places.length).toBe(2);
    expect(f.places[0]!.posteriorMean).toBeGreaterThan(f.places[1]!.posteriorMean); // Good が上
    // Good(rawMean=1) は baseline 0.5 へ縮約され 1.0 未満
    expect(f.places[0]!.posteriorMean).toBeLessThan(1.0);
    expect(f.places[0]!.posteriorMean).toBeGreaterThan(0.5);
  });
  it("★未回答のみ → places 空（shadow も光らせない）", () => {
    expect(buildShadowFusion([obs("A", null)]).places).toEqual([]);
  });
  it("★決定論（同入力→同出力・shadow=ranking 非依存）", () => {
    const data = [obs("A", "keep"), obs("B", "conditional"), obs("A", "no_more")];
    expect(buildShadowFusion(data)).toEqual(buildShadowFusion(data));
  });
  it("★fit 値整合（keep>conditional>not_today>no_more）", () => {
    expect(FIT.keep).toBeGreaterThan(FIT.conditional);
    expect(FIT.not_today).toBeGreaterThan(FIT.no_more);
  });
});
