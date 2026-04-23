/**
 * DialogState reducer — 単体テスト (W3-PR-8 rev 3 commit 14)
 *
 * 検証観点（CEO 2026-04-22 承認条件）:
 *   1. narrowStep 逆行禁止
 *   2. provider_recovering 中の plan_presented 相当（stable への暗黙昇格）禁止
 *   3. search_handoff_blocking は blocking のまま（降格禁止）
 *   4. readyForHandoff は derive のみ（action に手動書き経路なし）
 *
 * 追加:
 *   - FSA 遷移許可表の全入口
 *   - chain ↔ category 相互排他
 *   - focus 切替で narrowStep / draft reset
 *   - RESET が初期状態に戻す
 *   - pure（prev mutation なし）
 *
 * 設計書:
 *   - docs/alter-morning-strict-confirmation-design.md §3.7-3.9
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1
 */

import { describe, expect, it } from "vitest";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import {
  createInitialDialogState,
  type DialogAction,
  type DialogState,
  type NormalizedCapture,
} from "@/lib/alter-morning/dialog/types";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストヘルパ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkCapture(partial: Partial<NormalizedCapture>): NormalizedCapture {
  return {
    subKind: partial.subKind ?? "other",
    extractedAnchor: partial.extractedAnchor ?? null,
    extractedCategory: partial.extractedCategory ?? null,
    extractedChain: partial.extractedChain ?? null,
    rawSpan: partial.rawSpan ?? "",
  };
}

function mkTurnCaptured(
  opts: Partial<Extract<DialogAction, { type: "TURN_CAPTURED" }>>,
): DialogAction {
  return {
    type: "TURN_CAPTURED",
    turnIndex: opts.turnIndex ?? 1,
    capturedAt: opts.capturedAt ?? "2026-04-22T09:00:00Z",
    capture: opts.capture ?? mkCapture({ subKind: "other" }),
    targetEventId: opts.targetEventId ?? "event_1",
    targetSlot: opts.targetSlot ?? "where",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 初期状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("dialogReducer — 初期状態", () => {
  it("createInitialDialogState は version=1 / stable / 空 history", () => {
    const s = createInitialDialogState();
    expect(s.version).toBe(1);
    expect(s.conversationStatus).toBe("stable");
    expect(s.focus).toBeNull();
    expect(s.capturedHistory).toEqual([]);
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.lastGoodPlan).toBeNull();
    expect(s.providerFailureStreak).toBe(0);
    expect(s.semanticMissStreak).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. TURN_CAPTURED — 各 subKind の narrowStep 遷移
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("TURN_CAPTURED — subKind 別の narrowStep", () => {
  it("chain_with_anchor → narrowStep=2 + search_handoff_blocking", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(2);
    expect(s1.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s1.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s1.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s1.conversationStatus).toBe("search_handoff_blocking");
  });

  it("category_with_anchor → narrowStep=2 + search_handoff_blocking", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "category_with_anchor",
          extractedAnchor: "甲府",
          extractedCategory: "カフェ",
          rawSpan: "甲府のカフェ",
        }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(2);
    expect(s1.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s1.conversationStatus).toBe("search_handoff_blocking");
  });

  it("chain_alone（初回、anchor なし） → narrowStep=2 + narrowing（detail §1.2 table 0→2、§11.4 D 初回短絡）", () => {
    // 設計書 §1.2 Step 2 table row "0 → 2: (chainAdvanced || categoryAdvanced)" に従い、
    // chain_alone が初回 captured で anchor なしでも narrowStep=2 に直行する（1 スキップ）。
    // readyForHandoff は anchor 必須なので false（§11.4 D T1）。
    // → conversationStatus は narrowing（step=2 && !readyForHandoff、derivePending は where_pinpoint で
    //    「スタバね。どのあたりのスタバ？」と anchor を追加聴取する）。
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(2);
    expect(s1.searchQueryDraft.anchorRegion).toBeNull();
    expect(s1.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s1.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s1.conversationStatus).toBe("narrowing");
  });

  it("anchor_alone → narrowStep=1 + narrowing", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(1);
    expect(s1.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s1.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s1.conversationStatus).toBe("narrowing");
  });

  it("proper_noun_specific → narrowStep=3 + stable", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "proper_noun_specific",
          rawSpan: "サドヤ",
        }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(3);
    expect(s1.conversationStatus).toBe("stable");
  });

  it("baseline → narrowStep=3 + stable", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({ subKind: "baseline", rawSpan: "自宅" }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(3);
    expect(s1.conversationStatus).toBe("stable");
  });

  it("undecided → narrowStep=0 + clarifying（進めない）", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({ subKind: "undecided", rawSpan: "決めてない" }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(0);
    expect(s1.conversationStatus).toBe("clarifying");
  });

  it("other → narrowStep=0 + clarifying + semanticMissStreak++", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        capture: mkCapture({ subKind: "other", rawSpan: "あのさ" }),
      }),
    );
    expect(s1.focus?.narrowStep).toBe(0);
    expect(s1.semanticMissStreak).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. CEO invariant #1 — narrowStep 逆行禁止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO invariant #1 — narrowStep 逆行禁止", () => {
  it("narrowStep=2 → 後続ターンで subKind=category_alone でも step は 2 維持（逆行しない）", () => {
    let s: DialogState = createInitialDialogState();
    // T1: anchor + chain で step 2 到達
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.focus?.narrowStep).toBe(2);

    // T2: category_alone は通常 step=1 だが、同一 focus 継続中は逆行しない
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    expect(s.focus?.narrowStep).toBe(2); // 逆行せず 2 維持
  });

  it("focus 切替時（event_id 変更）は narrowStep=0 から再開", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.focus?.event_id).toBe("event_1");

    // 別 event に focus 切替 + anchor_alone
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetEventId: "event_2",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "東京",
          rawSpan: "東京",
        }),
      }),
    );
    // event 切替なので narrowStep=1 から再開（terminal=3 でも step=3 までしか行かない）
    expect(s.focus?.event_id).toBe("event_2");
    expect(s.focus?.narrowStep).toBe(1);
    // draft は event 切替で reset
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.anchorRegion).toBe("東京");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CEO invariant #2 — provider_recovering 中の昇格禁止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO invariant #2 — provider_recovering 中の暗黙昇格禁止", () => {
  it("provider_recovering 中に TURN_CAPTURED が来ても stable / narrowing に勝手に昇格しない", () => {
    let s: DialogState = createInitialDialogState();
    // PROVIDER_FAILED で provider_recovering へ
    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 1,
      reason: "provider_error",
    });
    expect(s.conversationStatus).toBe("provider_recovering");

    // TURN_CAPTURED が来ても provider_recovering を維持
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("provider_recovering");
  });

  it("provider_recovering 中に proper_noun が来ても stable 昇格禁止", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 1,
      reason: "empty_items",
    });
    expect(s.conversationStatus).toBe("provider_recovering");

    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "proper_noun_specific",
          rawSpan: "サドヤ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("provider_recovering");
  });

  it("復帰は PROVIDER_RECOVERED 経由のみ", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 1,
      reason: "timeout",
    });
    expect(s.conversationStatus).toBe("provider_recovering");

    const events: ReadonlyArray<ComprehensionEvent> = [];
    s = dialogReducer(s, {
      type: "PROVIDER_RECOVERED",
      turnIndex: 2,
      events,
    });
    // focus=null なので stable へ復帰
    expect(s.conversationStatus).toBe("stable");
    expect(s.providerFailureStreak).toBe(0);
    expect(s.lastGoodPlan).not.toBeNull();
    expect(s.lastGoodPlan?.capturedAtTurn).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. CEO invariant #3 — search_handoff_blocking は blocking のまま
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO invariant #3 — search_handoff_blocking 降格禁止", () => {
  it("search_handoff_blocking 中に undecided が来ても blocking のまま維持（降格しない）", () => {
    // CEO invariant #3 は「降格させない」= reducer の意思決定として
    // search_handoff_blocking を維持する。同じ focus のまま narrowStep は
    // monotonic なので、undecided 発話でも blocking 継続。
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");
    expect(s.focus?.narrowStep).toBe(2);

    // 同じ focus のまま undecided が来ても narrowStep は 2 維持、
    // readyForHandoff=true も維持 → search_handoff_blocking のまま。
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({ subKind: "undecided", rawSpan: "決めてない" }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
  });

  it("search_handoff_blocking 中に「他のところにして」等の category_alone でも blocking 維持", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");

    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    // narrowStep 逆行せず 2 維持、chain も維持、blocking のまま
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.searchQueryDraft.chainToken).toBe("スタバ"); // chain 維持（category は無視される）
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  it("search_handoff_blocking から slot_switching への遷移は許可", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");

    // 別 slot に focus 移動 → slot_switching
    s = dialogReducer(s, {
      type: "FOCUS_SWITCHED",
      turnIndex: 2,
      nextFocus: { event_id: "event_1", slot: "when", narrowStep: 0 },
    });
    expect(s.conversationStatus).toBe("slot_switching");
  });

  it("search_handoff_blocking から provider_recovering への遷移は許可", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");

    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "timeout",
    });
    expect(s.conversationStatus).toBe("provider_recovering");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. CEO invariant #4 — readyForHandoff は derive のみ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO invariant #4 — readyForHandoff は derive のみ", () => {
  it("anchor 単独では false", () => {
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
  });

  it("chain 単独では false", () => {
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
  });

  it("anchor + chain で true", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);

    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
  });

  it("anchor + category で true", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. chain ↔ category 相互排他
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("chain ↔ category 相互排他（detail §1.4）", () => {
  it("先に category 確定 → 後から chain 来ると category=null に排他", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");
    expect(s.searchQueryDraft.chainToken).toBeNull();

    // chain が明示 → category 排他
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 3,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.categoryToken).toBeNull();
  });

  it("先に chain 確定 → 後から category 来ても chain は維持", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");

    // category が来ても chain 維持（chain がより specific）
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 3,
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7.5 commit 23c: slot-independent preservation
//     where 以外の slot turn (when/what) でも、capture に where 情報が
//     含まれていれば draft の空欄を埋める。既存 non-null は上書きしない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("commit 23c — slot-independent draft preservation", () => {
  it("targetSlot=when で category 含む capture → draft.categoryToken に preserve", () => {
    // シナリオ: Turn 1「明日はカフェで仕事の予定」を when turn として処理
    // （dispatcher が when に振った場合）。category="カフェ" が落ちない。
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.anchorRegion).toBeNull();
  });

  it("targetSlot=when で anchor 含む capture → draft.anchorRegion に preserve", () => {
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
  });

  it("targetSlot=when で chain+anchor 含む capture → 両方 preserve", () => {
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
  });

  it("targetSlot=what でも同様に preserve される（slot 独立）", () => {
    const s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "what",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ");
  });

  it("既存 non-null は when turn で上書きされない（保守原則）", () => {
    // Turn 1 where: category=ランチ を確定
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "where",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ");

    // Turn 2 when: 別の category=カフェ を含んでも ランチ は維持
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ");
  });

  it("既存 anchor は when turn で上書きされない", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "where",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");

    // when turn で別 anchor 来ても 甲府 維持
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "新宿",
          rawSpan: "新宿",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
  });

  it("既存 category あり + when turn で chain 新規 → chain 採用・category 排他（§1.4 維持）", () => {
    // Turn 1 where: category=カフェ 確定
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "where",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");
    expect(s.searchQueryDraft.chainToken).toBeNull();

    // Turn 2 when: chain=スタバ → specificity で chain 採用、category 排他
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.categoryToken).toBeNull();
  });

  it("既存 chain あり + when turn で category 来ても chain 維持（chain 上書き禁止）", () => {
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "where",
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");

    // Turn 2 when: category=カフェ → chain 非空なので category 棄却
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.categoryToken).toBeNull();
  });

  it("when turn で空 capture (subKind=other) → draft は完全に不変", () => {
    // 先に where で何か埋めておく
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "where",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    const before = s.searchQueryDraft;

    // Turn 2 when: 空 capture
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({ subKind: "other", rawSpan: "まだ未定" }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe(before.anchorRegion);
    expect(s.searchQueryDraft.categoryToken).toBe(before.categoryToken);
    expect(s.searchQueryDraft.chainToken).toBe(before.chainToken);
  });

  it("E2E シナリオ: Turn 1=when(category) → Turn 2=what(empty) → Turn 3=where(clarify)  draft に category が残る", () => {
    // Turn 1: 「明日はカフェで仕事の予定」(when focus)
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetSlot: "when",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "カフェ",
          rawSpan: "カフェ",
        }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");

    // Turn 2: 「9時」(when focus 継続 / 空 capture)
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetSlot: "when",
        capture: mkCapture({ subKind: "other", rawSpan: "9時" }),
      }),
    );
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ"); // 維持

    // Turn 3: 「まだ未定」(where clarify focus)
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 3,
        targetSlot: "where",
        capture: mkCapture({ subKind: "other", rawSpan: "まだ未定" }),
      }),
    );
    // where turn に入っても capture 空なので category 維持
    expect(s.searchQueryDraft.categoryToken).toBe("カフェ");
    expect(s.searchQueryDraft.anchorRegion).toBeNull();
    // → clarifyFallback は draft.category="カフェ" を見て A2 分岐に入れる
  });

  it("event_id 切替 (eventChanged) は非 where turn でも draft を reset + 初期値乗せる", () => {
    // Turn 1: event_1, where, chain=スタバ
    let s = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        targetSlot: "where",
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "スタバ",
          rawSpan: "スタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");

    // Turn 2: event_2 (新 event) / when turn / category=ランチ
    // eventChanged 分岐で reset + 初期値「ランチ」が乗る
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        targetEventId: "event_2",
        targetSlot: "when",
        capture: mkCapture({
          subKind: "category_alone",
          extractedCategory: "ランチ",
          rawSpan: "ランチ",
        }),
      }),
    );
    // 前 draft (chain=スタバ) は消え、category=ランチ が乗る
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. PROVIDER_FAILED / RECOVERED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PROVIDER_FAILED / PROVIDER_RECOVERED", () => {
  it("PROVIDER_FAILED は providerFailureStreak++ + lastGoodPlan 維持", () => {
    let s: DialogState = createInitialDialogState();
    // lastGoodPlan を先に埋めておく
    s = dialogReducer(s, {
      type: "PROVIDER_RECOVERED",
      turnIndex: 1,
      events: [],
    });
    expect(s.lastGoodPlan).not.toBeNull();
    const lgp = s.lastGoodPlan;

    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "timeout",
    });
    expect(s.conversationStatus).toBe("provider_recovering");
    expect(s.providerFailureStreak).toBe(1);
    expect(s.lastGoodPlan).toBe(lgp); // 維持

    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 3,
      reason: "empty_items",
    });
    expect(s.providerFailureStreak).toBe(2);
  });

  it("PROVIDER_RECOVERED は providerFailureStreak=0 + lastGoodPlan 更新", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 1,
      reason: "provider_error",
    });
    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "provider_error",
    });
    expect(s.providerFailureStreak).toBe(2);

    s = dialogReducer(s, {
      type: "PROVIDER_RECOVERED",
      turnIndex: 3,
      events: [],
    });
    expect(s.providerFailureStreak).toBe(0);
    expect(s.lastGoodPlan?.capturedAtTurn).toBe(3);
  });

  it("PROVIDER_RECOVERED で focus 有りなら narrowing / clarifying に戻す", () => {
    let s: DialogState = createInitialDialogState();
    // narrowing 状態を作る
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("narrowing");

    s = dialogReducer(s, {
      type: "PROVIDER_FAILED",
      turnIndex: 2,
      reason: "provider_error",
    });
    expect(s.conversationStatus).toBe("provider_recovering");

    s = dialogReducer(s, {
      type: "PROVIDER_RECOVERED",
      turnIndex: 3,
      events: [],
    });
    // narrowStep=1 なので narrowing へ復帰
    expect(s.conversationStatus).toBe("narrowing");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. FOCUS_SWITCHED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("FOCUS_SWITCHED", () => {
  it("別 slot に切替 → slot_switching + narrowStep=0（where 以外）", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(s, {
      type: "FOCUS_SWITCHED",
      turnIndex: 1,
      nextFocus: { event_id: "event_1", slot: "when", narrowStep: 2 },
    });
    expect(s.conversationStatus).toBe("slot_switching");
    expect(s.focus?.slot).toBe("when");
    expect(s.focus?.narrowStep).toBe(0); // where 以外は強制 0
  });

  it("searchQueryDraft は focus 切替後も維持（slot 往復を想定）", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);

    s = dialogReducer(s, {
      type: "FOCUS_SWITCHED",
      turnIndex: 2,
      nextFocus: { event_id: "event_1", slot: "when", narrowStep: 0 },
    });
    // draft 維持
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBe("スタバ");
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. RESET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("RESET", () => {
  it("RESET は初期状態に戻す（capturedHistory 含む全 field）", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.capturedHistory.length).toBe(1);
    expect(s.conversationStatus).toBe("search_handoff_blocking");

    s = dialogReducer(s, { type: "RESET", turnIndex: 2 });
    expect(s.conversationStatus).toBe("stable");
    expect(s.focus).toBeNull();
    expect(s.capturedHistory).toEqual([]);
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s.providerFailureStreak).toBe(0);
    expect(s.lastGoodPlan).toBeNull();
  });

  it("RESET は不正遷移でも実行可能（migration 用）", () => {
    // search_handoff_blocking から通常なら stable 降格不可だが、
    // RESET は FSA 検証をスキップする。
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(s.conversationStatus).toBe("search_handoff_blocking");

    expect(() =>
      dialogReducer(s, { type: "RESET", turnIndex: 2 }),
    ).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. 純粋性（prev mutate しない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("純粋性 — reducer は prev を mutate しない", () => {
  it("prev.capturedHistory は TURN_CAPTURED 後も空のまま", () => {
    const prev = createInitialDialogState();
    const prevSnapshot = JSON.parse(JSON.stringify(prev));
    dialogReducer(
      prev,
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(prev).toEqual(prevSnapshot);
  });

  it("同じ prev / action から 2 回呼んで output が deep equal", () => {
    const prev = createInitialDialogState();
    const action = mkTurnCaptured({
      capture: mkCapture({
        subKind: "anchor_alone",
        extractedAnchor: "甲府",
        rawSpan: "甲府",
      }),
    });
    const a = dialogReducer(prev, action);
    const b = dialogReducer(prev, action);
    expect(a).toEqual(b);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. capturedHistory 追記順序 + progressDelta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("capturedHistory / progressDelta", () => {
  it("advanced → flat → flat の trace が記録される", () => {
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 2,
        capture: mkCapture({ subKind: "undecided", rawSpan: "決めてない" }),
      }),
    );
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 3,
        capture: mkCapture({ subKind: "undecided", rawSpan: "わかんない" }),
      }),
    );
    expect(s.capturedHistory.length).toBe(3);
    expect(s.capturedHistory[0]?.progressDelta).toBe("advanced");
    expect(s.capturedHistory[1]?.progressDelta).toBe("flat");
    expect(s.capturedHistory[2]?.progressDelta).toBe("flat");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. unknown action は throw（exhaustive 保証）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("exhaustive", () => {
  it("未知 action.type は throw", () => {
    const s = createInitialDialogState();
    expect(() =>
      dialogReducer(s, { type: "BOGUS" } as unknown as DialogAction),
    ).toThrow(/Unknown action type/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. PR-12 seedCapture merge — pre-comprehended where seeding on eventChanged
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 位置づけ:
//   PR-12 最小根治: 2 件目 event に focus が遷移した直後、
//   reducer は eventChanged branch で draft を「seed を初期値、user capture で上書き」
//   の 2 層 merge で再構築する。pre-comprehended where（event.where.place_ref）を
//   classify した seedCapture をユーザー発話が薄くても拾えるようにする。
//
// カバレッジ:
//   T1: 既存互換（seed 未渡し → fallback 同一挙動）
//   T2: seed chain_with_anchor + user category_only → seed chain 優位で handoff
//   T3: seed + capture 両方 non-null → capture が seed を上書き（chain 排他維持）
//   T4: isWhereSlot=false で seedCapture 渡しても無視
//   T5: eventChanged=false で seedCapture 渡しても無視
//   T7: area seed + category-only utterance → search_handoff_blocking 到達
//
describe("PR-12 seedCapture merge — eventChanged branch", () => {
  it("T1: regression-trap — seedCapture 未渡し（omitted）時は既存挙動維持", () => {
    // seed 未渡しで anchor_alone を食わせると narrowing に落ちる（従来動作）
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(
      s0,
      mkTurnCaptured({
        // seedCapture を omit（undefined）
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s1.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s1.searchQueryDraft.chainToken).toBeNull();
    expect(s1.searchQueryDraft.categoryToken).toBeNull();
    expect(s1.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s1.focus?.narrowStep).toBe(1);
    expect(s1.conversationStatus).toBe("narrowing");
  });

  it("T2: seed chain_with_anchor + capture category_only → seed chain 優位で handoff", () => {
    // 1 件目 event (event_1) で何か focus 経験 → 2 件目 event (event_2) に
    // 遷移する瞬間。event_2 は place_ref='新宿のルミネ' を pre-comprehend 済み。
    // ユーザー発話は「ランチ」(category_only)。
    //
    // 期待: seed({anchor=新宿, chain=ルミネ}) を初期値、capture.chain=null
    //       & seed.chain 非 null なので capture.category="ランチ" は棄却される。
    //       draft={anchor=新宿, chain=ルミネ, category=null} で handoff 到達。
    let s: DialogState = createInitialDialogState();
    // event_1 で anchor_alone を入れ focus を張る
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "渋谷",
          rawSpan: "渋谷",
        }),
      }),
    );
    expect(s.focus?.event_id).toBe("event_1");

    // event_2 に遷移 + seed
    s = dialogReducer(s, {
      type: "TURN_CAPTURED",
      turnIndex: 2,
      capturedAt: "2026-04-22T09:05:00Z",
      targetEventId: "event_2",
      targetSlot: "where",
      capture: mkCapture({
        subKind: "category_alone",
        extractedCategory: "ランチ",
        rawSpan: "ランチ",
      }),
      seedCapture: mkCapture({
        subKind: "chain_with_anchor",
        extractedAnchor: "新宿",
        extractedChain: "ルミネ",
        rawSpan: "新宿のルミネ",
      }),
    });

    expect(s.focus?.event_id).toBe("event_2");
    expect(s.searchQueryDraft.anchorRegion).toBe("新宿");
    expect(s.searchQueryDraft.chainToken).toBe("ルミネ");
    expect(s.searchQueryDraft.categoryToken).toBeNull(); // chain 排他維持
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });

  it("T3: seed + capture 両方 non-null → capture が seed を上書き（chain 排他維持）", () => {
    // seed={anchor=新宿, chain=ルミネ} と capture={anchor=渋谷, chain=スタバ}。
    // capture 側の chain が確定しているので、capture chain="スタバ" が勝ち、
    // nextAnchor も capture 側の "渋谷" が勝つ（上書き）。category は chain 排他で null。
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );

    s = dialogReducer(s, {
      type: "TURN_CAPTURED",
      turnIndex: 2,
      capturedAt: "2026-04-22T09:05:00Z",
      targetEventId: "event_2",
      targetSlot: "where",
      capture: mkCapture({
        subKind: "chain_with_anchor",
        extractedAnchor: "渋谷",
        extractedChain: "スタバ",
        rawSpan: "渋谷のスタバ",
      }),
      seedCapture: mkCapture({
        subKind: "chain_with_anchor",
        extractedAnchor: "新宿",
        extractedChain: "ルミネ",
        rawSpan: "新宿のルミネ",
      }),
    });

    expect(s.searchQueryDraft.anchorRegion).toBe("渋谷"); // capture が上書き
    expect(s.searchQueryDraft.chainToken).toBe("スタバ"); // capture が上書き
    expect(s.searchQueryDraft.categoryToken).toBeNull(); // chain 排他
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.focus?.narrowStep).toBe(2);
  });

  it("T4: targetSlot!=where（when）で seedCapture 渡しても無視される", () => {
    // seedCapture は where slot 専用の構成。targetSlot="when" の時は reducer で
    // 二重に guard されて無視される（shadowPipeline でも事前 null 化されるが、
    // reducer 側でも enforce）。
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        targetSlot: "where",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");

    // event_2 へ遷移、targetSlot=when で seedCapture を「あえて」渡す
    s = dialogReducer(s, {
      type: "TURN_CAPTURED",
      turnIndex: 2,
      capturedAt: "2026-04-22T09:05:00Z",
      targetEventId: "event_2",
      targetSlot: "when",
      capture: mkCapture({ subKind: "other", rawSpan: "えーと" }),
      seedCapture: mkCapture({
        subKind: "chain_with_anchor",
        extractedAnchor: "新宿",
        extractedChain: "ルミネ",
        rawSpan: "新宿のルミネ",
      }),
    });

    // seedCapture は無視される（isWhereSlot=false のため）。
    // eventChanged branch の fallback（capture-only reset）が走り、draft は空。
    expect(s.searchQueryDraft.anchorRegion).toBeNull();
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.categoryToken).toBeNull();
    expect(s.searchQueryDraft.readyForHandoff).toBe(false);
  });

  it("T5: eventChanged=false（同一 event）で seedCapture 渡しても無視される", () => {
    // 同じ event_id で 2 ターン目を打つと eventChanged=false。
    // このとき else if (isWhereSlot) branch が走り、seedCapture は参照されない。
    // 既存 draft ("甲府") は preserve されるのみ。seed の chain="ルミネ" は混入しない。
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "甲府",
          rawSpan: "甲府",
        }),
      }),
    );
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBeNull();

    // 同じ event_1 に対して seedCapture を「あえて」渡す
    s = dialogReducer(s, {
      type: "TURN_CAPTURED",
      turnIndex: 2,
      capturedAt: "2026-04-22T09:05:00Z",
      targetEventId: "event_1", // same as before
      targetSlot: "where",
      capture: mkCapture({
        subKind: "category_alone",
        extractedCategory: "ランチ",
        rawSpan: "ランチ",
      }),
      seedCapture: mkCapture({
        subKind: "chain_with_anchor",
        extractedAnchor: "新宿",
        extractedChain: "ルミネ",
        rawSpan: "新宿のルミネ",
      }),
    });

    // seedCapture は eventChanged=false で無視。既存 anchor="甲府" preserve、
    // capture の category="ランチ" が採用される。seed の chain は混入しない。
    expect(s.searchQueryDraft.anchorRegion).toBe("甲府");
    expect(s.searchQueryDraft.chainToken).toBeNull(); // seed chain="ルミネ" が漏れていない
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ");
  });

  it("T7 (CEO 追加): area seed + category-only utterance → handoff 到達", () => {
    // CEO 補正 1: 「event2 に area seed があり、ユーザー発話が category-only
    // (例:『ランチ』) でも search_handoff_blocking に到達するケース」
    //
    // seed: {subKind=anchor_alone, extractedAnchor=新宿} (place_ref="新宿" 相当)
    // capture: {subKind=category_alone, extractedCategory=ランチ}
    // → seed anchor + capture category で draft={anchor=新宿, category=ランチ, chain=null}
    // → readyForHandoff=true, narrowStep=2, search_handoff_blocking
    let s: DialogState = createInitialDialogState();
    s = dialogReducer(
      s,
      mkTurnCaptured({
        turnIndex: 1,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "anchor_alone",
          extractedAnchor: "渋谷",
          rawSpan: "渋谷",
        }),
      }),
    );

    s = dialogReducer(s, {
      type: "TURN_CAPTURED",
      turnIndex: 2,
      capturedAt: "2026-04-22T09:05:00Z",
      targetEventId: "event_2",
      targetSlot: "where",
      capture: mkCapture({
        subKind: "category_alone",
        extractedCategory: "ランチ",
        rawSpan: "ランチ",
      }),
      seedCapture: mkCapture({
        subKind: "anchor_alone",
        extractedAnchor: "新宿",
        rawSpan: "新宿",
      }),
    });

    expect(s.focus?.event_id).toBe("event_2");
    expect(s.searchQueryDraft.anchorRegion).toBe("新宿"); // seed が底上げ
    expect(s.searchQueryDraft.chainToken).toBeNull();
    expect(s.searchQueryDraft.categoryToken).toBe("ランチ"); // capture が category を載せる
    expect(s.searchQueryDraft.readyForHandoff).toBe(true);
    expect(s.focus?.narrowStep).toBe(2);
    expect(s.conversationStatus).toBe("search_handoff_blocking");
  });
});
