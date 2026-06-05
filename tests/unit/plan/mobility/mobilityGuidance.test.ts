import { describe, it, expect } from "vitest";
import {
  resolveMobilityGuidance,
  type MobilityGuidanceInput,
} from "@/lib/plan/mobility/mobilityGuidance";
import type { ModeBelief } from "@/lib/plan/mobility/mobilityHypothesis";

/** strong belief（train 7/walk 3・topShare 0.7・total 10 → strong → gate surface） */
function strongBelief(): ModeBelief {
  return { legKey: "a__b", counts: { train: 7, walk: 3 }, total: 10, topMode: "train", topShare: 0.7 };
}
/** split belief（5/5・topShare 0.5 → weak → gate silent） */
function splitBelief(): ModeBelief {
  return { legKey: "a__b", counts: { train: 5, walk: 5 }, total: 10, topMode: "train", topShare: 0.5 };
}
function emptyBelief(): ModeBelief {
  return { legKey: "a__b", counts: {}, total: 0, topMode: null, topShare: 0 };
}
function input(p: Partial<MobilityGuidanceInput>): MobilityGuidanceInput {
  return {
    belief: strongBelief(),
    selectedMode: null,
    readOnly: false,
    sensitive: false,
    recallMode: "bus",
    ...p,
  };
}

describe("resolveMobilityGuidance (v0-D guidance gate)", () => {
  it("readOnly → hypothesis 出さない・recall は既存のまま", () => {
    const g = resolveMobilityGuidance(input({ readOnly: true }));
    expect(g.hypothesisCopy).toBeNull();
    expect(g.recallMode).toBe("bus");
  });

  it("selectedMode あり → hypothesis 出さない", () => {
    expect(resolveMobilityGuidance(input({ selectedMode: "car" })).hypothesisCopy).toBeNull();
  });

  it("補正2: selectedMode undefined も未選択扱い → 条件成立で surface", () => {
    expect(resolveMobilityGuidance(input({ selectedMode: undefined })).hypothesisCopy?.surface).toBe(true);
  });

  it("sensitive → hypothesis 出さない・recall 既存", () => {
    const g = resolveMobilityGuidance(input({ sensitive: true }));
    expect(g.hypothesisCopy).toBeNull();
    expect(g.recallMode).toBe("bus");
  });

  it("cold-start(空 belief) → hypothesis 出さない・recall 既存", () => {
    const g = resolveMobilityGuidance(input({ belief: emptyBelief() }));
    expect(g.hypothesisCopy).toBeNull();
    expect(g.recallMode).toBe("bus");
  });

  it("split belief → hypothesis 出さない（断定回避）", () => {
    expect(resolveMobilityGuidance(input({ belief: splitBelief() })).hypothesisCopy).toBeNull();
  });

  it("★moderate+ 実belief・未選択・非readOnly・非sensitive → surface・recall 抑止(null)", () => {
    const g = resolveMobilityGuidance(input({}));
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.recallMode).toBeNull(); // ★hypothesis と recall を重複させない
  });

  it("hypothesis silent 時は recall を従来通り返す", () => {
    const g = resolveMobilityGuidance(input({ belief: emptyBelief(), recallMode: "train" }));
    expect(g.hypothesisCopy).toBeNull();
    expect(g.recallMode).toBe("train");
  });
});
