/**
 * P3-1 — Reality OS fixture E2E spine の integration test。
 * fixture → (overrun/minimalProgress real 呼び) → futureSimulation → redacted surface DTO。
 * 検証: current/protect/easy/push 通過 / honest-unknown / evidence・confidence・reasonCodes 保持 /
 *   permissionBoundary 緩まない / redaction（raw evidence 非露出）/ proposal非実行 / DB非保存。
 */
import { describe, it, expect } from "vitest";
import {
  composeRealityPipelineSurface,
  type RealityPipelineInputV0,
} from "@/lib/plan/realityCore/realityPipelineSurface";
import {
  REALITY_PIPELINE_FIXTURE,
  REALITY_PIPELINE_FIXTURE_UNKNOWN,
} from "@/lib/plan/realityCore/realityPipelineFixture";

describe("P3-1 Reality OS fixture E2E spine", () => {
  it("#1 current/protect/easy/push が end-to-end で通り surface DTO になる", () => {
    const s = composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE);
    expect(s.scenarios.map((x) => x.scenarioKind)).toEqual(["protect", "easy", "push"]);
    expect(s.scenarios).toHaveLength(3);
    // protect: 成立↑/崩れ↓/超過↓ → better 群
    const protect = s.scenarios.find((x) => x.scenarioKind === "protect")!;
    expect(protect.feasibilityShift).toBe("better");
    expect(protect.collapseRiskShift).toBe("better");
    expect(protect.overrunRiskShift).toBe("better");
    // push: 崩れ↑/超過↑ → worse
    const push = s.scenarios.find((x) => x.scenarioKind === "push")!;
    expect(push.collapseRiskShift).toBe("worse");
    expect(push.overrunRiskShift).toBe("worse");
  });

  it("#2 採用済 minimalProgress のみ surface に出る（未採用 LLM は null）", () => {
    const s = composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE);
    const protect = s.scenarios.find((x) => x.scenarioKind === "protect")!; // user_confirmed
    const push = s.scenarios.find((x) => x.scenarioKind === "push")!; // llm 未採用
    expect(protect.minimalProgressText).toBe("資料の構成を3行で書く");
    expect(push.minimalProgressText).toBeNull(); // 直接採用禁止が surface に表面化
  });

  it("#3 unknown 入力 → honest-unknown（断定しない）", () => {
    const s = composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE_UNKNOWN);
    expect(s.honestUnknown).toBe(true);
    expect(s.scenarios[0].feasibilityShift).toBe("unknown");
    expect(s.reasonCodes).toContain("current_incomplete");
  });

  it("#4 evidence/confidence/reasonCodes が失われない（evidenceCount>0・controlled reasonCodes）", () => {
    const s = composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE);
    for (const sc of s.scenarios) {
      expect(sc.evidenceCount).toBeGreaterThan(0);
      expect(typeof sc.confidence).toBe("number");
      expect(sc.reasonCodes.length).toBeGreaterThan(0);
      expect(sc.reasonCodes.some((c) => c.startsWith("feasibility_shift:"))).toBe(true);
    }
  });

  it("#5 permissionBoundary は緩まない（厳しい側=min を保持）", () => {
    const input: RealityPipelineInputV0 = {
      current: { ...REALITY_PIPELINE_FIXTURE.current, permissionBoundary: 1 },
      scenarios: [{ ...REALITY_PIPELINE_FIXTURE.scenarios[0], permissionBoundary: 5 }],
    };
    expect(composeRealityPipelineSurface(input).scenarios[0].permissionBoundary).toBe(1);
  });

  it("#6 redaction: raw evidence 文字列を surface に漏らさない", () => {
    const json = JSON.stringify(composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE));
    // fixture の内部 evidence ref は surface に現れない（件数のみ）
    expect(json).not.toContain("fixture:current");
    expect(json).not.toContain("fixture:overrun");
    expect(json).not.toContain("llm:gpt");
    // controlled reasonCode は出てよい
    expect(json).toContain("feasibility_shift:");
  });

  it("#7 surface DTO は提案実行/通知/DBフィールドを持たない（純データ）", () => {
    const s = composeRealityPipelineSurface(REALITY_PIPELINE_FIXTURE);
    const keys = Object.keys(s.scenarios[0]);
    for (const forbidden of ["execute", "notify", "send", "persist", "save", "dbId", "mutation"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
