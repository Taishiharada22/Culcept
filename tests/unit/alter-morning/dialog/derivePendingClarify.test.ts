/**
 * derivePendingClarify — 単体テスト (W3-PR-8 rev 3 commit 17)
 *
 * CEO 方針（2026-04-22 commit 17 条件）:
 *   1. DialogState が唯一の主状態 → 本関数は read-only ビュー、副作用なし
 *   2. reducer は pure のまま → 本関数も pure（Date.now / I/O 禁止、nowIso 注入）
 *   3. search_handoff_blocking は internal only → kind として返さない
 *   4. phase authority は hasBlockingUnresolvedSlots のまま → 本関数は phase を決めない
 *
 * 検証観点:
 *   §1 入力契約: state + events + nowIso の 3 引数、pure
 *   §2 pickClarifyKind table: detail §5.1 を 1:1 で検証
 *   §3 search_handoff_blocking の user-facing 非露出（CEO 条件 #3）
 *   §4 question template の「state に無い値を埋めない」規律
 *   §5 scope 生成（時間ラベル / 活動ラベル / ordinal）
 *   §6 純粋性（state / events 不変、nowIso 反映）
 *   §7 semanticMissCount は DialogState から read のみ
 */

import { describe, expect, it } from "vitest";
import { derivePendingClarify } from "@/lib/alter-morning/dialog/derivePendingClarify";
import {
  createInitialDialogState,
  type DialogFocus,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOW_ISO = "2026-04-22T09:00:00.000Z";

function mkEvent(partial: Partial<Event> & { event_id: string }): Event {
  const prov = {
    source_type: "utterance" as const,
    source_span: [] as string[],
    provenance_confidence: "high" as const,
    from_utterance: true,
  };
  return {
    event_id: partial.event_id,
    turn_mode: partial.turn_mode ?? "create",
    target_ref: partial.target_ref ?? null,
    target_ref_confidence: partial.target_ref_confidence ?? null,
    change_scope: partial.change_scope ?? null,
    when: partial.when ?? {
      startTime: null,
      timeHint: "morning",
      provenance: prov,
    },
    where: partial.where ?? {
      place_ref: null,
      placeType: null,
      provenance: prov,
    },
    what: partial.what ?? {
      activity: "仕事",
      activityCanonical: "仕事",
      provenance: prov,
    },
    who: partial.who ?? [],
    transport: partial.transport ?? null,
    certainty: partial.certainty ?? "asserted",
    missing_semantic_critical: partial.missing_semantic_critical ?? [],
    missing_solver_blockers: partial.missing_solver_blockers ?? [],
  };
}

function mkFocus(partial: Partial<DialogFocus>): DialogFocus {
  return {
    event_id: partial.event_id ?? "event_1",
    slot: partial.slot ?? "where",
    narrowStep: partial.narrowStep ?? 0,
  };
}

function mkState(partial: Partial<DialogState>): DialogState {
  const init = createInitialDialogState();
  return {
    ...init,
    ...partial,
    searchQueryDraft: partial.searchQueryDraft ?? init.searchQueryDraft,
    capturedHistory: partial.capturedHistory ?? init.capturedHistory,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 入力契約 / null 返却条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 入力契約 / null 返却条件", () => {
  it("初期状態（stable + focus=null）は null を返す", () => {
    const s = createInitialDialogState();
    expect(derivePendingClarify(s, [], NOW_ISO)).toBeNull();
  });

  it("conversationStatus=stable は focus があっても null", () => {
    const s = mkState({
      conversationStatus: "stable",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
    });
    expect(derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO))
      .toBeNull();
  });

  it("focus=null は stable 以外でも null（defensive）", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: null,
    });
    expect(derivePendingClarify(s, [], NOW_ISO)).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. pickClarifyKind table（detail §5.1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 pickClarifyKind — detail §5.1 table", () => {
  it("where + narrowStep=0 + clarifying → where_center", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("where_center");
    expect(r?.slot).toBe("where");
  });

  it("where + narrowStep=1 + narrowing → where_narrow", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: null,
        readyForHandoff: false,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("where_narrow");
  });

  it("where + narrowStep=2 + narrowing → where_pinpoint", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 2 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: "カフェ",
        chainToken: null,
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("where_pinpoint");
  });

  it("when + clarifying → when_start", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "when", narrowStep: 0 }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("when_start");
  });

  it("when + slot_switching → when_start（user-facing は同じ）", () => {
    const s = mkState({
      conversationStatus: "slot_switching",
      focus: mkFocus({ slot: "when", narrowStep: 0 }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("when_start");
  });

  it("when + search_handoff_blocking → when_start_after_handoff", () => {
    const s = mkState({
      conversationStatus: "search_handoff_blocking",
      focus: mkFocus({ slot: "when", narrowStep: 0 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: "スタバ",
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("when_start_after_handoff");
    expect(r?.slot).toBe("when");
  });

  it("what + clarifying → what_activity", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "what", narrowStep: 0 }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("what_activity");
  });

  it("provider_recovering → provider_retry（focus があれば）", () => {
    const s = mkState({
      conversationStatus: "provider_recovering",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.kind).toBe("provider_retry");
  });

  it("who slot → null（PR-8 rev 3 scope 外）", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "who", narrowStep: 0 }),
    });
    expect(derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO))
      .toBeNull();
  });

  it("where + slot_switching → null（focus 外に移った想定）", () => {
    const s = mkState({
      conversationStatus: "slot_switching",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
    });
    expect(derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO))
      .toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. search_handoff_blocking は internal only（CEO 条件 #3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 search_handoff_blocking は internal only（user-facing 非露出）", () => {
  it("where + search_handoff_blocking → null（user-facing kind を返さない）", () => {
    const s = mkState({
      conversationStatus: "search_handoff_blocking",
      focus: mkFocus({ slot: "where", narrowStep: 2 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: "スタバ",
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    // CEO 条件: search_handoff_blocking を user-facing に出さない
    expect(r).toBeNull();
  });

  it("readyForHandoff=true でも null（phase authority への影響なし）", () => {
    // この test は「derive がこの状態で何も出さない = user-facing には漏れない」
    // ことを保証する。phase を決めるのは hasBlockingUnresolvedSlots のままで、
    // 本関数は phase に touch しない。
    const s = mkState({
      conversationStatus: "search_handoff_blocking",
      focus: mkFocus({ slot: "where", narrowStep: 2 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: "カフェ",
        chainToken: null,
        readyForHandoff: true,
      },
    });
    expect(derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO))
      .toBeNull();
  });

  it("出力 PendingClarify.kind に 'search_handoff_blocking' が現れることは無い", () => {
    // 全 kind を生成し得るシナリオを走らせ、kind 集合に含まれないことを確認。
    const scenarios: Array<Pick<DialogState, "conversationStatus" | "focus">> = [
      {
        conversationStatus: "clarifying",
        focus: mkFocus({ slot: "where", narrowStep: 0 }),
      },
      {
        conversationStatus: "narrowing",
        focus: mkFocus({ slot: "where", narrowStep: 1 }),
      },
      {
        conversationStatus: "narrowing",
        focus: mkFocus({ slot: "where", narrowStep: 2 }),
      },
      {
        conversationStatus: "clarifying",
        focus: mkFocus({ slot: "when", narrowStep: 0 }),
      },
      {
        conversationStatus: "search_handoff_blocking",
        focus: mkFocus({ slot: "when", narrowStep: 0 }),
      },
      {
        conversationStatus: "clarifying",
        focus: mkFocus({ slot: "what", narrowStep: 0 }),
      },
      {
        conversationStatus: "provider_recovering",
        focus: mkFocus({ slot: "where", narrowStep: 0 }),
      },
    ];
    for (const sc of scenarios) {
      const state = mkState({
        ...sc,
        searchQueryDraft: {
          anchorRegion: "甲府",
          categoryToken: "カフェ",
          chainToken: null,
          readyForHandoff: true,
        },
      });
      const r = derivePendingClarify(
        state,
        [mkEvent({ event_id: "event_1" })],
        NOW_ISO,
      );
      if (r !== null) {
        expect(r.kind).not.toBe("search_handoff_blocking");
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. question template — state に無い値を埋めない規律
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 question template — 「state に入っていない値を埋めない」", () => {
  it("where_narrow: anchor 確定時は anchor を含む質問", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: null,
        readyForHandoff: false,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.question).toContain("甲府");
  });

  it("where_pinpoint: chain + anchor → 「どの{chain}？{anchor}駅前とか？」", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 2 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: "スタバ",
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.question).toContain("スタバ");
    expect(r?.question).toContain("甲府");
  });

  it("where_pinpoint: category + anchor → 「{anchor}でどの{cat}？」", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 2 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: "カフェ",
        chainToken: null,
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.question).toContain("カフェ");
    expect(r?.question).toContain("甲府");
  });

  it("where_center: timeHint + activity ラベルを使う", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
    });
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: {
          source_type: "utterance",
          source_span: [],
          provenance_confidence: "high",
          from_utterance: true,
        },
      },
      what: {
        activity: "仕事",
        activityCanonical: "仕事",
        provenance: {
          source_type: "utterance",
          source_span: [],
          provenance_confidence: "high",
          from_utterance: true,
        },
      },
    });
    const r = derivePendingClarify(s, [ev], NOW_ISO);
    expect(r?.question).toContain("朝");
    expect(r?.question).toContain("仕事");
  });

  it("when_start_after_handoff: anchor + token を含む", () => {
    const s = mkState({
      conversationStatus: "search_handoff_blocking",
      focus: mkFocus({ slot: "when", narrowStep: 0 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: "スタバ",
        readyForHandoff: true,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.question).toContain("甲府");
    expect(r?.question).toContain("スタバ");
  });

  it("provider_retry: state 非依存の固定文言", () => {
    const s = mkState({
      conversationStatus: "provider_recovering",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
    });
    const r = derivePendingClarify(s, [], NOW_ISO);
    expect(r?.kind).toBe("provider_retry");
    expect(r?.question.length).toBeGreaterThan(0);
  });

  it("question に null/undefined 文字が露出しない", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
      searchQueryDraft: {
        // anchor 未確定 + narrowing（想定外状態）のフォールバック
        anchorRegion: null,
        categoryToken: null,
        chainToken: null,
        readyForHandoff: false,
      },
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.question).not.toContain("null");
    expect(r?.question).not.toContain("undefined");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. scope 生成（PendingClarifyScope）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 scope 生成", () => {
  it("timeHint=morning → timeLabel='朝'", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0, event_id: "event_1" }),
    });
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: null,
        timeHint: "morning",
        provenance: {
          source_type: "utterance",
          source_span: [],
          provenance_confidence: "high",
          from_utterance: true,
        },
      },
    });
    const r = derivePendingClarify(s, [ev], NOW_ISO);
    expect(r?.scope.timeLabel).toBe("朝");
  });

  it("startTime が埋まっていれば startTime 優先", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0, event_id: "event_1" }),
    });
    const ev = mkEvent({
      event_id: "event_1",
      when: {
        startTime: "09:00",
        timeHint: "morning",
        provenance: {
          source_type: "utterance",
          source_span: [],
          provenance_confidence: "high",
          from_utterance: true,
        },
      },
    });
    const r = derivePendingClarify(s, [ev], NOW_ISO);
    expect(r?.scope.timeLabel).toBe("09:00");
  });

  it("eventOrdinal は 1-index で plan 内位置", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0, event_id: "event_2" }),
    });
    const events = [
      mkEvent({ event_id: "event_1" }),
      mkEvent({ event_id: "event_2" }),
      mkEvent({ event_id: "event_3" }),
    ];
    const r = derivePendingClarify(s, events, NOW_ISO);
    expect(r?.scope.eventOrdinal).toBe(2);
  });

  it("event 不在時は ordinal=0 の defensive scope", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0, event_id: "event_missing" }),
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    // focus.event_id が events に存在しなくても kind が生成される限り PendingClarify 自体は返す
    expect(r?.scope.eventOrdinal).toBe(0);
    expect(r?.scope.timeLabel).toBeNull();
    expect(r?.scope.activityLabel).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. 純粋性（state / events mutation なし、nowIso 反映、同一入力 → 同一出力）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6 純粋性", () => {
  it("state を mutate しない", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
      capturedHistory: [],
    });
    const snap = JSON.stringify(s);
    derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(JSON.stringify(s)).toBe(snap);
  });

  it("events を mutate しない", () => {
    const events = [mkEvent({ event_id: "event_1" }), mkEvent({ event_id: "event_2" })];
    const snap = JSON.stringify(events);
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0, event_id: "event_1" }),
    });
    derivePendingClarify(s, events, NOW_ISO);
    expect(JSON.stringify(events)).toBe(snap);
  });

  it("askedAt には注入した nowIso がそのまま入る（Date.now 不使用）", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
    });
    const custom = "2099-01-01T00:00:00.000Z";
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], custom);
    expect(r?.askedAt).toBe(custom);
  });

  it("同一入力で同一出力（deterministic）", () => {
    const s = mkState({
      conversationStatus: "narrowing",
      focus: mkFocus({ slot: "where", narrowStep: 1 }),
      searchQueryDraft: {
        anchorRegion: "甲府",
        categoryToken: null,
        chainToken: null,
        readyForHandoff: false,
      },
    });
    const evs = [mkEvent({ event_id: "event_1" })];
    const r1 = derivePendingClarify(s, evs, NOW_ISO);
    const r2 = derivePendingClarify(s, evs, NOW_ISO);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. semanticMissCount は DialogState からの read のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7 semanticMissCount = state.semanticMissStreak の read", () => {
  it("semanticMissStreak=2 → derived.semanticMissCount=2", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
      semanticMissStreak: 2,
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.semanticMissCount).toBe(2);
  });

  it("semanticMissStreak=0 → derived.semanticMissCount=0", () => {
    const s = mkState({
      conversationStatus: "clarifying",
      focus: mkFocus({ slot: "where", narrowStep: 0 }),
      semanticMissStreak: 0,
    });
    const r = derivePendingClarify(s, [mkEvent({ event_id: "event_1" })], NOW_ISO);
    expect(r?.semanticMissCount).toBe(0);
  });
});
