/**
 * B-3b foundation integration test (PR B-3b Commit 4)
 *
 * CEO/GPT 2026-05-03 PR B-3b 必須 7 項目を fix する infrastructure 統合 test:
 *
 *   1. 旧 activePresentation.targetEventId のみでも event_where として動く
 *   2. target: { kind: "event_where" } でも既存 event_where flow が壊れない
 *   3. target: { kind: "journey_origin" } を reducer が保持できる
 *   4. target: { kind: "journey_end" } を reducer が保持できる
 *   5. SEARCH_CANDIDATE_SELECTED の stale check が旧 targetEventId と新 target
 *      の両方で壊れない
 *   6. classifyLabel が private_semantic / generic / public_poi / ambiguous を
 *      正しく分類する (= cross-reference、Commit 1 で詳細 test 済み)
 *   7. private_semantic は Places API に流す段階まで到達しない設計
 *      (= shouldGroundLabel が必ず false、description で明記)
 *
 * 注: B-3b は infrastructure-only。actual candidate presentation の wiring は
 *     B-3b' で実施。本 test は type / reducer / classifier の **契約** を fix する。
 *     orchestrator や route.ts wiring の test は B-3b' に分離。
 */

import { describe, it, expect } from "vitest";
import {
  createInitialDialogState,
  getPresentationTarget,
  type DialogState,
  type PresentationTarget,
  type PresentationContext,
} from "@/lib/alter-morning/dialog/types";
import { dialogReducer } from "@/lib/alter-morning/dialog/reducer";
import {
  classifyLabel,
  shouldGroundLabel,
} from "@/lib/alter-morning/search/labelClassification";
import type { NormalizedPlaceCandidate } from "@/lib/alter-morning/search/normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FINGERPRINT = "fp_test_123";
const TARGET_EVENT_ID = "event_test_123";
const TURN_INDEX = 1;

function mockCandidate(placeId: string, name: string): NormalizedPlaceCandidate {
  return {
    placeId,
    displayName: name,
    formattedAddress: `${name} 住所`,
    coordinates: { lat: 35.6896, lng: 139.7006 },
    distanceMeters: null,
    primaryTypeJa: null,
    rating: null,
    rawTypes: [],
  };
}

/**
 * search_handoff_blocking 状態の DialogState を構築する。
 * SEARCH_CANDIDATES_PRESENTED の前提として使う。
 */
function makeHandoffBlockingState(): DialogState {
  const base = createInitialDialogState();
  return {
    ...base,
    focus: { event_id: TARGET_EVENT_ID, slot: "where", narrowStep: 2 },
    conversationStatus: "search_handoff_blocking",
    searchQueryDraft: {
      anchorRegion: "渋谷",
      categoryToken: null,
      chainToken: "サドヤ",
      readyForHandoff: true,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #1: 旧 activePresentation.targetEventId のみでも event_where として動く
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#1 必須] 旧 activePresentation.targetEventId のみでも event_where として動く", () => {
  it("target undefined の PresentationContext は event_where と推定される", () => {
    const ctx: PresentationContext = {
      targetEventId: TARGET_EVENT_ID,
      queryFingerprint: FINGERPRINT,
      candidates: [mockCandidate("p1", "サドヤ")],
      presentedAtTurn: TURN_INDEX,
    };
    const target = getPresentationTarget(ctx);
    expect(target.kind).toBe("event_where");
    if (target.kind === "event_where") {
      expect(target.eventId).toBe(TARGET_EVENT_ID);
    }
  });

  it("旧 reducer 経路: target を渡さない PRESENTED action でも presentation を立てられる", () => {
    const initialState = makeHandoffBlockingState();
    const nextState = dialogReducer(initialState, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: TURN_INDEX,
      targetEventId: TARGET_EVENT_ID,
      queryFingerprint: FINGERPRINT,
      candidates: [mockCandidate("p1", "サドヤ")],
      // target を意図的に渡さない (= 旧 caller 経路)
    });
    expect(nextState.conversationStatus).toBe("search_candidates_presented");
    expect(nextState.activePresentation).not.toBeNull();
    expect(nextState.activePresentation?.targetEventId).toBe(TARGET_EVENT_ID);
    // target field は undefined (= 旧 caller 経路で互換性維持)
    expect(nextState.activePresentation?.target).toBeUndefined();
    // helper 経由で event_where に正しく解決される
    if (nextState.activePresentation) {
      const resolved = getPresentationTarget(nextState.activePresentation);
      expect(resolved.kind).toBe("event_where");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #2: target: { kind: "event_where" } でも既存 event_where flow が壊れない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#2 必須] target: event_where でも既存 event_where flow 不変", () => {
  it("target: event_where が明示されても、reducer が presentation に保持する", () => {
    const initialState = makeHandoffBlockingState();
    const target: PresentationTarget = {
      kind: "event_where",
      eventId: TARGET_EVENT_ID,
    };
    const nextState = dialogReducer(initialState, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: TURN_INDEX,
      targetEventId: TARGET_EVENT_ID,
      queryFingerprint: FINGERPRINT,
      candidates: [mockCandidate("p1", "サドヤ")],
      target, // 明示
    });
    expect(nextState.activePresentation?.target).toEqual(target);
    expect(nextState.activePresentation?.targetEventId).toBe(TARGET_EVENT_ID);
  });

  it("旧 SELECTED action (target なし) でも target: event_where presentation を accept", () => {
    // PRESENTED で target=event_where、SELECTED で target を渡さない (= 旧 client)
    const presented: DialogState = {
      ...makeHandoffBlockingState(),
      conversationStatus: "search_candidates_presented",
      activePresentation: {
        targetEventId: TARGET_EVENT_ID,
        queryFingerprint: FINGERPRINT,
        candidates: [mockCandidate("p1", "サドヤ")],
        presentedAtTurn: TURN_INDEX,
        // target は **undefined** (= 旧 presentation 状態)
      },
    };
    const result = dialogReducer(presented, {
      type: "SEARCH_CANDIDATE_SELECTED",
      turnIndex: TURN_INDEX + 1,
      targetEventId: TARGET_EVENT_ID,
      queryFingerprint: FINGERPRINT,
      selectedPlaceId: "p1",
      // target undefined (= 旧 client)
    });
    // legacy 経路: targetEventId 一致のみで accept、stable に遷移
    expect(result.conversationStatus).toBe("stable");
    expect(result.activePresentation).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #3: target: { kind: "journey_origin" } を reducer が保持できる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#3 必須] target: journey_origin を reducer が保持できる", () => {
  it("PRESENTED with target=journey_origin → presentation.target = journey_origin", () => {
    const initialState = makeHandoffBlockingState();
    const target: PresentationTarget = { kind: "journey_origin" };
    const nextState = dialogReducer(initialState, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: TURN_INDEX,
      targetEventId: TARGET_EVENT_ID, // sentinel
      queryFingerprint: FINGERPRINT,
      candidates: [mockCandidate("p_hotel", "ANA インターコンチネンタル")],
      target,
    });
    expect(nextState.activePresentation?.target?.kind).toBe("journey_origin");
    if (nextState.activePresentation) {
      const resolved = getPresentationTarget(nextState.activePresentation);
      expect(resolved.kind).toBe("journey_origin");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #4: target: { kind: "journey_end" } を reducer が保持できる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#4 必須] target: journey_end を reducer が保持できる", () => {
  it("PRESENTED with target=journey_end → presentation.target = journey_end", () => {
    const initialState = makeHandoffBlockingState();
    const target: PresentationTarget = { kind: "journey_end" };
    const nextState = dialogReducer(initialState, {
      type: "SEARCH_CANDIDATES_PRESENTED",
      turnIndex: TURN_INDEX,
      targetEventId: TARGET_EVENT_ID,
      queryFingerprint: FINGERPRINT,
      candidates: [mockCandidate("p_home", "実家")],
      target,
    });
    expect(nextState.activePresentation?.target?.kind).toBe("journey_end");
    if (nextState.activePresentation) {
      const resolved = getPresentationTarget(nextState.activePresentation);
      expect(resolved.kind).toBe("journey_end");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #5: SELECTED stale check が旧 targetEventId と新 target の両方で壊れない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#5 必須] SELECTED stale check — 旧/新 両経路で壊れない", () => {
  describe("legacy 経路 (= target なし)", () => {
    it("targetEventId 一致 → accept", () => {
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p1", "サドヤ")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: TARGET_EVENT_ID,
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p1",
      });
      expect(result.conversationStatus).toBe("stable");
    });

    it("targetEventId 不一致 → reject (= state 不変)", () => {
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p1", "サドヤ")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: "other_event_id", // 不一致
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p1",
      });
      // reject: state はそのまま
      expect(result).toBe(presented);
    });
  });

  describe("new 経路 (= target あり)", () => {
    it("両方 target=journey_origin で kind 一致 → accept", () => {
      const target: PresentationTarget = { kind: "journey_origin" };
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          target,
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p_hotel", "ANA")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: TARGET_EVENT_ID,
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p_hotel",
        target, // 一致
      });
      expect(result.conversationStatus).toBe("stable");
    });

    it("kind 不一致 (= journey_origin presentation に event_where selection) → reject", () => {
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          target: { kind: "journey_origin" },
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p1", "X")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: TARGET_EVENT_ID,
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p1",
        target: { kind: "event_where", eventId: TARGET_EVENT_ID },
      });
      // kind 不一致 → reject
      expect(result).toBe(presented);
    });

    it("片方だけ target あり (= legacy/new mix) → reject (defensive)", () => {
      // presentation: target あり、selection: target なし (= 危険な mix)
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          target: { kind: "journey_origin" },
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p1", "X")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: TARGET_EVENT_ID,
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p1",
        // target 未指定 (= 旧 client)
      });
      // mix → reject (= 新旧経路の安全 guard)
      expect(result).toBe(presented);
    });

    it("event_where 同士で eventId 不一致 → reject", () => {
      const presented: DialogState = {
        ...makeHandoffBlockingState(),
        conversationStatus: "search_candidates_presented",
        activePresentation: {
          targetEventId: TARGET_EVENT_ID,
          target: { kind: "event_where", eventId: TARGET_EVENT_ID },
          queryFingerprint: FINGERPRINT,
          candidates: [mockCandidate("p1", "X")],
          presentedAtTurn: TURN_INDEX,
        },
      };
      const result = dialogReducer(presented, {
        type: "SEARCH_CANDIDATE_SELECTED",
        turnIndex: TURN_INDEX + 1,
        targetEventId: TARGET_EVENT_ID, // legacy field 一致
        queryFingerprint: FINGERPRINT,
        selectedPlaceId: "p1",
        target: { kind: "event_where", eventId: "other_event_id" }, // target で不一致
      });
      // 二重 check で reject
      expect(result).toBe(presented);
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #6: classifyLabel cross-reference (audit doc fixture)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#6 必須] classifyLabel が 4 分類を正しく判定 (audit doc fixture cross-reference)", () => {
  // 詳細 test は labelClassification.test.ts で網羅。本 test は audit doc §4.2 の
  // 代表 fixture を再確認する。
  it("public_poi_proper_noun: 「東京駅」", () => {
    expect(classifyLabel("東京駅")).toBe("public_poi_proper_noun");
  });

  it("generic_category: 「ホテル」", () => {
    expect(classifyLabel("ホテル")).toBe("generic_category");
  });

  it("private_semantic: 「自宅」", () => {
    expect(classifyLabel("自宅")).toBe("private_semantic");
  });

  it("private_semantic: 「会社」", () => {
    expect(classifyLabel("会社")).toBe("private_semantic");
  });

  it("private_semantic: 「友達の家」", () => {
    expect(classifyLabel("友達の家")).toBe("private_semantic");
  });

  it("ambiguous_or_demonstrative: 「あそこ」", () => {
    expect(classifyLabel("あそこ")).toBe("ambiguous_or_demonstrative");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test #7: private_semantic は Places API 段階に到達しない設計 (= shouldGroundLabel 必ず false)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("[#7 必須] private_semantic は Places API に流す段階まで到達しない設計", () => {
  it("private_semantic 各 sample で shouldGroundLabel が必ず false", () => {
    const privateSamples = [
      "自宅",
      "うち",
      "家",
      "実家",
      "会社",
      "職場",
      "オフィス",
      "学校",
      "大学",
      "事務所",
      "友達の家",
      "彼の家",
      "彼女のうち",
      "親の家",
      "兄のところ",
    ];
    for (const label of privateSamples) {
      const classification = classifyLabel(label);
      expect(classification).toBe("private_semantic");
      // 上層 (= B-3b' wiring) で本関数が false を返すと grounding 起動しない
      expect(shouldGroundLabel(classification)).toBe(false);
    }
  });

  it("ambiguous_or_demonstrative も grounding 起動しない", () => {
    const ambiguousSamples = ["あそこ", "そこ", "その辺", "いつもの", "どこか"];
    for (const label of ambiguousSamples) {
      const classification = classifyLabel(label);
      expect(classification).toBe("ambiguous_or_demonstrative");
      expect(shouldGroundLabel(classification)).toBe(false);
    }
  });

  it("generic_category も grounding 起動しない (= anchor/chain 待ち)", () => {
    const genericSamples = ["ホテル", "カフェ", "コンビニ"];
    for (const label of genericSamples) {
      const classification = classifyLabel(label);
      expect(classification).toBe("generic_category");
      expect(shouldGroundLabel(classification)).toBe(false);
    }
  });

  it("public_poi_proper_noun のみ grounding 起動可", () => {
    const publicSamples = ["東京駅", "サドヤ", "渋谷駅"];
    for (const label of publicSamples) {
      const classification = classifyLabel(label);
      expect(classification).toBe("public_poi_proper_noun");
      expect(shouldGroundLabel(classification)).toBe(true);
    }
  });
});
