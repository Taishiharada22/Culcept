/**
 * CEO success scenario integration test — PR #41b-0 Commit 4
 *
 * CEO 2026-04-28 "9時を10時に変更" 一連のシナリオを legacyAdapter レベルで E2E 検証。
 *
 * シナリオ:
 *   Turn 1: User「9時にカフェでコーヒー」
 *     → events[0] when=09:00, where=カフェ vague, what=コーヒー fixed
 *     → primary_clarify=where_center (where vague)
 *     → phase=clarifying, pendingClarify={slot:"where", kind:"where_center"}
 *
 *   Turn 2: User「サドヤ」 (place selection)
 *     → events[0] where=サドヤ exact_proper_noun fixed
 *     → primary_clarify=null (where fixed)
 *     → phase=plan_presented, pendingClarify=null
 *
 *   Turn 3: User「9時を10時に変更」
 *     → guard fires, events[0] turn_mode=modify, when=10:00 (suggestedNewStartTime)
 *     → mergeEventFields: priorEvent (09:00, サドヤ, コーヒー) と merge → 全 fixed
 *     → reconcile (PR #41b-0): primary_clarify (about when from pre-mutation) stale → drop
 *     → eventsFullyFixed=true → plan_presented
 *
 * 検証観点 (CEO 必須条件 6 項目):
 *   1. gapResolver は raw currentEvents ではなく、merge後の effectiveEvents を基準に再計算
 *   2. pendingClarify は prior fallback で古い where 質問を引き継がない
 *   3. where が fixed かつ missingSemanticCritical に where がない場合、where pendingClarify は必ず消える
 *   4. dialogState.focus が where のままでも、effectiveEvents 側で where fixed なら focus を clear / advance
 *      (本 commit では legacyAdapter wire で priorDialogState=null のため focusCleared 観測のみ)
 *   5. semanticMissStreak / capturedHistory の flat 連続は、resolved event に対して reset
 *      (dialogState wire 完了後に検証、本 commit では skip)
 *   6. 未解決slotがなければ phase は plan_presented に進む
 *
 * trace 観測 (Commit 3 で追加):
 *   - reconcile.eventsFullyFixed = true
 *   - reconcile.primaryClarifyDropped = true (Turn 3 のみ)
 *   - reconcile.phaseChanged = true (clarifying → plan_presented, Turn 3)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { ClarifyRequest } from "@/lib/alter-morning/planning/gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<Event>): Event {
  const base: Event = {
    event_id: "evt_x",
    turn_mode: "create",
    target_ref: null,
    target_ref_confidence: null,
    change_scope: null,
    when: {
      startTime: null,
      timeHint: null,
      provenance: inferredProvenance(),
    },
    where: {
      place_ref: null,
      placeType: null,
      coordinates: null,
      provenance: inferredProvenance(),
    },
    what: {
      activity: "",
      activityCanonical: "",
      provenance: inferredProvenance(),
    },
    who: [],
    transport: null,
    certainty: "asserted",
    missing_semantic_critical: [],
    missing_solver_blockers: [],
  };
  return { ...base, ...overrides } as Event;
}

function mkResult(opts: {
  events: Event[];
  primaryClarify?: ClarifyRequest | null;
}): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      events: opts.events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: null,
    },
    timeline: { entries: [], violations: [] },
    grounded: [],
    gapResolution: {
      actions: opts.events.map((ev) => ({
        type: "pass_through" as const,
        event_id: ev.event_id,
      })),
      primary_clarify: opts.primaryClarify ?? null,
    },
    annotations: { body: [], weather: [], party: [] },
    narration: null,
    hints: {
      explicit_times: [],
      explicit_start_points: [],
      slot_opt_outs: [],
    },
  };
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("VERCEL_ENV", "preview");
});

afterEach(() => {
  consoleSpy.mockRestore();
  vi.unstubAllEnvs();
});

function captureLog(): { payload: Record<string, unknown> } | null {
  const calls = consoleSpy.mock.calls.filter(
    (c: unknown[]) => c[0] === "[alter-morning:trace]",
  );
  if (calls.length === 0) return null;
  const lastCall = calls[calls.length - 1];
  const payload = JSON.parse(lastCall[1] as string) as Record<string, unknown>;
  return { payload };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO success scenario: 9時を10時に変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO 2026-04-28 success scenario: 9時を10時に変更", () => {
  it("[CEO 6 条件 統合検証] Turn 3 で reconcile が all 6 conditions を達成する", () => {
    // Turn 1-2 の最終状態を simulate: events[0] は確定済 (when=09:00, where=サドヤ, what=コーヒー)
    const turn2FinalEvent: Event = mkEvent({
      event_id: "evt_morning",
      turn_mode: "create",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: { lat: 35.66, lng: 138.57 },
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });

    // Turn 3 開始: User「9時を10時に変更」
    //   - LLM は「create」 で events[0]={when:null/morning vague, where=null, ...} を返す想定
    //     (LLM は「変更」 patterns を弱く認識)
    //   - guard 発火 → events[0]={turn_mode:modify, when=10:00 fixed, target_ref:"9時の予定"}
    //   - mergeEventFields: prior(turn2FinalEvent) と merge → 全 fixed
    const llmTurn3Event: Event = mkEvent({
      event_id: "evt_turn3", // LLM 生 event_id (新規)
      turn_mode: "create",
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: utteranceProvenance(["朝"], "medium"),
      },
      // where / what も null (LLM の partial output)
    });

    // pipeline gapResolution (pre-guard / pre-merge events 基準で計算)
    //   primary_clarify=specific_time (when missing/vague) と仮定
    const stalePrimary: ClarifyRequest = {
      event_id: "evt_turn3", // pipeline は LLM 生 event_id を refer
      kind: "specific_time",
      target_slot: "when",
      hint: "コーヒー",
      scope: {
        timeLabel: "朝",
        activityLabel: "コーヒー",
        eventOrdinal: 1,
        sameLabelCount: 1,
      },
      question: "コーヒーは何時頃？", // ← stale (when は guard で 10:00 に固定される)
    };

    // 古い pendingClarify (Turn 1 の where_center が turns 跨ぎで stuck)
    // Turn 2 で resolved だが意図的に carry-over させる
    const stalePendingFromTurn1 = {
      event_id: "evt_morning",
      slot: "where" as const,
      kind: "where_center",
      scope: { timeLabel: "9時", activityLabel: "コーヒー", eventOrdinal: 1 },
      question: "9時のコーヒーはどのあたり？",
      askedAt: "2026-04-28T03:55:47.638Z",
      semanticMissCount: 4,
    };

    // legacyAdapter 呼び出し
    const { response, session } = adaptPipelineToLegacy(
      mkResult({
        events: [llmTurn3Event],
        primaryClarify: stalePrimary,
      }),
      {
        sessionId: "ms_t",
        utterance: "9時を10時に変更",
        priorPersistedEvents: [turn2FinalEvent],
        priorPendingClarify: stalePendingFromTurn1,
      },
    );

    // ─── CEO 条件 6: 未解決 slot なし → phase=plan_presented ──
    expect(response.phase).toBe("plan_presented");

    // ─── CEO 条件 2,3: pendingClarify は null (stale fallback しない) ──
    expect(session.pendingClarify).toBeNull();

    // ─── plan が build されている ──
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    expect(response.plan!.status).toBe("confirmed");

    // ─── effectiveEvents は guard 補正済 + dispatch (modify apply) 済 ──
    //   PR #41b-1a: applyModifyPatch で prior.when.startTime=10:00 に更新済み
    //   prior の turn_mode="create" は維持 (modify は apply 後消える)
    //   target_ref は解決後 clear
    const persisted = session.persistedEvents;
    expect(persisted).toBeDefined();
    expect(persisted!.length).toBe(1);
    expect(persisted![0].event_id).toBe("evt_morning"); // prior id 維持
    // CEO Case 1 真因 fix: when=10:00 に更新
    expect(persisted![0].when.startTime).toBe("10:00");
    // turn_mode は prior の "create" を維持 (modify apply 後)
    expect(persisted![0].turn_mode).toBe("create");
    // target_ref は解決後 clear
    expect(persisted![0].target_ref).toBeNull();

    // ─── trace で reconcile 観測 ──
    const captured = captureLog();
    expect(captured).not.toBeNull();
    const reconcile = captured!.payload.reconcile as {
      phaseChanged: boolean;
      primaryClarifyDropped: boolean;
      pendingClarifyChanged: boolean;
      eventsFullyFixed: boolean;
      focusCleared: boolean;
    };

    // CEO 条件 1: gapResolver 由来 primary_clarify が effectiveEvents 基準で stale
    //   → drop されたことを trace で pin できる
    expect(reconcile.primaryClarifyDropped).toBe(true);

    // CEO 条件 6: events 全 fixed
    expect(reconcile.eventsFullyFixed).toBe(true);

    // phase changed: clarifying → plan_presented
    expect(reconcile.phaseChanged).toBe(true);

    // pendingClarify が変わった (priorPending あり → null)
    expect(reconcile.pendingClarifyChanged).toBe(true);

    // CEO 条件 4: dialogState は本 commit で priorDialogState=null 渡しのため focusCleared=false
    //   (route 側 reducer 統合で別途検証する)
    expect(reconcile.focusCleared).toBe(false);

    // modifyCandidate 観測 (PR #41a)
    expect(captured!.payload.modifyCandidate).toBe(true);
  });

  it("[CEO 条件 1 単独] 同一 event の partial update (where 確定後) で primary_clarify=null へ", () => {
    // priorEv: where=サドヤ exact_proper_noun (fixed)
    // 当 turn LLM: events[0]={event_id同じ, partial: where=null}
    //   → mergeEventFields で where=サドヤ が prior から carry
    //   → 全 fixed
    // 古い primary_clarify (where_center) は effectiveEvents 基準で stale
    const priorEv: Event = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "サドヤ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["サドヤ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const partialLlmEv: Event = mkEvent({
      event_id: "e1", // 同 event_id (LLM が context bind で同 id を返した)
      turn_mode: "create",
      // where は LLM が漏らした (partial)
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
    });

    // pipeline 計算: partial event 基準で primary_clarify=where_center
    const stalePrimary: ClarifyRequest = {
      event_id: "e1",
      kind: "where_center",
      target_slot: "where",
      hint: "コーヒー",
      scope: {
        timeLabel: "9時",
        activityLabel: "コーヒー",
        eventOrdinal: 1,
        sameLabelCount: 1,
      },
      question: "9時のコーヒーはどのあたり？",
    };

    const { response } = adaptPipelineToLegacy(
      mkResult({
        events: [partialLlmEv],
        primaryClarify: stalePrimary,
      }),
      {
        sessionId: "ms_t",
        utterance: "9時にコーヒー",
        priorPersistedEvents: [priorEv],
      },
    );

    // mergeEventFields で where=サドヤ が carry → effectiveEvents 全 fixed
    // → primary_clarify (where) が stale → drop
    // → phase=plan_presented
    expect(response.phase).toBe("plan_presented");

    const captured = captureLog();
    const reconcile = captured!.payload.reconcile as {
      primaryClarifyDropped: boolean;
      eventsFullyFixed: boolean;
    };
    expect(reconcile.primaryClarifyDropped).toBe(true);
    expect(reconcile.eventsFullyFixed).toBe(true);
  });
});
