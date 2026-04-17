/**
 * Bug A (CEO方針 2026-04-18 改訂): applyDelta の placeSearchHint 分岐
 *
 * 狙い:
 *   LLM が field=placeSearchHint を返してきた時、PlanSegment 上で
 *   - seg.placeSearchHint が適切にセットされる
 *   - 旧 point 解決（place / placeCanonical / resolvedLat 等）がクリアされる
 *   - searchCategory 未指定時に既存 place を流用する
 *
 * 背景:
 *   実機ログで「カフェを甲府にしてください」→ place="甲府" となり、placeResolver が
 *   甲府市役所の 1 点に解決 → 「現在地から取ってる」状態が続いた。
 *   area を point として扱わないように placeSearchHint フィールドを正規ルートにする。
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyDelta } from "@/lib/alter-morning/llmDeltaParser";
import type { PlanState, PlanSegment, PlanDelta } from "@/lib/alter-morning/planState";

function mkSeg(partial: Partial<PlanSegment> & { id: string; activity: string }): PlanSegment {
  return {
    order: 1,
    companions: [],
    status: "tentative",
    ...partial,
  };
}

function mkState(segments: PlanSegment[]): PlanState {
  return {
    targetDate: "2099-01-01",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments,
    status: "clarifying",
    missingFields: [],
  };
}

describe("Bug A 改訂: applyDelta / field=placeSearchHint", () => {
  test("「カフェを甲府にして」— 既存 place を searchCategory に流用", () => {
    const state = mkState([
      mkSeg({
        id: "s1",
        activity: "ミーティング",
        place: "カフェ",
        placeCanonical: "カフェ",
        resolvedLat: 35.6,
        resolvedLng: 138.5,
        resolvedPlaceName: "カフェ森の中",
      }),
    ]);
    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        {
          type: "replace",
          segmentId: "s1",
          field: "placeSearchHint",
          newValue: { nearAnchorLabel: "甲府" }, // searchCategory 未指定
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    const seg = next.segments[0];
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("甲府");
    expect(seg.placeSearchHint?.searchCategory).toBe("カフェ"); // 既存 place から補完
    expect(seg.place).toBeUndefined();
    expect(seg.placeCanonical).toBeUndefined();
    expect(seg.resolvedLat).toBeUndefined();
    expect(seg.resolvedLng).toBeUndefined();
    expect(seg.resolvedPlaceName).toBeUndefined();
  });

  test("「甲府のカフェ」— nearAnchorLabel/searchCategory 両方指定", () => {
    const state = mkState([
      mkSeg({ id: "s1", activity: "ミーティング", place: "マック" }),
    ]);
    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        {
          type: "replace",
          segmentId: "s1",
          field: "placeSearchHint",
          newValue: { nearAnchorLabel: "甲府", searchCategory: "カフェ" },
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    const seg = next.segments[0];
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("甲府");
    expect(seg.placeSearchHint?.searchCategory).toBe("カフェ");
    expect(seg.place).toBeUndefined();
  });

  test("プレーン文字列「甲府」も許容（nearAnchorLabel として扱う）", () => {
    const state = mkState([
      mkSeg({ id: "s1", activity: "ランチ", place: "レストラン" }),
    ]);
    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        {
          type: "replace",
          segmentId: "s1",
          field: "placeSearchHint",
          newValue: "甲府",
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    const seg = next.segments[0];
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("甲府");
    expect(seg.placeSearchHint?.searchCategory).toBe("レストラン");
    expect(seg.place).toBeUndefined();
  });

  test("nearAnchorLabel 欠落時は何もしない（安全弁）", () => {
    const state = mkState([
      mkSeg({ id: "s1", activity: "仕事", place: "オフィス" }),
    ]);
    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        {
          type: "replace",
          segmentId: "s1",
          field: "placeSearchHint",
          newValue: { searchCategory: "カフェ" }, // nearAnchorLabel 欠落
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    const seg = next.segments[0];
    // 既存 place は温存される（壊さない）
    expect(seg.place).toBe("オフィス");
    expect(seg.placeSearchHint).toBeUndefined();
  });

  test("field=place で object を受け取っても placeSearchHint に回す（保険）", () => {
    const state = mkState([mkSeg({ id: "s1", activity: "ランチ", place: "カフェ" })]);
    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        {
          type: "replace",
          segmentId: "s1",
          field: "place", // LLM がうっかり place に object を投げたケース
          newValue: { nearAnchorLabel: "甲府", searchCategory: "カフェ" },
        },
      ],
      confirmSummary: "",
    };
    const next = applyDelta(state, delta);
    const seg = next.segments[0];
    expect(seg.placeSearchHint?.nearAnchorLabel).toBe("甲府");
    expect(seg.place).toBeUndefined(); // 旧 place はクリア
  });
});
