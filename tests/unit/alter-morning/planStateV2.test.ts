/**
 * PlanState v2 — 決定論的コンポーネントのテスト
 *
 * LLM 呼び出しは不要。PlanState 正規化、applyDelta、confirm message、
 * セグメントID解決のテスト。
 */

import { describe, test, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  type PlanState,
  type PlanDelta,
  type LLMExtractResult,
  resetSegmentCounter,
} from "@/lib/alter-morning/planState";
import { preloadVocabulary } from "@/lib/alter-morning/intentParser";

// server-only をモック（llmPlanExtractor / llmDeltaParser が runAI 経由で依存）
vi.mock("server-only", () => ({}));

// モック後に import
let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;
let buildPlanConfirmMessage: typeof import("@/lib/alter-morning/llmPlanExtractor").buildPlanConfirmMessage;
let buildDeltaConfirmMessage: typeof import("@/lib/alter-morning/llmPlanExtractor").buildDeltaConfirmMessage;
let planStateToPlanItems: typeof import("@/lib/alter-morning/llmPlanExtractor").planStateToPlanItems;
let resolveTargetDate: typeof import("@/lib/alter-morning/llmPlanExtractor").resolveTargetDate;
let resolveSegmentIdFromHint: typeof import("@/lib/alter-morning/llmDeltaParser").resolveSegmentIdFromHint;
let applyDelta: typeof import("@/lib/alter-morning/llmDeltaParser").applyDelta;

beforeAll(async () => {
  await preloadVocabulary();

  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
  buildPlanConfirmMessage = ext.buildPlanConfirmMessage;
  buildDeltaConfirmMessage = ext.buildDeltaConfirmMessage;
  planStateToPlanItems = ext.planStateToPlanItems;
  resolveTargetDate = ext.resolveTargetDate;

  const delta = await import("@/lib/alter-morning/llmDeltaParser");
  resolveSegmentIdFromHint = delta.resolveSegmentIdFromHint;
  applyDelta = delta.applyDelta;
});

beforeEach(() => {
  resetSegmentCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveTargetDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveTargetDate", () => {
  test("today → 今日の日付", () => {
    const { absoluteDate, label } = resolveTargetDate("today");
    expect(label).toBe("今日");
    expect(absoluteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("tomorrow → 明日の日付", () => {
    const { absoluteDate, label } = resolveTargetDate("tomorrow");
    expect(label).toBe("明日");
    // 明日は今日+1
    const today = new Date();
    today.setDate(today.getDate() + 1);
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(absoluteDate).toBe(expected);
  });

  test("day_after_tomorrow → 明後日", () => {
    const { label } = resolveTargetDate("day_after_tomorrow");
    expect(label).toBe("明後日");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizeLLMOutput — CEO シナリオ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeLLMOutput — CEO scenario Turn 1", () => {
  const ceoInput: LLMExtractResult = {
    targetDate: "tomorrow",
    segments: [
      { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
      { order: 2, timeHint: "noon", activity: "食事", place: "近くのレストラン", companions: [] },
      { order: 3, timeHint: "afternoon", activity: "仕事の打ち合わせ", place: null, companions: ["A君"] },
    ],
    endTime: "18:00",
    endAction: "帰宅",
    transport: null,
    goOut: true,
  };

  test("targetDate が 明日 の絶対日付に変換される", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.targetDateLabel).toBe("明日");
    expect(state.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("segments が3つ生成される", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.segments).toHaveLength(3);
  });

  test("マック が マクドナルド に正規化される", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.segments[0].placeCanonical).toBe("マクドナルド");
  });

  test("食事 の活動カテゴリが正規化される", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.segments[1].activityCanonical).toBe("食事");
  });

  test("A君 が companions に入る", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.segments[2].companions).toEqual(["A君"]);
  });

  test("endTime が 18:00", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.endTime).toBe("18:00");
  });

  test("endAction が 帰宅", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.endAction).toBe("帰宅");
  });

  test("transport 未指定 → missingFields に transport", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.missingFields).toContain("transport");
  });

  test("startTime 未指定 → missingFields に departureTime", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.missingFields).toContain("departureTime");
  });

  test("打ち合わせ place なし → missingFields に segmentPlace", () => {
    const state = normalizeLLMOutput(ceoInput);
    const placeField = state.missingFields.find(f => f.startsWith("segmentPlace:"));
    expect(placeField).toBeDefined();
    expect(placeField).toContain("打ち合わせ");
  });

  test("startTime あり → departureTime は missing にならない", () => {
    const state = normalizeLLMOutput({
      ...ceoInput,
      segments: [
        { order: 1, timeHint: "morning", startTime: "09:00", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "レストラン", companions: [] },
      ],
    });
    expect(state.missingFields).not.toContain("departureTime");
  });

  test("全 segment に場所あり → segmentPlace は missing にならない", () => {
    const state = normalizeLLMOutput({
      ...ceoInput,
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "afternoon", activity: "打ち合わせ", place: "A社", companions: ["A君"] },
      ],
    });
    expect(state.missingFields.some(f => f.startsWith("segmentPlace:"))).toBe(false);
  });

  test("各セグメントに安定IDが付与される", () => {
    const state = normalizeLLMOutput(ceoInput);
    expect(state.segments[0].id).toMatch(/^seg_/);
    expect(state.segments[1].id).toMatch(/^seg_/);
    expect(state.segments[2].id).toMatch(/^seg_/);
    // ID が全て異なる
    const ids = new Set(state.segments.map(s => s.id));
    expect(ids.size).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildPlanConfirmMessage — Turn 1 全体要約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPlanConfirmMessage — Turn 1", () => {
  test("CEO シナリオの確認メッセージが正しく生成される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "近くのレストラン", companions: [] },
        { order: 3, timeHint: "afternoon", activity: "仕事の打ち合わせ", place: null, companions: ["A君"] },
      ],
      endTime: "18:00",
      endAction: "帰宅",
      transport: null,
    });

    const msg = buildPlanConfirmMessage(state);

    // 了解で始まる
    expect(msg).toMatch(/^了解。/);
    // 明日 が含まれる（今日ではない！）
    expect(msg).toContain("明日");
    // マクドナルド（正規化後）が含まれる
    expect(msg).toContain("マクドナルド");
    // 食事 が含まれる
    expect(msg).toContain("食事");
    // A君 が含まれる
    expect(msg).toContain("A君");
    // 18:00 終了 が含まれる
    expect(msg).toContain("18:00");
    // CEO方針 2026-04-17 Block 1: 1ターン1質問。
    // 優先順位: segmentTime(食事系) > departureTime > segmentPlace(食事系) > transport。
    // このシナリオでは timeHint はあるが explicit segmentTime は無いので、
    // departureTime が最優先で聞かれる。
    expect(msg).toContain("何時頃から動き出す");
    // 他の質問は同じターンでは聞かない
    expect(msg).not.toContain("移動手段");
    expect(msg).not.toContain("いくつか確認させて");
    // 「違う」「通勤」等のゴミが混入しない
    expect(msg).not.toContain("違う");
    expect(msg).not.toContain("通勤");
  });

  test("時間が揃った後は transport が単独で聞かれる (1ターン1質問)", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, startTime: "09:00", activity: "仕事", place: "マクドナルド", companions: [] },
      ],
      endTime: "18:00",
      endAction: "帰宅",
      transport: null,
    });

    const msg = buildPlanConfirmMessage(state);

    // 時間は埋まっているので transport が最優先で聞かれる
    expect(msg).toContain("移動手段");
    // departureTime/segmentTime は聞かない
    expect(msg).not.toContain("何時頃から動き出す");
    expect(msg).not.toContain("いくつか確認させて");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveSegmentIdFromHint — セグメントID解決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveSegmentIdFromHint", () => {
  function makeCEOState(): PlanState {
    return normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "近くのレストラン", companions: [] },
        { order: 3, timeHint: "afternoon", activity: "仕事の打ち合わせ", place: null, companions: ["A君"] },
      ],
      endTime: "18:00",
      endAction: "帰宅",
      transport: null,
    });
  }

  test("ランチ → noon セグメント（食事）を解決", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("ランチ", state);
    expect(id).toBe(state.segments[1].id);
  });

  test("食事 → 完全一致で解決", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("食事", state);
    expect(id).toBe(state.segments[1].id);
  });

  test("午後の打ち合わせ → afternoon セグメントを解決", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("午後の打ち合わせ", state);
    expect(id).toBe(state.segments[2].id);
  });

  test("朝の仕事 → morning セグメントを解決", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("朝の仕事", state);
    expect(id).toBe(state.segments[0].id);
  });

  test("マクドナルド → place 一致で解決", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("マクドナルド", state);
    expect(id).toBe(state.segments[0].id);
  });

  test("存在しないヒント → null", () => {
    const state = makeCEOState();
    const id = resolveSegmentIdFromHint("映画", state);
    expect(id).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━��━━━━━━━━━━━━━━
// applyDelta — 差分適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyDelta — CEO scenario Turn 2", () => {
  function makeCEOState(): PlanState {
    return normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "近くのレストラン", companions: [] },
        { order: 3, timeHint: "afternoon", activity: "仕事の打ち合わせ", place: null, companions: ["A君"] },
      ],
      endTime: "18:00",
      endAction: "帰宅",
      transport: null,
    });
  }

  test("ランチの場所を変更 + transport を設定", () => {
    const state = makeCEOState();
    const lunchSegId = state.segments[1].id;

    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        { type: "replace", segmentId: lunchSegId, field: "place", newValue: "別のお店" },
        { type: "set", segmentId: null, field: "transport", newValue: "car" },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // 場所が変更された
    expect(updated.segments[1].place).toBe("別のお店");
    expect(updated.segments[1].placeCanonical).toBe("別のお店"); // placeTable に無い → 生テキスト

    // transport が設定された
    expect(updated.transport).toBe("car");

    // 他のセグメントは変わっていない
    expect(updated.segments[0].placeCanonical).toBe("マクドナルド");
    expect(updated.segments[2].companions).toEqual(["A君"]);

    // missingFields から transport が消える
    expect(updated.missingFields).not.toContain("transport");
  });

  test("セグメント削除", () => {
    const state = makeCEOState();
    const meetingSegId = state.segments[2].id;

    const delta: PlanDelta = {
      turnType: "deletion",
      changes: [
        { type: "remove_segment", segmentId: meetingSegId, field: "segment" },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.segments).toHaveLength(2);
    expect(updated.segments.find(s => s.id === meetingSegId)).toBeUndefined();
  });

  test("セグメント追加", () => {
    const state = makeCEOState();

    const delta: PlanDelta = {
      turnType: "addition",
      changes: [
        {
          type: "add_segment",
          segmentId: null,
          field: "segment",
          newSegment: {
            order: 4,
            timeHint: "evening",
            activity: "買い物",
            place: "スーパー",
            companions: [],
          },
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.segments).toHaveLength(4);
    expect(updated.segments[3].activity).toBe("買い物");
    expect(updated.segments[3].timeHint).toBe("evening");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDeltaConfirmMessage — Turn 2+ 差分メッセージ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDeltaConfirmMessage", () => {
  test("場所変更 + transport 設定 → 2つの変更を1文に", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "別のお店", companions: [] },
      ],
      endTime: "18:00",
      transport: "car",
    });

    const delta: PlanDelta = {
      turnType: "correction",
      changes: [
        { type: "replace", segmentId: state.segments[1].id, field: "place", newValue: "別のお店" },
        { type: "set", segmentId: null, field: "transport", newValue: "car" },
      ],
      confirmSummary: "",
    };

    const msg = buildDeltaConfirmMessage(state, delta);

    expect(msg).toMatch(/^了解。/);
    expect(msg).toContain("食事");
    expect(msg).toContain("場所");
    expect(msg).toContain("車");
    // 全文読み上げ（Turn 1 形式）ではなく、差分のみ
    expect(msg).not.toContain("マクドナルド");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// planStateToPlanItems — UI 互換レイヤー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("planStateToPlanItems", () => {
  test("PlanState → PlanItem[] 変換", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, timeHint: "morning", activity: "仕事", place: "マック", companions: [] },
        { order: 2, timeHint: "noon", activity: "食事", place: "レストラン", companions: [] },
      ],
      endTime: "18:00",
      transport: null,
    });

    const items = planStateToPlanItems(state);
    expect(items).toHaveLength(2);
    expect(items[0].what).toBe("仕事");
    expect(items[0].text).toContain("マクドナルド");
    expect(items[1].what).toBe("食事");
  });

  test("companions → withWhom に変換される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ディナー", place: "レストラン", companions: ["Aさん"] },
        { order: 2, activity: "打ち合わせ", place: "カフェ", companions: ["田中さん", "佐藤さん"] },
      ],
      transport: "car",
    });

    const items = planStateToPlanItems(state);
    expect(items[0].withWhom).toBe("Aさん");
    expect(items[1].withWhom).toBe("田中さん、佐藤さん");
  });

  test("companions 空配列 → withWhom は undefined", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        { order: 1, activity: "仕事", place: "マック", companions: [] },
      ],
      transport: "car",
    });

    const items = planStateToPlanItems(state);
    expect(items[0].withWhom).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyDelta — セグメント追加時の既存セグメント保全
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyDelta — segment preservation on add", () => {
  const baseState: PlanState = {
    targetDate: "2026-04-16",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments: [
      {
        id: "seg_1", order: 1, activity: "仕事",
        activityCanonical: "仕事", companions: [],
        status: "confirmed", timeHint: "morning",
        startTime: "09:00", estimatedDurationMin: 120,
      },
      {
        id: "seg_2", order: 2, activity: "ランチ",
        activityCanonical: "ランチ", companions: [],
        status: "confirmed", timeHint: "noon",
        place: "マクドナルド", placeCanonical: "マクドナルド",
        estimatedDurationMin: 60,
      },
      {
        id: "seg_3", order: 3, activity: "打ち合わせ",
        activityCanonical: "打ち合わせ", companions: ["Aさん"],
        status: "confirmed", timeHint: "afternoon",
        startTime: "14:00", estimatedDurationMin: 60,
      },
    ],
    transport: "car",
    status: "collecting",
    missingFields: [],
  };

  test("add_segment で既存の3セグメントが保持される", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 4,
          activity: "商談",
          companions: ["Bさん"],
          timeHint: "afternoon",
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    // 既存の3つ + 新しい1つ = 4つ
    expect(result.segments).toHaveLength(4);
    // 既存セグメントが全て存在する
    expect(result.segments.find(s => s.id === "seg_1")).toBeTruthy();
    expect(result.segments.find(s => s.id === "seg_2")).toBeTruthy();
    expect(result.segments.find(s => s.id === "seg_3")).toBeTruthy();
    // Aさんの打ち合わせが消えていない
    const meeting = result.segments.find(s => s.id === "seg_3");
    expect(meeting!.activity).toBe("打ち合わせ");
    expect(meeting!.companions).toEqual(["Aさん"]);
  });

  test("add_segment の companions が新セグメントのみに適用される（コンパニオン混同防止）", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 4,
          activity: "商談",
          companions: ["Bさん"],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    // 新しいセグメント（商談）にはBさんのみ
    const newSeg = result.segments.find(s => s.activity === "商談");
    expect(newSeg).toBeTruthy();
    expect(newSeg!.companions).toEqual(["Bさん"]);
    // 既存セグメント（打ち合わせ）のAさんは変わっていない
    const existingSeg = result.segments.find(s => s.id === "seg_3");
    expect(existingSeg!.companions).toEqual(["Aさん"]);
    // ランチには同行者なし（混入していない）
    const lunch = result.segments.find(s => s.id === "seg_2");
    expect(lunch!.companions).toEqual([]);
  });

  test("add_segment の order 正規化（既存の order と衝突しても安定）", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2, // ランチと同じ order
          activity: "買い物",
          companions: [],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    expect(result.segments).toHaveLength(4);
    // order が 1-based 連番に正規化されている
    const orders = result.segments.map(s => s.order);
    expect(orders).toEqual([1, 2, 3, 4]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyDelta — 時間敏感アクティビティの missing field 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyDelta — 5W1H missing field detection", () => {
  const baseState: PlanState = {
    targetDate: "2026-04-16",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments: [
      {
        id: "seg_1", order: 1, activity: "仕事",
        companions: [], status: "confirmed",
        startTime: "09:00", estimatedDurationMin: 120,
      },
    ],
    transport: "car",
    status: "collecting",
    missingFields: [],
  };

  test("商談を追加 → segmentTime が missing fields に含まれる", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2,
          activity: "商談",
          companions: ["Bさん"],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    // startTime なしの「商談」→ segmentTime:xxx:商談 が missing に
    const timeFields = result.missingFields.filter(f => f.startsWith("segmentTime:"));
    expect(timeFields).toHaveLength(1);
    expect(timeFields[0]).toContain("商談");
  });

  test("打ち合わせを追加（startTime 指定あり）→ segmentTime は missing にならない", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2,
          activity: "打ち合わせ",
          startTime: "15:00",
          companions: [],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    const timeFields = result.missingFields.filter(f => f.startsWith("segmentTime:"));
    expect(timeFields).toHaveLength(0);
  });

  test("食事を追加（場所なし）→ segmentPlace が missing に", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2,
          activity: "ランチ",
          companions: [],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    const placeFields = result.missingFields.filter(f => f.startsWith("segmentPlace:"));
    expect(placeFields).toHaveLength(1);
    expect(placeFields[0]).toContain("ランチ");
  });

  test("散歩を追加 → 時間も場所も missing にならない（非敏感アクティビティ）", () => {
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2,
          activity: "散歩",
          companions: [],
        },
      }],
      confirmSummary: "",
    };

    const result = applyDelta(baseState, delta);
    const timeFields = result.missingFields.filter(f => f.startsWith("segmentTime:"));
    const placeFields = result.missingFields.filter(f => f.startsWith("segmentPlace:"));
    expect(timeFields).toHaveLength(0);
    expect(placeFields).toHaveLength(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDeltaConfirmMessage — clarify question 統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDeltaConfirmMessage with clarify", () => {
  test("add_segment + missingFields → 確認メッセージに質問が含まれる", () => {
    const state: PlanState = {
      targetDate: "2026-04-16",
      targetDateLabel: "明日",
      timezone: "Asia/Tokyo",
      segments: [
        {
          id: "seg_1", order: 1, activity: "仕事",
          companions: [], status: "confirmed",
          startTime: "09:00", estimatedDurationMin: 120,
        },
        {
          id: "seg_2", order: 2, activity: "商談",
          companions: ["Bさん"], status: "tentative",
          estimatedDurationMin: 60,
        },
      ],
      transport: "car",
      status: "collecting",
      missingFields: ["segmentTime:seg_2:商談"],
    };

    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: { order: 2, activity: "商談", companions: ["Bさん"] },
      }],
      confirmSummary: "",
    };

    const msg = buildDeltaConfirmMessage(state, delta);
    expect(msg).toContain("商談を追加");
    expect(msg).toContain("何時からの予定");
  });
});
