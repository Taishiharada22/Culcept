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

  test("打ち合わせ place なし → missingFields に segmentPlace", () => {
    const state = normalizeLLMOutput(ceoInput);
    const placeField = state.missingFields.find(f => f.startsWith("segmentPlace:"));
    expect(placeField).toBeDefined();
    expect(placeField).toContain("打ち合わせ");
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
    // 移動手段の質問が含まれる
    expect(msg).toContain("移動手段");
    // 「違う」「ランチ」「通勤」等のゴミが混入しない
    expect(msg).not.toContain("違う");
    expect(msg).not.toContain("通勤");
  });

  test("CEO シナリオ — 開始時刻 + 場所の質問も含まれる", () => {
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

    // 移動手段の質問
    expect(msg).toContain("移動手段");
    // 打ち合わせ場所の質問（activityCanonical = "打ち合わせ"）
    expect(msg).toContain("打ち合わせ");
    expect(msg).toMatch(/どこ/);
    // 複数質問時のまとめ表現
    expect(msg).toContain("確認させて");
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
});
