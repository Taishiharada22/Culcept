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
