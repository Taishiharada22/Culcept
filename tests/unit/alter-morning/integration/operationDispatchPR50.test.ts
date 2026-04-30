/**
 * PR-50 5 cases integration tests (CEO 2026-04-30 Commit 5)
 *
 * Goal:
 *   Commit 3 (parser + validation) + Commit 4 (operationDispatcher) で組んだ
 *   「operation → validate → dispatch」 経路が **一気通貫で成立** していることを
 *   E2E で証明する。新しい挙動は追加しない。
 *
 *   各 case で:
 *     1. runMorningPipeline (operations を含む raw を stub provider で渡す)
 *     2. adaptPipelineToLegacy (legacyAdapter で fallbackToEvents 分岐)
 *     3. effectiveEvents (= session.persistedEvents) を assert
 *     4. trace.operations field を assert (received / accepted / rejected /
 *        fallbackToEvents / appliedTypes / rejectReasons)
 *
 * 5 cases:
 *   1. modify when (時間変更): 09:00 → 10:00、where/what/transport 不変
 *   2. modify transport (移動手段変更): train → walk、plan.dayConditions.mainTransport も更新
 *   3. append (予定追加): event_1 不変、event_2 追加、id collision なし
 *   4. answer (pendingClarify 回答): where slot bind、新規 event なし
 *   5. invalid fallback: prior 複数 + targetRef 解決失敗 → reject → events fallback
 *
 * trace 観測: VERCEL_ENV=preview を stub して emitTurnTrace を機能させる。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

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
import type { PlanOperation } from "@/lib/alter-morning/comprehension/planOperation";
import type { PendingClarify } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  resetEventCounter();
  // trace emission を有効化 (NODE_ENV=test では shouldEmitTrace=false なので)
  vi.stubEnv("VERCEL_ENV", "preview");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkPriorStarbucks(overrides?: Partial<Event>): Event {
  return {
    event_id: "event_prior",
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
      placeType: "exact_proper_noun",
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
  overrides: Partial<L1PipelineInput["raw"]>,
): L1PipelineInput["raw"] {
  return {
    targetDate: "2026-04-30",
    startPoint: null,
    departureTime: null,
    goOut: true,
    operations: [],
    events: [],
    ...overrides,
  };
}

function mkPendingWhere(eventId: string): PendingClarify {
  return {
    event_id: eventId,
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "9時", activityLabel: "コーヒー", eventOrdinal: 1 },
    question: "どのあたり？",
    askedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 1: 時間変更 (modify when)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Case 1: modify when (時間変更)", () => {
  it("09:00 → 10:00 (where/what/transport 不変)、trace.operations 完備", async () => {
    const prior = mkPriorStarbucks();
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "9時の予定",
      patch: { when: { startTime: "10:00", endTime: null, timeHint: null } },
    };
    const raw = mkRaw({ operations: [modifyOp] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "9時を10時に変更",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-case-1",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [prior],
    });

    // ── effective events ──
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.event_id).toBe("event_prior");
    expect(ev.when.startTime).toBe("10:00"); // 変更
    // 不変 fields (PR-46 contract)
    expect(ev.where.place_ref).toBe("スタバ");
    expect(ev.what.activity).toBe("コーヒー");
    expect(ev.transport).toBeNull();

    // ── trace.operations ──
    expect(adapted.lastTraceSnapshot).toBeDefined();
    // Commit 7 (synth): utterance「9時を10時に変更」 → deterministic pattern hit
    //   stub の raw.operations にも modify が入っているため LLM ops 非空 →
    //   synthesisSource = "deterministic_overrides_llm"
    expect(adapted.lastTraceSnapshot!.operations).toEqual({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["modify"],
      rejectReasons: [],
      synthesisSource: "deterministic_overrides_llm",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 2: 移動手段変更 (modify transport)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Case 2: modify transport (移動手段変更)", () => {
  it("train → 徒歩、plan.dayConditions.mainTransport も更新", async () => {
    const prior = mkPriorStarbucks({ transport: "train" });
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "今日の予定",
      patch: { transport: "walk" },
    };
    const raw = mkRaw({ operations: [modifyOp] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "徒歩に変更",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-case-2",
      utterance: "徒歩に変更",
      priorPersistedEvents: [prior],
    });

    // ── effective events: transport だけ更新 ──
    // Commit 7 (synth): utterance「徒歩に変更」 が deterministic transport-only
    //   pattern hit → LLM の patch.transport "walk" を上書きして
    //   parseTransportExact が正規化した「徒歩」 が採用される (日本語正規化 token)。
    //   これは現状の transport vocabulary の正規化方針 (parseTransport / Exact が
    //   日本語に正規化) と一致。後段 deriveDayTransport / synthesizeTravelItems で
    //   walk マップに変換される。
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe("event_prior");
    expect(events[0].transport).toBe("徒歩");
    // 不変 fields
    expect(events[0].when.startTime).toBe("09:00");
    expect(events[0].where.place_ref).toBe("スタバ");
    expect(events[0].what.activity).toBe("コーヒー");

    // ── plan.dayConditions: deriveDayTransport が effectiveEvents から
    //    再計算するので、transport=徒歩 が dayConditions.mainTransport に反映 ──
    //    deriveDayTransport は日本語 → walk 系正規化を行う想定 (transportContext.ts)。
    const plan = adapted.session.plan;
    expect(plan).toBeDefined();
    expect(plan!.dayConditions?.mainTransport).toBe("walk");

    // ── trace.operations ──
    // Commit 7 (synth): utterance「徒歩に変更」 → transport-only deterministic
    //   pattern hit、LLM ops 非空 → synthesisSource = "deterministic_overrides_llm"
    expect(adapted.lastTraceSnapshot!.operations).toEqual({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["modify"],
      rejectReasons: [],
      synthesisSource: "deterministic_overrides_llm",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 3: 予定追加 (append)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Case 3: append (予定追加)", () => {
  it("既存 event 不変、新 event 追加、id collision なし", async () => {
    const prior = mkPriorStarbucks();
    const appendOp: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "12:00",
          timeHint: null,
          provenance: utteranceProvenance(["12時"], "high"),
        },
        where: {
          place_ref: "新宿",
          placeType: "generic_place",
          provenance: utteranceProvenance(["新宿"], "high"),
        },
        what: {
          activity: "ランチ",
          activityCanonical: "ランチ",
          provenance: utteranceProvenance(["ランチ"], "high"),
        },
        who: ["武藤"],
        transport: null,
        certainty: "asserted",
      },
    };
    const raw = mkRaw({ operations: [appendOp] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "12時に新宿で武藤さんとランチ",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-case-3",
      utterance: "12時に新宿で武藤さんとランチ",
      priorPersistedEvents: [prior],
    });

    // ── effective events: 2 件 ──
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(2);
    // event 1 完全保持
    expect(events[0]).toEqual(prior);
    // event 2: append (id 衝突なし、event_prior と異なる)
    expect(events[1].event_id).not.toBe("event_prior");
    expect(events[1].event_id).toBe("event_1"); // generateNonCollidingEventId で event_1 (prior は event_prior 形式)
    expect(events[1].turn_mode).toBe("append");
    expect(events[1].when.startTime).toBe("12:00");
    expect(events[1].where.place_ref).toBe("新宿");
    expect(events[1].what.activity).toBe("ランチ");
    expect(events[1].who).toEqual(["武藤"]);

    // ── trace.operations ──
    // Commit 7 (synth): utterance「12時に新宿でランチ」 は時刻変更でも
    //   transport-only でもないので deterministic pattern hit せず → LLM ops を
    //   そのまま採用 → synthesisSource = "llm"
    expect(adapted.lastTraceSnapshot!.operations).toEqual({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["append"],
      rejectReasons: [],
      synthesisSource: "llm",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 4: pendingClarify 回答 (answer secondary path)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Case 4: answer (pendingClarify 回答, secondary safety path)", () => {
  it("where slot bind、新規 event は増えない", async () => {
    // prior: where が null で missing_semantic_critical=["where"]
    const prior = mkPriorStarbucks({
      where: {
        place_ref: null,
        placeType: null,
        provenance: utteranceProvenance([], "low"),
      },
      missing_semantic_critical: ["where"],
    });
    const pending = mkPendingWhere(prior.event_id);
    const answerOp: PlanOperation = {
      type: "answer",
      slot: "where",
      value: "池袋",
    };
    const raw = mkRaw({ operations: [answerOp] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "池袋",
        priorPlanForContext: [prior],
        priorPendingClarify: pending,
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "test-case-4",
      utterance: "池袋",
      priorPersistedEvents: [prior],
      priorPendingClarify: pending,
    });

    // ── effective events: 1 件 (新規追加なし)、where が "池袋" に bind ──
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe("event_prior");
    expect(events[0].where.place_ref).toBe("池袋");
    // when / what は prior 維持
    expect(events[0].when.startTime).toBe("09:00");
    expect(events[0].what.activity).toBe("コーヒー");

    // ── trace.operations ──
    // Commit 7 (synth): utterance「池袋」 は時刻変更でも transport-only でもない
    //   ので deterministic pattern hit せず → LLM ops (answer) をそのまま採用 →
    //   synthesisSource = "llm"
    expect(adapted.lastTraceSnapshot!.operations).toEqual({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["answer"],
      rejectReasons: [],
      synthesisSource: "llm",
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 5: invalid operation fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-50 Case 5: invalid operation fallback", () => {
  it("prior 複数 + targetRef 解決失敗 → reject → events fallback で既存挙動維持", async () => {
    // prior 2 件 (single_event_fallback が効かない条件)
    const prior1 = mkPriorStarbucks({ event_id: "event_p1" });
    const prior2 = mkPriorStarbucks({
      event_id: "event_p2",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: "generic_place",
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
    });
    // 解決不可能な targetRef
    const modifyOp: PlanOperation = {
      type: "modify",
      targetRef: "夜の予定",
      patch: { when: { startTime: "20:00", endTime: null, timeHint: null } },
    };
    const raw = mkRaw({ operations: [modifyOp], events: [] });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pipelineResult = await runMorningPipeline(
        {
          utterance: "夜の予定を20時に変更",
          priorPlanForContext: [prior1, prior2],
        },
        { comprehension: createStubComprehensionProvider(raw), weather: null },
      );

      // validation で modify_target_unresolved reject (prior 複数 + 解決失敗)
      expect(pipelineResult.comprehension!.fallbackToEvents).toBe(true);
      expect(pipelineResult.comprehension!.operationRejections).toEqual([
        expect.objectContaining({ reason: "modify_target_unresolved" }),
      ]);

      const adapted = adaptPipelineToLegacy(pipelineResult, {
        sessionId: "test-case-5",
        utterance: "夜の予定を20時に変更",
        priorPersistedEvents: [prior1, prior2],
      });

      // ── effective events: events 経路 fallback、events も空なので
      //    state は priorPersistedEvents のまま (= 安全に既存挙動へ戻る) ──
      const events = adapted.session.persistedEvents ?? [];
      expect(events).toHaveLength(2);
      expect(events[0].event_id).toBe("event_p1");
      expect(events[0].when.startTime).toBe("09:00"); // 不変
      expect(events[1].event_id).toBe("event_p2");
      expect(events[1].when.startTime).toBe("12:00"); // 不変

      // ── trace.operations ──
      // Commit 7 (synth): utterance「夜の予定を20時に変更」 は「N時を M時に」
      //   pattern (「夜」 は数字でない) に該当しないので deterministic pattern
      //   hit せず → LLM ops をそのまま採用 → synthesisSource = "llm"
      //   その後 validation で modify_target_unresolved reject。
      expect(adapted.lastTraceSnapshot!.operations).toEqual({
        received: 1,
        accepted: 0,
        rejected: 1,
        fallbackToEvents: true,
        appliedTypes: [],
        rejectReasons: ["modify_target_unresolved"],
        synthesisSource: "llm",
      });
    } finally {
      warn.mockRestore();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preview 観測ケース修復 (Commit 6-9 全層通過の E2E)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 観測 (Preview 2026-04-30) で以下の退化が判明:
//   1. LLM が「9時を10時に変更」 を operations 空で返す → modify が動かない
//   2. LLM が「電車」 を「event_1 完全コピー + transport=電車」 で append output
//      → events[] 経路で kept_as_new、duplicate event 発生
//
// PR-50.1 (Commit 6-9) で以下を修正:
//   1. Commit 7 deterministic synth: LLM 出力に依存せず utterance pattern で
//      modify を生成 → 「9時を10時に変更」 が動く
//   2. Commit 8 LLM operations inspector: LLM bad append を transform して
//      modify に変換 → duplicate を防ぐ
//
// 以下の E2E test で Preview 退化が解消されたことを固定する。

describe("PR-50 Preview 観測退化の修復 (Commit 6-9)", () => {
  it("LLM 不出力時でも「9時を10時に変更」 が deterministic synth で動く", async () => {
    const prior = mkPriorStarbucks();
    // CEO Preview 観測: LLM が operations / events 両方空で返す状況を再現
    const raw = mkRaw({ operations: [], events: [] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "9時を10時に変更",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "preview-fix-1",
      utterance: "9時を10時に変更",
      priorPersistedEvents: [prior],
    });

    // Commit 7 deterministic synth が utterance pattern hit
    //   LLM ops 空 → synthesisSource = "deterministic" (overrides_llm でない)
    expect(adapted.lastTraceSnapshot!.operations).toMatchObject({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["modify"],
      synthesisSource: "deterministic",
    });

    // event_1 の startTime が 10:00 に変更
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].when.startTime).toBe("10:00");
    // PR-46 contract: where / what 不変
    expect(events[0].where.place_ref).toBe("スタバ");
    expect(events[0].what.activity).toBe("コーヒー");
  });

  it("LLM が bad append (transport-only duplicate) を出しても、deterministic で modify に変換", async () => {
    const prior = mkPriorStarbucks({ transport: null });
    // CEO Preview 観測: LLM が「電車」 を以下で append output
    const llmBadAppend: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: "電車",
        certainty: "asserted",
      },
    };
    const raw = mkRaw({ operations: [llmBadAppend], events: [] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "電車",
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "preview-fix-2",
      utterance: "電車",
      priorPersistedEvents: [prior],
    });

    // Commit 7 deterministic synth が「電車」 utterance pattern hit、LLM ops を上書き
    //   deterministic_overrides_llm
    expect(adapted.lastTraceSnapshot!.operations).toMatchObject({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["modify"],
      synthesisSource: "deterministic_overrides_llm",
    });

    // duplicate event が作られていない (1 件のみ + transport 更新)
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe(prior.event_id);
    expect(events[0].transport).toBe("電車");
    // 不変 fields
    expect(events[0].when.startTime).toBe("09:00");
    expect(events[0].where.place_ref).toBe("スタバ");
  });

  it("LLM bad append + utterance が pattern hit しない場合 → Layer 2 inspector で transform", async () => {
    // utterance が transport-only でも時刻変更でもない場合 (Commit 8 Layer 2 単独動作)
    const prior = mkPriorStarbucks({ transport: null });
    const llmBadAppend: PlanOperation = {
      type: "append",
      eventDraft: {
        when: {
          startTime: "09:00",
          timeHint: null,
          provenance: utteranceProvenance(["9時"], "high"),
        },
        where: {
          place_ref: "スタバ",
          placeType: "exact_proper_noun",
          provenance: utteranceProvenance(["スタバ"], "high"),
        },
        what: {
          activity: "コーヒー",
          activityCanonical: "コーヒー",
          provenance: utteranceProvenance(["コーヒー"], "high"),
        },
        who: [],
        transport: "徒歩",
        certainty: "asserted",
      },
    };
    const raw = mkRaw({ operations: [llmBadAppend], events: [] });

    const pipelineResult = await runMorningPipeline(
      {
        utterance: "うん", // pattern hit しない発話 (LLM が文脈で transport を抽出した想定)
        priorPlanForContext: [prior],
      },
      { comprehension: createStubComprehensionProvider(raw), weather: null },
    );

    const adapted = adaptPipelineToLegacy(pipelineResult, {
      sessionId: "preview-fix-3",
      utterance: "うん",
      priorPersistedEvents: [prior],
    });

    // Layer 1 (utterance) hit せず、Layer 2 (LLM inspect) で transform
    //   synthesisSource = "llm_transformed"
    expect(adapted.lastTraceSnapshot!.operations).toMatchObject({
      received: 1,
      accepted: 1,
      rejected: 0,
      fallbackToEvents: false,
      appliedTypes: ["modify"],
      synthesisSource: "llm_transformed",
    });

    // duplicate event が作られていない (Commit 8 が transform したので modify 適用済)
    const events = adapted.session.persistedEvents ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].transport).toBe("徒歩");
  });
});
