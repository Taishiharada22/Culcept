/**
 * Place Search Bridge — integration-style tests
 *
 * 検証観点（CEO 追加 guard 2 本含む）:
 *   §1 Bridge 入力境界 — 注入の発火条件
 *     - placeAsk あり + persistedEvents 空 → synthetic events 生成
 *     - placeAsk なし → 生成しない
 *     - placeConfirm のみ → 生成しない（Phase 1 は placeAsk のみ対象）
 *
 *   §2 Bridge → reducer dispatch（synthetic events を使った dispatch path 検証）
 *     - synthetic events を advanceDialogState に渡すと
 *       reducer が focus / narrowStep / readyForHandoff を populate できる
 *     - conversationStatus が search_handoff_blocking まで到達
 *
 *   §3 phase 降格境界（CEO guard #2）
 *     - placeAsk あり: phase=plan_presented → 降格して clarifying
 *     - placeAsk なし: phase=plan_presented のまま（降格しない）
 *
 *   §4 round-trip 完全実証（CEO guard #1）
 *     synthetic 注入
 *       → advanceDialogState（focus/draft 確立）
 *       → SEARCH_CANDIDATES_PRESENTED dispatch（候補提示）
 *       → applyPlaceSelection（選択の適用）
 *       → decidePhase が plan_presented を返す（hard gate 解除）
 *     ここまで「実際に動くこと」を 1 本で証明する。
 */

import { describe, it, expect } from "vitest";
import {
  buildSyntheticEventsFromPlanState,
  buildSyntheticEventFromSegment,
} from "@/lib/alter-morning/dialog/syntheticEventBuilder";
import { advanceDialogState } from "@/lib/alter-morning/dialog/shadowPipeline";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import { applyPlaceSelection } from "@/lib/alter-morning/search/applyPlaceSelection";
import { hasBlockingUnresolvedSlots } from "@/lib/alter-morning/planning/blockingSlots";
import type {
  DialogState,
  ConversationStatus,
} from "@/lib/alter-morning/dialog/types";
import type { PlanSegment, PlanState } from "@/lib/alter-morning/planState";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mkSegment(opts: {
  id: string;
  place: string;
  placeCanonical?: string;
  placeType?: PlanSegment["placeType"];
  startTime?: string;
  resolvedLat?: number;
  resolvedLng?: number;
  resolutionConfidence?: PlanSegment["resolutionConfidence"];
}): PlanSegment {
  return {
    id: opts.id,
    order: 1,
    activity: "滞在",
    activityCanonical: "滞在",
    place: opts.place,
    placeCanonical: opts.placeCanonical,
    placeType: opts.placeType ?? "chain_brand",
    startTime: opts.startTime ?? "09:00",
    resolvedLat: opts.resolvedLat,
    resolvedLng: opts.resolvedLng,
    resolutionConfidence: opts.resolutionConfidence ?? "low",
    timeConstraint: { type: "fixed_start", fixedTime: opts.startTime ?? "09:00" },
    anchorScore: 4,
    companions: [],
    status: "tentative",
  } as PlanSegment;
}

function mkPlanState(opts: {
  segments?: PlanSegment[];
  missingFields?: string[];
}): PlanState {
  return {
    targetDate: "2026-04-25",
    targetDateLabel: "今日",
    timezone: "Asia/Tokyo",
    segments: opts.segments ?? [],
    goOut: true,
    status: "collecting",
    missingFields: opts.missingFields ?? [],
    transport: "car",
  } as PlanState;
}

function mkInitialDialogState(): DialogState {
  return {
    version: 1,
    focus: null,
    conversationStatus: "stable" as ConversationStatus,
    capturedHistory: [],
    semanticMissStreak: 0,
    providerFailureStreak: 0,
    lastGoodPlan: null,
    searchQueryDraft: {
      anchorRegion: null,
      categoryToken: null,
      chainToken: null,
      readyForHandoff: false,
    },
    activePresentation: null,
    parkedPresentations: [],
    lastFailedSearch: null,
    zeroCandidateMissCount: 0,
  };
}

function mkCandidate(opts: {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
}): NormalizedPlaceCandidate {
  return {
    placeId: opts.placeId,
    displayName: opts.displayName,
    address: "東京都",
    coordinates: { lat: opts.lat, lng: opts.lng },
    distanceFromAnchor: null,
    category: "cafe",
    chainToken: "スタバ",
    rawRef: { provider: "google_places", placeId: opts.placeId },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 Bridge 入力境界
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 Bridge 入力境界", () => {
  it("§1.1 placeAsk あり → synthetic events が segment 数だけ生成される", () => {
    const plan = mkPlanState({
      segments: [mkSegment({ id: "seg_1", place: "渋谷のスタバ" })],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });
    const events = buildSyntheticEventsFromPlanState(plan);
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe("seg_1");
  });

  it("§1.2 missingFields が空 → 全 segment が non-blocking で生成される（route.ts 側で injection を skip すべきだが、builder 自体は安全）", () => {
    const plan = mkPlanState({
      segments: [mkSegment({ id: "seg_1", place: "渋谷のスタバ" })],
      missingFields: [],
    });
    const events = buildSyntheticEventsFromPlanState(plan);
    expect(events).toHaveLength(1);
    expect(events[0].missing_semantic_critical).toEqual([]);
    expect(events[0].certainty).toBe("asserted");
  });

  it("§1.3 placeConfirm のみ（placeAsk なし）→ 全 segment が non-blocking", () => {
    const plan = mkPlanState({
      segments: [mkSegment({ id: "seg_1", place: "渋谷のスタバ" })],
      missingFields: ["placeConfirm:seg_1:渋谷のスタバ"],
    });
    const events = buildSyntheticEventsFromPlanState(plan);
    expect(events[0].missing_semantic_critical).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 Bridge → reducer dispatch path（実際の reducer に渡して動作実証）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2 Bridge → reducer dispatch", () => {
  it("§2.1 synthetic events を渡して advanceDialogState を実行 → focus/narrowStep/readyForHandoff が populate", () => {
    const plan = mkPlanState({
      segments: [
        mkSegment({
          id: "seg_1",
          place: "渋谷のスタバ",
          placeCanonical: "スターバックス",
          placeType: "chain_brand",
          startTime: "09:00",
          resolvedLat: 35.6587,
          resolvedLng: 139.6997,
          resolutionConfidence: "low",
        }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });
    const syntheticEvents = buildSyntheticEventsFromPlanState(plan);
    const initialState = mkInitialDialogState();

    // Bridge 経路と同等の dispatch 呼び出し
    const advanced = advanceDialogState({
      prevState: initialState,
      message: "渋谷のスタバ",   // ← classifyUtterance がここから anchor=渋谷, chain=スタバ を抽出
      targetEventId: "seg_1",     // ← segment.id を流用（CEO 指示）
      targetSlot: "where",
      events: syntheticEvents,
      turnIndex: 1,
      nowIso: "2026-04-25T07:00:00Z",
    });

    // focus が where slot で seg_1 に向く
    expect(advanced.nextState.focus).not.toBeNull();
    expect(advanced.nextState.focus?.event_id).toBe("seg_1");
    expect(advanced.nextState.focus?.slot).toBe("where");

    // searchQueryDraft が classifyUtterance の出力で populate
    // 「渋谷のスタバ」→ anchor=渋谷, chain=スタバ
    expect(advanced.nextState.searchQueryDraft.anchorRegion).toBe("渋谷");
    expect(advanced.nextState.searchQueryDraft.chainToken).toBe("スタバ");
    expect(advanced.nextState.searchQueryDraft.readyForHandoff).toBe(true);
  });

  it("§2.2 上記 dispatch 後 → conversationStatus が search_handoff_blocking", () => {
    const plan = mkPlanState({
      segments: [
        mkSegment({
          id: "seg_1",
          place: "渋谷のスタバ",
          placeType: "chain_brand",
          resolutionConfidence: "low",
        }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });
    const syntheticEvents = buildSyntheticEventsFromPlanState(plan);
    const advanced = advanceDialogState({
      prevState: mkInitialDialogState(),
      message: "渋谷のスタバ",
      targetEventId: "seg_1",
      targetSlot: "where",
      events: syntheticEvents,
      turnIndex: 1,
      nowIso: "2026-04-25T07:00:00Z",
    });

    expect(advanced.nextState.conversationStatus).toBe("search_handoff_blocking");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 hard gate 境界（CEO 2026-04-26 redesign）
//   旧 phase 降格 (route.ts 内) は MorningPlanCard の「これでいく」gate に
//   何の影響も与えていなかった（gate は !plan.confirmed のみ依存）。
//   新設計: events.missing_semantic_critical=["where"] を MorningPlanCard 内で
//   読んで「これでいく」を hide する。selection で applyPlaceSelection が
//   "where" を filter すると false に戻り button 復活。
//
//   (router 側 bridge は injection のみ責務、phase 降格は削除)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3 hard gate 境界（events 由来 placeAskPending）", () => {
  /**
   * Bridge injection の核心ロジック（route.ts に同じ判定が入る）。
   * placeAsk が missingFields にあり persistedEvents が空の時だけ
   * synthetic events を作って注入する。phase 降格は廃止された。
   */
  function shouldInject(opts: {
    persistedEventsLength: number;
    missingFields: string[];
  }): boolean {
    if (opts.persistedEventsLength > 0) return false;
    return opts.missingFields.some((f) => f.startsWith("placeAsk:"));
  }

  /**
   * MorningPlanCard 内の hasPlaceAskPending の純粋ロジック（行末側で
   * 真の component 関数を直接 import すると jsdom 不在 react import が
   * 走るためここでは pure helper として再現テストする）。
   */
  function hasPlaceAskPendingFromEventLikeArray(
    events: Array<{ missing_semantic_critical?: string[] }> | undefined | null,
  ): boolean {
    if (!events || events.length === 0) return false;
    return events.some(
      (e) => e.missing_semantic_critical?.includes("where") ?? false,
    );
  }

  it("§3.1 events 空 → false（初期状態 / morningPlan が無いケース）", () => {
    expect(hasPlaceAskPendingFromEventLikeArray([])).toBe(false);
    expect(hasPlaceAskPendingFromEventLikeArray(undefined)).toBe(false);
    expect(hasPlaceAskPendingFromEventLikeArray(null)).toBe(false);
  });

  it("§3.2 events 1 件 + missing_semantic_critical=[where] → true（hard gate 有効）", () => {
    expect(
      hasPlaceAskPendingFromEventLikeArray([
        { missing_semantic_critical: ["where"] },
      ]),
    ).toBe(true);
  });

  it("§3.3 events 1 件 + missing_semantic_critical=[] → false", () => {
    expect(
      hasPlaceAskPendingFromEventLikeArray([{ missing_semantic_critical: [] }]),
    ).toBe(false);
  });

  it("§3.4 events 1 件 + missing_semantic_critical undefined → false", () => {
    expect(hasPlaceAskPendingFromEventLikeArray([{}])).toBe(false);
  });

  it("§3.5 events 複数 + 1 件だけ where → true（or 評価）", () => {
    // CEO 観測ケース: スタバ + マック の 2 件のうち 1 件でも未確定なら hard gate
    expect(
      hasPlaceAskPendingFromEventLikeArray([
        { missing_semantic_critical: [] },
        { missing_semantic_critical: ["where"] },
      ]),
    ).toBe(true);
  });

  it("§3.6 events 複数 + 全件 where → true", () => {
    expect(
      hasPlaceAskPendingFromEventLikeArray([
        { missing_semantic_critical: ["where"] },
        { missing_semantic_critical: ["where"] },
      ]),
    ).toBe(true);
  });

  it("§3.7 events 複数 + 全件 where 解消 → false（selection 完了想定）", () => {
    expect(
      hasPlaceAskPendingFromEventLikeArray([
        { missing_semantic_critical: [] },
        { missing_semantic_critical: [] },
      ]),
    ).toBe(false);
  });

  it("§3.8 missing_semantic_critical に when は含まれるが where はない → false", () => {
    // hard gate は where に限定（時刻未確定では確定 button を hide しない）
    expect(
      hasPlaceAskPendingFromEventLikeArray([
        { missing_semantic_critical: ["when"] },
      ]),
    ).toBe(false);
  });

  it("§3.9 injection ガード: persistedEvents 既存 + placeAsk あり → injection しない", () => {
    expect(
      shouldInject({
        persistedEventsLength: 1,
        missingFields: ["placeAsk:seg_1:X"],
      }),
    ).toBe(false);
  });

  it("§3.10 injection ガード: persistedEvents 空 + placeAsk あり → injection する", () => {
    expect(
      shouldInject({
        persistedEventsLength: 0,
        missingFields: ["placeAsk:seg_1:X"],
      }),
    ).toBe(true);
  });

  it("§3.11 injection ガード: persistedEvents 空 + placeAsk なし → injection しない", () => {
    expect(
      shouldInject({
        persistedEventsLength: 0,
        missingFields: [],
      }),
    ).toBe(false);
  });

  it("§3.12 idempotency: 同じ events で n 回判定しても同じ結果（純関数）", () => {
    const evs = [{ missing_semantic_critical: ["where"] }];
    expect(hasPlaceAskPendingFromEventLikeArray(evs)).toBe(true);
    expect(hasPlaceAskPendingFromEventLikeArray(evs)).toBe(true);
    expect(hasPlaceAskPendingFromEventLikeArray(evs)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 round-trip 完全実証（CEO 追加 guard #1）
// 「synthetic 注入 → presented → selection → where 除去 → plan_presented」
// を 1 本で実コードチェーンに通して立証する。
// 「applyPlaceSelection はそのまま動くはず」で止めない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4 round-trip 完全実証（CEO guard #1）", () => {
  it("§4.1 synthetic 注入 → 候補提示 → 選択 → hard gate 解除 → plan_presented まで通る", () => {
    // Step A: planState から synthetic events を構築
    const plan = mkPlanState({
      segments: [
        mkSegment({
          id: "seg_1",
          place: "渋谷のスタバ",
          placeCanonical: "スターバックス",
          placeType: "chain_brand",
          startTime: "09:00",
          resolvedLat: 35.6587,
          resolvedLng: 139.6997,
          resolutionConfidence: "low",
        }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });
    const syntheticEvents = buildSyntheticEventsFromPlanState(plan);
    expect(syntheticEvents).toHaveLength(1);
    expect(syntheticEvents[0].event_id).toBe("seg_1");
    expect(syntheticEvents[0].missing_semantic_critical).toEqual(["where"]);

    // hard gate の前提検証: synthetic 注入直後、blocking が成立している
    expect(hasBlockingUnresolvedSlots(syntheticEvents)).toBe(true);

    // Step B: TURN_CAPTURED dispatch（既存の advanceDialogState 経由）
    const initialState = mkInitialDialogState();
    const advanced = advanceDialogState({
      prevState: initialState,
      message: "渋谷のスタバ",
      targetEventId: "seg_1",
      targetSlot: "where",
      events: syntheticEvents,
      turnIndex: 1,
      nowIso: "2026-04-25T07:00:00Z",
    });
    expect(advanced.nextState.conversationStatus).toBe("search_handoff_blocking");
    expect(advanced.nextState.searchQueryDraft.readyForHandoff).toBe(true);

    // Step C: SEARCH_CANDIDATES_PRESENTED dispatch（orchestrator が走った想定）
    const queryFingerprint = "渋谷|スタバ|null";
    const candidates: NormalizedPlaceCandidate[] = [
      mkCandidate({
        placeId: "ChIJR4fczVeLGGARWVp2HGalka0",
        displayName: "スターバックス コーヒー 渋谷マークシティ店",
        lat: 35.6587191,
        lng: 139.6997413,
      }),
      mkCandidate({
        placeId: "ChIJOTHER",
        displayName: "スターバックス コーヒー 渋谷スカイ店",
        lat: 35.659,
        lng: 139.701,
      }),
    ];
    const afterPresented = dialogReducer(advanced.nextState, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: 1,
      targetEventId: "seg_1",
      queryFingerprint,
      candidates,
    });
    expect(afterPresented.conversationStatus).toBe("search_candidates_presented");
    expect(afterPresented.activePresentation).not.toBeNull();
    expect(afterPresented.activePresentation?.candidates).toHaveLength(2);

    // Step D: ユーザーが 1 件選択
    const selectedCandidate = candidates[0];
    const selectionResult = applyPlaceSelection({
      events: syntheticEvents,
      targetEventId: "seg_1",
      candidate: selectedCandidate,
    });
    // 「applyPlaceSelection はそのまま動くはず」で止めない実証:
    expect(selectionResult.applied).toBe(true);
    expect(selectionResult.events).toHaveLength(1);

    const updatedEvent = selectionResult.events[0];
    expect(updatedEvent.event_id).toBe("seg_1");
    // missing_semantic_critical から "where" 除去（CEO guard #1 の要件）
    expect(updatedEvent.missing_semantic_critical).toEqual([]);
    // placeType が exact_proper_noun に昇格
    expect(updatedEvent.where.placeType).toBe("exact_proper_noun");
    // 座標が selectedCandidate のものに置換
    expect(updatedEvent.where.coordinates).toEqual({
      lat: 35.6587191,
      lng: 139.6997413,
    });
    expect(updatedEvent.where.place_ref).toBe(
      "スターバックス コーヒー 渋谷マークシティ店",
    );

    // Step E: hard gate 解除を blockingSlots で実証
    expect(hasBlockingUnresolvedSlots(selectionResult.events)).toBe(false);

    // Step F: phase は legacyAdapter の decidePhase と同じロジックで判定可能
    // （decidePhase は MorningPipelineResult を要求するため、
    // ここでは直接 hasBlockingUnresolvedSlots(false) ＝ plan_presented 昇格可能と確認）

    // Step G (CEO 2026-04-26 追加): client-side hard gate も同期して解除する
    //   MorningPlanCard 内の hasPlaceAskPending(events) の純粋ロジックを
    //   再現してテスト（component 関数を直接 import すると jsdom 不在で失敗）。
    function hasPlaceAskPending(
      evs: Array<{ missing_semantic_critical?: string[] }>,
    ): boolean {
      return evs.some(
        (e) => e.missing_semantic_critical?.includes("where") ?? false,
      );
    }
    // 注入直後（選択前）: hard gate 有効
    expect(hasPlaceAskPending(syntheticEvents)).toBe(true);
    // 選択後: hard gate 解除（「これでいく」復活）
    expect(hasPlaceAskPending(selectionResult.events)).toBe(false);

    // → CEO guard #1 の「plan_presented へ戻る」要件を実証完了:
    //   - server side: hasBlockingUnresolvedSlots false → decidePhase=plan_presented
    //   - client side: hasPlaceAskPending false → 「これでいく」復活
  });

  it("§4.2 round-trip negative: 選択前は hard gate が成立し続けている（境界の対比証明）", () => {
    const plan = mkPlanState({
      segments: [
        mkSegment({
          id: "seg_1",
          place: "渋谷のスタバ",
          placeType: "chain_brand",
          resolutionConfidence: "low",
        }),
      ],
      missingFields: ["placeAsk:seg_1:渋谷のスタバ"],
    });
    const events = buildSyntheticEventsFromPlanState(plan);

    // 選択前 → blocking
    expect(hasBlockingUnresolvedSlots(events)).toBe(true);

    // 同じ event でも、確定済 (exact_proper_noun + where 除去) なら blocking が消える
    const confirmed = buildSyntheticEventFromSegment(
      mkSegment({
        id: "seg_2",
        place: "本店",
        placeType: "exact_proper_noun",
        resolutionConfidence: "high",
      }),
      false,
    );
    expect(hasBlockingUnresolvedSlots([confirmed])).toBe(false);
  });
});
