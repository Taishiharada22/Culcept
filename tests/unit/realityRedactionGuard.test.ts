import { describe, it, expect } from "vitest";
import {
  assertRedacted,
  assertShadowSummaryRedacted,
  assertDevReportRedacted,
  collectStringValues,
  isAllowedAtom,
  isValidShadowLine,
} from "@/lib/plan/reality/integration/redaction-guard";
import { runShadow, formatShadowLine, type ShadowSummary, type ShadowInput } from "@/lib/plan/reality/integration/shadow-runner";
import { aggregateShadowReport } from "@/lib/plan/reality/integration/dev-report";
import type { RealityInput } from "@/lib/plan/reality/integration/input-adapter";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { ReceptivityInput } from "@/lib/plan/reality/receptivity-gate";

// 適法な ShadowSummary（shadow-runner の出力形を手組み）
function summary(p: Partial<ShadowSummary> = {}): ShadowSummary {
  return {
    mode: "repair",
    candidateCount: 2,
    bestRef: "c0",
    rejected: [{ ref: "c1", gates: ["safety"] }],
    deliveryMode: "push",
    invariantViolations: ["INV-16"],
    risk: "low",
    line: "mode=repair candidates=2 best=c0 rejected=1 delivery=push violations=1 risk=low",
    ...p,
  };
}

// runShadow を実走させるための候補 fixture（realityShadowRunner.test.ts と同形）
const trace: SourceTrace = { kind: "seed", ref: "s1", reason: "目的", confidence: 0.8 };
function cs(id: string): ChangeSet {
  return { id, ops: [{ kind: "add", itemId: `${id}_a`, after: { itemId: `${id}_a`, startMin: 540, endMin: 600 } }], reason: "r", sourceTraces: [trace] };
}
function metrics(p: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return { feasible: true, wholePartCoherent: true, recoveryProtected: true, deadlineSatisfied: true, goalAttainment: 0.8, rhythmFit: 0.7, slackHealth: 0.7, overpack: 0.1, contextSwitches: 1, instability: 0, correctionMisalignment: 0.1, ...p };
}
function cand(id: string, p: Partial<BestActionCandidate> = {}): BestActionCandidate {
  return { id, changeSet: cs(id), sourceTraces: [trace], metrics: metrics(), proposedDisposition: "confirm", ...p };
}
function realityInput(p: Partial<RealityInput> = {}): RealityInput {
  return { mode: "repair", dayNodes: [], anchors: {}, seedTraces: [], ...p };
}
function recep(p: Partial<ReceptivityInput> = {}): ReceptivityInput {
  return { stakes: "high", actionable: true, allowedActions: ["one_tap_confirm"], confidence: 0.8, sourceTraceStrength: 0.8, receptivity: 0.7, timeCritical: false, pushPermission: true, budget: { remaining: 5, recentDismissals: 0, trust: 0.9 }, ...p };
}
function shadow(p: Partial<ShadowInput> = {}): ShadowInput {
  return { input: realityInput(), candidates: [cand("plan")], intervened: true, conditionPresent: true, ...p };
}

const RAW = "渋谷の田中皮膚科_anchor_42"; // raw PII を模した値（id/title/第三者名相当）

describe("redaction-guard — allowlist primitives", () => {
  it("isAllowedAtom: enum / ephemeral ref / INV id を許可、raw を拒否", () => {
    for (const t of ["repair", "safety", "push", "high", "none", "c0", "c12", "c?", "INV-16", "INV-3", ""]) {
      expect(isAllowedAtom(t)).toBe(true);
    }
    for (const t of [RAW, "渋谷", "Dr. Tanaka", "c", "cX", "INV-", "INV-16a", "delivery", "title", "mode=repair"]) {
      expect(isAllowedAtom(t)).toBe(false);
    }
  });

  it("isValidShadowLine: 実 line 文法のみ許可、注入を拒否", () => {
    expect(isValidShadowLine("mode=repair candidates=2 best=c0 rejected=1 delivery=push violations=1 risk=low")).toBe(true);
    expect(isValidShadowLine("mode=build candidates=0 best=none rejected=0 delivery=none violations=0 risk=none")).toBe(true);
    // 注入: enum 外 / raw 混入 / 形崩れ
    expect(isValidShadowLine("mode=repair candidates=2 best=c0 rejected=1 delivery=evil violations=1 risk=low")).toBe(false);
    expect(isValidShadowLine(`mode=repair candidates=2 best=${RAW} rejected=1 delivery=push violations=1 risk=low`)).toBe(false);
    expect(isValidShadowLine(`mode=repair title=${RAW} candidates=2 best=c0 rejected=1 delivery=push violations=1 risk=low`)).toBe(false);
  });
});

describe("redaction-guard — collectStringValues", () => {
  it("ネストした string 値を path 付きで収集（キー＝構造名は対象外）", () => {
    const leaves = collectStringValues(summary());
    const paths = leaves.map((l) => l.path).sort();
    expect(paths).toEqual(["bestRef", "deliveryMode", "invariantViolations[0]", "line", "mode", "rejected[0].gates[0]", "rejected[0].ref", "risk"]);
    // フィールド名（"candidateCount" 等）は string 値ではないので含まれない
    expect(paths).not.toContain("candidateCount");
    // line フィールドだけ isLineField=true
    expect(leaves.find((l) => l.path === "line")?.isLineField).toBe(true);
    expect(leaves.find((l) => l.path === "mode")?.isLineField).toBe(false);
  });
});

describe("redaction-guard — assertRedacted (clean)", () => {
  it("適法な ShadowSummary は clean", () => {
    const v = assertShadowSummaryRedacted(summary());
    expect(v.clean).toBe(true);
    expect(v.offendingPaths).toEqual([]);
  });

  it("best=none / delivery=null / 違反なし の縮退も clean", () => {
    const v = assertShadowSummaryRedacted(
      summary({ bestRef: null, deliveryMode: null, rejected: [], invariantViolations: [], risk: "none", candidateCount: 0, line: "mode=build candidates=0 best=none rejected=0 delivery=none violations=0 risk=none", mode: "build" })
    );
    expect(v.clean).toBe(true);
  });
});

describe("redaction-guard — assertRedacted catches leaks (and is itself leak-safe)", () => {
  it("bestRef に raw → flagged、かつ verdict は raw 値を含まない", () => {
    const v = assertShadowSummaryRedacted(summary({ bestRef: RAW }));
    expect(v.clean).toBe(false);
    expect(v.offendingPaths).toEqual(["bestRef"]);
    // 検出器自身が leak-safe: verdict を文字列化しても raw は出ない
    expect(JSON.stringify(v)).not.toContain(RAW);
    expect(JSON.stringify(v)).not.toContain("渋谷");
  });

  it("line に raw 注入（文法崩れ）→ flagged", () => {
    const v = assertShadowSummaryRedacted(summary({ line: `mode=repair candidates=2 best=${RAW} rejected=1 delivery=push violations=1 risk=low` }));
    expect(v.clean).toBe(false);
    expect(v.offendingPaths).toContain("line");
    expect(JSON.stringify(v)).not.toContain(RAW);
  });

  it("rejected[].ref に raw → 正確な path で flagged", () => {
    const v = assertShadowSummaryRedacted(summary({ rejected: [{ ref: "c0", gates: ["safety"] }, { ref: RAW as string, gates: ["traceability"] }] }));
    expect(v.clean).toBe(false);
    expect(v.offendingPaths).toEqual(["rejected[1].ref"]);
  });

  it("invariantViolations に偽 id → flagged（INV-\\d+ 形のみ許可）", () => {
    const v = assertRedacted(summary({ invariantViolations: ["INV-16", RAW] as unknown as ShadowSummary["invariantViolations"] }));
    expect(v.clean).toBe(false);
    expect(v.offendingPaths).toEqual(["invariantViolations[1]"]);
  });

  it("複数箇所の raw → すべての path を列挙", () => {
    const v = assertShadowSummaryRedacted(summary({ bestRef: RAW, rejected: [{ ref: RAW as string, gates: ["safety"] }] }));
    expect(v.clean).toBe(false);
    expect(v.offendingPaths.sort()).toEqual(["bestRef", "rejected[0].ref"]);
  });
});

describe("redaction-guard — keystone: 実 runShadow 出力は allowlist-clean", () => {
  it("raw id を持つ候補を runShadow に通しても出力は clean（refOf チョークポイントが効く）", () => {
    // 候補 id に raw PII を仕込む → runShadow が "c0" に redact するはず
    const s = runShadow(shadow({ candidates: [cand(RAW), cand("safe", { metrics: metrics({ goalAttainment: 0.3 }) })], receptivity: recep() }));
    // 前提: raw id は出力に直接現れない
    expect(JSON.stringify(s)).not.toContain(RAW);
    // 表明: allowlist-clean
    const v = assertShadowSummaryRedacted(s);
    expect(v.clean).toBe(true);
    expect(v.offendingPaths).toEqual([]);
  });

  it("gate 失敗・違反のある実出力でも clean（enum/ephemeral のみで構成）", () => {
    const dangerous = cand("dangerous_raw_id", { sourceTraces: [], metrics: metrics({ goalAttainment: 1 }) }); // traceability fail
    const s = runShadow(shadow({ candidates: [dangerous, cand("safe")], receptivity: recep() }));
    expect(assertShadowSummaryRedacted(s).clean).toBe(true);
  });

  it("aggregateShadowReport 出力も clean（R3: counts/enum のみ）", () => {
    const s1 = runShadow(shadow({ candidates: [cand(RAW)], receptivity: recep() }));
    const s2 = runShadow(shadow({ candidates: [cand("another_raw")], receptivity: recep() }));
    const report = aggregateShadowReport([s1, s2]);
    expect(JSON.stringify(report)).not.toContain(RAW);
    const v = assertDevReportRedacted(report);
    expect(v.clean).toBe(true);
  });
});

describe("redaction-guard — producer/guard 整合（GPT 制約 #1: line は safe token のみ）", () => {
  it("formatShadowLine の出力は常に isValidShadowLine を満たす（全 enum 組合せ）", () => {
    const modes = ["build", "complete", "repair", "optimize", "none"] as const;
    const deliveries = ["silent", "on_open", "push", "urgent_push", "permission_prompt", null] as const;
    const risks = ["none", "low", "medium", "high"] as const;
    for (const mode of modes) {
      for (const deliveryMode of deliveries) {
        for (const risk of risks) {
          const core: Omit<ShadowSummary, "line"> = {
            mode,
            candidateCount: 3,
            bestRef: "c2",
            rejected: [{ ref: "c0", gates: ["safety"] }],
            deliveryMode,
            invariantViolations: ["INV-16"],
            risk,
          };
          expect(isValidShadowLine(formatShadowLine(core))).toBe(true);
        }
      }
    }
  });

  it("bestRef=null は best=none に落ち、文法を満たす", () => {
    const core: Omit<ShadowSummary, "line"> = {
      mode: "build", candidateCount: 0, bestRef: null, rejected: [], deliveryMode: null, invariantViolations: [], risk: "none",
    };
    const line = formatShadowLine(core);
    expect(line).toBe("mode=build candidates=0 best=none rejected=0 delivery=none violations=0 risk=none");
    expect(isValidShadowLine(line)).toBe(true);
  });

  it("実 runShadow の line は producer formatter と一致し allowlist-clean", () => {
    const s = runShadow(shadow({ candidates: [cand(RAW)], receptivity: recep() }));
    const { line, ...core } = s;
    expect(line).toBe(formatShadowLine(core));
    expect(isValidShadowLine(line)).toBe(true);
  });
});

describe("redaction-guard — tripwire: RealityInput を誤って出力すると raw 値が flagged される", () => {
  it("RealityInput の seedTrace.reason（自由文）/ ref（実 id）は allowlist 違反として検出", () => {
    // R1: RealityInput は内部型。万一 output に混ぜたら guard が叫ぶ。
    const leaky: RealityInput = realityInput({
      seedTraces: [{ kind: "seed", ref: "seed_uuid_123", reason: "渋谷で田中さんと打ち合わせ", confidence: 0.7 }],
    });
    const v = assertRedacted(leaky);
    expect(v.clean).toBe(false);
    // reason（自由文）と ref（実 id）両方が flagged
    expect(v.offendingPaths).toContain("seedTraces[0].reason");
    expect(v.offendingPaths).toContain("seedTraces[0].ref");
  });
});
