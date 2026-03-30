import { describe, it, expect } from "vitest";
import {
  integrateAxisScore,
  buildDualAxisScores,
  classifyDivergence,
  detectDivergences,
  computeMirrorConfidence,
  DEFAULT_MIRROR_WEIGHTS,
  SELF_ONLY_WEIGHTS,
  type MirrorAxisScore,
  type ThreeMirrorProfile,
} from "@/lib/stargazer/threeMirrors";

function makeMirror(overrides: Partial<MirrorAxisScore> = {}): MirrorAxisScore {
  return {
    axisId: "introvert_vs_extrovert" as never,
    selfPortrait: undefined,
    footprint: undefined,
    shadowPlay: undefined,
    counts: { selfPortrait: 0, footprint: 0, shadowPlay: 0 },
    ...overrides,
  };
}

describe("threeMirrors", () => {
  // ── Weight Configuration ──

  describe("デフォルト重み", () => {
    it("selfPortrait=0.30, footprint=0.35, shadowPlay=0.35", () => {
      expect(DEFAULT_MIRROR_WEIGHTS.selfPortrait).toBe(0.30);
      expect(DEFAULT_MIRROR_WEIGHTS.footprint).toBe(0.35);
      expect(DEFAULT_MIRROR_WEIGHTS.shadowPlay).toBe(0.35);
    });

    it("重みの合計が 1.0", () => {
      const total =
        DEFAULT_MIRROR_WEIGHTS.selfPortrait +
        DEFAULT_MIRROR_WEIGHTS.footprint +
        DEFAULT_MIRROR_WEIGHTS.shadowPlay;
      expect(total).toBeCloseTo(1.0, 5);
    });
  });

  // ── integrateAxisScore ──

  describe("integrateAxisScore", () => {
    it("全ミラーが存在する場合の重み付き統合 (30:35:35)", () => {
      const mirror = makeMirror({
        selfPortrait: 0.6,
        footprint: 0.2,
        shadowPlay: -0.4,
        counts: { selfPortrait: 3, footprint: 5, shadowPlay: 2 },
      });
      const result = integrateAxisScore(mirror);
      // (0.6*0.30 + 0.2*0.35 + (-0.4)*0.35) / (0.30+0.35+0.35)
      // = (0.18 + 0.07 + (-0.14)) / 1.0 = 0.11
      expect(result).toBeCloseTo(0.11, 2);
    });

    it("selfPortrait のみの場合はその値をそのまま返す", () => {
      const mirror = makeMirror({
        selfPortrait: 0.7,
        counts: { selfPortrait: 3, footprint: 0, shadowPlay: 0 },
      });
      const result = integrateAxisScore(mirror);
      expect(result).toBeCloseTo(0.7, 5);
    });

    it("全ミラーが未観測なら 0 を返す", () => {
      const mirror = makeMirror();
      const result = integrateAxisScore(mirror);
      expect(result).toBe(0);
    });

    it("footprint と shadowPlay のみ（自己申告なし）", () => {
      const mirror = makeMirror({
        footprint: 0.5,
        shadowPlay: -0.3,
        counts: { selfPortrait: 0, footprint: 3, shadowPlay: 2 },
      });
      const result = integrateAxisScore(mirror);
      // (0.5*0.35 + (-0.3)*0.35) / (0.35+0.35) = (0.175 - 0.105) / 0.70 ≈ 0.1
      expect(result).toBeCloseTo(0.1, 2);
    });

    it("SELF_ONLY_WEIGHTS で selfPortrait のみが使われる", () => {
      const mirror = makeMirror({
        selfPortrait: 0.8,
        footprint: -0.5,
        shadowPlay: 0.3,
        counts: { selfPortrait: 3, footprint: 5, shadowPlay: 2 },
      });
      const result = integrateAxisScore(mirror, SELF_ONLY_WEIGHTS);
      expect(result).toBeCloseTo(0.8, 5);
    });
  });

  // ── buildDualAxisScores ──

  describe("buildDualAxisScores", () => {
    it("subjective は selfPortrait のみ、objective は統合値", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          axisId: "introvert_vs_extrovert" as never,
          selfPortrait: 0.6,
          footprint: 0.2,
          shadowPlay: -0.1,
          counts: { selfPortrait: 3, footprint: 5, shadowPlay: 2 },
        }),
      };
      const { subjective, objective } = buildDualAxisScores(profile);
      expect(subjective.introvert_vs_extrovert).toBe(0.6);
      // objective は統合値
      expect(objective.introvert_vs_extrovert).toBeDefined();
      expect(objective.introvert_vs_extrovert).not.toBe(0.6);
    });
  });

  // ── classifyDivergence ──

  describe("classifyDivergence", () => {
    it("全ミラーが近い値なら all_aligned", () => {
      const mirror = makeMirror({
        selfPortrait: 0.5,
        footprint: 0.55,
        shadowPlay: 0.48,
        counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
      });
      expect(classifyDivergence(mirror)).toBe("all_aligned");
    });

    it("selfPortrait と footprint が大きくずれると self_vs_footprint", () => {
      const mirror = makeMirror({
        selfPortrait: 0.8,
        footprint: 0.2,
        shadowPlay: 0.25,
        counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
      });
      expect(classifyDivergence(mirror)).toBe("self_vs_footprint");
    });

    it("selfPortrait と shadowPlay が大きくずれると self_vs_shadow", () => {
      // self_vs_shadow の条件: spShDiverged && !fpShDiverged
      // → footprint は shadow に近く、self は遠い
      // self=0.8, footprint=0.4, shadow=0.35
      // sp-fp=0.4 (diverged), sp-sh=0.45 (diverged), fp-sh=0.05 (aligned)
      // divergedCount=2, spFpDiverged=true, spShDiverged=true, fpShDiverged=false
      // 最初にヒット: spFpDiverged && !fpShDiverged → "self_vs_footprint"
      // self_vs_shadow を得るには: spShDiverged && !fpShDiverged && !spFpDiverged
      // → self が shadow と遠く、footprint は shadow に近い、self は footprint にも近い... 矛盾
      // 実際には classifyDivergence のロジック上 self_vs_shadow は:
      // spFpDiverged=false && spShDiverged=true && fpShDiverged=false の時
      // つまり self だけが shadow と違い、fp は shadow にも self にも近い
      // self=0.8, fp=0.55, shadow=0.4
      // sp-fp=0.25 (aligned), sp-sh=0.4 (diverged), fp-sh=0.15 (aligned)
      const mirror = makeMirror({
        selfPortrait: 0.8,
        footprint: 0.55,
        shadowPlay: 0.4,
        counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
      });
      expect(classifyDivergence(mirror)).toBe("self_vs_shadow");
    });

    it("全ミラーがバラバラなら all_diverged", () => {
      const mirror = makeMirror({
        selfPortrait: 0.8,
        footprint: 0.0,
        shadowPlay: -0.8,
        counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
      });
      expect(classifyDivergence(mirror)).toBe("all_diverged");
    });
  });

  // ── detectDivergences ──

  describe("detectDivergences", () => {
    it("ミラーが1つしかない軸はスキップ", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          selfPortrait: 0.5,
          counts: { selfPortrait: 3, footprint: 0, shadowPlay: 0 },
        }),
      };
      const divergences = detectDivergences(profile);
      expect(divergences).toHaveLength(0);
    });

    it("ズレが大きい順にソートされる", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          axisId: "introvert_vs_extrovert" as never,
          selfPortrait: 0.8,
          footprint: -0.5,
          counts: { selfPortrait: 3, footprint: 3, shadowPlay: 0 },
        }),
        cautious_vs_bold: makeMirror({
          axisId: "cautious_vs_bold" as never,
          selfPortrait: 0.5,
          footprint: 0.1,
          counts: { selfPortrait: 3, footprint: 3, shadowPlay: 0 },
        }),
      };
      const divergences = detectDivergences(profile);
      if (divergences.length >= 2) {
        expect(divergences[0].magnitude).toBeGreaterThanOrEqual(
          divergences[1].magnitude
        );
      }
    });

    it("一致している軸は結果に含まれない", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          selfPortrait: 0.5,
          footprint: 0.52,
          shadowPlay: 0.48,
          counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
        }),
      };
      const divergences = detectDivergences(profile);
      expect(divergences).toHaveLength(0);
    });
  });

  // ── computeMirrorConfidence ──

  describe("computeMirrorConfidence", () => {
    it("空プロファイルで overall 0", () => {
      const confidence = computeMirrorConfidence({});
      expect(confidence.overall).toBe(0);
      expect(confidence.alignedAxesCount).toBe(0);
      expect(confidence.divergentAxesCount).toBe(0);
    });

    it("全軸一致で高い overall", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          selfPortrait: 0.5,
          footprint: 0.52,
          shadowPlay: 0.48,
          counts: { selfPortrait: 3, footprint: 3, shadowPlay: 3 },
        }),
      };
      const confidence = computeMirrorConfidence(profile);
      expect(confidence.alignedAxesCount).toBe(1);
      expect(confidence.divergentAxesCount).toBe(0);
      expect(confidence.overall).toBeGreaterThan(0);
    });

    it("perMirror にカバレッジ情報が含まれる", () => {
      const profile: Partial<ThreeMirrorProfile> = {
        introvert_vs_extrovert: makeMirror({
          selfPortrait: 0.5,
          counts: { selfPortrait: 3, footprint: 0, shadowPlay: 0 },
        }),
      };
      const confidence = computeMirrorConfidence(profile);
      expect(confidence.perMirror.self_portrait).toBe(1); // 1/1
      expect(confidence.perMirror.footprint).toBe(0);
      expect(confidence.perMirror.shadow_play).toBe(0);
    });
  });
});
