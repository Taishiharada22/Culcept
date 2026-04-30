/**
 * selectShadowTargetEventId — W3-PR-8 rev 3 commit 22 unit tests
 *
 * 目的:
 *   shadow pipeline に渡す targetEventId の条件付き focus 継承ロジックを
 *   10+ シナリオで固定する。
 *
 * CEO 追加条件（2026-04-22 commit 22）:
 *   1. focus.event_id は無条件最優先にしない → 条件 B-E のどれか欠けると fallback
 *   2. 新 event 開始で stale focus を握らない → prev phase 非 clarifying / slot 変化で fallback
 *
 * 契約:
 *   - 本 helper は pure function（入力のみから出力）
 *   - 戻り値 `reason` は英数字のみ（log ローテに優しい）
 *   - `canContinueFocus=true` のときのみ `chosenTargetEventId === prevFocus.event_id`
 */

import { describe, expect, test } from "vitest";
import {
  selectShadowTargetEventId,
  type SelectTargetEventIdParams,
} from "@/lib/alter-morning/dialog/shadowTargetEventId";
import type { DialogFocus } from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function focus(event_id: string, slot: DialogFocus["slot"] = "where", narrowStep: 0 | 1 | 2 | 3 = 1): DialogFocus {
  return { event_id, slot, narrowStep };
}

function mkParams(overrides: Partial<SelectTargetEventIdParams> = {}): SelectTargetEventIdParams {
  return {
    prevFocus: focus("event_prev", "where", 1),
    prevConversationStatus: "narrowing",
    previousResponsePhase: "clarifying",
    pendingEventId: "event_new_pending",
    firstEventId: "event_new_first",
    currentResponsePhase: "clarifying",
    targetSlot: "where",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectShadowTargetEventId — condition matrix (commit 22)", () => {
  // Condition A: prevFocus === null
  test("A. 初回 turn (prevFocus=null) → fallback to pending", () => {
    const r = selectShadowTargetEventId(mkParams({ prevFocus: null }));
    expect(r.canContinueFocus).toBe(false);
    expect(r.chosenTargetEventId).toBe("event_new_pending");
    expect(r.reason).toBe("no_prev_focus");
  });

  test("A. 初回 turn で pending=null → events[0] fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: null,
        pendingEventId: null,
        firstEventId: "event_only_events0",
      }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.chosenTargetEventId).toBe("event_only_events0");
  });

  test("A. 初回 turn で pending=null かつ events=[] → null 返却 (shadow skip)", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: null,
        pendingEventId: null,
        firstEventId: null,
      }),
    );
    expect(r.chosenTargetEventId).toBe(null);
    expect(r.canContinueFocus).toBe(false);
  });

  // Condition B: previousResponsePhase !== "clarifying"
  test("B. 前 turn が plan_presented だった → fallback (stale focus を握らない)", () => {
    const r = selectShadowTargetEventId(
      mkParams({ previousResponsePhase: "plan_presented" }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.chosenTargetEventId).toBe("event_new_pending");
    expect(r.reason).toMatch(/^prev_phase_not_clarifying_plan_presented$/);
  });

  test("B. 前 turn が completed → fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({ previousResponsePhase: "completed" }),
    );
    expect(r.canContinueFocus).toBe(false);
  });

  test("B. 前 turn が null (新 session 作成後の初回) → fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({ previousResponsePhase: null }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.reason).toBe("prev_phase_not_clarifying_null");
  });

  // Condition C: currentResponsePhase !== "clarifying"
  test("C. 今 turn が plan_presented に抜ける → fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({ currentResponsePhase: "plan_presented" }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.reason).toBe("current_phase_not_clarifying_plan_presented");
  });

  // Condition D: prevConversationStatus not active
  test("D. 前 status=stable → fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({ prevConversationStatus: "stable" }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.reason).toBe("prev_status_not_active_stable");
  });

  test("D. 前 status=slot_switching → fallback (別 slot に切替直後)", () => {
    const r = selectShadowTargetEventId(
      mkParams({ prevConversationStatus: "slot_switching" }),
    );
    expect(r.canContinueFocus).toBe(false);
  });

  test("D. 前 status=provider_recovering → fallback (LLM 失敗復帰中は stale)", () => {
    const r = selectShadowTargetEventId(
      mkParams({ prevConversationStatus: "provider_recovering" }),
    );
    expect(r.canContinueFocus).toBe(false);
  });

  // Condition E: slot change
  test("E. slot 変化 where→when → fallback", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: focus("event_prev", "where", 2),
        targetSlot: "when",
      }),
    );
    expect(r.canContinueFocus).toBe(false);
    expect(r.reason).toBe("slot_change_where_to_when");
  });

  test("E. targetSlot=null (dispatch 不能 slot) → fallback", () => {
    const r = selectShadowTargetEventId(mkParams({ targetSlot: null }));
    expect(r.canContinueFocus).toBe(false);
    expect(r.reason).toBe("slot_change_where_to_null");
  });

  // Condition F: all pass
  test("F. 全条件 OK (narrowing 継続 same where) → prev.focus.event_id 継承", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: focus("event_abc", "where", 1),
        prevConversationStatus: "narrowing",
        previousResponsePhase: "clarifying",
        currentResponsePhase: "clarifying",
        targetSlot: "where",
      }),
    );
    expect(r.canContinueFocus).toBe(true);
    expect(r.chosenTargetEventId).toBe("event_abc");
    expect(r.reason).toBe("continue_focus");
  });

  test("F. prev status=clarifying (narrowStep=0 初期) でも継承", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: focus("event_c", "where", 0),
        prevConversationStatus: "clarifying",
      }),
    );
    expect(r.canContinueFocus).toBe(true);
    expect(r.chosenTargetEventId).toBe("event_c");
  });

  test("F. prev status=search_handoff_blocking (narrowStep=2 ready=1) でも継承", () => {
    // PR-9 未実装のため rev3 では handoff blocking のまま user が追加発話する
    // シナリオ（「スタバじゃなくてタリーズ」等）。同一 event_id 継続が必要。
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: focus("event_h", "where", 2),
        prevConversationStatus: "search_handoff_blocking",
      }),
    );
    expect(r.canContinueFocus).toBe(true);
    expect(r.chosenTargetEventId).toBe("event_h");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 優先順位: condition check は A→B→C→D→E の順。早い fail ほど外側で捕まる。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectShadowTargetEventId — precedence of failure conditions", () => {
  test("A は B より先に判定される (prevFocus=null が最優先)", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevFocus: null,
        previousResponsePhase: "plan_presented", // これも fail だが A が先に捕る
      }),
    );
    expect(r.reason).toBe("no_prev_focus");
  });

  test("B は C より先に判定される (prev phase が最優先の closed 判定)", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        previousResponsePhase: "skipped",
        currentResponsePhase: "plan_presented", // これも fail だが B が先
      }),
    );
    expect(r.reason).toMatch(/^prev_phase_not_clarifying_skipped$/);
  });

  test("D は E より先に判定される (status 判定が slot より先)", () => {
    const r = selectShadowTargetEventId(
      mkParams({
        prevConversationStatus: "stable",
        targetSlot: "when", // これも fail だが D が先
      }),
    );
    expect(r.reason).toBe("prev_status_not_active_stable");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pure 性: 入力を mutate しない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("selectShadowTargetEventId — purity", () => {
  test("入力 prevFocus を mutate しない", () => {
    const prev = focus("event_imm", "where", 2);
    const snap = { ...prev };
    selectShadowTargetEventId(
      mkParams({ prevFocus: prev, targetSlot: "when" }),
    );
    expect(prev).toEqual(snap);
  });

  test("同入力 2 回呼び出しで同結果（副作用なし）", () => {
    const p = mkParams({ prevFocus: focus("event_det", "where", 1) });
    const r1 = selectShadowTargetEventId(p);
    const r2 = selectShadowTargetEventId(p);
    expect(r1).toEqual(r2);
  });
});
