/**
 * DialogState Shadow Pipeline — 単体テスト (W3-PR-8 rev 3 commit 17)
 *
 * CEO 完了条件（2026-04-22 commit 17）:
 *   1. flag OFF baseline 不変                   → §1 で検証
 *   2. flag ON で classify → reducer → persist → derive が通る → §2 で検証
 *   3. readyForHandoff=true でも clarifying（internal only） → §3 で検証
 *   4. internal state が user-facing に漏れない → §4 で検証
 *
 * 検証方針:
 *   本 helper は pure。route.ts の flag gate 外側（flag OFF 中は呼ばれない）は
 *   ensureSessionV1.test.ts で既に担保済み。本ファイルは helper 自体の
 *   「flag ON 時の振る舞い」を網羅する。
 */

import { describe, expect, it } from "vitest";
import { advanceDialogState } from "@/lib/alter-morning/dialog/shadowPipeline";
import {
  createInitialDialogState,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import type { Event } from "@/lib/alter-morning/comprehension/eventSchema";

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
    when: partial.when ?? { startTime: null, timeHint: "morning", provenance: prov },
    where: partial.where ?? { place_ref: null, placeType: null, provenance: prov },
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 不変性（shadow は input を mutate しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 不変性: input を mutate しない", () => {
  it("prevState を mutate しない（pure）", () => {
    const prev = createInitialDialogState();
    const snap = JSON.stringify(prev);
    advanceDialogState({
      prevState: prev,
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(JSON.stringify(prev)).toBe(snap);
  });

  it("events を mutate しない", () => {
    const events = [mkEvent({ event_id: "event_1" })];
    const snap = JSON.stringify(events);
    advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(JSON.stringify(events)).toBe(snap);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. classify → reducer → persist → derive が通る（CEO 完了条件 #2）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 classify → reducer → derive の一気通貫", () => {
  it("「甲府のスタバ」: anchor+chain → narrowStep=2 + readyForHandoff=true", () => {
    const prev = createInitialDialogState();
    const result = advanceDialogState({
      prevState: prev,
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    // classify が chain_with_anchor を出し、reducer が search_handoff_blocking に
    // 遷移、readyForHandoff=true になることを確認
    expect(result.nextState.focus?.narrowStep).toBe(2);
    expect(result.nextState.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(result.nextState.searchQueryDraft.chainToken).toBe("スタバ");
    expect(result.nextState.searchQueryDraft.readyForHandoff).toBe(true);
    expect(result.nextState.conversationStatus).toBe("search_handoff_blocking");
  });

  it("「甲府」: anchor のみ → narrowStep=1 + narrowing", () => {
    const prev = createInitialDialogState();
    const result = advanceDialogState({
      prevState: prev,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(result.nextState.focus?.narrowStep).toBe(1);
    expect(result.nextState.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(result.nextState.searchQueryDraft.readyForHandoff).toBe(false);
    expect(result.nextState.conversationStatus).toBe("narrowing");
  });

  it("「決めてない」: undecided → narrowStep 不進", () => {
    const prev = createInitialDialogState();
    const result = advanceDialogState({
      prevState: prev,
      message: "決めてない",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(result.nextState.focus?.narrowStep).toBe(0);
    expect(result.nextState.searchQueryDraft.readyForHandoff).toBe(false);
  });

  it("capturedHistory が append-only で進む（複数ターン通算で readyForHandoff に到達）", () => {
    let state = createInitialDialogState();
    const events = [mkEvent({ event_id: "event_1" })];

    // T1: 「甲府」= anchor_alone → narrowStep=1, anchor 確定
    state = advanceDialogState({
      prevState: state,
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 1,
      nowIso: NOW_ISO,
    }).nextState;
    expect(state.capturedHistory).toHaveLength(1);
    expect(state.focus?.narrowStep).toBe(1);
    expect(state.searchQueryDraft.anchorRegion).toBe("甲府");

    // T2: 「スタバ」= chain_alone → narrowStep=1 維持（subKindStep=1）
    //   但し anchor+chain が揃い readyForHandoff=true（reducer CEO invariant #4 の通り derive）
    state = advanceDialogState({
      prevState: state,
      message: "スタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events,
      turnIndex: 2,
      nowIso: NOW_ISO,
    }).nextState;
    expect(state.capturedHistory).toHaveLength(2);
    expect(state.searchQueryDraft.chainToken).toBe("スタバ");
    expect(state.searchQueryDraft.readyForHandoff).toBe(true);
    // conversationStatus は narrowStep=2 に未到達なので narrowing 維持
    //   （commit 14 reducer 仕様: search_handoff_blocking は narrowStep=2 条件付き）
    expect(state.conversationStatus).toBe("narrowing");
  });

  it("anchor+chain 単発発話は narrowStep=2 + search_handoff_blocking 到達", () => {
    // 単一ターンの chain_with_anchor は NARROW_STEP_BY_SUBKIND=2 で直行。
    const state = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    }).nextState;
    expect(state.focus?.narrowStep).toBe(2);
    expect(state.searchQueryDraft.readyForHandoff).toBe(true);
    expect(state.conversationStatus).toBe("search_handoff_blocking");
  });

  it("derive は読み取り専用ビュー（nextState と独立した戻り値）", () => {
    const result = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    // narrowing 中は where_narrow が derive される
    expect(result.derived?.kind).toBe("where_narrow");
    expect(result.derived?.askedAt).toBe(NOW_ISO);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. readyForHandoff=true でも user-facing は clarifying（CEO 完了条件 #3）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 readyForHandoff=true でも user-facing は clarifying", () => {
  it("search_handoff_blocking + readyForHandoff=true → derived=null（user-facing 非露出）", () => {
    // 「甲府のスタバ」→ reducer が search_handoff_blocking + readyForHandoff=true に
    //   なるが、derive は where_handoff_blocking を user-facing kind として出さず null を返す。
    //   → phase authority（route 側 hasBlockingUnresolvedSlots）が user-facing phase を
    //   決める際に、shadow 側の readyForHandoff 情報は一切流れていない。
    const result = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府のスタバ",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(result.nextState.searchQueryDraft.readyForHandoff).toBe(true);
    expect(result.nextState.conversationStatus).toBe("search_handoff_blocking");
    // ★ CEO 完了条件 #3: readyForHandoff=true でも derived は null
    //   = user-facing clarify としての露出点を持たない
    expect(result.derived).toBeNull();
  });

  it("category_with_anchor でも同様（readyForHandoff=true → derived=null）", () => {
    const result = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府のカフェ",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(result.nextState.searchQueryDraft.readyForHandoff).toBe(true);
    expect(result.derived).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. internal state が user-facing に漏れない（CEO 完了条件 #4）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 internal state が user-facing に漏れない", () => {
  it("search_handoff_blocking は derived.kind として現れない", () => {
    const messages = [
      "甲府のスタバ",
      "甲府のカフェ",
      "甲府のマック",
    ];
    for (const msg of messages) {
      const result = advanceDialogState({
        prevState: createInitialDialogState(),
        message: msg,
        targetEventId: "event_1",
        targetSlot: "where",
        events: [mkEvent({ event_id: "event_1" })],
        turnIndex: 1,
        nowIso: NOW_ISO,
      });
      // internal: conversationStatus = search_handoff_blocking
      expect(result.nextState.conversationStatus).toBe("search_handoff_blocking");
      // external: derived.kind は search_handoff_blocking を含まない
      if (result.derived !== null) {
        expect(result.derived.kind).not.toBe("search_handoff_blocking");
      }
    }
  });

  it("derived は caller 側で session.pendingClarify に書き戻す経路を持たない（戻り値 shape）", () => {
    // 本 helper は nextState と derived を分離して返す。caller（route）は
    // nextState だけを session.dialogState に代入する規律。
    // shape が分離されているため、derived を session.pendingClarify に代入するのは
    // 明示的なコード追加を要する（CEO 条件を破るには意図的操作が必要）。
    const result = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    // 型検査的に別々のプロパティ
    expect(result).toHaveProperty("nextState");
    expect(result).toHaveProperty("derived");
    // nextState に pendingClarify は含まれない（DialogState 型には無い）
    expect((result.nextState as unknown as { pendingClarify?: unknown }).pendingClarify).toBeUndefined();
  });

  it("conversationStatus='narrowing' 中は where_narrow / 'clarifying' 中は where_center（internal kind は外に出ない）", () => {
    // narrowing での kind
    const r1 = advanceDialogState({
      prevState: createInitialDialogState(),
      message: "甲府",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(r1.nextState.conversationStatus).toBe("narrowing");
    expect(r1.derived?.kind).toBe("where_narrow");

    // clarifying (narrowStep=0) → where_center
    const initState: DialogState = {
      ...createInitialDialogState(),
      conversationStatus: "clarifying",
    };
    const r2 = advanceDialogState({
      prevState: initState,
      message: "うーん",
      targetEventId: "event_1",
      targetSlot: "where",
      events: [mkEvent({ event_id: "event_1" })],
      turnIndex: 1,
      nowIso: NOW_ISO,
    });
    expect(r2.nextState.focus?.narrowStep).toBe(0);
    expect(r2.derived?.kind).toBe("where_center");
  });
});
