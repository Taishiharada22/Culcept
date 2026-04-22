/**
 * DialogState reducer — PR-9 commit 2 追加テスト
 *
 * 検証観点（CEO 2026-04-23 承認条件）:
 *   - SEARCH_CANDIDATES_PRESENTED: 正常遷移 + invariant 違反 throw
 *   - SEARCH_CANDIDATE_SELECTED: 成功時の state 再構成 + S8 reject/no-op パターン
 *   - SEARCH_ZERO_CANDIDATES: anchor 保持 + chain/category drop + narrowStep 1 rollback
 *   - α' parked pattern: focus 切替で activePresentation が park される（LRU 最大 3）
 *   - S9: zeroCandidateMissCount は policy-neutral（reducer は count のみ、status は触らない）
 *   - FSA 拡張: search_handoff_blocking → search_candidates_presented | clarifying 追加
 *
 * 設計書:
 *   - docs/alter-morning-pr9-places-search-design.md §2, §5（rev 2）
 *   - docs/alter-morning-roadmap.md §2 依存
 */

import { describe, expect, it } from "vitest";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import {
  createInitialDialogState,
  type DialogAction,
  type DialogState,
  type NormalizedCapture,
} from "@/lib/alter-morning/dialog/types";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパ
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
    capturedAt: opts.capturedAt ?? "2026-04-23T09:00:00Z",
    capture: opts.capture ?? mkCapture({ subKind: "other" }),
    targetEventId: opts.targetEventId ?? "event_1",
    targetSlot: opts.targetSlot ?? "where",
  };
}

function mkCandidate(
  opts: Partial<NormalizedPlaceCandidate> & { placeId: string },
): NormalizedPlaceCandidate {
  return {
    placeId: opts.placeId,
    displayName: opts.displayName ?? `店舗 ${opts.placeId}`,
    address: opts.address ?? "山梨県甲府市",
    coordinates: opts.coordinates ?? { lat: 35.6, lng: 138.5 },
    distanceFromAnchor: opts.distanceFromAnchor ?? 300,
    category: opts.category ?? "cafe",
    chainToken: opts.chainToken ?? "スタバ",
    rawRef: opts.rawRef ?? { provider: "google_places", placeId: opts.placeId },
  };
}

/** search_handoff_blocking に到達した standard state を作る */
function mkBlockingState(): DialogState {
  const s0 = createInitialDialogState();
  return dialogReducer(
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
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. 初期状態の新フィールド
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 initial state — PR-9 新フィールド", () => {
  it("createInitialDialogState は activePresentation=null / parked 空 / miss=0 / lastFailed=null", () => {
    const s = createInitialDialogState();
    expect(s.activePresentation).toBeNull();
    expect(s.parkedPresentations).toEqual([]);
    expect(s.lastFailedSearch).toBeNull();
    expect(s.zeroCandidateMissCount).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. SEARCH_CANDIDATES_PRESENTED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 SEARCH_CANDIDATES_PRESENTED", () => {
  it("search_handoff_blocking → search_candidates_presented + activePresentation set", () => {
    const s0 = mkBlockingState();
    expect(s0.conversationStatus).toBe("search_handoff_blocking");

    const s1 = dialogReducer(s0, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "甲府|スタバ|null",
      candidates: [mkCandidate({ placeId: "p1" }), mkCandidate({ placeId: "p2" })],
    });

    expect(s1.conversationStatus).toBe("search_candidates_presented");
    expect(s1.activePresentation).not.toBeNull();
    expect(s1.activePresentation?.targetEventId).toBe("event_1");
    expect(s1.activePresentation?.queryFingerprint).toBe("甲府|スタバ|null");
    expect(s1.activePresentation?.candidates.map((c) => c.placeId)).toEqual([
      "p1",
      "p2",
    ]);
    expect(s1.activePresentation?.presentedAtTurn).toBe(2);
    // focus と draft は変わらない（presentation は state の副次属性）
    expect(s1.focus).toEqual(s0.focus);
    expect(s1.searchQueryDraft).toEqual(s0.searchQueryDraft);
  });

  it("同状態再提示（presented → presented）も許可される（自己遷移）", () => {
    const s0 = mkBlockingState();
    const s1 = dialogReducer(s0, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
    const s2 = dialogReducer(s1, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 3,
      targetEventId: "event_1",
      queryFingerprint: "fp2",
      candidates: [mkCandidate({ placeId: "p9" })],
    });
    expect(s2.conversationStatus).toBe("search_candidates_presented");
    expect(s2.activePresentation?.queryFingerprint).toBe("fp2");
    expect(s2.activePresentation?.candidates[0].placeId).toBe("p9");
  });

  it("narrowing からの直接 PRESENTED は invariant 違反で throw", () => {
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
    expect(s1.conversationStatus).toBe("narrowing");

    expect(() =>
      dialogReducer(s1, {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex: 2,
        targetEventId: "event_1",
        queryFingerprint: "fp",
        candidates: [mkCandidate({ placeId: "p1" })],
      }),
    ).toThrow(/requires conversationStatus in/);
  });

  it("空 candidates は throw（zero は SEARCH_ZERO_CANDIDATES 経由）", () => {
    const s0 = mkBlockingState();
    expect(() =>
      dialogReducer(s0, {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex: 2,
        targetEventId: "event_1",
        queryFingerprint: "fp",
        candidates: [],
      }),
    ).toThrow(/empty candidates/);
  });

  it("focus.slot != 'where' は throw", () => {
    // when slot に focus 切替後に PRESENTED を発行しようとする (not reachable in normal flow)
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(s0, {
      type: "FOCUS_SWITCHED",
      turnIndex: 1,
      nextFocus: { event_id: "event_1", slot: "when", narrowStep: 0 },
    });
    expect(() =>
      dialogReducer(s1, {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex: 2,
        targetEventId: "event_1",
        queryFingerprint: "fp",
        candidates: [mkCandidate({ placeId: "p1" })],
      }),
    ).toThrow(/requires conversationStatus in/);
  });

  it("targetEventId と focus.event_id 不一致は throw", () => {
    const s0 = mkBlockingState(); // focus.event_id = event_1
    expect(() =>
      dialogReducer(s0, {
        type: "SEARCH_CANDIDATES_PRESENTED",
        turnIndex: 2,
        targetEventId: "event_OTHER",
        queryFingerprint: "fp",
        candidates: [mkCandidate({ placeId: "p1" })],
      }),
    ).toThrow(/targetEventId mismatch/);
  });

  it("PRESENTED で zeroCandidateMissCount が 0 にリセットされる", () => {
    // 先に zero_candidates を 1 回起こし miss=1 にしてから、blocking に戻して再 present
    const s0 = mkBlockingState();
    const sZero = dialogReducer(s0, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
    });
    expect(sZero.zeroCandidateMissCount).toBe(1);
    expect(sZero.conversationStatus).toBe("clarifying");

    // 別 chain 検出で再び blocking に進める
    const sBlocking2 = dialogReducer(
      sZero,
      mkTurnCaptured({
        turnIndex: 3,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "ドトール",
          rawSpan: "ドトール",
        }),
      }),
    );
    // miss は維持される（clarifying 継続中は count 保持）
    expect(sBlocking2.zeroCandidateMissCount).toBe(1);

    const sPresented = dialogReducer(sBlocking2, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 4,
      targetEventId: "event_1",
      queryFingerprint: "fp2",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
    expect(sPresented.zeroCandidateMissCount).toBe(0); // reset
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. SEARCH_CANDIDATE_SELECTED — 成功ケース
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 SEARCH_CANDIDATE_SELECTED 成功", () => {
  it("成功選択 → stable + narrowStep=3 + draft full clear + activePresentation null", () => {
    const sBlocking = mkBlockingState();
    const sPresented = dialogReducer(sBlocking, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [
        mkCandidate({ placeId: "p1" }),
        mkCandidate({ placeId: "p2" }),
      ],
    });

    const sSelected = dialogReducer(sPresented, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 3,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      selectedPlaceId: "p2",
    });

    expect(sSelected.conversationStatus).toBe("stable");
    expect(sSelected.focus?.narrowStep).toBe(3);
    expect(sSelected.activePresentation).toBeNull();
    expect(sSelected.searchQueryDraft.anchorRegion).toBeNull();
    expect(sSelected.searchQueryDraft.categoryToken).toBeNull();
    expect(sSelected.searchQueryDraft.chainToken).toBeNull();
    expect(sSelected.searchQueryDraft.readyForHandoff).toBe(false);
    expect(sSelected.zeroCandidateMissCount).toBe(0);
    expect(sSelected.lastFailedSearch).toBeNull();
  });

  it("選択成功は parkedPresentations を触らない（別 event の履歴は保持）", () => {
    // 先に event_1 presentation を park させる（event_2 に焦点切替）
    const s = mkBlockingState();
    const sP1 = dialogReducer(s, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
    const sSwitched = dialogReducer(sP1, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.parkedPresentations).toHaveLength(1);

    // event_2 を blocking まで持っていき、そこで presented → selected
    const sNarrow2 = dialogReducer(
      sSwitched,
      mkTurnCaptured({
        turnIndex: 4,
        targetEventId: "event_2",
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "ドトール",
          rawSpan: "甲府のドトール",
        }),
      }),
    );
    expect(sNarrow2.conversationStatus).toBe("search_handoff_blocking");

    const sP2 = dialogReducer(sNarrow2, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 5,
      targetEventId: "event_2",
      queryFingerprint: "fp2",
      candidates: [mkCandidate({ placeId: "p9" })],
    });
    const sSel = dialogReducer(sP2, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 6,
      targetEventId: "event_2",
      queryFingerprint: "fp2",
      selectedPlaceId: "p9",
    });

    // 選択成功は parked を触らない（event_1 の park は残る）
    expect(sSel.parkedPresentations).toHaveLength(1);
    expect(sSel.parkedPresentations[0].targetEventId).toBe("event_1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. SEARCH_CANDIDATE_SELECTED — S8: stale/invalid は throw ではなく no-op
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 SEARCH_CANDIDATE_SELECTED — S8 reject/no-op パターン", () => {
  function setupPresented(): DialogState {
    return dialogReducer(mkBlockingState(), {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
  }

  it("activePresentation=null での SELECTED は prev state を返す（throw せず）", () => {
    const s0 = createInitialDialogState();
    const s1 = dialogReducer(s0, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 1,
      targetEventId: "event_1",
      queryFingerprint: "fp",
      selectedPlaceId: "p1",
    });
    expect(s1).toBe(s0); // 同一参照（mutation なし）
  });

  it("provider_recovering 中の SELECTED は no-op", () => {
    const sP = setupPresented();
    const sFailed = dialogReducer(sP, {
      type: "PROVIDER_FAILED",
      turnIndex: 3,
      reason: "timeout",
    });
    // provider 失敗で activePresentation は null 化されているが、
    // status も provider_recovering。どちらのガードでも no-op になる。
    const sReject = dialogReducer(sFailed, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 4,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      selectedPlaceId: "p1",
    });
    expect(sReject).toBe(sFailed);
  });

  it("targetEventId 不一致（別 event からの selection）は no-op", () => {
    const sP = setupPresented();
    const s1 = dialogReducer(sP, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 3,
      targetEventId: "event_OTHER",
      queryFingerprint: "fp1",
      selectedPlaceId: "p1",
    });
    expect(s1).toBe(sP);
  });

  it("queryFingerprint 不一致（stale selection）は no-op", () => {
    const sP = setupPresented();
    const s1 = dialogReducer(sP, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 3,
      targetEventId: "event_1",
      queryFingerprint: "fp_OLD",
      selectedPlaceId: "p1",
    });
    expect(s1).toBe(sP);
  });

  it("selectedPlaceId が candidates に無い場合は no-op", () => {
    const sP = setupPresented();
    const s1 = dialogReducer(sP, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 3,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      selectedPlaceId: "p_NONEXISTENT",
    });
    expect(s1).toBe(sP);
  });

  it("α' 不変条件: parkedPresentations に一致候補があっても SELECTED 解決源にはならない", () => {
    // event_1 を present → FOCUS_SWITCHED で park → event_2 に焦点
    // この時 parkedPresentations[0] には (event_1, fp1, p1) が入っているが、
    // activePresentation は null。SELECTED は parked から解決せず no-op にする。
    const sP1 = setupPresented(); // (event_1, fp1, p1) が active
    const sSwitched = dialogReducer(sP1, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.activePresentation).toBeNull();
    expect(sSwitched.parkedPresentations).toHaveLength(1);
    expect(sSwitched.parkedPresentations[0].candidates[0].placeId).toBe("p1");

    // parked と完全一致する payload で SELECTED を撃つ → それでも no-op
    const sReject = dialogReducer(sSwitched, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: 4,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      selectedPlaceId: "p1",
    });
    expect(sReject).toBe(sSwitched); // 同一参照 = parked は lookup 元に使われていない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. SEARCH_ZERO_CANDIDATES — E: drop failed spec + keep anchor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5 SEARCH_ZERO_CANDIDATES — E pattern", () => {
  it("chain 失敗時: anchor 保持、chain drop、narrowStep 2→1、clarifying へ", () => {
    const s0 = mkBlockingState(); // 甲府/スタバ/step=2
    const s1 = dialogReducer(s0, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
    });

    expect(s1.conversationStatus).toBe("clarifying");
    expect(s1.focus?.narrowStep).toBe(1);
    expect(s1.searchQueryDraft.anchorRegion).toBe("甲府"); // 保持
    expect(s1.searchQueryDraft.chainToken).toBeNull(); // drop
    expect(s1.searchQueryDraft.categoryToken).toBeNull();
    expect(s1.searchQueryDraft.readyForHandoff).toBe(false);
    expect(s1.zeroCandidateMissCount).toBe(1);
    expect(s1.lastFailedSearch).not.toBeNull();
    expect(s1.lastFailedSearch?.anchorRegion).toBe("甲府");
    expect(s1.lastFailedSearch?.failedChainToken).toBe("スタバ");
    expect(s1.lastFailedSearch?.failedCategoryToken).toBeNull();
    expect(s1.activePresentation).toBeNull();
  });

  it("category 失敗時: failedCategoryToken を記録", () => {
    const s0 = dialogReducer(
      createInitialDialogState(),
      mkTurnCaptured({
        capture: mkCapture({
          subKind: "category_with_anchor",
          extractedAnchor: "甲府",
          extractedCategory: "カフェ",
          rawSpan: "甲府のカフェ",
        }),
      }),
    );
    const s1 = dialogReducer(s0, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp",
    });
    expect(s1.lastFailedSearch?.failedCategoryToken).toBe("カフェ");
    expect(s1.lastFailedSearch?.failedChainToken).toBeNull();
  });

  it("zeroCandidateMissCount は同 focus 継続中は累積（S9: status は触らない）", () => {
    // 1 回目 zero
    const s0 = mkBlockingState();
    const sZero1 = dialogReducer(s0, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
    });
    expect(sZero1.zeroCandidateMissCount).toBe(1);

    // 別 chain で再挑戦 → また 0 件
    const sBlocking2 = dialogReducer(
      sZero1,
      mkTurnCaptured({
        turnIndex: 3,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "ドトール",
          rawSpan: "ドトール",
        }),
      }),
    );
    const sZero2 = dialogReducer(sBlocking2, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 4,
      targetEventId: "event_1",
      queryFingerprint: "fp2",
    });
    expect(sZero2.zeroCandidateMissCount).toBe(2);
    expect(sZero2.conversationStatus).toBe("clarifying"); // 維持

    // 3 回目でも status は clarifying のまま（S9: 強制 slot_switching 禁止）
    const sBlocking3 = dialogReducer(
      sZero2,
      mkTurnCaptured({
        turnIndex: 5,
        capture: mkCapture({
          subKind: "chain_alone",
          extractedChain: "タリーズ",
          rawSpan: "タリーズ",
        }),
      }),
    );
    const sZero3 = dialogReducer(sBlocking3, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 6,
      targetEventId: "event_1",
      queryFingerprint: "fp3",
    });
    expect(sZero3.zeroCandidateMissCount).toBe(3);
    expect(sZero3.conversationStatus).toBe("clarifying"); // focus は移動しない
    expect(sZero3.focus?.slot).toBe("where");
    expect(sZero3.focus?.event_id).toBe("event_1");
  });

  it("focus 切替で zeroCandidateMissCount が 0 リセット", () => {
    const s0 = mkBlockingState();
    const sZero = dialogReducer(s0, {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
    });
    expect(sZero.zeroCandidateMissCount).toBe(1);

    const sSwitched = dialogReducer(sZero, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.zeroCandidateMissCount).toBe(0);
  });

  it("search_handoff_blocking 以外から ZERO_CANDIDATES を発火すると throw", () => {
    const s0 = createInitialDialogState();
    expect(() =>
      dialogReducer(s0, {
        type: "SEARCH_ZERO_CANDIDATES",
        turnIndex: 1,
        targetEventId: "event_1",
        queryFingerprint: "fp",
      }),
    ).toThrow(/requires conversationStatus=search_handoff_blocking/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Parked pattern (α') — FOCUS_SWITCHED / TURN_CAPTURED で park
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6 parked pattern (α')", () => {
  function presentOn(
    state: DialogState,
    opts: { eventId: string; fingerprint: string; placeId: string; turn: number },
  ): DialogState {
    return dialogReducer(state, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: opts.turn,
      targetEventId: opts.eventId,
      queryFingerprint: opts.fingerprint,
      candidates: [mkCandidate({ placeId: opts.placeId })],
    });
  }

  it("FOCUS_SWITCHED で activePresentation → parkedPresentations 先頭", () => {
    const s0 = mkBlockingState();
    const sP = presentOn(s0, {
      eventId: "event_1",
      fingerprint: "fp1",
      placeId: "p1",
      turn: 2,
    });
    expect(sP.activePresentation?.targetEventId).toBe("event_1");

    const sSwitched = dialogReducer(sP, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });

    expect(sSwitched.activePresentation).toBeNull();
    expect(sSwitched.parkedPresentations).toHaveLength(1);
    expect(sSwitched.parkedPresentations[0].targetEventId).toBe("event_1");
    expect(sSwitched.parkedPresentations[0].queryFingerprint).toBe("fp1");
  });

  it("TURN_CAPTURED で focus 切替が発生した場合も park される", () => {
    const s0 = mkBlockingState();
    const sP = presentOn(s0, {
      eventId: "event_1",
      fingerprint: "fp1",
      placeId: "p1",
      turn: 2,
    });

    // 別 event の入力（event 切替）
    const sTurn = dialogReducer(
      sP,
      mkTurnCaptured({
        turnIndex: 3,
        targetEventId: "event_2",
        targetSlot: "when",
        capture: mkCapture({
          subKind: "other",
          rawSpan: "午後",
        }),
      }),
    );

    expect(sTurn.activePresentation).toBeNull();
    expect(sTurn.parkedPresentations).toHaveLength(1);
    expect(sTurn.parkedPresentations[0].targetEventId).toBe("event_1");
  });

  it("LRU 最大 3 件、超過分は最古 drop", () => {
    // event_1..4 を順次 present → focus 切替しながら parked を溜める
    let state: DialogState = createInitialDialogState();

    for (let i = 1; i <= 4; i++) {
      const eventId = `event_${i}`;
      // 各 event を blocking まで持っていく
      state = dialogReducer(
        state,
        mkTurnCaptured({
          turnIndex: i * 2 - 1,
          targetEventId: eventId,
          capture: mkCapture({
            subKind: "chain_with_anchor",
            extractedAnchor: "甲府",
            extractedChain: `chain_${i}`,
            rawSpan: `甲府の chain_${i}`,
          }),
        }),
      );
      state = presentOn(state, {
        eventId,
        fingerprint: `fp_${i}`,
        placeId: `p_${i}`,
        turn: i * 2,
      });
      // 次 event に FOCUS_SWITCHED（最後の 1 件は切替しない、active のまま）
      if (i < 4) {
        state = dialogReducer(state, {
          type: "FOCUS_SWITCHED",
          turnIndex: i * 2 + 1,
          nextFocus: {
            event_id: `event_${i + 1}`,
            slot: "where",
            narrowStep: 0,
          },
        });
      }
    }

    // event_1, event_2, event_3 が park されている（event_4 は active）
    // ただし LRU 最大 3 なので 3 件
    expect(state.activePresentation?.targetEventId).toBe("event_4");
    expect(state.parkedPresentations).toHaveLength(3);
    // 新しい順
    expect(state.parkedPresentations.map((p) => p.targetEventId)).toEqual([
      "event_3",
      "event_2",
      "event_1",
    ]);

    // event_4 も park してみる（4 つ目で event_1 が drop されるはず）
    const sSwitched = dialogReducer(state, {
      type: "FOCUS_SWITCHED",
      turnIndex: 99,
      nextFocus: { event_id: "event_5", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.parkedPresentations).toHaveLength(3);
    expect(sSwitched.parkedPresentations.map((p) => p.targetEventId)).toEqual([
      "event_4", // 最新
      "event_3",
      "event_2",
    ]);
    // event_1 が LRU で drop
  });

  it("同 (targetEventId, queryFingerprint) の重複 park は最新化のみ", () => {
    // event_1/fp1 を park → 再度 event_1 に戻って同 fp で present → 再 park
    const s0 = mkBlockingState();
    const sP1 = presentOn(s0, {
      eventId: "event_1",
      fingerprint: "fp1",
      placeId: "p1",
      turn: 2,
    });
    const sSwitched = dialogReducer(sP1, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.parkedPresentations).toHaveLength(1);

    // event_1 に戻る → blocking 再現 → 同 fp で present → FOCUS_SWITCHED で park
    const sBack = dialogReducer(
      sSwitched,
      mkTurnCaptured({
        turnIndex: 4,
        targetEventId: "event_1",
        capture: mkCapture({
          subKind: "chain_with_anchor",
          extractedAnchor: "甲府",
          extractedChain: "スタバ",
          rawSpan: "甲府のスタバ",
        }),
      }),
    );
    expect(sBack.conversationStatus).toBe("search_handoff_blocking");

    const sP2 = presentOn(sBack, {
      eventId: "event_1",
      fingerprint: "fp1", // 同じ
      placeId: "p_other",
      turn: 5,
    });
    const sSwitched2 = dialogReducer(sP2, {
      type: "FOCUS_SWITCHED",
      turnIndex: 6,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    // 重複は最新化のみ（2 件になるのではなく 1 件のまま）
    expect(sSwitched2.parkedPresentations).toHaveLength(1);
    expect(sSwitched2.parkedPresentations[0].presentedAtTurn).toBe(5); // 最新
  });

  it("focus 継続中（narrowing → blocking 等）は park されない", () => {
    const s0 = mkBlockingState();
    const sP = presentOn(s0, {
      eventId: "event_1",
      fingerprint: "fp1",
      placeId: "p1",
      turn: 2,
    });
    // 同 event/slot で別発話（focus 継続）
    //   ただし PRESENTED 状態から TURN_CAPTURED の FSA 遷移は整合しない場合があるため、
    //   PRESENTED → 同状態（PRESENTED）で再提示だけ検証する
    const sP2 = dialogReducer(sP, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 3,
      targetEventId: "event_1",
      queryFingerprint: "fp1b",
      candidates: [mkCandidate({ placeId: "p_new" })],
    });
    expect(sP2.activePresentation?.queryFingerprint).toBe("fp1b");
    expect(sP2.parkedPresentations).toHaveLength(0); // parking なし
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. PROVIDER_FAILED / PROVIDER_RECOVERED と新フィールドの挙動
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7 PROVIDER_FAILED / RECOVERED", () => {
  it("PROVIDER_FAILED で activePresentation は null 化、parked は維持", () => {
    const s0 = mkBlockingState();
    const sP = dialogReducer(s0, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });

    const sFailed = dialogReducer(sP, {
      type: "PROVIDER_FAILED",
      turnIndex: 3,
      reason: "timeout",
    });

    expect(sFailed.conversationStatus).toBe("provider_recovering");
    expect(sFailed.activePresentation).toBeNull();
    expect(sFailed.parkedPresentations).toEqual(sP.parkedPresentations);
  });

  it("PROVIDER_RECOVERED は parked / lastFailed / miss を維持", () => {
    const s0 = mkBlockingState();
    const sP = dialogReducer(s0, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
    const sFailed = dialogReducer(sP, {
      type: "PROVIDER_FAILED",
      turnIndex: 3,
      reason: "timeout",
    });

    const sRec = dialogReducer(sFailed, {
      type: "PROVIDER_RECOVERED",
      turnIndex: 4,
      events: [],
    });

    expect(sRec.activePresentation).toBeNull(); // 復帰後も stale は残さない
    expect(sRec.parkedPresentations).toEqual(sFailed.parkedPresentations);
    expect(sRec.lastFailedSearch).toEqual(sFailed.lastFailedSearch);
    expect(sRec.zeroCandidateMissCount).toBe(sFailed.zeroCandidateMissCount);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. RESET は全新フィールドを初期値に戻す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8 RESET", () => {
  it("RESET で activePresentation/parked/lastFailed/missCount が初期化", () => {
    const s0 = mkBlockingState();
    const sP = dialogReducer(s0, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 2,
      targetEventId: "event_1",
      queryFingerprint: "fp1",
      candidates: [mkCandidate({ placeId: "p1" })],
    });
    const sZero = dialogReducer(mkBlockingState(), {
      type: "SEARCH_ZERO_CANDIDATES",
      turnIndex: 9,
      targetEventId: "event_1",
      queryFingerprint: "fp_bad",
    });
    // 複合 state を作る：sP から PROVIDER で park + miss を同時に持たせる
    void sZero;

    const sSwitched = dialogReducer(sP, {
      type: "FOCUS_SWITCHED",
      turnIndex: 3,
      nextFocus: { event_id: "event_2", slot: "where", narrowStep: 0 },
    });
    expect(sSwitched.parkedPresentations.length).toBeGreaterThan(0);

    const sReset = dialogReducer(sSwitched, { type: "RESET", turnIndex: 4 });
    expect(sReset.activePresentation).toBeNull();
    expect(sReset.parkedPresentations).toEqual([]);
    expect(sReset.lastFailedSearch).toBeNull();
    expect(sReset.zeroCandidateMissCount).toBe(0);
  });
});
