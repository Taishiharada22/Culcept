import { describe, it, expect } from "vitest";
import {
  isTraceable,
  traceConfidence,
  isWeaklyGrounded,
  strongestSource,
  summarizeReasons,
  type SourceTrace,
  type SourceKind,
} from "@/lib/plan/reality/source-trace";

const t = (kind: SourceKind, confidence: number, reason = `from ${kind}`, ref?: string): SourceTrace => ({
  kind,
  confidence,
  reason,
  ref,
});

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
    const traces = kinds.map((k) => t(k, 0.5));
    expect(traces.every((x) => isTraceable([x]))).toBe(true);
    expect(traces).toHaveLength(9);
  });
});

describe("reality/source-trace — composite confidence (noisy-OR)", () => {
  it("single basis returns its own confidence", () => {
    expect(traceConfidence([t("seed", 0.7)])).toBeCloseTo(0.7, 10);
  });

  it("independent weak bases compound (0.4, 0.4 → 0.64)", () => {
    expect(traceConfidence([t("prm", 0.4), t("environment", 0.4)])).toBeCloseTo(0.64, 10);
  });

  it("empty → 0, clamps out-of-range confidence", () => {
    expect(traceConfidence([])).toBe(0);
    expect(traceConfidence([t("seed", 2), t("prm", -1)])).toBeCloseTo(1, 10); // 2→1 clamp ⇒ 1
    expect(traceConfidence([t("prm", NaN)])).toBe(0);
  });
});

describe("reality/source-trace — weak grounding (INV-23)", () => {
  it("weak (combined < 0.5) flagged for demotion to confirm/on-open", () => {
    expect(isWeaklyGrounded([t("prm", 0.3)])).toBe(true);
    expect(isWeaklyGrounded([t("prm", 0.3), t("environment", 0.2)])).toBe(true); // ≈0.44
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
