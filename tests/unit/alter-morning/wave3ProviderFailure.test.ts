/**
 * Provider failure 耐性 — W3-PR-7 Commit 5
 *
 * 目的:
 *   provider / pipeline が throw しても **会話状態（plan / pending / events）を
 *   壊さない** ことを固定する。provider 自体の修正は別 PR。
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §8.5
 *
 * カバレッジ:
 *   1. comprehension_failed でも plan が消えない（priorPlan / priorPersistedEvents）
 *   2. pendingClarify が維持される
 *   3. failure 後も phase=clarifying で question が非空
 *   4. sticky session で前ターン状態（rawInputs / events / plan / pending）が継承される
 *   5. system_miss 相当の扱い: semanticMissCount は increment されない
 *      （bind 経路の semantic_miss 2-count 破棄ポリシーを壊さない）
 */
import { describe, test, expect, vi } from "vitest";

import {
  utteranceProvenance,
  type Event as ComprehensionEvent,
} from "@/lib/alter-morning/comprehension/eventSchema";
import {
  adaptPipelineToLegacy,
  buildFailedPipelineResult,
} from "@/lib/alter-morning/legacyAdapter";
import type {
  MorningPlan,
  PendingClarify,
} from "@/lib/alter-morning/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(overrides: Partial<ComprehensionEvent> = {}): ComprehensionEvent {
  return {
    event_id: "e_prior",
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["9時"]),
    },
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

function mkPending(overrides: Partial<PendingClarify> = {}): PendingClarify {
  return {
    event_id: "e_prior",
    slot: "where",
    kind: "where_center",
    scope: { timeLabel: "朝", activityLabel: "仕事", eventOrdinal: 1 },
    question: "朝の仕事はどのあたり？",
    askedAt: "2026-04-22T08:00:00.000Z",
    semanticMissCount: 0,
    ...overrides,
  };
}

/**
 * W3-PR-8 items=0 禁則: dev/test では throw、prod のみ safe degrade。
 * provider failure テストの多くは priorPlan/priorPersistedEvents を渡さずに
 * `items=0` パスを踏むため、NODE_ENV=production でのみ検証する。
 */
function withProdEnv<T>(fn: () => T): T {
  const orig = process.env.NODE_ENV;
  // @ts-expect-error — NODE_ENV は readonly だがテスト時上書き
  process.env.NODE_ENV = "production";
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    return fn();
  } finally {
    // @ts-expect-error
    process.env.NODE_ENV = orig;
    errSpy.mockRestore();
  }
}

function mkPlan(overrides: Partial<MorningPlan> = {}): MorningPlan {
  return {
    date: "2026-04-22",
    items: [
      {
        id: "e_prior",
        kind: "fixed",
        text: "09:00 オフィス 仕事",
        what: "仕事",
        startTime: "09:00",
        durationMin: 45,
        durationSource: "inferred",
        fixedStart: true,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
      },
    ],
    dayConditions: {},
    createdAt: "2026-04-22T08:00:00.000Z",
    confirmed: false,
    status: "needs_answer",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildFailedPipelineResult — 合成 comprehension_failed の契約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildFailedPipelineResult: 合成 comprehension_failed の形", () => {
  test("status=comprehension_failed / comprehension=null / gapResolution=null", () => {
    const r = buildFailedPipelineResult();
    expect(r.status).toBe("comprehension_failed");
    expect(r.comprehension).toBeNull();
    expect(r.gapResolution).toBeNull();
    expect(r.narration).toBeNull();
    expect(r.timeline).toBeNull();
    expect(r.grounded).toEqual([]);
    expect(r.annotations.body).toEqual([]);
    expect(r.annotations.weather).toEqual([]);
    expect(r.annotations.party).toEqual([]);
    // hints も空で安全
    expect(r.hints.explicit_times).toEqual([]);
    expect(r.hints.explicit_start_points).toEqual([]);
    expect(r.hints.slot_opt_outs).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. comprehension_failed でも plan が消えない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("provider failure 吸収: plan は消えない", () => {
  test("priorPersistedEvents があれば plan.items に再構築される", () => {
    const priorEv = mkEvent();
    const { response, session } = adaptPipelineToLegacy(
      buildFailedPipelineResult(),
      {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorPersistedEvents: [priorEv],
      },
    );
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    expect(response.plan!.items[0].id).toBe("e_prior");
    expect(response.plan!.status).toBe("provisional");
    expect(session.persistedEvents?.length).toBe(1);
  });

  test("priorPersistedEvents 無し + priorPlan あり → plan 継承", () => {
    const { response } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
      sessionId: "ms_pf",
      utterance: "（provider throw）",
      priorPlan: mkPlan({ status: "confirmed" }),
    });
    expect(response.phase).toBe("clarifying");
    expect(response.plan).toBeDefined();
    expect(response.plan!.items.length).toBe(1);
    // 失敗時は confirmed にしない — needs_answer or provisional に引き下げる
    expect(response.plan!.status).not.toBe("confirmed");
  });

  test("prior 何も無ければ plan は undefined でも会話は壊れない（prod safe degrade）", () => {
    withProdEnv(() => {
      const { response } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
      });
      expect(response.phase).toBe("clarifying");
      expect(response.plan).toBeUndefined();
      expect(response.message.length).toBeGreaterThan(0);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. pendingClarify が維持される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("provider failure 吸収: pendingClarify が維持される", () => {
  test("priorPendingClarify はそのまま session.pendingClarify に継承（prod safe degrade）", () => {
    withProdEnv(() => {
      const prior = mkPending();
      const { session } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorPendingClarify: prior,
      });
      expect(session.pendingClarify).not.toBeNull();
      expect(session.pendingClarify?.event_id).toBe(prior.event_id);
      expect(session.pendingClarify?.slot).toBe(prior.slot);
      expect(session.pendingClarify?.question).toBe(prior.question);
    });
  });

  test("failure 時に semanticMissCount は increment されない（system_miss 相当、prod safe degrade）", () => {
    // semantic_miss の 2-count 破棄ポリシーは bind 経路の責務。
    // provider throw では counter を触らない（会話を殺さない）。
    withProdEnv(() => {
      const prior = mkPending({ semanticMissCount: 1 });
      const { session } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorPendingClarify: prior,
      });
      expect(session.pendingClarify?.semanticMissCount).toBe(1);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. failure 後も phase=clarifying で question が非空
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("provider failure 吸収: phase=clarifying + question 非空", () => {
  test("priorPending がある → その question を再提示（prod safe degrade）", () => {
    withProdEnv(() => {
      const prior = mkPending({ question: "朝の仕事はどのあたり？" });
      const { response } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorPendingClarify: prior,
      });
      expect(response.phase).toBe("clarifying");
      expect(response.message).toBe("朝の仕事はどのあたり？");
      expect(response.clarifyQuestion).toBe("朝の仕事はどのあたり？");
    });
  });

  test("priorPending 無しでも phase=clarifying で message は非空（prod safe degrade）", () => {
    withProdEnv(() => {
      const { response } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
      });
      expect(response.phase).toBe("clarifying");
      expect(response.message.length).toBeGreaterThan(0);
      expect(response.clarifyQuestion).toBeDefined();
      expect(response.clarifyQuestion!.length).toBeGreaterThan(0);
    });
  });

  test("priorPending.question が空文字でも最終 fallback で埋まる（prod safe degrade）", () => {
    withProdEnv(() => {
      const prior = mkPending({ question: "   " });
      const { response } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorPendingClarify: prior,
      });
      expect(response.phase).toBe("clarifying");
      expect(response.message.trim().length).toBeGreaterThan(0);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. sticky session で前ターン状態が継承される（failure 時）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("provider failure 吸収: sticky session 前ターン状態継承", () => {
  test("rawInputs は priorRawInputs + 今ターン utterance で追記される（prod safe degrade）", () => {
    withProdEnv(() => {
      const { session } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "9時オフィス",
        priorRawInputs: ["朝カフェ"],
      });
      expect(session.rawInputs).toEqual(["朝カフェ", "9時オフィス"]);
    });
  });

  test("priorPersistedEvents + priorPendingClarify + priorPlan 全部揃って継承", () => {
    // CEO 2026-04-28 PR #41b-0: priorPending (slot="where") は priorEv の where が
    // 既に fixed だと CEO condition 3 (stale drop) で消える。
    // 本テストの本質「provider failure 時の継続性」を保ったまま fixture を
    // 一貫させるため、priorEv の where を vague にする。
    const prior = mkPending();
    const priorEv = mkEvent({
      where: {
        place_ref: "カフェ",
        placeType: null, // category_alone → vague (blocking) → priorPending preserved
        provenance: utteranceProvenance(["カフェ"]),
      },
    });
    const priorPlan = mkPlan();
    const { session, response } = adaptPipelineToLegacy(
      buildFailedPipelineResult(),
      {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        priorRawInputs: ["前ターン発話"],
        priorPendingClarify: prior,
        priorPersistedEvents: [priorEv],
        priorPlan,
      },
    );
    // plan / events / pending / rawInputs 全部残っている
    expect(response.phase).toBe("clarifying");
    expect(response.plan?.items.length).toBe(1);
    expect(session.persistedEvents?.length).toBe(1);
    expect(session.pendingClarify?.event_id).toBe(prior.event_id);
    expect(session.rawInputs).toEqual([
      "前ターン発話",
      "（provider throw）",
    ]);
    // message も priorPending から取れる
    expect(response.message).toBe(prior.question);
  });

  test("user 固有属性（prefecture / home）も session に引き継がれる（prod safe degrade）", () => {
    withProdEnv(() => {
      const { session } = adaptPipelineToLegacy(buildFailedPipelineResult(), {
        sessionId: "ms_pf",
        utterance: "（provider throw）",
        userPrefecture: "東京都",
        userCity: "渋谷区",
        userHomeLabel: "自宅",
        userHomeLat: 35.658,
        userHomeLng: 139.701,
      });
      expect(session.userPrefecture).toBe("東京都");
      expect(session.userCity).toBe("渋谷区");
      expect(session.userHomeLabel).toBe("自宅");
      expect(session.userHomeLat).toBe(35.658);
      expect(session.userHomeLng).toBe(139.701);
    });
  });
});
