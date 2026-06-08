/**
 * Life Ops L-4 — 予定前準備エンジン（pure・CEO 指示: nearing をイベント前倒し）。
 *   外見重要イベント近接 ∧ nearing のみ前倒し・within/beyond/unknown は出さない・business_trip 除外・HORIZON・dedupe・昇順。
 */
import { describe, it, expect } from "vitest";
import {
  generateEventPrepCandidates,
  type UpcomingEvent,
} from "@/lib/lifeops/event-preparation";
import type { CadenceObservation } from "@/lib/lifeops/candidate-types";

const NOW = "2026-06-12T00:00:00Z";
// cut typical42: 35日(2026-05-08)=nearing(0.83) / 20日=within / 72日(2026-04-01)=well_beyond
const obsCutNearing: CadenceObservation = { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-05-08" };
const obsCutWithin: CadenceObservation = { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-05-30" };
const obsCutWellBeyond: CadenceObservation = { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-04-01" };
const meetingIn5: UpcomingEvent = { kind: "meeting_someone", startISO: "2026-06-17" }; // 5日後
const tripIn3: UpcomingEvent = { kind: "trip", startISO: "2026-06-15" }; // 3日後

describe("L-4 nearing × 外見重要イベント近接 → 前倒し候補", () => {
  it("nearing ∧ meeting 近接 → event_prep 候補（cyclePhase=nearing・recommendedLeadDays）", () => {
    const out = generateEventPrepCandidates([meetingIn5], [obsCutNearing], NOW);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.category).toBe("beauty_salon");
    expect(c.menu).toBe("cut");
    expect(c.dueReason.kind).toBe("event_prep");
    if (c.dueReason.kind === "event_prep") {
      expect(c.dueReason.eventKind).toBe("meeting_someone");
      expect(c.dueReason.daysUntilEvent).toBe(5);
      expect(c.dueReason.cyclePhase).toBe("nearing");
      expect(c.dueReason.recommendedLeadDays).toBe(3); // cut=3
    }
    expect(c.placeQuery).toBe("美容室"); // L-1 から
    expect(c.suggestedWindow).toBeNull(); // 横 R2 が決める
  });
});

describe("L-4 出さない条件", () => {
  it("within_typical（新しすぎ）→ 前倒ししない", () => {
    expect(generateEventPrepCandidates([meetingIn5], [obsCutWithin], NOW)).toEqual([]);
  });
  it("beyond/well_beyond は L-3 の領分 → L-4 は出さない", () => {
    expect(generateEventPrepCandidates([meetingIn5], [obsCutWellBeyond], NOW)).toEqual([]);
  });
  it("unknown（履歴なし）→ 出さない", () => {
    expect(generateEventPrepCandidates([meetingIn5], [{ categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: null }], NOW)).toEqual([]);
  });
  it("business_trip（非外見）→ 出さない", () => {
    expect(generateEventPrepCandidates([{ kind: "business_trip", startISO: "2026-06-15" }], [obsCutNearing], NOW)).toEqual([]);
  });
  it("HORIZON 超（15日先）→ 出さない", () => {
    expect(generateEventPrepCandidates([{ kind: "meeting_someone", startISO: "2026-06-27" }], [obsCutNearing], NOW)).toEqual([]);
  });
  it("過去イベント → 出さない", () => {
    expect(generateEventPrepCandidates([{ kind: "meeting_someone", startISO: "2026-06-01" }], [obsCutNearing], NOW)).toEqual([]);
  });
  it("近接イベントなし → 空", () => {
    expect(generateEventPrepCandidates([], [obsCutNearing], NOW)).toEqual([]);
  });
});

describe("L-4 dedupe / ソート", () => {
  it("複数イベント → daysUntil 最小を根拠に 1 候補（dedupe）", () => {
    const out = generateEventPrepCandidates([meetingIn5, tripIn3], [obsCutNearing], NOW);
    expect(out).toHaveLength(1);
    if (out[0].dueReason.kind === "event_prep") {
      expect(out[0].dueReason.daysUntilEvent).toBe(3); // trip の方が近い
      expect(out[0].dueReason.eventKind).toBe("trip");
    }
  });
  it("複数 nearing カテゴリ → daysUntil 昇順（同一なら安定）", () => {
    const eyebrowNearing: CadenceObservation = { categoryId: "eyebrow", lastCompletedAtISO: "2026-05-20" }; // 23日/28=0.82 nearing
    const out = generateEventPrepCandidates([meetingIn5], [obsCutNearing, eyebrowNearing], NOW);
    expect(out.map((c) => c.category)).toEqual(["beauty_salon", "eyebrow"]); // 同 daysUntil(5) → 入力順安定
    expect(out).toHaveLength(2);
  });
  it("同入力は同出力（pure・deterministic）", () => {
    const e = [meetingIn5];
    const o = [obsCutNearing];
    expect(generateEventPrepCandidates(e, o, NOW)).toEqual(generateEventPrepCandidates(e, o, NOW));
  });
});
