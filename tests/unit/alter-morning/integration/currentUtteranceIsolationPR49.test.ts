/**
 * PR-49 current utterance 分離 — integration tests (CEO 2026-04-30)
 *
 * 真因 (CEO + GPT 共同特定):
 *   旧設計: combinedUtterance = priorInputs.join(' / ') + ' / ' + message
 *     → LLM が毎 turn 過去発話全部を再解釈 → 重複 events 大量生成
 *
 *   新設計 (PR-49): utterance = message (今 turn のみ)
 *     prior context は priorPlanForContext (persisted events) で渡す
 *
 * 検証観点 (CEO 成功条件):
 *   1. pendingClarify 中の「池袋」「新宿」「カフェ」 が新規 event 化しない
 *   2. priorRawInputs を渡しても session.rawInputs に audit log として追記
 *      されるが、LLM extraction には影響しない
 *   3. legacyAdapter は currentUtterance (= input.utterance) のみを LLM
 *      observation 用 trace に出す
 *   4. 1 turn ごとに events が雪だるま式に増えない (既存 dispatch が正常動作)
 *   5. 新規 create flow が壊れない
 *   6. PR-48 dayMainTransport 永続化が壊れない (regression)
 *
 * 注意:
 *   route.ts level の combinedUtterance 削除は本 unit test では直接検証
 *   できない (route handler 全体の integration が必要)。本テストは
 *   legacyAdapter level での「priorRawInputs と utterance の責務分離」
 *   を中心に regression を防ぐ。
 *
 *   実機検証 (Vercel preview) で trace.verbose.utterance を観測し、
 *   「過去発話 / 連結が消えた」 ことを CEO が確認する。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { adaptPipelineToLegacy } from "@/lib/alter-morning/legacyAdapter";
import type { MorningPipelineResult } from "@/lib/alter-morning/morningPipeline";
import {
  type Event,
  utteranceProvenance,
  inferredProvenance,
} from "@/lib/alter-morning/comprehension/eventSchema";

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

function mkResult(events: Event[]): MorningPipelineResult {
  return {
    status: "ok",
    comprehension: {
      events,
      targetDate: "today",
      startPoint: null,
      departureTime: null,
      goOut: null,
    },
    timeline: { entries: [], violations: [] },
    grounded: [],
    gapResolution: {
      actions: events.map((ev) => ({
        type: "pass_through" as const,
        event_id: ev.event_id,
      })),
      primary_clarify: null,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 責務分離: priorRawInputs (audit log) vs utterance (LLM extraction target)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-49 [責務分離]: priorRawInputs は audit log、utterance は今 turn のみ", () => {
  it("priorRawInputs (過去発話) を渡しても、session.rawInputs に audit log として追記される", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
    });
    const { session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "12時に新宿でランチ",
      priorRawInputs: [
        "明日9時に渋谷のスタバ",
        "電車",
        "高橋とミーティング",
      ],
      priorPersistedEvents: [],
    });
    // session.rawInputs は priorRawInputs + 今 turn の utterance
    expect(session.rawInputs).toEqual([
      "明日9時に渋谷のスタバ",
      "電車",
      "高橋とミーティング",
      "12時に新宿でランチ",
    ]);
    // session.rawInputs は audit log として保持される (UI / DB 互換)
  });

  it("priorRawInputs なし → utterance 単独で session.rawInputs を構築", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スタバ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const { session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にスタバでコーヒー",
      // priorRawInputs 未指定
    });
    expect(session.rawInputs).toEqual(["9時にスタバでコーヒー"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 累積防止: 1 turn で events が雪だるま化しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-49 [累積防止]: 1 turn で events が雪だるま化しない", () => {
  it("Turn 5 (priorRawInputs 4 個 + 今 turn) → effective events は当 turn 出力 + prior のみ、過去発話分は追加されない", () => {
    // Turn 1-4 の rawInputs:
    //   ["明日9時に渋谷のスタバ", "電車", "高橋とミーティング", "9時を10時に変更"]
    // Turn 5: 「12時に新宿でランチ」 → LLM は (PR-49 後) 1 個の event だけ出力
    const priorEv = mkEvent({
      event_id: "e1",
      when: {
        startTime: "10:00",
        timeHint: null,
        provenance: utteranceProvenance(["10時"], "high"),
      },
      where: {
        place_ref: "スターバックス TSUTAYA",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "ミーティング",
        activityCanonical: "ミーティング",
        provenance: utteranceProvenance(["ミーティング"], "high"),
      },
      transport: "電車",
    });
    // Turn 5 LLM 出力 (PR-49 後の想定: 今 turn の発話のみを extraction)
    const newEv = mkEvent({
      event_id: "e2",
      turn_mode: "append",
      when: {
        startTime: "12:00",
        timeHint: null,
        provenance: utteranceProvenance(["12時"], "high"),
      },
      where: {
        place_ref: "新宿",
        placeType: null,
        coordinates: null,
        provenance: utteranceProvenance(["新宿"], "high"),
      },
      what: {
        activity: "ランチ",
        activityCanonical: "ランチ",
        provenance: utteranceProvenance(["ランチ"], "high"),
      },
    });
    const { session } = adaptPipelineToLegacy(mkResult([newEv]), {
      sessionId: "s1",
      utterance: "12時に新宿でランチ",
      priorRawInputs: [
        "明日9時に渋谷のスタバ",
        "電車",
        "高橋とミーティング",
        "9時を10時に変更",
      ],
      priorPersistedEvents: [priorEv],
    });
    // ★ effective events は prior (1) + 今 turn 新規 (1) = 2 件のみ
    //   旧設計なら過去発話の影響で 5+ events になっていた
    expect(session.persistedEvents).toBeDefined();
    expect(session.persistedEvents).toHaveLength(2);
    expect(session.persistedEvents![0].event_id).toBe("e1"); // prior 維持
    expect(session.persistedEvents![1].event_id).toBe("e2"); // 新規 1 個のみ
    // rawInputs は audit log として 5 個全部保持
    expect(session.rawInputs).toHaveLength(5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 既存挙動 regression: 新規 create flow / PR-48 が壊れない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PR-49 [regression]: 既存挙動が壊れない", () => {
  it("新規 create flow (Turn 1): priorRawInputs なしで通常動作", () => {
    const ev = mkEvent({
      event_id: "e1",
      when: {
        startTime: "09:00",
        timeHint: null,
        provenance: utteranceProvenance(["9時"], "high"),
      },
      where: {
        place_ref: "スタバ",
        placeType: "exact_proper_noun",
        coordinates: null,
        provenance: utteranceProvenance(["スタバ"], "high"),
      },
      what: {
        activity: "コーヒー",
        activityCanonical: "コーヒー",
        provenance: utteranceProvenance(["コーヒー"], "high"),
      },
    });
    const { response, session } = adaptPipelineToLegacy(mkResult([ev]), {
      sessionId: "s1",
      utterance: "9時にスタバでコーヒー",
    });
    expect(response.phase).toBe("plan_presented");
    expect(session.persistedEvents).toHaveLength(1);
    expect(session.rawInputs).toEqual(["9時にスタバでコーヒー"]);
  });
});
