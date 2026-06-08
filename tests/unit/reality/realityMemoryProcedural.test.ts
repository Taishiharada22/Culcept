/**
 * R1-5 Procedural Memory（pure）— CEO 補正: accept を成功と短絡しない。
 *   4 signal 分離（accepted/completed=unknown/confirmed/stable）・hypothesis 抑制・完了/有効/うまくいった を断定しない・
 *   adoption/deferral のみ（non_adoption は手順でない）・certainty ≤tentative。
 */
import { describe, it, expect } from "vitest";
import {
  assessProceduralSignals,
  tendencyToProceduralMemory,
  tendenciesToProceduralMemory,
  STABLE_MIN_EVIDENCE,
} from "@/lib/plan/reality/learning/memory-procedural";
import { memoryObservationHasViolation } from "@/lib/plan/reality/learning/memory-model";
import type { SecondSelfTendency } from "@/lib/plan/reality/learning/prm-model-entry-read";

function t(over: Partial<SecondSelfTendency> = {}): SecondSelfTendency {
  return {
    contextDimension: "band",
    contextValue: "evening",
    tendencyDirection: "adoption",
    favoredHypothesis: "now",
    stillPossible: [],
    evidenceCount: 6,
    counterCount: 0,
    certainty: "tentative",
    reviewed: true,
    userCorrection: null,
    ...over,
  };
}
// 完了/有効/成功を断定する語（procedural は絶対に出さない）
const COMPLETION_ASSERT = /うまくいった|完了した|有効です|成功し|間違いなく効く/;

describe("R1-5 assessProceduralSignals — 4 signal 分離", () => {
  it("completed は常に unknown（PRM レーンに completion data なし・捏造しない）", () => {
    expect(assessProceduralSignals(t()).completed).toBe("unknown");
    expect(assessProceduralSignals(t({ evidenceCount: 99 })).completed).toBe("unknown");
  });
  it("accepted = evidence>0", () => {
    expect(assessProceduralSignals(t({ evidenceCount: 1 })).accepted).toBe(true);
    expect(assessProceduralSignals(t({ evidenceCount: 0 })).accepted).toBe(false);
  });
  it("confirmed は外から join（既定 false）", () => {
    expect(assessProceduralSignals(t()).confirmed).toBe(false);
    expect(assessProceduralSignals(t(), { confirmed: true }).confirmed).toBe(true);
  });
  it("stable = evidence≥MIN ∧ counter==0 ∧ correction なし", () => {
    expect(assessProceduralSignals(t({ evidenceCount: STABLE_MIN_EVIDENCE, counterCount: 0 })).stable).toBe(true);
    expect(assessProceduralSignals(t({ evidenceCount: STABLE_MIN_EVIDENCE - 1 })).stable).toBe(false); // 証拠不足
    expect(assessProceduralSignals(t({ evidenceCount: 9, counterCount: 1 })).stable).toBe(false); // 反証あり
    expect(assessProceduralSignals(t({ evidenceCount: 9, userCorrection: "direction_adjusted" })).stable).toBe(false); // 訂正あり
  });
});

describe("R1-5 tendencyToProceduralMemory — hypothesis のみ", () => {
  it("non_adoption は手順でない → null", () => {
    expect(tendencyToProceduralMemory(t({ tendencyDirection: "non_adoption" }))).toBeNull();
  });
  it("adoption→取り入れる進め方 / deferral→後回しにする進め方", () => {
    expect(tendencyToProceduralMemory(t({ tendencyDirection: "adoption" }))!.observation).toContain("取り入れる進め方");
    expect(tendencyToProceduralMemory(t({ tendencyDirection: "deferral" }))!.observation).toContain("後回しにする進め方");
  });
  it("observation は『かもしれない/仮説』で抑制・完了/有効を断定しない・trait/断定なし", () => {
    const m = tendencyToProceduralMemory(t())!;
    expect(m.observation).toContain("かもしれない");
    expect(m.observation).toContain("仮説");
    expect(m.observation).not.toMatch(COMPLETION_ASSERT);
    expect(memoryObservationHasViolation(m.observation)).toBe(false);
    expect(m.kind).toBe("procedural");
  });
  it("certainty: stable は tendency certainty 継承(≤tentative)・非 stable は low", () => {
    expect(tendencyToProceduralMemory(t({ evidenceCount: 9, counterCount: 0, certainty: "tentative" }))!.certainty).toBe("tentative");
    expect(tendencyToProceduralMemory(t({ evidenceCount: 2, certainty: "tentative" }))!.certainty).toBe("low"); // 非 stable
  });
  it("confirmed 注記は本人確認時のみ", () => {
    expect(tendencyToProceduralMemory(t(), { confirmed: true })!.observation).toContain("本人が確認済み");
    expect(tendencyToProceduralMemory(t())!.userConfirmed).toBe(false);
  });
});

describe("R1-5 tendenciesToProceduralMemory", () => {
  it("adoption/deferral のみ・non_adoption skip・confirmedKeys で confirmed 付与", () => {
    const out = tendenciesToProceduralMemory(
      [t({ tendencyDirection: "adoption", contextValue: "evening" }), t({ tendencyDirection: "non_adoption", contextValue: "morning" }), t({ tendencyDirection: "deferral", contextValue: "afternoon" })],
      new Set(["band:evening"]),
    );
    expect(out).toHaveLength(2); // non_adoption 除外
    const evening = out.find((m) => m.context.value === "evening")!;
    expect(evening.userConfirmed).toBe(true); // confirmedKeys 命中
  });
});
