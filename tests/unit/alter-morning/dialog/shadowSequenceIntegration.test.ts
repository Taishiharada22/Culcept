/**
 * Shadow Sequence Integration — W3-PR-8 rev 3 commit 22
 *
 * 目的:
 *   selectShadowTargetEventId + advanceDialogState を組み合わせて、
 *   Branch B 再 comprehension が毎 turn 新 event_id を発行する状況下でも
 *   draft が累積され narrowStep が単調非減少になることを contract level で固定する。
 *
 *   2026-04-22 preview で観測された narrowStep 2→1→2 逆行の再発防止 regression。
 *
 * 契約:
 *   - Turn 1: prevFocus=null → fallback → 新 event_id を使う
 *   - Turn 2 以降: active clarify loop 継続 → prev.focus.event_id を継承
 *   - 結果として、reducer の eventChanged が turn 2/3 で false となり draft 累積
 *   - narrowStep は turn 間で単調非減少（逆行しない）
 *   - undecided 発話でも draft が保持される
 *   - 新 event 開始（phase=plan_presented → 次 turn clarifying）時は stale focus を握らない
 *
 * 方法:
 *   実 taxonomy + 実 reducer + 実 derive を advanceDialogState 経由で呼ぶ。
 *   route.ts の shadow block を in-memory で simulate する薄い harness。
 */

import { describe, expect, test } from "vitest";
import { advanceDialogState } from "@/lib/alter-morning/dialog/shadowPipeline";
import { selectShadowTargetEventId } from "@/lib/alter-morning/dialog/shadowTargetEventId";
import {
  createInitialDialogState,
  type DialogState,
} from "@/lib/alter-morning/dialog/types";
import {
  utteranceProvenance,
  type Event,
} from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// harness — route.ts shadow block の in-memory simulation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkEvent(id: string): Event {
  return {
    event_id: id,
    turn_mode: "create",
    change_scope: null,
    target_ref: null,
    target_ref_confidence: null,
    certainty: "asserted",
    when: {
      startTime: "09:00",
      timeHint: null,
      provenance: utteranceProvenance(["明日の朝"], "high"),
    },
    where: {
      place_ref: null,
      placeType: null,
      provenance: utteranceProvenance([], "low"),
    },
    what: {
      activity: null,
      activityCanonical: null,
      provenance: utteranceProvenance([], "low"),
    },
    who: [],
    transport: null,
    missing_semantic_critical: ["where"],
    missing_solver_blockers: [],
  } as unknown as Event;
}

interface SimTurnInput {
  message: string;
  /** Branch B 再 comprehension が発行する新 event_id (turn 毎に異なる前提) */
  freshEventIdForThisTurn: string;
  /** pendingClarify.slot（route.ts の rawSlot 由来） */
  pendingSlot: "where" | "when" | "what";
  /** 前 turn の MorningProtocolResponse.phase (route.ts の rawMorningSession?.phase) */
  previousResponsePhase: string | null;
  /** 今 turn の MorningProtocolResponse.phase (adapted.response.phase) */
  currentResponsePhase: string;
}

interface SimTurnOutput {
  chosenTargetEventId: string | null;
  canContinueFocus: boolean;
  reason: string;
  nextState: DialogState;
  narrowStep: number;
  status: DialogState["conversationStatus"];
  readyForHandoff: boolean;
  anchor: string | null;
  category: string | null;
  chain: string | null;
}

/**
 * route.ts shadow block の必要最小限を in-memory で再現する harness。
 *
 * これで「毎 turn 新 event_id」という Branch B の副作用を明示的に表現しつつ、
 * selectShadowTargetEventId の focus 継承判定 → advanceDialogState の
 * reducer drive を実経路どおりに通せる。
 */
function simulateTurn(
  prevState: DialogState,
  turn: SimTurnInput,
  turnIndex: number,
): SimTurnOutput {
  const events = [mkEvent(turn.freshEventIdForThisTurn)];

  const selection = selectShadowTargetEventId({
    prevFocus: prevState.focus,
    prevConversationStatus: prevState.conversationStatus,
    previousResponsePhase: turn.previousResponsePhase,
    pendingEventId: turn.freshEventIdForThisTurn, // Branch B はこれを pending にも設定する想定
    firstEventId: events[0]?.event_id ?? null,
    currentResponsePhase: turn.currentResponsePhase,
    targetSlot: turn.pendingSlot,
  });

  const targetEventId = selection.chosenTargetEventId;
  if (targetEventId === null) {
    // shadow skip 経路 — prevState を不変で返す
    return {
      chosenTargetEventId: null,
      canContinueFocus: false,
      reason: selection.reason,
      nextState: prevState,
      narrowStep: prevState.focus?.narrowStep ?? 0,
      status: prevState.conversationStatus,
      readyForHandoff: prevState.searchQueryDraft.readyForHandoff,
      anchor: prevState.searchQueryDraft.anchorRegion,
      category: prevState.searchQueryDraft.categoryToken,
      chain: prevState.searchQueryDraft.chainToken,
    };
  }

  const advanced = advanceDialogState({
    prevState,
    message: turn.message,
    targetEventId,
    targetSlot: turn.pendingSlot,
    events,
    turnIndex,
    nowIso: "2026-04-22T09:00:00.000Z",
  });

  return {
    chosenTargetEventId: targetEventId,
    canContinueFocus: selection.canContinueFocus,
    reason: selection.reason,
    nextState: advanced.nextState,
    narrowStep: advanced.nextState.focus?.narrowStep ?? 0,
    status: advanced.nextState.conversationStatus,
    readyForHandoff: advanced.nextState.searchQueryDraft.readyForHandoff,
    anchor: advanced.nextState.searchQueryDraft.anchorRegion,
    category: advanced.nextState.searchQueryDraft.categoryToken,
    chain: advanced.nextState.searchQueryDraft.chainToken,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadow sequence integration (commit 22) — 3-turn draft accumulation", () => {
  test("カフェ → 甲府 → 甲府のスタバ: narrowStep は単調非減少、draft は累積される", () => {
    const initial = createInitialDialogState();

    // Turn 1: "明日の朝はカフェで仕事したい"
    //   prev.focus=null → fallback → event_t1 を使う
    //   classify: category_alone (extractedCategory=カフェ)
    //   reducer: draft={C:カフェ} → step=2 (category 載り) → narrowing/search_handoff_blocking
    const t1 = simulateTurn(
      initial,
      {
        message: "明日の朝はカフェで仕事したい",
        freshEventIdForThisTurn: "event_t1",
        pendingSlot: "where",
        previousResponsePhase: null, // 初回
        currentResponsePhase: "clarifying",
      },
      1,
    );
    expect(t1.canContinueFocus).toBe(false); // 初回は fallback
    expect(t1.chosenTargetEventId).toBe("event_t1");
    expect(t1.reason).toBe("no_prev_focus");
    expect(t1.category).toBe("カフェ");
    expect(t1.narrowStep).toBe(2);

    // Turn 2: "甲府"
    //   prev.focus=event_t1 / status=narrowing or search_handoff_blocking / phase=clarifying
    //   selection: canContinueFocus=true → chosen=event_t1 (event_t2 を捨てる)
    //   reducer: eventChanged=false → draft 累積 → {A:甲府, C:カフェ} → step=2 維持
    const t2 = simulateTurn(
      t1.nextState,
      {
        message: "甲府",
        freshEventIdForThisTurn: "event_t2", // Branch B が発行する新 id
        pendingSlot: "where",
        previousResponsePhase: "clarifying",
        currentResponsePhase: "clarifying",
      },
      2,
    );
    expect(t2.canContinueFocus).toBe(true); // 継承！
    expect(t2.chosenTargetEventId).toBe("event_t1"); // prev.focus の id
    expect(t2.reason).toBe("continue_focus");
    expect(t2.anchor).toBe("甲府");
    expect(t2.category).toBe("カフェ"); // ← 累積保持（commit 21 以前は null になっていた）
    expect(t2.narrowStep).toBeGreaterThanOrEqual(t1.narrowStep); // 単調非減少
    expect(t2.narrowStep).toBe(2);

    // Turn 3: "甲府のスタバ"
    //   prev.focus=event_t1 / status=narrowing | search_handoff_blocking / phase=clarifying
    //   selection: canContinueFocus=true → chosen=event_t1
    //   reducer: eventChanged=false → chain set → category 排他で null
    //           → draft={A:甲府, C:null, Ch:スタバ} → step=2 ready=true → search_handoff_blocking
    const t3 = simulateTurn(
      t2.nextState,
      {
        message: "甲府のスタバ",
        freshEventIdForThisTurn: "event_t3",
        pendingSlot: "where",
        previousResponsePhase: "clarifying",
        currentResponsePhase: "clarifying",
      },
      3,
    );
    expect(t3.canContinueFocus).toBe(true);
    expect(t3.chosenTargetEventId).toBe("event_t1");
    expect(t3.anchor).toBe("甲府");
    expect(t3.chain).toBe("スタバ");
    expect(t3.category).toBe(null); // chain 確定で category は排他 null
    expect(t3.readyForHandoff).toBe(true);
    expect(t3.narrowStep).toBeGreaterThanOrEqual(t2.narrowStep);
    expect(t3.narrowStep).toBe(2);
    expect(t3.status).toBe("search_handoff_blocking");

    // 全 3 turn の event_id が同一 (reducer の eventChanged=false 維持)
    const allChosenIds = [t1.chosenTargetEventId, t2.chosenTargetEventId, t3.chosenTargetEventId];
    expect(new Set(allChosenIds.filter(Boolean)).size).toBe(1);
  });

  test("prev 逆行シナリオの再現（fix 無し = canContinueFocus を強制 false）では 2→1→2 が起きる", () => {
    // この test は commit 22 fix が必須である証明。
    // selectShadowTargetEventId を bypass して「毎 turn 新 event_id を直接 reducer に投入」
    // したときに narrowStep が逆行することを固定する。
    const initial = createInitialDialogState();

    // Turn 1: 毎 turn 新 id（live preview の挙動）
    const t1 = advanceDialogState({
      prevState: initial,
      message: "明日の朝はカフェで仕事したい",
      targetEventId: "event_t1_raw",
      targetSlot: "where",
      events: [mkEvent("event_t1_raw")],
      turnIndex: 1,
      nowIso: "2026-04-22T09:00:00.000Z",
    });

    // Turn 2: 毎 turn 新 id → reducer の eventChanged=true → draft reset
    const t2 = advanceDialogState({
      prevState: t1.nextState,
      message: "甲府",
      targetEventId: "event_t2_raw", // ← 異なる id を投入
      targetSlot: "where",
      events: [mkEvent("event_t2_raw")],
      turnIndex: 2,
      nowIso: "2026-04-22T09:00:00.001Z",
    });

    // Turn 3: 毎 turn 新 id
    const t3 = advanceDialogState({
      prevState: t2.nextState,
      message: "甲府のスタバ",
      targetEventId: "event_t3_raw",
      targetSlot: "where",
      events: [mkEvent("event_t3_raw")],
      turnIndex: 3,
      nowIso: "2026-04-22T09:00:00.002Z",
    });

    // 観測された live 逆行パターン 2 → 1 → 2 を再現
    expect(t1.nextState.focus?.narrowStep).toBe(2);
    expect(t2.nextState.focus?.narrowStep).toBe(1); // ← 逆行（これが bug）
    expect(t3.nextState.focus?.narrowStep).toBe(2);

    // draft reset の証拠: turn 2 で category=カフェ が消える
    expect(t2.nextState.searchQueryDraft.categoryToken).toBe(null);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadow sequence integration (commit 22) — undecided でも draft 保持", () => {
  test("カフェ → 特にない: draft が保持され narrowStep は下がらない", () => {
    const initial = createInitialDialogState();

    const t1 = simulateTurn(
      initial,
      {
        message: "カフェで仕事したい",
        freshEventIdForThisTurn: "event_u1",
        pendingSlot: "where",
        previousResponsePhase: null,
        currentResponsePhase: "clarifying",
      },
      1,
    );
    expect(t1.category).toBe("カフェ");
    expect(t1.narrowStep).toBe(2);

    // "特にない" → undecided → 新 event_id 発行されても continue_focus で draft 維持
    const t2 = simulateTurn(
      t1.nextState,
      {
        message: "特にない",
        freshEventIdForThisTurn: "event_u2",
        pendingSlot: "where",
        previousResponsePhase: "clarifying",
        currentResponsePhase: "clarifying",
      },
      2,
    );
    expect(t2.canContinueFocus).toBe(true);
    expect(t2.chosenTargetEventId).toBe("event_u1");
    // draft 保持（undecided は draft を触らない reducer 契約 + event_id 継承で
    // eventChanged=false）
    expect(t2.category).toBe("カフェ");
    expect(t2.narrowStep).toBeGreaterThanOrEqual(t1.narrowStep); // 下がらない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("shadow sequence integration (commit 22) — 新 event で stale focus を握らない", () => {
  test("plan_presented 後の新 turn は fallback で新 event_id を使う", () => {
    // シミュレーション: 前 turn で plan_presented に到達（完了済み event）、
    // 次 turn でユーザーが別 event を話し始める。
    const initial = createInitialDialogState();

    // Turn 1: カフェ絞り込み終了まで進める
    const t1 = simulateTurn(
      initial,
      {
        message: "カフェで仕事したい",
        freshEventIdForThisTurn: "event_done",
        pendingSlot: "where",
        previousResponsePhase: null,
        currentResponsePhase: "clarifying",
      },
      1,
    );
    expect(t1.canContinueFocus).toBe(false); // 初回は fallback

    // Turn 2: 前 turn 結果として plan_presented に到達した想定。
    //   ユーザーが新しい event を始める：「夕方ジム行く」
    //   previousResponsePhase="plan_presented" で stale focus を握らないことを確認。
    const t2 = simulateTurn(
      t1.nextState,
      {
        message: "夕方ジム行く",
        freshEventIdForThisTurn: "event_new",
        pendingSlot: "where",
        previousResponsePhase: "plan_presented", // ← 前が closed
        currentResponsePhase: "clarifying",
      },
      2,
    );
    expect(t2.canContinueFocus).toBe(false); // fallback！ stale focus を握らない
    expect(t2.chosenTargetEventId).toBe("event_new");
    expect(t2.reason).toMatch(/^prev_phase_not_clarifying/);
  });

  test("slot 変化（where→when）は継承せず fallback", () => {
    const initial = createInitialDialogState();

    const t1 = simulateTurn(
      initial,
      {
        message: "カフェで仕事したい",
        freshEventIdForThisTurn: "event_s1",
        pendingSlot: "where",
        previousResponsePhase: null,
        currentResponsePhase: "clarifying",
      },
      1,
    );

    // gapResolver が次 turn で別 slot (when) を primary_clarify に選ぶ想定
    const t2 = simulateTurn(
      t1.nextState,
      {
        message: "朝 9 時から",
        freshEventIdForThisTurn: "event_s2",
        pendingSlot: "when", // ← slot 変化
        previousResponsePhase: "clarifying",
        currentResponsePhase: "clarifying",
      },
      2,
    );
    expect(t2.canContinueFocus).toBe(false);
    expect(t2.chosenTargetEventId).toBe("event_s2");
    expect(t2.reason).toMatch(/^slot_change_where_to_when$/);
  });
});
