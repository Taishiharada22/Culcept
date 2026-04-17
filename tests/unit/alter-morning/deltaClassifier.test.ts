/**
 * Bug A (CEO方針 2026-04-18): Deterministic Delta Pre-Classifier
 *
 * 実機ログ再現 + 主要分類の挙動確認。
 *
 *   入力:  "カフェ森の中へだと甲府から相当遠くなるので、甲府にしてください。要は9時から家を出ます"
 *   期待: place_replacement（カフェ seg → 甲府）+ departure_time（09:00）
 *         items 爆発（3→7）が起きないこと
 *
 * classifyDeltaDeterministic は短絡成立時のみ PlanDelta を返す。
 * null を返した場合は LLM フォールバックに回る（短絡せず）。
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

describe("Bug A: classifyDeltaDeterministic", () => {
  describe("place_replacement", () => {
    test("CEO ログ再現: カフェ seg を甲府にreplace + departureTime 09:00 を同時検出", () => {
      const state = mkState([
        mkSeg({ id: "s1", order: 1, activity: "仕事", place: "マック", placeCanonical: "マクドナルド" }),
        mkSeg({ id: "s2", order: 2, activity: "ランチ", place: "サドヤ", companions: ["仙洞田さん"] }),
        mkSeg({ id: "s3", order: 3, activity: "ミーティング", place: "カフェ", companions: ["ナウさん"] }),
      ]);

      const result = classifyDeltaDeterministic(
        "カフェ森の中へだと甲府から相当遠くなるので、甲府にしてください。要は9時から家を出ます",
        state,
      );

      expect(result).not.toBeNull();
      expect(result!.delta.turnType).toBe("correction");

      // place_replacement: カフェ seg の place → 甲府
      const placeChange = result!.delta.changes.find((c) => c.field === "place");
      expect(placeChange).toBeDefined();
      expect(placeChange!.type).toBe("replace");
      expect(placeChange!.segmentId).toBe("s3"); // カフェ seg
      expect(placeChange!.newValue).toBe("甲府");

      // departureTime: 09:00
      const depChange = result!.delta.changes.find((c) => c.field === "departureTime");
      expect(depChange).toBeDefined();
      expect(depChange!.type).toBe("set");
      expect(depChange!.segmentId).toBeNull();
      expect(depChange!.newValue).toBe("09:00");

      // add_segment が混入していないこと（items 爆発防止）
      const addSeg = result!.delta.changes.find((c) => c.type === "add_segment");
      expect(addSeg).toBeUndefined();
    });

    test("文脈なし単独の「甲府にしてください」→ null（LLM フォールバック）", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "仕事", place: "マック" }),
      ]);

      // 発話中に既存 seg の place/activity トークンが一切含まれないため null
      const result = classifyDeltaDeterministic("甲府にしてください", state);
      expect(result).toBeNull();
    });

    test("「スタバに変更」→ 対象 seg が place=スタバ のものに resolve される", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "朝食", place: "マック" }),
        mkSeg({ id: "s2", activity: "仕事", place: "スタバ" }),
      ]);
      // "スタバに変更" は s2 を参照しつつ "スタバ" にという矛盾発話になるので、
      // excludePlace で新値自身を除外 → カフェ系の別 seg を探そうとするが
      // 該当なし → null（ユーザーが place を変えたいなら seg を指定すべき）
      const result = classifyDeltaDeterministic("スタバに変更", state);
      expect(result).toBeNull();
    });

    test("「甲府にしてください」+ 既存 seg.activity に「ミーティング」含む → seg を resolve", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "朝食", place: "マック" }),
        mkSeg({ id: "s2", activity: "ミーティング", place: "カフェ" }),
      ]);
      const result = classifyDeltaDeterministic(
        "ミーティングは甲府にしてください",
        state,
      );
      expect(result).not.toBeNull();
      const placeChange = result!.delta.changes.find((c) => c.field === "place");
      expect(placeChange!.segmentId).toBe("s2");
      expect(placeChange!.newValue).toBe("甲府");
    });

    test("人名「田中さんにしてください」→ place 誤検出しない（null）", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "ミーティング", place: "カフェ" }),
      ]);
      const result = classifyDeltaDeterministic(
        "ミーティングは田中さんにしてください",
        state,
      );
      // 「田中さん」は敬称で終わる → place 誤抽出を回避
      expect(result).toBeNull();
    });

    test("時刻「9時にしてください」→ place 誤検出しない", () => {
      const state = mkState([
        mkSeg({ id: "s1", activity: "ミーティング", place: "カフェ" }),
      ]);
      // 数字を含むトークンは PLACE_REPLACEMENT_RE でマッチしない
      const result = classifyDeltaDeterministic(
        "ミーティングは9時にしてください",
        state,
      );
      expect(result).toBeNull();
    });
  });

  describe("departure_time", () => {
    test("「9時から家を出ます」→ departureTime=09:00", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("9時から家を出ます", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes).toHaveLength(1);
      expect(result!.delta.changes[0]).toMatchObject({
        type: "set",
        field: "departureTime",
        segmentId: null,
        newValue: "09:00",
      });
    });

    test("「8時30分に出発」→ departureTime=08:30", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("8時30分に出発します", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("08:30");
    });

    test("「9時出発」→ departureTime=09:00", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事" })]);
      const result = classifyDeltaDeterministic("9時出発", state);
      expect(result).not.toBeNull();
      expect(result!.delta.changes[0].newValue).toBe("09:00");
    });
  });

  describe("transport_update", () => {
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
  });

  describe("compound signals (短絡禁止)", () => {
    test("「ジムも追加」→ null（LLM にゆだねる）", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "仕事", place: "マック" })]);
      const result = classifyDeltaDeterministic(
        "ジムも追加してください",
        state,
      );
      expect(result).toBeNull();
    });

    test("「ランチをやめる」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "ランチ", place: "サドヤ" })]);
      const result = classifyDeltaDeterministic("ランチをやめる", state);
      expect(result).toBeNull();
    });

    test("「ランチはキャンセル」→ null", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "ランチ", place: "サドヤ" })]);
      const result = classifyDeltaDeterministic("ランチはキャンセル", state);
      expect(result).toBeNull();
    });

    test("複合: 「甲府にしてください、あと新しくジム追加」→ null（LLM へ）", () => {
      const state = mkState([mkSeg({ id: "s1", activity: "ミーティング", place: "カフェ" })]);
      const result = classifyDeltaDeterministic(
        "カフェは甲府にしてください、あと新しくジム追加",
        state,
      );
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
