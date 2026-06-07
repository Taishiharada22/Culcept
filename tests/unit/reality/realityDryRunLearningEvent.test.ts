/**
 * A1-7-0 Candidate Action Outcome → PRM Dry-run Learning Event — pure transform 検証。
 *   accept/dismiss/later が**非断定の structured learning event 候補**に正しく変換されること、
 *   選好を断定しないこと（assertsPreference=false / certainty=low / 嫌い等を含まない）、文脈が記録されること、
 *   Date.now 不使用（actedAtISO 注入）・pure deterministic・未永続化 marker を証明する。
 */
import { describe, it, expect } from "vitest";
import {
  toDryRunLearningEvent,
  toDryRunLearningEvents,
  hypothesisLabel,
  type CandidateActionContext,
} from "@/lib/plan/reality/learning/dry-run-learning-event";

const HANDLE = "c1:" + "a".repeat(64);
function ctx(p: Partial<CandidateActionContext> = {}): CandidateActionContext {
  return { handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...p };
}

describe("A1-7-0 toDryRunLearningEvent — 3 action が dry-run event 化（複数 hypothesis・潰さない）", () => {
  it("accept → adoption / accepted_for_plan primary / [accepted_for_plan, positive_signal]", () => {
    const e = toDryRunLearningEvent(ctx(), "accept");
    expect(e.kind).toBe("dry_run_learning_event"); // **未永続化** marker（PRM 保存でない）
    expect(e.action).toBe("accept");
    expect(e.signal).toBe("adoption");
    expect(e.primaryHypothesis).toBe("accepted_for_plan");
    expect(e.hypotheses).toEqual(["accepted_for_plan", "positive_signal"]);
  });
  it("dismiss → non_adoption / not_selected primary / [not_selected, not_now, mismatch_unknown]（**嫌いと断定しない**）", () => {
    const e = toDryRunLearningEvent(ctx(), "dismiss");
    expect(e.signal).toBe("non_adoption"); // ≠ negative
    expect(e.primaryHypothesis).toBe("not_selected");
    expect(e.hypotheses).toEqual(["not_selected", "not_now", "mismatch_unknown"]);
    expect(JSON.stringify(e)).not.toMatch(/嫌い|dislike|negative|hate/i); // 断定語を含まない
  });
  it("later → deferral / postpone_signal primary / [postpone_signal, timing_uncertain]", () => {
    const e = toDryRunLearningEvent(ctx(), "later");
    expect(e.signal).toBe("deferral");
    expect(e.primaryHypothesis).toBe("postpone_signal");
    expect(e.hypotheses).toEqual(["postpone_signal", "timing_uncertain"]);
  });
  it("primaryHypothesis は常に hypotheses[0]（最も中立な読み）", () => {
    for (const a of ["accept", "dismiss", "later"] as const) {
      const e = toDryRunLearningEvent(ctx(), a);
      expect(e.primaryHypothesis).toBe(e.hypotheses[0]);
    }
  });
});

describe("A1-7-0 非断定の構造的保証", () => {
  it("全 action で assertsPreference=false / certainty=low", () => {
    for (const a of ["accept", "dismiss", "later"] as const) {
      const e = toDryRunLearningEvent(ctx(), a);
      expect(e.assertsPreference).toBe(false);
      expect(e.certainty).toBe("low");
    }
  });
  it("consumed(accept) は「選好確定」を断定しない（positive は可能性止まり）", () => {
    const e = toDryRunLearningEvent(ctx(), "accept");
    expect(e.hypotheses).toContain("positive_signal"); // 「確定」でなく「signal の可能性」
    expect(e.assertsPreference).toBe(false);
  });
});

describe("A1-7-0 文脈の記録（将来の cross-event 相関 disambiguation 用）", () => {
  it("handle / date / band / confidenceBand / durationMin / sourceKind / sourceLabel を記録", () => {
    const e = toDryRunLearningEvent(ctx({ date: "2026-07-01", band: "evening", confidenceBand: "medium", durationMin: 30, evidenceSource: "correction" }), "dismiss");
    expect(e.handle).toBe(HANDLE);
    expect(e.desiredDate).toBe("2026-07-01");
    expect(e.band).toBe("evening");
    expect(e.confidenceBand).toBe("medium");
    expect(e.durationMin).toBe(30);
    expect(e.sourceKind).toBe("correction");
    expect(e.sourceLabel).toBe("これまでの調整から"); // controlled friendly
  });
  it("null 文脈（date/duration/band 無）も安全に記録", () => {
    const e = toDryRunLearningEvent(ctx({ date: null, band: null, durationMin: null }), "later");
    expect(e.desiredDate).toBeNull();
    expect(e.band).toBeNull();
    expect(e.durationMin).toBeNull();
  });
  it("seedRef / raw / UUID を持たない（handle は opaque・UUID パターンなし）", () => {
    const json = JSON.stringify(toDryRunLearningEvent(ctx(), "accept"));
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(json).not.toContain("source_ref");
  });
});

describe("A1-7-0 actedAtISO 注入（Date.now 不使用）+ pure", () => {
  it("string 注入 → 記録 / 無 / null → null", () => {
    expect(toDryRunLearningEvent(ctx(), "accept", "2026-06-15T09:00:00Z").actedAtISO).toBe("2026-06-15T09:00:00Z");
    expect(toDryRunLearningEvent(ctx(), "accept").actedAtISO).toBeNull();
    expect(toDryRunLearningEvent(ctx(), "accept", null).actedAtISO).toBeNull();
  });
  it("pure・deterministic（同入力→同出力）", () => {
    expect(toDryRunLearningEvent(ctx(), "dismiss", "2026-06-15T09:00:00Z")).toEqual(
      toDryRunLearningEvent(ctx(), "dismiss", "2026-06-15T09:00:00Z")
    );
  });
});

describe("A1-7-0 batch + hypothesisLabel（hypothesis-tone・controlled）", () => {
  it("toDryRunLearningEvents は入力順保持", () => {
    const evs = toDryRunLearningEvents([
      { ctx: ctx(), action: "accept" },
      { ctx: ctx(), action: "dismiss", actedAtISO: "2026-06-15T10:00:00Z" },
      { ctx: ctx(), action: "later" },
    ]);
    expect(evs.map((e) => e.action)).toEqual(["accept", "dismiss", "later"]);
    expect(evs[1]!.actedAtISO).toBe("2026-06-15T10:00:00Z");
  });
  it("全 hypothesis に hypothesis-tone label がある（断定しない・completeness）", () => {
    expect(hypothesisLabel("not_now")).toBe("タイミングの問題かもしれない");
    expect(hypothesisLabel("mismatch_unknown")).toContain("不明");
    expect(hypothesisLabel("positive_signal")).toContain("可能性");
    for (const a of ["accept", "dismiss", "later"] as const) {
      for (const h of toDryRunLearningEvent(ctx(), a).hypotheses) {
        expect(hypothesisLabel(h)).toBeTruthy();
      }
    }
  });
});
