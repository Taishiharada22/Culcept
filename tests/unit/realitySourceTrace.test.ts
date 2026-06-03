import { describe, it, expect } from "vitest";
import {
  isTraceable,
  isAuditable,
  allAuditable,
  traceConfidence,
  isWeaklyGrounded,
  strongestSource,
  summarizeReasons,
  type SourceTrace,
  type SourceKind,
} from "@/lib/plan/reality/source-trace";

const t = (
  kind: SourceKind,
  confidence: number,
  reason = `from ${kind}`,
  ref?: string,
  correlationGroup?: string
): SourceTrace => ({ kind, confidence, reason, ref, correlationGroup });

describe("reality/source-trace — traceability (INV-4)", () => {
  it("isTraceable requires ≥1 basis", () => {
    expect(isTraceable([])).toBe(false);
    expect(isTraceable([t("seed", 0.8)])).toBe(true);
  });

  it("expresses all required source kinds", () => {
    const kinds: SourceKind[] = [
      "anchor",
      "seed",
      "task",
      "prm",
      "environment",
      "correction",
      "long_term_goal",
      "draft_proposal",
      "change_set",
    ];
    expect(kinds.map((k) => t(k, 0.5))).toHaveLength(9);
  });
});

describe("reality/source-trace — auditability (INV-23: 説明文でなく辿れる根拠)", () => {
  it("entity-backed kinds require a sourceId (ref); reason always required", () => {
    expect(isAuditable(t("prm", 0.7, "午前集中", "prm_focus_morning"))).toBe(true);
    expect(isAuditable(t("prm", 0.7, "午前集中"))).toBe(false); // ref 欠落
    expect(isAuditable(t("seed", 0.7, "", "seed_1"))).toBe(false); // reason 欠落
  });

  it("environment / long_term_goal may be id-less but need a reason", () => {
    expect(isAuditable(t("environment", 0.4, "晴れ・カフェ適性"))).toBe(true);
    expect(isAuditable(t("long_term_goal", 0.4, "今期の企画を進める"))).toBe(true);
    expect(isAuditable(t("environment", 0.4, ""))).toBe(false);
  });

  it("allAuditable requires non-empty and every trace auditable", () => {
    expect(allAuditable([])).toBe(false);
    expect(allAuditable([t("prm", 0.7, "r", "id1"), t("environment", 0.3, "晴れ")])).toBe(true);
    expect(allAuditable([t("prm", 0.7, "r")])).toBe(false);
  });
});

describe("reality/source-trace — composite confidence (correlation-aware, GPT audit)", () => {
  it("single basis returns its own confidence", () => {
    expect(traceConfidence([t("seed", 0.7)])).toBeCloseTo(0.7, 10);
  });

  it("INDEPENDENT weak bases compound (0.4, 0.4 → 0.64)", () => {
    expect(traceConfidence([t("prm", 0.4), t("environment", 0.4)])).toBeCloseTo(0.64, 10);
  });

  it("CORRELATED bases (same group) do NOT over-compound — group max (0.4, 0.4 → 0.4)", () => {
    // PRM と correction が同じ行動履歴由来 → 二重計上しない
    const traces = [
      t("prm", 0.4, "午前集中", "prm_1", "morning_focus"),
      t("correction", 0.4, "前回も午前", "corr_1", "morning_focus"),
    ];
    expect(traceConfidence(traces)).toBeCloseTo(0.4, 10);
  });

  it("mixed: correlated pair (group max) then independent basis (noisy-OR)", () => {
    const traces = [
      t("prm", 0.4, "a", "p1", "g"),
      t("correction", 0.4, "b", "c1", "g"), // same group → max 0.4
      t("seed", 0.5, "c", "s1"), // independent
    ];
    // 1 - (1-0.4)(1-0.5) = 1 - 0.3 = 0.7
    expect(traceConfidence(traces)).toBeCloseTo(0.7, 10);
  });

  it("cap bounds the combined confidence", () => {
    const traces = [t("a" as SourceKind, 0.9), t("b" as SourceKind, 0.9)];
    expect(traceConfidence(traces)).toBeGreaterThan(0.9);
    expect(traceConfidence(traces, { cap: 0.85 })).toBe(0.85);
  });

  it("empty → 0, clamps out-of-range confidence", () => {
    expect(traceConfidence([])).toBe(0);
    expect(traceConfidence([t("seed", 2), t("prm", -1)])).toBeCloseTo(1, 10);
    expect(traceConfidence([t("prm", NaN)])).toBe(0);
  });
});

describe("reality/source-trace — weak grounding is an AUXILIARY signal (not a push gate)", () => {
  it("weak (combined < 0.5) flagged for demotion to confirm/on-open", () => {
    expect(isWeaklyGrounded([t("prm", 0.3)])).toBe(true);
    expect(isWeaklyGrounded([t("anchor", 0.9)])).toBe(false);
    expect(isWeaklyGrounded([t("prm", 0.4), t("environment", 0.4)])).toBe(false); // 0.64
  });

  it("respects a custom threshold", () => {
    expect(isWeaklyGrounded([t("seed", 0.7)], 0.8)).toBe(true);
    expect(isWeaklyGrounded([t("seed", 0.7)], 0.6)).toBe(false);
  });
});

describe("reality/source-trace — helpers", () => {
  it("strongestSource returns the highest-confidence basis", () => {
    expect(strongestSource([t("prm", 0.3), t("anchor", 0.9), t("seed", 0.6)])?.kind).toBe("anchor");
    expect(strongestSource([])).toBeNull();
  });

  it("summarizeReasons joins the human-readable reasons (the 'why')", () => {
    const traces = [t("seed", 0.8, "企画が目的"), t("prm", 0.6, "午前が集中帯"), t("environment", 0.3, "")];
    expect(summarizeReasons(traces)).toBe("企画が目的 / 午前が集中帯");
  });
});
