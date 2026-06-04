import { describe, it, expect } from "vitest";
import {
  runCompleteShadow,
  isCompleteShadowEnabled,
  emptyCompleteDispatchInput,
} from "@/lib/plan/reality/integration/complete-shadow-orchestration";
import { aggregateShadowReport } from "@/lib/plan/reality/integration/dev-report";
import { assertShadowSummaryRedacted, assertDevReportRedacted } from "@/lib/plan/reality/integration/redaction-guard";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";

function realityInput(over: Partial<RealityInput> = {}): RealityInput {
  const base: RealityInput = {
    mode: "complete",
    dayNodes: [{ id: "a", startMin: 540, endMin: 600, importance: "normal", hard: false }],
    anchors: {},
    seedTraces: [],
  };
  return { ...base, ...over };
}

describe("A1-5-1a pure helpers", () => {
  it("isCompleteShadowEnabled: true→true / false→false", () => {
    expect(isCompleteShadowEnabled(true)).toBe(true);
    expect(isCompleteShadowEnabled(false)).toBe(false);
  });

  it("emptyCompleteDispatchInput: seedPlacements=[] / durationEvidences=[]", () => {
    const ci = emptyCompleteDispatchInput();
    expect(ci.seedPlacements).toEqual([]);
    expect(ci.durationEvidences).toEqual([]);
  });
});

describe("A1-5-1a runCompleteShadow — server-only orchestration（no call-site・空入力）", () => {
  it("flag off → no-op(flag_off)（kernel を呼ばない）", () => {
    const out = runCompleteShadow({ flag: false, realityInput: realityInput() });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("flag_off");
  });

  it("flag on + 空入力 → candidateCount=0 の redacted summary", () => {
    const out = runCompleteShadow({ flag: true, realityInput: realityInput() });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.summary.candidateCount).toBe(0);
      expect(out.summary.bestRef).toBeNull();
      expect(out.summary.rejected).toEqual([]);
      expect(out.summary.invariantViolations).toEqual([]);
      expect(out.summary.risk).toBe("none");
      expect(out.summary.deliveryMode).toBeNull();
    }
  });

  it("返り値 summary は redaction-guard を通る（raw 非含有）", () => {
    const out = runCompleteShadow({ flag: true, realityInput: realityInput() });
    expect(out.ok).toBe(true);
    if (out.ok) expect(assertShadowSummaryRedacted(out.summary).clean).toBe(true);
  });

  it("dev report contract が壊れない（aggregateShadowReport→assertDevReportRedacted clean）", () => {
    const out = runCompleteShadow({ flag: true, realityInput: realityInput() });
    expect(out.ok).toBe(true);
    if (out.ok) {
      const report = aggregateShadowReport([out.summary]);
      expect(assertDevReportRedacted(report).clean).toBe(true);
    }
  });

  it("入力の raw（seedTrace.reason 自由文）は summary に漏れない", () => {
    const RAW = "RAW_SECRET_カフェで仕事_XYZ";
    const out = runCompleteShadow({
      flag: true,
      realityInput: realityInput({ seedTraces: [{ kind: "seed", ref: "s1", reason: RAW, confidence: 0.8 }] }),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      const serialized = JSON.stringify(out.summary);
      expect(serialized).not.toContain(RAW);
      expect(serialized).not.toContain("RAW_SECRET");
      expect(out.summary.candidateCount).toBe(0); // seedTrace は Complete 経路で未使用
    }
  });

  it("redaction violation → fail-closed(redaction_failed)（DI で失敗チェック注入）", () => {
    const out = runCompleteShadow({
      flag: true,
      realityInput: realityInput(),
      redactionCheck: () => false, // 失敗を注入
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("redaction_failed");
  });
});
