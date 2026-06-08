/**
 * Life Ops L-4 — 予定前準備エンジン（pure・CEO 指示: nearing をイベント前倒し）。
 *   外見重要イベント近接 ∧ nearing のみ前倒し・within/beyond/unknown は出さない・business_trip 除外・HORIZON・dedupe・昇順。
 */
import { describe, it, expect } from "vitest";
import {
  generateEventPrepCandidates,
  generateOneshotPrepCandidates,
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

// ── L-4(b) one-shot 準備（cadence 無関係・イベント種→準備マップ）──
describe("L-4(b) generateOneshotPrepCandidates — イベント種→準備マップ", () => {
  it("interview → 服 + 資料", () => {
    const out = generateOneshotPrepCandidates([{ kind: "interview", startISO: "2026-06-16" }], NOW);
    expect(out.map((c) => c.category).sort()).toEqual(["document_prep", "outfit_prep"]);
  });
  it("trip → 荷造り + チケット宿確認", () => {
    const out = generateOneshotPrepCandidates([{ kind: "trip", startISO: "2026-06-15" }], NOW);
    expect(out.map((c) => c.category).sort()).toEqual(["packing", "ticket_hotel_check"]);
  });
  it("ceremony → 服 + 持ち物確認", () => {
    const out = generateOneshotPrepCandidates([{ kind: "ceremony", startISO: "2026-06-19" }], NOW);
    expect(out.map((c) => c.category).sort()).toEqual(["belongings_check", "outfit_prep"]);
  });
  it("business_trip も対象（外見フィルタなし）→ 荷造り/宿確認/資料", () => {
    const out = generateOneshotPrepCandidates([{ kind: "business_trip", startISO: "2026-06-17" }], NOW);
    expect(out.map((c) => c.category).sort()).toEqual(["document_prep", "packing", "ticket_hotel_check"]);
  });
  it("meeting_someone → 空（手土産は MVP 除外）", () => {
    expect(generateOneshotPrepCandidates([{ kind: "meeting_someone", startISO: "2026-06-16" }], NOW)).toEqual([]);
  });
});

describe("L-4(b) candidate 内容 / 近接フィルタ", () => {
  it("dueReason=event_prep・cyclePhase なし・L1・placeQuery null・menu null", () => {
    const out = generateOneshotPrepCandidates([{ kind: "interview", startISO: "2026-06-16" }], NOW);
    const outfit = out.find((c) => c.category === "outfit_prep")!;
    expect(outfit.menu).toBeNull();
    expect(outfit.placeQuery).toBeNull();
    expect(outfit.permissionLevelHint).toBe("L1");
    expect(outfit.riskFlags).toEqual([]);
    expect(outfit.dueReason.kind).toBe("event_prep");
    if (outfit.dueReason.kind === "event_prep") {
      expect(outfit.dueReason.eventKind).toBe("interview");
      expect(outfit.dueReason.daysUntilEvent).toBe(4);
      expect(outfit.dueReason.cyclePhase).toBeUndefined(); // one-shot は周期なし
      expect(outfit.dueReason.recommendedLeadDays).toBe(2);
    }
  });
  it("HORIZON超（15日先）/ 過去 → 出さない", () => {
    expect(generateOneshotPrepCandidates([{ kind: "trip", startISO: "2026-06-27" }], NOW)).toEqual([]);
    expect(generateOneshotPrepCandidates([{ kind: "trip", startISO: "2026-06-01" }], NOW)).toEqual([]);
  });
  it("空イベント → 空", () => {
    expect(generateOneshotPrepCandidates([], NOW)).toEqual([]);
  });
});

describe("L-4(b) dedupe / ソート", () => {
  it("同 category 複数イベント → daysUntil 最小・出力は昇順", () => {
    const out = generateOneshotPrepCandidates(
      [
        { kind: "trip", startISO: "2026-06-15" }, // 3日 → packing, ticket_hotel_check
        { kind: "business_trip", startISO: "2026-06-17" }, // 5日 → packing, ticket_hotel_check, document_prep
      ],
      NOW,
    );
    expect(out.map((c) => c.category)).toEqual(["packing", "ticket_hotel_check", "document_prep"]); // 3,3,5
    const packing = out.find((c) => c.category === "packing")!;
    if (packing.dueReason.kind === "event_prep") {
      expect(packing.dueReason.daysUntilEvent).toBe(3); // nearest
      expect(packing.dueReason.eventKind).toBe("trip");
    }
  });
});
