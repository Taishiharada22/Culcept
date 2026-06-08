/**
 * A1-7-1 Dry-run Event Aggregation + Hypothesis Disambiguation — pure 集約検証。
 *   文脈ごとの pattern 化、context 相関による hypothesis disambiguation（band→timing / confidence→framing）、
 *   counter-evidence 保持、certainty 上限 tentative（high 禁止）、非断定の構造保証、未永続化、pure deterministic を証明する。
 */
import { describe, it, expect } from "vitest";
import { toDryRunLearningEvent, type CandidateActionContext } from "@/lib/plan/reality/learning/dry-run-learning-event";
import { aggregateDryRunEvents, dedupeEventsForSignal } from "@/lib/plan/reality/learning/dry-run-aggregation";
import type { CandidateActionKind } from "@/lib/plan/reality/candidate-action";

const HANDLE = "c1:" + "a".repeat(64);
function ev(action: CandidateActionKind, over: Partial<CandidateActionContext> = {}) {
  return toDryRunLearningEvent({ handle: HANDLE, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...over }, action);
}

describe("A1-7-1 aggregateDryRunEvents — 文脈ごとの tentative pattern + disambiguation", () => {
  it("少数（< minEvents=3）→ pattern なし（断定しない）", () => {
    const r = aggregateDryRunEvents([ev("dismiss"), ev("dismiss")]);
    expect(r.kind).toBe("tentative_pattern_report");
    expect(r.totalEvents).toBe(2);
    expect(r.patterns).toEqual([]);
  });

  it("evening band で dismiss 一貫 → favored not_now（timing）/ stillPossible 残す / consistent / tentative", () => {
    const r = aggregateDryRunEvents([ev("dismiss", { band: "evening" }), ev("dismiss", { band: "evening" }), ev("dismiss", { band: "evening" })]);
    const p = r.patterns.find((x) => x.dimension === "band" && x.value === "evening")!;
    expect(p.dominantAction).toBe("dismiss");
    expect(p.signal).toBe("non_adoption");
    expect(p.favoredHypothesis).toBe("not_now"); // band-tied dismiss = timing
    expect(p.stillPossible).toEqual(["not_selected", "mismatch_unknown"]); // 他は潰さない（非断定）
    expect(p.consistency).toBe("consistent");
    expect(p.certainty).toBe("tentative");
    expect(p.counterCount).toBe(0);
    expect(p.note).toContain("タイミング");
  });

  it("同じ dismiss でも confidence 次元 → favored mismatch_unknown（disambiguation の核心）", () => {
    const r = aggregateDryRunEvents([ev("dismiss", { confidenceBand: "high" }), ev("dismiss", { confidenceBand: "high" }), ev("dismiss", { confidenceBand: "high" })]);
    const p = r.patterns.find((x) => x.dimension === "confidence" && x.value === "high")!;
    expect(p.favoredHypothesis).toBe("mismatch_unknown"); // confidence-tied dismiss = 提示のズレ
  });

  it("counter-evidence: 割れた group → mixed / certainty low / counterCount 記録 / note 明示", () => {
    const r = aggregateDryRunEvents([ev("accept", { band: "morning" }), ev("dismiss", { band: "morning" }), ev("later", { band: "morning" })]);
    const p = r.patterns.find((x) => x.dimension === "band" && x.value === "morning")!;
    expect(p.consistency).toBe("mixed");
    expect(p.certainty).toBe("low");
    expect(p.counterCount).toBe(2); // dominant 1 / total 3
    expect(p.note).toContain("割れている");
  });

  it("certainty は 100% 一貫でも **最大 tentative**（high/personality 禁止）", () => {
    const r = aggregateDryRunEvents(Array.from({ length: 10 }, () => ev("accept", { band: "afternoon" })));
    const p = r.patterns.find((x) => x.dimension === "band" && x.value === "afternoon")!;
    expect(p.certainty).toBe("tentative"); // NOT "high"
  });

  it("duration bucket（short/medium/long）で group 化される", () => {
    const r = aggregateDryRunEvents([
      ev("accept", { durationMin: 20 }), ev("accept", { durationMin: 25 }), ev("accept", { durationMin: 30 }), // short
      ev("dismiss", { durationMin: 120 }), ev("dismiss", { durationMin: 100 }), ev("dismiss", { durationMin: 95 }), // long
    ]);
    expect(r.patterns.find((x) => x.dimension === "durationBucket" && x.value === "short")?.dominantAction).toBe("accept");
    expect(r.patterns.find((x) => x.dimension === "durationBucket" && x.value === "long")?.dominantAction).toBe("dismiss");
  });
});

describe("A1-7-1 非断定 + 未永続化 の構造的保証", () => {
  it("report.kind=marker / assertsPersonality=false / 各 pattern.assertsPreference=false", () => {
    const r = aggregateDryRunEvents(Array.from({ length: 4 }, () => ev("dismiss", { band: "evening" })));
    expect(r.kind).toBe("tentative_pattern_report"); // 未永続化 marker（PRM 保存でない）
    expect(r.assertsPersonality).toBe(false);
    for (const p of r.patterns) expect(p.assertsPreference).toBe(false);
  });
  it("note（rendered text）が性格・嗜好の断定語を含まず hypothesis-tone である", () => {
    const r = aggregateDryRunEvents(Array.from({ length: 5 }, () => ev("dismiss", { band: "evening" })));
    const notes = r.patterns.map((p) => p.note).join(" | ");
    expect(notes).not.toMatch(/嫌い|好き|性格|always|never/i); // 断定語なし
    expect(notes).toMatch(/かもしれない|可能性|断定不可|割れている/); // hypothesis-tone であること
  });
  it("pure・deterministic（同入力→同出力・sort 済）", () => {
    const evs = [ev("dismiss", { band: "evening" }), ev("accept", { band: "morning" }), ev("dismiss", { band: "evening" }), ev("dismiss", { band: "evening" })];
    expect(aggregateDryRunEvents(evs)).toEqual(aggregateDryRunEvents(evs));
  });
});

describe("A1-7-19 dedupeEventsForSignal / dedupeSameDay — 同日反復 collapse・異日蓄積・distinct candidate 安全", () => {
  const H = (c: string) => "c1:" + c.repeat(64);
  function evAt(action: CandidateActionKind, actedAtISO: string, handle = HANDLE, over: Partial<CandidateActionContext> = {}) {
    return toDryRunLearningEvent({ handle, date: "2026-06-15", band: "afternoon", confidenceBand: "high", durationMin: 60, evidenceSource: "seed_explicit", ...over }, action, actedAtISO);
  }

  it("同 handle+later+同日（時刻違い 3 件）→ 1（連打 collapse）", () => {
    const r = dedupeEventsForSignal([
      evAt("later", "2026-06-15T08:00:00.000Z"),
      evAt("later", "2026-06-15T12:00:00.000Z"),
      evAt("later", "2026-06-15T20:30:00.000Z"),
    ]);
    expect(r).toHaveLength(1);
  });

  it("同 handle+later+異日 2 件 → 2（慢性 deferral 蓄積）", () => {
    const r = dedupeEventsForSignal([evAt("later", "2026-06-15T08:00:00.000Z"), evAt("later", "2026-06-16T08:00:00.000Z")]);
    expect(r).toHaveLength(2);
  });

  it("distinct handle（別候補）同日 later 3 件 → 3（collapse しない）", () => {
    const r = dedupeEventsForSignal([
      evAt("later", "2026-06-15T08:00:00.000Z", H("a")),
      evAt("later", "2026-06-15T08:00:00.000Z", H("b")),
      evAt("later", "2026-06-15T08:00:00.000Z", H("c")),
    ]);
    expect(r).toHaveLength(3);
  });

  it("accept/dismiss は distinct handle ゆえ collapse しない（dedup contract で安全）", () => {
    const r = dedupeEventsForSignal([
      evAt("accept", "2026-06-15T08:00:00.000Z", H("a")),
      evAt("dismiss", "2026-06-15T08:00:00.000Z", H("b")),
    ]);
    expect(r).toHaveLength(2);
  });

  it("aggregate dedupeSameDay: 同日 later 連打 → signal 1（off なら 3）", () => {
    const sameDay = [
      evAt("later", "2026-06-15T08:00:00.000Z"),
      evAt("later", "2026-06-15T12:00:00.000Z"),
      evAt("later", "2026-06-15T20:30:00.000Z"),
    ];
    expect(aggregateDryRunEvents(sameDay, { dedupeSameDay: true }).totalEvents).toBe(1);
    expect(aggregateDryRunEvents(sameDay).totalEvents).toBe(3); // dedup off=既存挙動
  });

  it("aggregate dedupeSameDay: 異日 later → signal 2", () => {
    const diffDay = [evAt("later", "2026-06-15T08:00:00.000Z"), evAt("later", "2026-06-16T08:00:00.000Z")];
    expect(aggregateDryRunEvents(diffDay, { dedupeSameDay: true }).totalEvents).toBe(2);
  });

  it("accept は distinct handle なら dedupeSameDay on/off で同結果（regress なし）", () => {
    const accepts = Array.from({ length: 4 }, (_, i) => evAt("accept", "2026-06-15T08:00:00.000Z", H(String.fromCharCode(97 + i)), { band: "morning" }));
    const withDedup = aggregateDryRunEvents(accepts, { dedupeSameDay: true, minEvents: 3 });
    const without = aggregateDryRunEvents(accepts, { minEvents: 3 });
    expect(withDedup.totalEvents).toBe(4); // distinct handle ゆえ collapse なし
    expect(withDedup).toEqual(without); // regress なし
  });
});
