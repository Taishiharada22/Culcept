/**
 * targetDate preserve — PR-50 Commit 15 (CEO 2026-04-30)
 *
 * 検証範囲:
 *   - 初回 turn: comprehension.targetDate="tomorrow" → plan.date = 明日
 *   - turn 2 以降: priorPlan.date が継承される (= session の最初に決まった date 維持)
 *   - 「明日」 で始まった session が後続 turn で「今日」 に戻らないこと
 *
 * CEO 観測 (Preview 2026-04-30 turn 1-5):
 *   rawInputs[0] = 「明日の9時に渋谷のスタバでコーヒー」
 *   plan.date = 2026-04-30 (= 今日) ← 「明日」 が無視されている
 *
 * 修正: legacyAdapter の plan.date 決定ロジックを resolvePlanDate に変更:
 *   1. priorPlan.date があれば最優先
 *   2. comprehension.targetDate を解釈
 *   3. fallback: today
 *
 * 検証 (CEO 確定):
 *   1. 初回「明日の9時に渋谷のスタバ」 → plan.date = 明日
 *   2. 「電車」 → plan.date は明日のまま
 *   3. 「9時を10時に変更」 → plan.date は明日のまま
 *   4. 「移動は車に変更」 → plan.date は明日のまま
 *   5. 「12時に新宿でランチ」 → plan.date は明日のまま
 *   6. targetDate preserve により既存 items / events が壊れない
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  runMorningPipeline,
  createStubComprehensionProvider,
} from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import {
  resetEventCounter,
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { L1PipelineInput } from "@/lib/alter-morning/comprehension/l1Pipeline";
import type { MorningPlan } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayAfterTomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mkEvent(overrides?: Partial<Event>): Event {
  return {
    event_id: "event_1",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"], "high"),
    },
    where: {
      place_ref: "スターバックス コーヒー SHIBUYA TSUTAYA 2F店",
      placeType: "exact_proper_noun",
      coordinates: { lat: 35.6598, lng: 139.7004 },
      provenance: utteranceProvenance(["スタバ"], "high"),
    },
    what: {
      activity: "コーヒー",
      activityCanonical: "コーヒー",
      provenance: utteranceProvenance(["コーヒー"], "high"),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkRaw(
  overrides?: Partial<L1PipelineInput["raw"]>,
): L1PipelineInput["raw"] {
  return {
    targetDate: "today",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

function mkPriorPlan(date: string): MorningPlan {
  return {
    date,
    items: [
      {
        id: "event_prior",
        kind: "fixed",
        text: "09:00 スタバ コーヒー",
        what: "コーヒー",
        startTime: "09:00",
        durationMin: 30,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        whenSharpness: "fixed",
        whereSharpness: "fixed",
        whatSharpness: "fixed",
        confirmationState: "confirmed",
      },
    ],
    dayConditions: {},
    createdAt: new Date().toISOString(),
    confirmed: false,
    status: "confirmed",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 初回 turn: comprehension.targetDate を正しく解釈
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("targetDate preserve: 初回 turn (priorPlan なし)", () => {
  it("CEO ケース: comprehension.targetDate=tomorrow → plan.date = 明日", async () => {
    const raw = mkRaw({
      targetDate: "tomorrow",
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "明日の9時に渋谷のスタバでコーヒー" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "明日の9時に渋谷のスタバでコーヒー",
    });

    // CEO 不変条件: 「明日」 が今日に書き換わらない
    expect(adapted.session.plan?.date).toBe(tomorrowYmd());
    expect(adapted.session.plan?.date).not.toBe(todayYmd());
  });

  it("comprehension.targetDate=today → plan.date = 今日", async () => {
    const raw = mkRaw({
      targetDate: "today",
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "9時にスタバでコーヒー" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "9時にスタバでコーヒー",
    });
    expect(adapted.session.plan?.date).toBe(todayYmd());
  });

  it("comprehension.targetDate=day_after_tomorrow → plan.date = 明後日", async () => {
    const raw = mkRaw({
      targetDate: "day_after_tomorrow",
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "明後日の9時にスタバ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "明後日の9時にスタバ",
    });
    expect(adapted.session.plan?.date).toBe(dayAfterTomorrowYmd());
  });

  it("comprehension.targetDate=YYYY-MM-DD → そのまま採用", async () => {
    const raw = mkRaw({
      targetDate: "2026-05-15",
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "5月15日 9時にスタバ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "5月15日 9時にスタバ",
    });
    expect(adapted.session.plan?.date).toBe("2026-05-15");
  });

  it("comprehension.targetDate=不明な token → fallback (today)", async () => {
    const raw = mkRaw({
      targetDate: "next_monday", // 認識しない token
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "来週月曜の9時" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "来週月曜の9時",
    });
    expect(adapted.session.plan?.date).toBe(todayYmd());
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// turn 2 以降: priorPlan.date が継承される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("targetDate preserve: turn 2 以降 (priorPlan.date 維持)", () => {
  const tomorrow = tomorrowYmd();

  it("CEO Case: 初回「明日」 → turn 2 「電車」 → plan.date は明日のまま", async () => {
    // turn 2 で comprehension.targetDate=today を返しても、priorPlan.date=明日 が優先
    const priorPlan = mkPriorPlan(tomorrow);
    const priorEv = mkEvent({ event_id: "event_prior" });
    const raw = mkRaw({
      targetDate: "today", // ← LLM が誤って今日を返してきても
      events: [
        {
          ...priorEv,
          // raw.events は Omit<Event, "event_id">
        } as Omit<Event, "event_id">,
      ],
    });

    const pipelineResult = await runMorningPipeline(
      { utterance: "電車", priorPlanForContext: [priorEv] },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "電車",
      priorPersistedEvents: [priorEv],
      priorPlan, // ← priorPlan.date = 明日
    });

    // priorPlan.date が最優先で採用される
    expect(adapted.session.plan?.date).toBe(tomorrow);
    expect(adapted.session.plan?.date).not.toBe(todayYmd());
  });

  it("priorPlan.date=明後日 + comprehension.targetDate=tomorrow → 明後日が優先", async () => {
    const dayAfter = dayAfterTomorrowYmd();
    const priorPlan = mkPriorPlan(dayAfter);
    const priorEv = mkEvent({ event_id: "event_prior" });
    const raw = mkRaw({ targetDate: "tomorrow" });

    const pipelineResult = await runMorningPipeline(
      { utterance: "9時を10時に変更", priorPlanForContext: [priorEv] },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [priorEv],
      priorPlan,
    });

    expect(adapted.session.plan?.date).toBe(dayAfter);
  });

  it("priorPlan = null → comprehension.targetDate に fallback (turn 1 と同じ挙動)", async () => {
    const raw = mkRaw({
      targetDate: "tomorrow",
      events: [
        {
          turn_mode: "create",
          target_ref: null,
          target_ref_confidence: null,
          change_scope: null,
          when: {
            startTime: "09:00",
            timeHint: null,
            provenance: utteranceProvenance(["9時"], "high"),
          },
          where: {
            place_ref: "スタバ",
            placeType: "chain_brand",
            coordinates: null,
            provenance: utteranceProvenance(["スタバ"], "high"),
          },
          what: {
            activity: "コーヒー",
            activityCanonical: "コーヒー",
            provenance: utteranceProvenance(["コーヒー"], "high"),
          },
          who: [],
          transport: null,
          certainty: "asserted",
          missing_semantic_critical: [],
          missing_solver_blockers: [],
        },
      ],
    });
    const pipelineResult = await runMorningPipeline(
      { utterance: "明日の9時にスタバ" },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );
    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "s1",
      utterance: "明日の9時にスタバ",
      // priorPlan: undefined
    });
    expect(adapted.session.plan?.date).toBe(tomorrowYmd());
  });
});
