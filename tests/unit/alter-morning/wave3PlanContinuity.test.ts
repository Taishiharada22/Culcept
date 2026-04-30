/**
 * items=0 禁則 + plan 継続性 — W3-PR-7 Commit 4
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §4.5 / §8.4
 *
 * カバレッジ:
 *   - phase=clarifying でも message が空にならない（items=0 禁則）
 *   - primary_clarify.question が空でも scope/kind 再生成で修復
 *   - primary_clarify 無し + priorPendingClarify あり → 前ターンの question 継承
 *   - clarifying 中でも plan.items が保持される（provisional）
 *   - comprehension_failed で今ターン events 空 + priorPersistedEvents → plan 継承
 *   - comprehension_failed で events も priorPersistedEvents も無い + priorPlan → plan 継承
 *   - plan.status が 3 値（confirmed / needs_answer / provisional）で出る
 *   - decidePhase は status!=ok || primary_clarify!=null のみで判定
 */
import { describe, test, expect, vi, afterEach } from "vitest";

import {
  inferredProvenance,
  utteranceProvenance,
  type Event as ComprehensionEvent,
} from "@/lib/alter-morning/comprehension/eventSchema";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type {
  MorningPlan,
  PendingClarify,
} from "@/lib/alter-morning/types";
import type {
  ClarifyRequest,
  ClarifyScope,
} from "@/lib/alter-morning/planning/gapResolver";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<ComprehensionEvent> = {}): ComprehensionEvent {
  return {
    event_id: "e1",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: { startTime: "09:00", timeHint: null, provenance: utteranceProvenance(["9時"]) },
    where: {
      place_ref: "オフィス",
      placeType: "exact_proper_noun",
      provenance: utteranceProvenance(["オフィス"]),
    },
    what: {
      activity: "仕事",
      activityCanonical: "仕事",
      provenance: utteranceProvenance(["仕事"]),
    },
    who: [],
    transport: null,
    missing_semantic_critical: [],
    missing_solver_blockers: [],
    ...overrides,
  };
}

function mkScope(overrides: Partial<ClarifyScope> = {}): ClarifyScope {
  return {
    timeLabel: null,
    activityLabel: null,
    eventOrdinal: 1,
    sameLabelCount: 1,
    ...overrides,
  };
}

function mkClarifyRequest(
  overrides: Partial<ClarifyRequest> = {},
): ClarifyRequest {
  return {
    event_id: "e1",
    kind: "where_center",
    target_slot: "where",
    hint: "仕事",
    scope: mkScope({ timeLabel: "朝", activityLabel: "仕事" }),
    question: "朝の仕事はどのあたり？",
    ...overrides,
  };
}

function mkOkResult(opts: {
  events: ComprehensionEvent[];
  primaryClarify?: ClarifyRequest | null;
  narrationText?: string | null;
}): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      targetDate: "2026-04-22",
      events: opts.events,
      startPoint: null,
      departureTime: null,
      goOut: null,
    },
    gapResolution: {
      actions: [],
      primary_clarify: opts.primaryClarify ?? null,
    },
    narration: opts.narrationText
      ? { narration: { text: opts.narrationText } }
      : null,
    weather: null,
  } as unknown as MorningPipelineResult;
}

function mkFailedResult(): MorningPipelineResult {
  return {
    status: "comprehension_failed",
    comprehension: null,
    gapResolution: null,
    narration: null,
    weather: null,
  } as unknown as MorningPipelineResult;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// items=0 禁則
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("items=0 禁則: phase=clarifying なら message は非空", () => {
  test("primary_clarify.question あり → その question を返す", () => {
    const pc = mkClarifyRequest({ question: "朝の仕事は何時頃？" });
    const result = mkOkResult({
      events: [mkEvent({ when: { startTime: null, timeHint: "morning", provenance: utteranceProvenance(["朝"]) } })],
      primaryClarify: pc,
    });
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "朝カフェ",
    });
    expect(response.phase).toBe("clarifying");
    expect(response.message).toBe("朝の仕事は何時頃？");
    expect(response.message.length).toBeGreaterThan(0);
  });

  test("primary_clarify はあるが question が空 → scope/kind から再生成", () => {
    // CEO 2026-04-28 PR #41b-0: primary_clarify は target slot が effectiveEvents で
    // fixed なら drop される (condition 3)。本テストでは where が vague な event を
    // 使い、primary_clarify (where_center) と一貫した状態を作る。
    const pc = mkClarifyRequest({
      question: "   ",
      kind: "where_center",
      scope: mkScope({ timeLabel: "朝", activityLabel: "仕事" }),
    });
    const result = mkOkResult({
      events: [
        mkEvent({
          where: {
            place_ref: "カフェ",
            placeType: null, // category_alone → vague (blocking)
            provenance: utteranceProvenance(["カフェ"]),
          },
        }),
      ],
      primaryClarify: pc,
    });
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "朝仕事",
    });
    expect(response.phase).toBe("clarifying");
    expect(response.message).toBe("朝の仕事はどのあたり？");
  });

  test("comprehension_failed で primary_clarify 無し + priorPendingClarify あり → 前 question 継承（prod safe degrade）", () => {
    // W3-PR-8 items=0 禁則: dev/test では throw、prod のみ safe degrade。
    // priorPlan / priorPersistedEvents 無し + failure は items=0 に陥るため prod 前提。
    const orig = process.env.NODE_ENV;
    // @ts-expect-error — NODE_ENV は readonly だがテスト時上書き
    process.env.NODE_ENV = "production";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const priorPending: PendingClarify = {
        event_id: "e1",
        slot: "when",
        kind: "specific_time",
        scope: { timeLabel: "朝", activityLabel: "仕事", eventOrdinal: 1 },
        question: "朝の仕事は何時頃？",
        askedAt: new Date().toISOString(),
        semanticMissCount: 0,
      };
      const result = mkFailedResult();
      const { response } = adaptPipelineToLegacy(result, {
        sessionId: "ms_t",
        utterance: "（認識失敗）",
        priorPendingClarify: priorPending,
      });
      expect(response.phase).toBe("clarifying");
      expect(response.message).toBe("朝の仕事は何時頃？");
      expect(response.plan).toBeUndefined();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      // @ts-expect-error — restore
      process.env.NODE_ENV = orig;
      errSpy.mockRestore();
    }
  });

  test("絶対 fallback: 何も手がかりが無ければ generic（prod safe degrade）", () => {
    const orig = process.env.NODE_ENV;
    // @ts-expect-error
    process.env.NODE_ENV = "production";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = mkFailedResult();
      const { response } = adaptPipelineToLegacy(result, {
        sessionId: "ms_t",
        utterance: "（認識失敗）",
      });
      expect(response.phase).toBe("clarifying");
      expect(response.message.length).toBeGreaterThan(0);
      expect(response.message).toContain("詳しく");
      expect(response.plan).toBeUndefined();
    } finally {
      // @ts-expect-error
      process.env.NODE_ENV = orig;
      errSpy.mockRestore();
    }
  });

  test("W3-PR-8: dev/test 環境で phase=clarifying items=0 → throw", () => {
    // NODE_ENV=test (vitest default) で throw を期待
    const result = mkFailedResult();
    expect(() =>
      adaptPipelineToLegacy(result, {
        sessionId: "ms_t",
        utterance: "（認識失敗）",
      }),
    ).toThrow(/contract violation: phase=clarifying with empty items/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// clarifying でも plan が残る（provisional）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("plan 継続性: clarifying 中も plan は消えない", () => {
  test("primary_clarify あり + events あり → plan.items=events.length, status=needs_answer", () => {
    // CEO 2026-04-28 PR #41b-0: primary_clarify (where_center) と event の where が
    // 一貫している必要がある。default mkEvent の where=オフィス は fixed なので
    // primary_clarify が drop されてしまう。where vague な event に変更する。
    const ev = mkEvent({
      where: {
        place_ref: "カフェ",
        placeType: null, // category_alone → vague (blocking)
        provenance: utteranceProvenance(["カフェ"]),
      },
    });
    const result = mkOkResult({
      events: [ev],
      primaryClarify: mkClarifyRequest(),
    });
    const { response, session } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "朝カフェ",
    });
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    expect(response.plan!.status).toBe("needs_answer");
    expect(session.plan).toBe(response.plan);
  });

  test("primary_clarify 無し + events あり + plan_presented → status=confirmed", () => {
    const ev = mkEvent();
    const result = mkOkResult({
      events: [ev],
      primaryClarify: null,
      narrationText: "9時にオフィスで仕事",
    });
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "9時オフィス",
    });
    expect(response.phase).toBe("plan_presented");
    expect(response.plan).toBeDefined();
    expect(response.plan!.status).toBe("confirmed");
  });

  test("comprehension_failed + priorPersistedEvents → plan.items 継承 status=provisional", () => {
    const priorEv = mkEvent({ event_id: "e_prior", when: { startTime: "08:00", timeHint: null, provenance: utteranceProvenance(["8時"]) } });
    const result = mkFailedResult();
    const { response, session } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "（認識失敗）",
      priorPersistedEvents: [priorEv],
    });
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    expect(response.plan!.items[0].id).toBe("e_prior");
    // pendingClarify は無い（primary_clarify も priorPending も無し）→ provisional
    expect(response.plan!.status).toBe("provisional");
    expect(session.persistedEvents?.length).toBe(1);
  });

  test("comprehension_failed + priorPlan のみ → plan 継承 status=provisional", () => {
    const priorPlan: MorningPlan = {
      date: "2026-04-22",
      items: [
        {
          id: "e_prior",
          kind: "fixed",
          text: "08:00 出発",
          what: "出発",
          startTime: "08:00",
          durationMin: 30,
          durationSource: "inferred",
          fixedStart: true,
          orderHint: 0,
          sourceTurnIndex: 0,
          completed: false,
        },
      ],
      dayConditions: {},
      createdAt: new Date().toISOString(),
      confirmed: false,
      status: "confirmed",
    };
    const result = mkFailedResult();
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "（認識失敗）",
      priorPlan,
    });
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    expect(response.plan!.status).toBe("provisional");
  });

  test("events も priorPersistedEvents も priorPlan も無い → plan=undefined でも message は出る（prod safe degrade）", () => {
    const orig = process.env.NODE_ENV;
    // @ts-expect-error
    process.env.NODE_ENV = "production";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = mkFailedResult();
      const { response } = adaptPipelineToLegacy(result, {
        sessionId: "ms_t",
        utterance: "（認識失敗）",
      });
      expect(response.phase).toBe("clarifying");
      expect(response.plan).toBeUndefined();
      expect(response.message.length).toBeGreaterThan(0);
    } finally {
      // @ts-expect-error
      process.env.NODE_ENV = orig;
      errSpy.mockRestore();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// decidePhase シンプル化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("decidePhase: status!=ok || primary_clarify!=null のみで判定", () => {
  test("status=ok + primary_clarify=null + narration 空 → plan_presented（旧 safety net 撤廃）", () => {
    const ev = mkEvent();
    const result = mkOkResult({ events: [ev], primaryClarify: null, narrationText: null });
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "9時オフィス",
    });
    expect(response.phase).toBe("plan_presented");
    // narration 空でも deterministic fallback で非空 message
    expect(response.message.length).toBeGreaterThan(0);
    expect(response.message).toContain("仕事");
  });

  test("missing_semantic_critical が残っても primary_clarify 無ければ plan_presented", () => {
    // 旧 safety net: missing_semantic_critical 二重化 → clarifying に倒す
    // 新: gapResolver の責務に一元化、primary_clarify が正本
    const ev = mkEvent({ missing_semantic_critical: ["when"] });
    const result = mkOkResult({
      events: [ev],
      primaryClarify: null,
      narrationText: "9時にオフィスで仕事",
    });
    const { response } = adaptPipelineToLegacy(result, {
      sessionId: "ms_t",
      utterance: "オフィスで仕事",
    });
    expect(response.phase).toBe("plan_presented");
  });

  test("status!=ok → 必ず clarifying（prod safe degrade）", () => {
    const orig = process.env.NODE_ENV;
    // @ts-expect-error
    process.env.NODE_ENV = "production";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = mkFailedResult();
      const { response } = adaptPipelineToLegacy(result, {
        sessionId: "ms_t",
        utterance: "...",
      });
      expect(response.phase).toBe("clarifying");
    } finally {
      // @ts-expect-error
      process.env.NODE_ENV = orig;
      errSpy.mockRestore();
    }
  });
});
