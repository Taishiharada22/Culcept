/**
 * R1-6 Preference Memory（pure）— CEO 補正: trait/fixed/liked-disliked を断定しない・context-bound・tentative。
 *   好き/嫌い 語を出さない・最大 strength=leaning・rejected は好みにしない・certainty ≤tentative。
 */
import { describe, it, expect } from "vitest";
import {
  preferenceStrength,
  tendencyToPreferenceMemory,
  tendenciesToPreferenceMemory,
  LEANING_MIN_EVIDENCE,
} from "@/lib/plan/reality/learning/memory-preference";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
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
const LIKED_DISLIKED = /好き|嫌い|苦手|大好き|お気に入り/;
const FIXED_TRAIT = /いつも|常に|性格|fixed/;

describe("R1-6 preferenceStrength — 最大 leaning（trait 化しない）", () => {
  it("反復で faint/leaning（fixed は作らない）", () => {
    expect(preferenceStrength(LEANING_MIN_EVIDENCE)).toBe("leaning");
    expect(preferenceStrength(LEANING_MIN_EVIDENCE - 1)).toBe("faint");
  });
});

describe("R1-6 tendencyToPreferenceMemory — context-bound tentative", () => {
  it("rejected は好みにしない → null", () => {
    expect(tendencyToPreferenceMemory(t({ userCorrection: "rejected" }))).toBeNull();
  });
  it("direction → 行動の寄り（価値でない）", () => {
    expect(tendencyToPreferenceMemory(t({ tendencyDirection: "adoption" }))!.observation).toContain("取り入れる方に寄せる");
    expect(tendencyToPreferenceMemory(t({ tendencyDirection: "non_adoption" }))!.observation).toContain("見送る方に寄せる");
    expect(tendencyToPreferenceMemory(t({ tendencyDirection: "deferral" }))!.observation).toContain("後回しにする余地を残す");
  });
  it("好き/嫌い を断定しない・trait/fixed/断定なし・context 句を含む", () => {
    for (const d of ["adoption", "non_adoption", "deferral"] as const) {
      const m = tendencyToPreferenceMemory(t({ tendencyDirection: d }))!;
      expect(m.observation).not.toMatch(LIKED_DISLIKED);
      expect(m.observation).not.toMatch(FIXED_TRAIT);
      expect(memoryObservationHasViolation(m.observation)).toBe(false);
      expect(m.observation).toContain("うかがえるかもしれない"); // hedged
    }
  });
  it("context-bound（global でなく文脈句に束縛）", () => {
    const m = tendencyToPreferenceMemory(t({ contextValue: "evening" }))!;
    expect(m.context).toEqual({ dimension: "band", value: "evening" });
    expect(m.observation).toContain("夜の予定");
  });
  it("certainty: leaning かつ tendency tentative のみ tentative・他は low", () => {
    expect(tendencyToPreferenceMemory(t({ evidenceCount: 6, certainty: "tentative" }))!.certainty).toBe("tentative");
    expect(tendencyToPreferenceMemory(t({ evidenceCount: 2, certainty: "tentative" }))!.certainty).toBe("low"); // faint
    expect(tendencyToPreferenceMemory(t({ evidenceCount: 6, certainty: "low" }))!.certainty).toBe("low"); // tendency low 継承
  });
});

describe("R1-6 tendenciesToPreferenceMemory", () => {
  it("rejected skip・confirmedKeys で confirmed 注記", () => {
    const out = tendenciesToPreferenceMemory(
      [t({ contextValue: "evening" }), t({ contextValue: "morning", userCorrection: "rejected" })],
      new Set(["band:evening"]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.userConfirmed).toBe(true);
    expect(out[0]!.observation).toContain("本人が確認した寄り");
  });
});
