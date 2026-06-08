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
    expect(g.surfacedMode).toBeNull();
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
    expect(g.surfacedMode).toBe("train"); // v0-E: feedback kind 判定用
  });

  it("hypothesis silent 時は recall を従来通り返す", () => {
    const g = resolveMobilityGuidance(input({ belief: emptyBelief(), recallMode: "train" }));
    expect(g.hypothesisCopy).toBeNull();
    expect(g.recallMode).toBe("train");
  });
});

// ★A2-7: weather pass-through（屋外 mode×悪天候の contextNote のみ・mode は変えない）
describe("resolveMobilityGuidance — A2-7 weather contextNote", () => {
  /** bicycle 優勢（屋外露出 mode・strong → surface） */
  function bicycleBelief(): ModeBelief {
    return { legKey: "a__b", counts: { bicycle: 7, train: 3 }, total: 10, topMode: "bicycle", topShare: 0.7 };
  }

  it("★weather なし → contextNoteText なし（後方互換）", () => {
    const g = resolveMobilityGuidance(input({ belief: bicycleBelief() }));
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.hypothesisCopy?.contextNoteText).toBeNull();
  });
  it("★weather=rain × 屋外 habitual(bicycle) → contextNoteText 出る（注意のみ）", () => {
    const g = resolveMobilityGuidance(input({ belief: bicycleBelief(), weather: "rain" }));
    expect(g.hypothesisCopy?.contextNoteText).not.toBeNull();
    expect(g.surfacedMode).toBe("bicycle"); // ★mode は変わらない（雨でも bicycle のまま）
  });
  it("★A2-8: weather=snow/storm × 屋外 habitual → 雪/荒天の注意（mode 不変）", () => {
    const snow = resolveMobilityGuidance(input({ belief: bicycleBelief(), weather: "snow" }));
    expect(snow.hypothesisCopy?.contextNoteText).toContain("雪");
    expect(snow.surfacedMode).toBe("bicycle"); // mode 不変
    expect(resolveMobilityGuidance(input({ belief: bicycleBelief(), weather: "storm" })).hypothesisCopy?.contextNoteText).toContain("荒天");
  });
  it("★weather=rain × 非屋外 habitual(train) → contextNoteText なし（屋外露出のみ）", () => {
    const g = resolveMobilityGuidance(input({ belief: strongBelief(), weather: "rain" }));
    expect(g.hypothesisCopy?.contextNoteText).toBeNull();
  });
  it("weather=normal → contextNoteText なし", () => {
    expect(resolveMobilityGuidance(input({ belief: bicycleBelief(), weather: "normal" })).hypothesisCopy?.contextNoteText).toBeNull();
  });
});
