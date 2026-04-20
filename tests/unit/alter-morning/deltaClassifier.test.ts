/**
 * Bug A (CEO方針 2026-04-18 改訂): Deterministic Delta Pre-Classifier — 短絡範囲縮小版
 *
 * 改訂経緯:
 *   v1 は place_replacement / departure_time を短絡していたが、実機検証で
 *   「自然言語の読み取り 0 点」と判定された。area / point / compound の区別は
 *   決定論 regex では不可能。よって短絡対象は transport_update のみに縮小。
 *
 * 本テストは以下を検証:
 *   ✓ transport 単独発話（「車」等）は短絡する
 *   ✗ place_replacement / departure_time は短絡せず null（→ LLM へフォールバック）
 *   ✗ 複合シグナル（追加/やめる）は null
 */

import { describe, test, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { classifyDeltaDeterministic } from "@/lib/alter-morning/deltaClassifier";
import type { PlanState, PlanSegment } from "@/lib/alter-morning/planState";

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

describe("Bug A 改訂: classifyDeltaDeterministic", () => {
  describe("transport_update のみ短絡（唯一の安全なパターン）", () => {
    test("単独発話「車」→ transport=car", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("車", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0]).toMatchObject({
        type: "set",
        field: "transport",
        segmentId: null,
        newValue: "car",
      });
    });

    test("単独発話「徒歩」→ transport=walk", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("徒歩", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("walk");
    });

    test("単独発話「電車。」→ transport=train（末尾句点許容）", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("電車。", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("train");
    });

    test("明示宣言「移動は車」→ transport=car", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("移動は車", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("car");
    });

    test("「車で行きます」→ transport=car", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("車で行きます", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("car");
    });
  });

  describe("place_replacement は LLM に回す（短絡しない）", () => {
    test("実機ログ再現「カフェ〜甲府にしてください。9時から家を出ます」→ null（全て LLM 処理）", () => {
      const state = mkState([
        mkSeg({ id: "s1", order: 1, activity: "仕事", place: "マック" }),
        mkSeg({ id: "s2", order: 2, activity: "ランチ", place: "サドヤ" }),
        mkSeg({ id: "s3", order: 3, activity: "ミーティング", place: "カフェ" }),
      ]);
      const result = classifyDeltaDeterministic(
        "カフェ森の中へだと甲府から相当遠くなるので、甲府にしてください。要は9時から家を出ます",
        state,
      );
      // 改訂版では short-circuit しない — LLM が area/point を判定する
      expect(result).toBeNull();
    });

    test("「甲府にしてください」→ null（LLM が area / point を判定）", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "ミーティング", place: "カフェ" }),
      ]);
      const result = classifyDeltaDeterministic("甲府にしてください", state);
      expect(result).toBeNull();
    });

    test("「甲府のカフェ」→ null（compound query は LLM が分解）", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "ミーティング", place: "カフェ" }),
      ]);
      const result = classifyDeltaDeterministic("甲府のカフェ", state);
      expect(result).toBeNull();
    });

    test("「スタバに変更」→ null（固有名も LLM に回す — 一貫性優先）", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "仕事", place: "マック" }),
      ]);
      const result = classifyDeltaDeterministic("スタバに変更", state);
      expect(result).toBeNull();
    });
  });

  describe("departure_time も LLM に回す（短絡しない）", () => {
    test("「9時から家を出ます」→ null（LLM が出発/開始時刻を判別）", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("9時から家を出ます", state);
      expect(result).toBeNull();
    });

    test("「8時30分に出発」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("8時30分に出発します", state);
      expect(result).toBeNull();
    });
  });

  describe("複合シグナル（追加/削除） → null", () => {
    test("「ジムも追加」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事", place: "マック" })]);
      const result = classifyDeltaDeterministic("ジムも追加してください", state);
      expect(result).toBeNull();
    });

    test("「ランチをやめる」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "ランチ", place: "サドヤ" })]);
      const result = classifyDeltaDeterministic("ランチをやめる", state);
      expect(result).toBeNull();
    });

    test("複合: 「車」+「追加」→ null（compound signal が transport より優先）", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      // "車" は単独発話にならないためそもそも transport_single にマッチしない
      const result = classifyDeltaDeterministic("車で追加", state);
      expect(result).toBeNull();
    });
  });

  describe("何もマッチしない場合", () => {
    test("通常の発話「よろしくお願いします」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("よろしくお願いします", state);
      expect(result).toBeNull();
    });

    test("空文字 → null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("", state);
      expect(result).toBeNull();
    });
  });
});
