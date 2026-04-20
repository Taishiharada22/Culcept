/**
 * Plan Readiness Gate — Week 1 Step 6a テスト
 *
 * CEO方針 2026-04-18:
 *   壊れた確定プランを出さない。
 *
 * テスト観点:
 *   1. 健全な state → ready: true
 *   2. placeSearchHint 残存 + resolvedLat/Lng 無し → near_anchor_not_resolved
 *   3. resolutionConfidence=low → low_confidence
 *   4. clarifyMessage が率直（「学習中」「調整中」等の曖昧文を含まない）
 *   5. isPlanReadyForPresent: missingFields も合流判定
 */
import { describe, test, expect } from "vitest";
import {
  evaluatePlanReadiness,
  isPlanReadyForPresent,
  applyPlacementStatusFromPlan,
} from "@/lib/alter-morning/planReadinessGate";
import type { PlanState, PlanSegment } from "@/lib/alter-morning/planState";

function baseState(segments: PlanSegment[], missingFields: string[] = []): PlanState {
  return {
    targetDate: "2026-04-19",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments,
    status: "draft" as any,
    missingFields,
  };
}

function seg(partial: Partial<PlanSegment>): PlanSegment {
  return {
    id: partial.id ?? "seg_1",
    order: partial.order ?? 1,
    activity: partial.activity ?? "カフェ",
    activityCanonical: partial.activityCanonical ?? "カフェ",
    activityCategory: "social_meal" as any,
    estimatedDurationMin: 60,
    anchorScore: 1,
    companions: [],
    status: "tentative",
    ...partial,
  };
}

// 率直メッセージ検証用の禁止語（CEO方針 2026-04-18）
const FORBIDDEN_PHRASES = ["学習中", "調整中", "準備中", "しばらく"];

describe("evaluatePlanReadiness", () => {
  test("健全な segment 群 → ready: true", () => {
    const state = baseState([
      seg({
        id: "seg_1",
        place: "サドヤ",
        resolvedPlaceName: "サドヤ ワイナリー",
        resolvedLat: 35.6630,
        resolvedLng: 138.5680,
        resolutionConfidence: "high",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(true);
  });

  test("placeSearchHint 残存 + resolvedLat/Lng 無し → near_anchor_not_resolved", () => {
    const state = baseState([
      seg({
        id: "seg_2",
        activity: "カフェ",
        placeSearchHint: {
          nearAnchorLabel: "サドヤ",
          searchCategory: "カフェ",
          originalQuery: "サドヤ近くのカフェ",
        },
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return; // type guard
    expect(result.reason).toBe("near_anchor_not_resolved");
    expect(result.segmentId).toBe("seg_2");
    expect(result.clarifyMessage).toBeTruthy();
    // 率直であること: 曖昧語禁止
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(result.clarifyMessage).not.toContain(phrase);
    }
    // 何を聞いているかが明示されている: area か category のどちらかに言及
    expect(result.clarifyMessage).toMatch(/サドヤ|カフェ/);
    // diagnostic にセグ ID と anchor 情報が入っている
    expect(result.diagnostic).toContain("seg_2");
    expect(result.diagnostic).toContain("サドヤ");
  });

  test("resolutionConfidence=low → low_confidence", () => {
    const state = baseState([
      seg({
        id: "seg_3",
        activity: "ディナー",
        activityCanonical: "ディナー",
        place: "叙々苑",
        resolvedPlaceName: "叙々苑 新宿店",
        resolvedLat: 35.6900,
        resolvedLng: 139.7000,
        resolutionConfidence: "low",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.reason).toBe("low_confidence");
    expect(result.segmentId).toBe("seg_3");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(result.clarifyMessage).not.toContain(phrase);
    }
    // place 名が clarify に含まれる
    expect(result.clarifyMessage).toContain("叙々苑");
  });

  test("先に出てきた違反を返す（複数違反時は 1 件だけ）", () => {
    const state = baseState([
      seg({
        id: "seg_first",
        placeSearchHint: { nearAnchorLabel: "甲府", searchCategory: "カフェ" },
      }),
      seg({
        id: "seg_second",
        order: 2,
        place: "どこか",
        resolutionConfidence: "low",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.segmentId).toBe("seg_first");
    expect(result.reason).toBe("near_anchor_not_resolved");
  });

  test("placeSearchHint + resolvedLat/Lng 両方ある → スルー（解決済みとみなす）", () => {
    // resolveNearAnchorPlaces が候補を採用して resolvedLat を立てたケース
    const state = baseState([
      seg({
        id: "seg_ok",
        placeSearchHint: { nearAnchorLabel: "サドヤ", searchCategory: "カフェ" },
        resolvedPlaceName: "ブルーボトル",
        resolvedLat: 35.6635,
        resolvedLng: 138.5685,
        resolutionConfidence: "medium",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(true);
  });
});

describe("evaluatePlanReadiness — W2-CEO-Emergency C (Rule 4: place_not_resolved)", () => {
  test("explicit place + resolvedLat 無し + !known_base → place_not_resolved", () => {
    // CEO 実機 0 点ケース: place="カフェ森の中へ" が座標解決に失敗したが、
    //   旧 gate はこれを見逃して plan_presented に進んでいた。
    const state = baseState([
      seg({
        id: "seg_cafe",
        activity: "カフェ",
        activityCanonical: "カフェ",
        place: "カフェ森の中へ",
        placeCanonical: "カフェ森の中へ",
        placeType: "exact_proper_noun",
        // resolvedLat / resolvedLng 未定義
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.reason).toBe("place_not_resolved");
    expect(result.segmentId).toBe("seg_cafe");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(result.clarifyMessage).not.toContain(phrase);
    }
    expect(result.clarifyMessage).toContain("カフェ森の中へ");
    expect(result.diagnostic).toContain("seg_cafe");
  });

  test("known_base（自宅等）は resolvedLat 無しでも通す", () => {
    const state = baseState([
      seg({
        id: "seg_home",
        activity: "帰宅",
        place: "自宅",
        placeType: "known_base",
        // resolvedLat 無しでも別経路で解決されるのでスルー
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(true);
  });

  test("placeSearchHint 経路は Rule 1 で拾うので Rule 4 は発火しない", () => {
    const state = baseState([
      seg({
        id: "seg_near",
        placeSearchHint: { nearAnchorLabel: "甲府", searchCategory: "カフェ" },
        // place は無し、placeSearchHint のみ
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.reason).toBe("near_anchor_not_resolved");
  });

  test("explicit place + resolvedLat あり → 通す", () => {
    const state = baseState([
      seg({
        id: "seg_resolved",
        place: "スタバ",
        resolvedLat: 35.66,
        resolvedLng: 138.56,
        resolutionConfidence: "high",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(true);
  });
});

describe("evaluatePlanReadiness — W2-1 window_overflow", () => {
  test("placementStatus=window_overflow → ready=false + window_overflow reason", () => {
    const state = baseState([
      seg({
        id: "seg_lunch",
        activity: "ランチ",
        activityCanonical: "ランチ",
        place: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 138.56,
        resolutionConfidence: "high",
        placementStatus: "window_overflow",
        timeConstraint: { type: "window_noon" } as any,
      }),
      seg({
        id: "seg_work",
        order: 2,
        activity: "仕事",
        activityCanonical: "仕事",
        startTime: "12:00",
        timeConstraint: { type: "fixed_start", fixedTime: "12:00" } as any,
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.reason).toBe("window_overflow");
    expect(result.segmentId).toBe("seg_lunch");
    // 曖昧語禁止
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(result.clarifyMessage).not.toContain(phrase);
    }
    // 対象セグメント名が含まれる
    expect(result.clarifyMessage).toContain("ランチ");
    // 時間帯ラベルが含まれる
    expect(result.clarifyMessage).toContain("昼");
  });

  test("placementStatus 未設定なら window_overflow 判定は走らない", () => {
    const state = baseState([
      seg({
        id: "seg_lunch",
        place: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 138.56,
        resolutionConfidence: "high",
      }),
    ]);
    const result = evaluatePlanReadiness(state);
    expect(result.ready).toBe(true);
  });
});

describe("applyPlacementStatusFromPlan — W2-1", () => {
  test("PlanItem.cannotFitWindow=true → 対応セグメントに placementStatus=window_overflow", () => {
    const state = baseState([
      seg({ id: "seg_1", place: "X", resolvedLat: 1, resolvedLng: 1, resolutionConfidence: "high" }),
      seg({ id: "seg_2", order: 2, place: "Y", resolvedLat: 1, resolvedLng: 1, resolutionConfidence: "high" }),
    ]);
    const plan = {
      items: [
        { id: "seg_1", kind: "todo", cannotFitWindow: true } as any,
        { id: "seg_2", kind: "todo" } as any,
      ],
    };
    const next = applyPlacementStatusFromPlan(state, plan);
    expect(next.segments[0].placementStatus).toBe("window_overflow");
    expect(next.segments[1].placementStatus).toBeUndefined();
    // 元の state は不変
    expect(state.segments[0].placementStatus).toBeUndefined();
  });

  test("以前 window_overflow だったセグメントが今回 fit → reset", () => {
    const state = baseState([
      seg({
        id: "seg_1",
        place: "X",
        resolvedLat: 1,
        resolvedLng: 1,
        resolutionConfidence: "high",
        placementStatus: "window_overflow",
      }),
    ]);
    const plan = { items: [{ id: "seg_1", kind: "todo" } as any] }; // cannotFitWindow なし
    const next = applyPlacementStatusFromPlan(state, plan);
    expect(next.segments[0].placementStatus).toBeUndefined();
  });
});

describe("isPlanReadyForPresent", () => {
  test("missingFields あり → false（gate 評価せずに弾く）", () => {
    const state = baseState(
      [seg({ id: "seg_1", resolvedLat: 1, resolvedLng: 1, resolutionConfidence: "high" })],
      ["segmentTime:seg_1"],
    );
    expect(isPlanReadyForPresent(state)).toBe(false);
  });

  test("missingFields 空 + gate ready → true", () => {
    const state = baseState([
      seg({
        id: "seg_1",
        place: "サドヤ",
        resolvedLat: 35.66,
        resolvedLng: 138.56,
        resolutionConfidence: "high",
      }),
    ]);
    expect(isPlanReadyForPresent(state)).toBe(true);
  });

  test("missingFields 空 + gate 失敗 → false", () => {
    const state = baseState([
      seg({
        id: "seg_1",
        placeSearchHint: { nearAnchorLabel: "サドヤ", searchCategory: "カフェ" },
      }),
    ]);
    expect(isPlanReadyForPresent(state)).toBe(false);
  });
});
