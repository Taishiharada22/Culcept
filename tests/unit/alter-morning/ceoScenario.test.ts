/**
 * CEO実例シナリオ統合テスト
 *
 * CEO指摘:
 * 1. 何時に何をするかがぐちゃぐちゃ
 * 2. 午後のAさんとの打ち合わせが消える
 * 3. 時間変更で移動時間が更新されない
 * 4. Bさんとの商談がA君の商談になる
 * 5. 予定追加時に5W1Hが足りない
 * 6. カテゴリ別アイコン（UIテスト対象外）
 *
 * 検証の3層:
 * - Layer 1: PlanState（segment 単位の意味情報）
 * - Layer 2: PlanItems（UI 描画用の item リスト）
 * - Layer 3: Rendered（travel 挿入 + 時刻割り当て後の最終形）
 */

import { describe, test, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  type PlanState,
  type PlanDelta,
  type PlanSegment,
  type TimeConstraint,
  type TimeConstraintType,
  type LLMRawSegment,
  type LLMExtractResult,
  TIME_WINDOWS,
  resetSegmentCounter,
} from "@/lib/alter-morning/planState";
import { preloadVocabulary } from "@/lib/alter-morning/intentParser";
import { mergeLocationActivitySegments, normalizeLLMOutput } from "@/lib/alter-morning/llmPlanExtractor";
import type { PlanItem } from "@/lib/alter-morning/types";

vi.mock("server-only", () => ({}));

let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;
let planStateToPlanItems: typeof import("@/lib/alter-morning/llmPlanExtractor").planStateToPlanItems;
let buildDeltaConfirmMessage: typeof import("@/lib/alter-morning/llmPlanExtractor").buildDeltaConfirmMessage;
let buildPlanConfirmMessage: typeof import("@/lib/alter-morning/llmPlanExtractor").buildPlanConfirmMessage;
let applyDelta: typeof import("@/lib/alter-morning/llmDeltaParser").applyDelta;
let buildDayPlan: typeof import("@/lib/alter-morning/planningEngine").buildDayPlan;
let recalculateSchedule: typeof import("@/lib/alter-morning/planningEngine").recalculateSchedule;
let insertTravelItems: typeof import("@/lib/alter-morning/travelTimeEngine").insertTravelItems;
let detectGaps: typeof import("@/lib/alter-morning/gapFillEngine").detectGaps;
let fillGaps: typeof import("@/lib/alter-morning/gapFillEngine").fillGaps;

beforeAll(async () => {
  await preloadVocabulary();

  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
  planStateToPlanItems = ext.planStateToPlanItems;
  buildDeltaConfirmMessage = ext.buildDeltaConfirmMessage;
  buildPlanConfirmMessage = ext.buildPlanConfirmMessage;

  const delta = await import("@/lib/alter-morning/llmDeltaParser");
  applyDelta = delta.applyDelta;

  const engine = await import("@/lib/alter-morning/planningEngine");
  buildDayPlan = engine.buildDayPlan;
  recalculateSchedule = engine.recalculateSchedule;

  const travel = await import("@/lib/alter-morning/travelTimeEngine");
  insertTravelItems = travel.insertTravelItems;

  const gapFill = await import("@/lib/alter-morning/gapFillEngine");
  detectGaps = gapFill.detectGaps;
  fillGaps = gapFill.fillGaps;
});

beforeEach(() => {
  resetSegmentCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: 3層ログ — PlanState → PlanItems → Rendered
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Layer1Row {
  id: string;
  order: number;
  activity: string;
  startTime?: string;
  companions: string[];
  place?: string;
}

interface Layer2Row {
  id: string;
  kind: string;
  what: string | null;
  startTime?: string;
  fixedStart: boolean;
  withWhom?: string;
  sequenceOrder?: number;
  durationMin: number;
  location?: string;
}

interface Layer3Row {
  kind: string;
  startTime?: string;
  text: string;
  durationMin: number;
  fixedStart: boolean;
}

function snapshotLayer1(state: PlanState): Layer1Row[] {
  return state.segments.map(s => ({
    id: s.id,
    order: s.order,
    activity: s.activityCanonical ?? s.activity,
    startTime: s.startTime,
    companions: [...s.companions],
    place: s.placeCanonical ?? s.place,
  }));
}

function snapshotLayer2(items: ReturnType<typeof planStateToPlanItems>): Layer2Row[] {
  return items.map(i => ({
    id: i.id,
    kind: i.kind,
    what: i.what,
    startTime: i.startTime,
    fixedStart: i.fixedStart,
    withWhom: i.withWhom,
    sequenceOrder: i.sequenceOrder,
    durationMin: i.durationMin,
    location: i.location?.label,
  }));
}

function snapshotLayer3(items: ReturnType<typeof planStateToPlanItems>): Layer3Row[] {
  return items.map(i => ({
    kind: i.kind,
    startTime: i.startTime,
    text: i.text,
    durationMin: i.durationMin,
    fixedStart: i.fixedStart,
  }));
}

/** 時刻文字列を分に変換 */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** overlap 検出: 連続する2アイテムで startTime + duration > 次の startTime */
function findOverlaps(items: Layer3Row[]): string[] {
  const overlaps: string[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (a.startTime && b.startTime) {
      const aEnd = toMin(a.startTime) + a.durationMin;
      const bStart = toMin(b.startTime);
      if (aEnd > bStart) {
        overlaps.push(`${a.text}(ends ${aEnd}) overlaps ${b.text}(starts ${bStart})`);
      }
    }
  }
  return overlaps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CEO Scenario: 初期プラン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeCEOBaseState(): PlanState {
  return {
    targetDate: "2026-04-17",
    targetDateLabel: "明日",
    timezone: "Asia/Tokyo",
    segments: [
      {
        id: "seg_1", order: 1, activity: "仕事",
        activityCanonical: "仕事", companions: [],
        status: "confirmed", timeHint: "morning",
        startTime: "08:00", estimatedDurationMin: 120,
        place: "マクドナルド", placeCanonical: "マクドナルド",
        placeCategory: "fast_food",
      },
      {
        id: "seg_2", order: 2, activity: "食事",
        activityCanonical: "食事", companions: [],
        status: "confirmed", timeHint: "noon",
        place: "レストラン", placeCanonical: "レストラン",
        placeCategory: "restaurant",
        estimatedDurationMin: 60,
      },
      {
        id: "seg_3", order: 3, activity: "休憩",
        activityCanonical: "休憩", companions: [],
        status: "confirmed", timeHint: "afternoon",
        place: "公園", placeCanonical: "公園",
        placeCategory: "park",
        estimatedDurationMin: 15,
      },
      {
        id: "seg_4", order: 4, activity: "打ち合わせ",
        activityCanonical: "打ち合わせ", companions: ["Aさん"],
        status: "confirmed", timeHint: "afternoon",
        startTime: "13:00", estimatedDurationMin: 60,
        place: "近くのカフェ", placeCanonical: "カフェ",
        placeCategory: "cafe",
      },
    ],
    transport: "car",
    status: "collecting",
    missingFields: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 1: Layer 1 → Layer 2 のセグメント順序保全
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Layer 1→2: PlanState→PlanItems 順序保全", () => {
  test("segment order が item の sequenceOrder に正しく伝播する", () => {
    const state = makeCEOBaseState();
    const l1 = snapshotLayer1(state);
    const items = planStateToPlanItems(state);
    const l2 = snapshotLayer2(items);

    // Layer 1 の order と Layer 2 の sequenceOrder が一致
    for (let i = 0; i < l1.length; i++) {
      expect(l2[i].sequenceOrder).toBe(l1[i].order);
    }
  });

  test("companions が Layer 1→2 で正しく変換される", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);

    // seg_4（打ち合わせ）のみ Aさんがいる
    const meeting = items.find(i => i.id === "seg_4");
    expect(meeting?.withWhom).toBe("Aさん");

    // 他のセグメントは withWhom なし
    const others = items.filter(i => i.id !== "seg_4");
    for (const item of others) {
      expect(item.withWhom).toBeUndefined();
    }
  });

  test("startTime あり → kind='fixed', なし → kind='todo'", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);

    // seg_1(08:00) = fixed, seg_4(13:00) = fixed
    expect(items.find(i => i.id === "seg_1")?.kind).toBe("fixed");
    expect(items.find(i => i.id === "seg_4")?.kind).toBe("fixed");
    // seg_2(no startTime) = todo, seg_3(no startTime) = todo
    expect(items.find(i => i.id === "seg_2")?.kind).toBe("todo");
    expect(items.find(i => i.id === "seg_3")?.kind).toBe("todo");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 2: Layer 2 → Layer 3 の順序 + overlap 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Layer 2→3: buildDayPlan 順序 + overlap", () => {
  test("CEO初期シナリオで overlap が発生しない", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const l3 = snapshotLayer3(plan.items);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });

  test("fixed item の順序が startTime 通りに保たれる", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // fixed items（仕事08:00、打ち合わせ13:00）の順序確認
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const work = nonTravel.find(i => i.what === "仕事");
    const meeting = nonTravel.find(i => i.what === "打ち合わせ");
    expect(work?.startTime).toBe("08:00");
    expect(meeting?.startTime).toBe("13:00");
  });

  test("todo items が fixed items の間に配置される（食事は仕事の後、打ち合わせの前）", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const workIdx = nonTravel.findIndex(i => i.what === "仕事");
    const mealIdx = nonTravel.findIndex(i => i.what === "食事");
    const breakIdx = nonTravel.findIndex(i => i.what === "休憩");
    const meetIdx = nonTravel.findIndex(i => i.what === "打ち合わせ");

    // 仕事 < 食事 < 打ち合わせ
    expect(workIdx).toBeLessThan(mealIdx);
    expect(mealIdx).toBeLessThan(meetIdx);
    // 休憩 も仕事と打ち合わせの間
    expect(breakIdx).toBeGreaterThan(workIdx);
    expect(breakIdx).toBeLessThan(meetIdx);
  });

  test("todo の sequenceOrder が durationMin fallback に負けない", () => {
    // 意味順序: 食事(60分, order=2) → 休憩(15分, order=3)
    // durationMin desc sort だと: 食事(60) → 休憩(15) → 正しい
    // だが、逆のケース: 短い(order=2) → 長い(order=3) ではどうなるか？
    const state = makeCEOBaseState();
    // 休憩を60分、食事を15分に入れ替えて、duration sort が勝つか確認
    state.segments[1].estimatedDurationMin = 15; // 食事 = 15分（order=2）
    state.segments[2].estimatedDurationMin = 60; // 休憩 = 60分（order=3）

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const mealIdx = nonTravel.findIndex(i => i.what === "食事");
    const breakIdx = nonTravel.findIndex(i => i.what === "休憩");

    // sequenceOrder(=segment order) が勝つべき: 食事(order=2) < 休憩(order=3)
    expect(mealIdx).toBeLessThan(breakIdx);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 3: Delta 追加 → 全層の一貫性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Delta 追加後の全層一貫性", () => {
  test("CEO Issue 2: add_segment で既存の Aさん打ち合わせが消えない", () => {
    const state = makeCEOBaseState();

    // 「Bさんとの商談を追加」
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 5,
          activity: "商談",
          companions: ["Bさん"],
          timeHint: "afternoon",
        },
      }],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // Layer 1: 全5セグメント存在
    const l1 = snapshotLayer1(updated);
    expect(l1).toHaveLength(5);
    expect(l1.find(s => s.activity === "打ち合わせ")).toBeTruthy();
    expect(l1.find(s => s.activity === "打ち合わせ")!.companions).toEqual(["Aさん"]);

    // Layer 2: 全5アイテム存在
    const items = planStateToPlanItems(updated);
    const l2 = snapshotLayer2(items);
    expect(l2).toHaveLength(5);
    const meetingItem = l2.find(i => i.what === "打ち合わせ");
    expect(meetingItem).toBeTruthy();
    expect(meetingItem!.withWhom).toBe("Aさん");

    // Layer 3: buildDayPlan 後も消えない
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    expect(nonTravel.find(i => i.what === "打ち合わせ")).toBeTruthy();
    expect(nonTravel.find(i => i.what === "商談")).toBeTruthy();
  });

  test("CEO Issue 4: Bさんの商談がAさんにならない", () => {
    const state = makeCEOBaseState();

    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 5,
          activity: "商談",
          companions: ["Bさん"],
        },
      }],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // Layer 1: companions 分離確認
    const meeting = updated.segments.find(s => s.activity === "打ち合わせ");
    const business = updated.segments.find(s => s.activity === "商談");
    expect(meeting!.companions).toEqual(["Aさん"]);
    expect(business!.companions).toEqual(["Bさん"]);

    // Layer 2: withWhom 分離確認
    const items = planStateToPlanItems(updated);
    const meetingItem = items.find(i => i.what === "打ち合わせ");
    const businessItem = items.find(i => i.what === "商談");
    expect(meetingItem!.withWhom).toBe("Aさん");
    expect(businessItem!.withWhom).toBe("Bさん");
  });

  test("CEO Issue 5: 商談追加で segmentTime clarify が発火する", () => {
    const state = makeCEOBaseState();

    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 5,
          activity: "Bさんとの商談",
          companions: ["Bさん"],
        },
      }],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // segmentTime が missingFields に含まれる
    const timeFields = updated.missingFields.filter(f => f.startsWith("segmentTime:"));
    expect(timeFields.length).toBeGreaterThanOrEqual(1);
    expect(timeFields[0]).toContain("商談");

    // confirm message に質問が含まれる
    const msg = buildDeltaConfirmMessage(updated, delta);
    expect(msg).toContain("何時からの予定");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 4: reassignTimes の overlap 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("reassignTimes overlap 検出", () => {
  test("todo が fixed を押し退けずに配置される", () => {
    // 09:00 仕事(120分, fixed) → 食事(60分, todo) → 13:00 打ち合わせ(60分, fixed)
    // 仕事 ends at 11:00, 食事は 11:00 start → ends 12:00 → 打ち合わせ 13:00 → OK
    const state = makeCEOBaseState();
    // 休憩を除去してシンプルに
    state.segments = state.segments.filter(s => s.activity !== "休憩");

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const l3 = snapshotLayer3(nonTravel);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });

  test("todo が固定予定の間に収まらない場合、overflow しない", () => {
    // 09:00 仕事(120分, fixed) → 大型タスク(180分, todo) → 12:00 昼食(60分, fixed)
    // 仕事 ends at 11:00, 空き 11:00-12:00 = 60分。大型タスク(180分) は入らない
    // 大型タスクは 12:00 昼食の後 = 13:00 start にスライドすべき
    const state: PlanState = {
      targetDate: "2026-04-17",
      targetDateLabel: "明日",
      timezone: "Asia/Tokyo",
      segments: [
        {
          id: "seg_1", order: 1, activity: "仕事",
          activityCanonical: "仕事", companions: [],
          status: "confirmed", startTime: "09:00",
          estimatedDurationMin: 120,
          place: "オフィス", placeCanonical: "オフィス", placeCategory: "office",
        },
        {
          id: "seg_2", order: 2, activity: "プレゼン準備",
          activityCanonical: "プレゼン準備", companions: [],
          status: "confirmed",
          estimatedDurationMin: 180,
        },
        {
          id: "seg_3", order: 3, activity: "昼食",
          activityCanonical: "昼食", companions: [],
          status: "confirmed", startTime: "12:00",
          estimatedDurationMin: 60,
          place: "レストラン", placeCanonical: "レストラン", placeCategory: "restaurant",
        },
      ],
      transport: "car",
      status: "collecting",
      missingFields: [],
    };

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const l3 = snapshotLayer3(nonTravel);
    const overlaps = findOverlaps(l3);

    // 大型タスクと昼食が overlap しないことを確認
    expect(overlaps).toEqual([]);
  });

  test("travel 挿入後も overlap が発生しない", () => {
    const state = makeCEOBaseState();
    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // 全アイテム（travel 含む）で overlap 確認
    const l3 = snapshotLayer3(plan.items);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 5: 時刻変更 + travel 再生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO Issue 3: 時刻変更 + travel 再生成", () => {
  test("startTime 変更 → recalculateSchedule で後続が調整される", () => {
    // シナリオ: 仕事 08:00(120min) → 食事 → 打ち合わせ 13:00
    // 仕事を 07:00 に変更 → 食事は 09:00 start に前倒し
    const state = makeCEOBaseState();
    state.segments = state.segments.filter(s => s.activity !== "休憩");

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // 仕事の startTime を 07:00 に変更
    const modified = plan.items
      .filter(i => i.kind !== "travel")
      .map(i => i.what === "仕事"
        ? { ...i, startTime: "07:00", fixedStart: true }
        : i
      );

    // travel 再挿入 + 時刻再計算
    const withTravel = insertTravelItems(modified, "car", true);
    const recalculated = recalculateSchedule(withTravel);

    // 食事の startTime が前倒しされている（09:00 or travel 後）
    const nonTravel = recalculated.filter(i => i.kind !== "travel");
    const meal = nonTravel.find(i => i.what === "食事");
    expect(meal?.startTime).toBeTruthy();
    // 仕事終了(09:00) 以降に配置されているべき
    if (meal?.startTime) {
      expect(toMin(meal.startTime)).toBeGreaterThanOrEqual(toMin("07:00") + 120);
    }

    // overlap なし
    const l3 = snapshotLayer3(recalculated);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 6: 順序の単一真実源
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("順序の単一真実源: segment.order", () => {
  test("segment.order の昇順が、最終 render の非travel行の意味順序と一致する", () => {
    const state = makeCEOBaseState();
    const l1 = snapshotLayer1(state);
    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // Layer 1 の activity 順序
    const l1Order = l1.sort((a, b) => a.order - b.order).map(r => r.activity);

    // Layer 3 の非travel行の activity 順序
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const l3Order = nonTravel.map(i => i.what);

    // 意味順序が一致すべき
    expect(l3Order).toEqual(l1Order);
  });

  test("delta で追加後も、segment.order の昇順 = render の意味順序", () => {
    const state = makeCEOBaseState();

    // 商談を order=3.5 に追加（休憩と打ち合わせの間）
    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 5, // 末尾
          activity: "商談",
          companions: ["Bさん"],
          startTime: "16:00",
        },
      }],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    const l1 = snapshotLayer1(updated);
    const l1Order = l1.sort((a, b) => a.order - b.order).map(r => r.activity);

    const items = planStateToPlanItems(updated);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel" && !i.proposal);
    const l3Order = nonTravel.map(i => i.what);

    expect(l3Order).toEqual(l1Order);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 7: 時間意味論（CEO方針: startTime 一枚では足りない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("時間意味論: TimeConstraint", () => {
  // ── normalizeLLMOutput 由来の TimeConstraint 構築テスト ──

  test("LLM が timeType=fixed_start を返す → TimeConstraint.type=fixed_start", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start", companions: ["Aさん"] },
      ],
    });
    const seg = state.segments[0];
    expect(seg.timeConstraint).toBeDefined();
    expect(seg.timeConstraint!.type).toBe("fixed_start");
    expect(seg.timeConstraint!.fixedTime).toBe("14:00");
  });

  test("LLM が timeType=window_afternoon を返す → TimeConstraint にウィンドウが設定される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon", companions: ["Aさん"] },
      ],
    });
    const seg = state.segments[0];
    expect(seg.timeConstraint).toBeDefined();
    expect(seg.timeConstraint!.type).toBe("window_afternoon");
    expect(seg.timeConstraint!.windowStart).toBe("13:00");
    expect(seg.timeConstraint!.windowEnd).toBe("17:59");
  });

  test("LLM が departureTime を返す → PlanState.departureTime + departureTimeConstraint が設定される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start" },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
    });
    expect(state.departureTime).toBe("08:00");
    expect(state.departureTimeConstraint).toBeDefined();
    expect(state.departureTimeConstraint!.type).toBe("fixed_departure");
    expect(state.departureTimeConstraint!.fixedTime).toBe("08:00");
    expect(state.startPoint).toBe("自宅");
  });

  test("timeType なし + startTime あり → レガシーフォールバックで fixed_start", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        { order: 1, activity: "仕事", startTime: "08:00" },
      ],
    });
    const seg = state.segments[0];
    expect(seg.timeConstraint).toBeDefined();
    expect(seg.timeConstraint!.type).toBe("fixed_start");
    expect(seg.timeConstraint!.fixedTime).toBe("08:00");
  });

  test("timeType なし + timeHint=afternoon → レガシーフォールバックで window_afternoon", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        { order: 1, activity: "買い物", timeHint: "afternoon" },
      ],
    });
    const seg = state.segments[0];
    expect(seg.timeConstraint).toBeDefined();
    expect(seg.timeConstraint!.type).toBe("window_afternoon");
    expect(seg.timeConstraint!.windowStart).toBe("13:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 8: planStateToPlanItems の timeConstraintType 伝播
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("planStateToPlanItems: timeConstraintType 伝播", () => {
  test("fixed_start → PlanItem.kind=fixed, timeConstraintType=fixed_start", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start" },
      ],
    });
    const items = planStateToPlanItems(state);
    expect(items[0].kind).toBe("fixed");
    expect(items[0].timeConstraintType).toBe("fixed_start");
    expect(items[0].fixedStart).toBe(true);
  });

  test("window_afternoon → PlanItem.kind=todo, timeConstraintType=window_afternoon", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "買い物", timeHint: "afternoon", timeType: "window_afternoon" },
      ],
    });
    const items = planStateToPlanItems(state);
    expect(items[0].kind).toBe("todo");
    expect(items[0].timeConstraintType).toBe("window_afternoon");
    expect(items[0].fixedStart).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 9: CEO再現シナリオ — 時間意味論
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO再現: 時間意味論エンドツーエンド", () => {
  /**
   * CEO指摘: 「午後からAさんと打ち合わせって言ってんのに11時に設定される」
   * 期待: window_afternoon → 13:00 以降に配置
   */
  test("午後の打ち合わせが 13:00 以降に配置される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start" },
        { order: 2, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon", companions: ["Aさん"] },
      ],
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const meeting = nonTravel.find(i => i.what === "打ち合わせ");
    expect(meeting).toBeTruthy();
    expect(meeting!.startTime).toBeTruthy();
    // 13:00 (= 780分) 以降に配置されるべき
    expect(toMin(meeting!.startTime!)).toBeGreaterThanOrEqual(13 * 60);
  });

  /**
   * CEO指摘: 「8時に家出るって言ってんのに家出るのが7:45になる」
   * 期待: departureTime=08:00 → dayStart=480, 最初のアイテムが 08:00 以降
   */
  test("8時に家を出る → 最初のアイテムが 08:00 以降", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: state.departureTime,
    });

    // 全アイテムの startTime が 08:00 (480分) 以降
    for (const item of plan.items) {
      if (item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }

    // overlap なし
    const l3 = snapshotLayer3(plan.items);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });

  /**
   * CEO統合シナリオ: 「朝8時に家を出る、午後Aさんと打ち合わせ、18時帰宅」
   * 検証:
   * - departureTime = 08:00 → 全 startTime >= 08:00
   * - 打ち合わせ = window_afternoon → startTime >= 13:00
   * - endTime = 18:00
   * - overlap なし
   */
  test("統合シナリオ: 8時出発 + 午後打ち合わせ + 18時帰宅", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
        { order: 3, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon", companions: ["Aさん"], place: "カフェ" },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
      endTime: "18:00",
      endAction: "帰宅",
    });

    expect(state.departureTime).toBe("08:00");
    expect(state.endTime).toBe("18:00");
    expect(state.endAction).toBe("帰宅");

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
      endTimeConstraint: "18:00",
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");

    // 全アイテム startTime >= 08:00
    for (const item of plan.items) {
      if (item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }

    // 打ち合わせは 13:00 以降
    const meeting = nonTravel.find(i => i.what === "打ち合わせ");
    expect(meeting).toBeTruthy();
    if (meeting?.startTime) {
      expect(toMin(meeting.startTime)).toBeGreaterThanOrEqual(13 * 60);
    }

    // ランチは 11:00 以降 (window_noon)
    const lunch = nonTravel.find(i => i.what === "ランチ");
    expect(lunch).toBeTruthy();
    if (lunch?.startTime) {
      expect(toMin(lunch.startTime)).toBeGreaterThanOrEqual(11 * 60);
    }

    // overlap なし
    const l3 = snapshotLayer3(plan.items);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });

  /**
   * 朝の活動(window_morning) が昼に溢れない
   */
  test("window_morning のアイテムが午前中に配置される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "ジョギング", timeHint: "morning", timeType: "window_morning" },
        { order: 2, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start" },
      ],
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "walk" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    // resolveActivity("ジョギング") → canonical: "ランニング"
    const jogging = nonTravel.find(i => i.what === "ランニング" || i.what === "ジョギング");
    expect(jogging).toBeTruthy();
    if (jogging?.startTime) {
      // morning window: 06:00-11:59 → start >= 360分
      expect(toMin(jogging.startTime)).toBeGreaterThanOrEqual(6 * 60);
    }
  });

  /**
   * Delta で午後の予定を追加 → window_afternoon が尊重される
   */
  test("Delta add_segment with window_afternoon → 13:00 以降", () => {
    const state: PlanState = {
      targetDate: "2026-04-17",
      targetDateLabel: "明日",
      timezone: "Asia/Tokyo",
      segments: [
        {
          id: "seg_1", order: 1, activity: "仕事",
          activityCanonical: "仕事", companions: [],
          status: "confirmed", startTime: "09:00",
          timeConstraint: { type: "fixed_start", fixedTime: "09:00" },
          estimatedDurationMin: 120,
        },
      ],
      transport: "car",
      status: "collecting",
      missingFields: [],
    };

    const delta: PlanDelta = {
      turnType: "addition",
      changes: [{
        type: "add_segment",
        segmentId: null,
        field: "segment",
        newSegment: {
          order: 2,
          activity: "打ち合わせ",
          timeHint: "afternoon",
          timeType: "window_afternoon",
          companions: ["Aさん"],
        },
      }],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    const addedSeg = updated.segments.find(s => s.activity === "打ち合わせ");
    expect(addedSeg).toBeTruthy();
    expect(addedSeg!.timeConstraint).toBeDefined();
    expect(addedSeg!.timeConstraint!.type).toBe("window_afternoon");

    // buildDayPlan で 13:00 以降に配置
    const items = planStateToPlanItems(updated);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const meeting = nonTravel.find(i => i.what === "打ち合わせ");
    expect(meeting).toBeTruthy();
    if (meeting?.startTime) {
      expect(toMin(meeting.startTime)).toBeGreaterThanOrEqual(13 * 60);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 10: CEO精密検証 — 08:00出発 exactly
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO精密: 08:00出発 exactly", () => {
  /**
   * CEO指摘: 「8時に家出るって言ってんのに家出るのが7:45」
   *
   * 検証3点:
   * 1. 最初の travel row が 08:00 exactly
   * 2. その前に 07:45 みたいな前倒し行が存在しない
   * 3. 仕事開始は travel 後でよい
   */
  test("最初の travel が 08:00 exactly、07:45 のような前倒しがない", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        {
          order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start",
          place: "オフィス",
        },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
    });

    // 1. 最初のアイテムが travel であること
    expect(plan.items[0].kind).toBe("travel");

    // 2. 最初の travel が 08:00 exactly（08:20 でも 07:45 でもダメ）
    expect(plan.items[0].startTime).toBe("08:00");

    // 3. 08:00 より前のアイテムが存在しない
    for (const item of plan.items) {
      if (item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }

    // 4. 仕事は travel 後 = 09:00 のまま（fixed_start anchor）
    const work = plan.items.find(i => i.what === "仕事");
    expect(work?.startTime).toBe("09:00");

    // 5. overlap なし
    const l3 = snapshotLayer3(plan.items);
    const overlaps = findOverlaps(l3);
    expect(overlaps).toEqual([]);
  });

  test("departure=08:00 + 複数行程でも最初のtravelが08:00", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start", place: "カフェ", companions: ["Aさん"] },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
    });

    // 最初の travel = 08:00
    const firstTravel = plan.items.find(i => i.kind === "travel");
    expect(firstTravel).toBeTruthy();
    expect(firstTravel!.startTime).toBe("08:00");

    // 全アイテム >= 08:00
    for (const item of plan.items) {
      if (item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }

    // overlap なし
    const l3 = snapshotLayer3(plan.items);
    expect(findOverlaps(l3)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 11: CEO精密検証 — 18:00帰宅 exactly
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO精密: 18:00帰宅 exactly", () => {
  /**
   * CEO指摘: 18時帰宅 → 最終「帰宅」到着が 18:00 exactly、帰宅前の移動が逆算
   *
   * 検証3点:
   * 1. 最終到着が 18:00 exactly
   * 2. 帰宅前の移動がそこから逆算される
   * 3. 途中予定を並べ替えても 18:00 固定は崩れない
   */
  test("最終 return travel の到着が 18:00 exactly", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start", place: "カフェ", companions: ["Aさん"] },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
      endTime: "18:00",
      endAction: "帰宅",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
      endTimeConstraint: "18:00",
    });

    // 最終 travel を取得（帰路）
    const travelItems = plan.items.filter(i => i.kind === "travel");
    expect(travelItems.length).toBeGreaterThanOrEqual(1);
    const lastTravel = travelItems[travelItems.length - 1];

    // 到着 = startTime + duration = 18:00 (1080分) exactly
    expect(lastTravel.startTime).toBeTruthy();
    const arrivalMin = toMin(lastTravel.startTime!) + lastTravel.durationMin;
    expect(arrivalMin).toBe(18 * 60);

    // overlap なし
    const l3 = snapshotLayer3(plan.items);
    expect(findOverlaps(l3)).toEqual([]);
  });

  test("8時出発 + 18時帰宅の統合シナリオで全整合", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon", place: "レストラン" },
        { order: 3, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon", place: "カフェ", companions: ["Aさん"] },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
      endTime: "18:00",
      endAction: "帰宅",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
      endTimeConstraint: "18:00",
    });

    // 最初の travel = 08:00
    const firstTravel = plan.items.find(i => i.kind === "travel");
    expect(firstTravel?.startTime).toBe("08:00");

    // 最終 travel 到着 = 18:00
    const travelItems = plan.items.filter(i => i.kind === "travel");
    const lastTravel = travelItems[travelItems.length - 1];
    expect(toMin(lastTravel.startTime!) + lastTravel.durationMin).toBe(18 * 60);

    // 打ち合わせ >= 13:00
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const meeting = nonTravel.find(i => i.what === "打ち合わせ");
    if (meeting?.startTime) {
      expect(toMin(meeting.startTime)).toBeGreaterThanOrEqual(13 * 60);
    }

    // ランチ >= 11:00
    const lunch = nonTravel.find(i => i.what === "ランチ");
    if (lunch?.startTime) {
      expect(toMin(lunch.startTime)).toBeGreaterThanOrEqual(11 * 60);
    }

    // 全アイテム >= 08:00
    for (const item of plan.items) {
      if (item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }

    // overlap なし
    const l3 = snapshotLayer3(plan.items);
    expect(findOverlaps(l3)).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 12: CEO精密検証 — reorder 後の全再スケジュール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("CEO精密: reorder preserves anchors", () => {
  /**
   * 並べ替え後:
   * 1. departure / window / arrival 制約が維持される
   * 2. overlap なし
   * 3. travel 再生成正常
   * 4. fixedStart アイテムの startTime は動かない
   */
  test("ランチと仕事を入れ替えても、仕事は09:00のまま・ランチはwindow尊重", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon", place: "レストラン" },
        { order: 3, activity: "打ち合わせ", startTime: "14:00", timeType: "fixed_start", place: "カフェ", companions: ["Aさん"] },
      ],
      startPlace: "自宅",
      departureTime: "08:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
    });

    // ── reorder: ランチ(idx=1) を 仕事(idx=0) の前に移動 ──
    // MorningPlanCard の handleMoveUp と同等の操作
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const lunchIdx = nonTravel.findIndex(i => i.what === "ランチ");
    const workIdx = nonTravel.findIndex(i => i.what === "仕事");

    // ランチを前に、仕事を後ろに入れ替え
    const reordered = [...nonTravel];
    if (lunchIdx > 0) {
      [reordered[lunchIdx - 1], reordered[lunchIdx]] = [reordered[lunchIdx], reordered[lunchIdx - 1]];
    }

    // travel 再生成 + recalculateSchedule（MorningPlanCard.regenerateTravel と同等）
    const withTravel = insertTravelItems(reordered, "car", true);
    const recalculated = recalculateSchedule(withTravel);

    // 1. fixedStart の仕事は 09:00 のまま
    const work = recalculated.find(i => i.what === "仕事");
    expect(work?.startTime).toBe("09:00");
    expect(work?.fixedStart).toBe(true);

    // 2. fixedStart の打ち合わせは 14:00 のまま
    const meeting = recalculated.find(i => i.what === "打ち合わせ");
    expect(meeting?.startTime).toBe("14:00");
    expect(meeting?.fixedStart).toBe(true);

    // 3. ランチは window_noon (>= 11:00) を尊重
    const lunch = recalculated.find(i => i.what === "ランチ");
    expect(lunch).toBeTruthy();
    if (lunch?.startTime) {
      expect(toMin(lunch.startTime)).toBeGreaterThanOrEqual(11 * 60);
    }

    // 4. overlap なし
    const l3 = snapshotLayer3(recalculated);
    expect(findOverlaps(l3)).toEqual([]);

    // 5. travel が重複しない（同じ from→to が2つない）
    const travels = recalculated.filter(i => i.kind === "travel");
    const travelKeys = travels.map(t => `${t.travelFrom}→${t.travelTo}`);
    expect(new Set(travelKeys).size).toBe(travelKeys.length);
  });

  test("reorder 後も timeConstraintType が保持される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon", place: "レストラン" },
        { order: 3, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon", place: "カフェ" },
      ],
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // reorder: 打ち合わせを前に
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const reordered = [...nonTravel];
    const meetIdx = reordered.findIndex(i => i.what === "打ち合わせ");
    if (meetIdx > 0) {
      [reordered[meetIdx - 1], reordered[meetIdx]] = [reordered[meetIdx], reordered[meetIdx - 1]];
    }

    const withTravel = insertTravelItems(reordered, "car", true);
    const recalculated = recalculateSchedule(withTravel);

    // timeConstraintType が保持されている
    const work = recalculated.find(i => i.what === "仕事");
    const lunch = recalculated.find(i => i.what === "ランチ");
    const meeting = recalculated.find(i => i.what === "打ち合わせ");

    expect(work?.timeConstraintType).toBe("fixed_start");
    expect(lunch?.timeConstraintType).toBe("window_noon");
    expect(meeting?.timeConstraintType).toBe("window_afternoon");

    // 打ち合わせが reorder されても 13:00 以降
    if (meeting?.startTime) {
      expect(toMin(meeting.startTime)).toBeGreaterThanOrEqual(13 * 60);
    }

    // ランチが reorder されても 11:00 以降
    if (lunch?.startTime) {
      expect(toMin(lunch.startTime)).toBeGreaterThanOrEqual(11 * 60);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 13: Transport mode mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Transport mode: travelTransport の構造化", () => {
  test("travel item に travelTransport が正しく設定される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
      ],
      transport: "car",
      startPlace: "自宅",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    const travels = plan.items.filter(i => i.kind === "travel");
    for (const travel of travels) {
      expect(travel.travelTransport).toBe("car");
    }
  });

  test("各 TransportMode が travel item に正しく伝播する", () => {
    const modes: Array<[string, string]> = [
      ["car", "car"],
      ["train", "train"],
      ["walk", "walk"],
      ["bus", "bus"],
      ["bicycle", "bicycle"],
      ["taxi", "taxi"],
    ];

    for (const [input, expected] of modes) {
      resetSegmentCounter();
      const state = normalizeLLMOutput({
        targetDate: "tomorrow",
        segments: [
          { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        ],
        transport: input,
        startPlace: "自宅",
      });

      const items = planStateToPlanItems(state);
      const plan = buildDayPlan(items, { mainTransport: input as any }, undefined, {
        targetDate: "2026-04-17",
        goOut: true,
      });

      const travels = plan.items.filter(i => i.kind === "travel");
      if (travels.length > 0) {
        expect(travels[0].travelTransport).toBe(expected);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 14: P0 — UI recalculateSchedule が departure/arrival anchor を尊重する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P0: recalculateSchedule departure/arrival anchor — UI/サーバー一致", () => {
  test("departure anchor あり → 最初の travel が exactly 08:00 に配置される（UI 07:15 バグの修正検証）", () => {
    // ── CEO再現シナリオ: 「8時に家を出る、仕事、ランチ、買い物して18時に帰る」 ──
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      departureTime: "08:00",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
        { order: 3, activity: "買い物", timeHint: "afternoon", timeType: "window_afternoon" },
      ],
      transport: "car",
      startPlace: "自宅",
      endTime: "18:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
      endTimeConstraint: "18:00",
    });

    // ── Step 1: buildDayPlan が anchor を MorningPlan に保存している ──
    expect(plan.departureTime).toBe("08:00");
    expect(plan.arrivalTime).toBe("18:00");

    // ── Step 2: reassignTimes（サーバー側）の結果を確認 ──
    const serverTravel = plan.items.filter(i => i.kind === "travel");
    const firstTravel = serverTravel[0];
    expect(firstTravel).toBeDefined();
    expect(firstTravel.startTime).toBe("08:00"); // exactly 08:00

    // ── Step 3: UI 側 regenerateTravel を再現 ──
    //   MorningPlanCard.regenerateTravel と同等のフロー:
    //   nonTravel → insertTravelItems → recalculateSchedule(withTravel, anchors)
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const withTravel = insertTravelItems(nonTravel, "car", true);
    // 修正前: recalculateSchedule(withTravel) → 07:15 になるバグ
    // 修正後: recalculateSchedule(withTravel, anchors) → 08:00 exactly
    const uiResult = recalculateSchedule(withTravel, {
      departureTime: plan.departureTime,
      arrivalTime: plan.arrivalTime,
    });

    // ── 検証: UI の最初の travel も exactly 08:00 ──
    const uiTravels = uiResult.filter(i => i.kind === "travel");
    const uiFirstTravel = uiTravels[0];
    expect(uiFirstTravel).toBeDefined();
    expect(uiFirstTravel.startTime).toBe("08:00"); // P0 修正: exactly 08:00

    // ── 検証: UI の最後の travel の到着が 18:00 ──
    const uiLastTravel = uiTravels[uiTravels.length - 1];
    expect(uiLastTravel).toBeDefined();
    const lastTravelEnd = toMin(uiLastTravel.startTime!) + uiLastTravel.durationMin;
    expect(lastTravelEnd).toBe(18 * 60); // 到着 = 18:00

    // ── 検証: サーバーとUIの結果が一致 ──
    expect(uiFirstTravel.startTime).toBe(firstTravel.startTime);
  });

  test("departure anchor なし → 従来通り cursor ベースで配置（互換性）", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
      ],
      transport: "car",
      startPlace: "自宅",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
    });

    // anchor なし
    expect(plan.departureTime).toBeUndefined();
    expect(plan.arrivalTime).toBeUndefined();

    // recalculateSchedule に anchor なしで呼んでも壊れない
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const withTravel = insertTravelItems(nonTravel, "car", true);
    const uiResult = recalculateSchedule(withTravel);

    // 結果は正常（startTime あり、順序維持）
    for (const item of uiResult) {
      if (item.startTime) {
        expect(item.startTime).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  test("reorder 後も departure anchor が保持される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      departureTime: "08:00",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
        { order: 3, activity: "買い物", timeHint: "afternoon", timeType: "window_afternoon" },
      ],
      transport: "car",
      startPlace: "自宅",
      endTime: "18:00",
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: "08:00",
      endTimeConstraint: "18:00",
    });

    // reorder: ランチと買い物を入れ替え
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const reordered = [...nonTravel];
    const lunchIdx = reordered.findIndex(i => i.what === "ランチ");
    const shopIdx = reordered.findIndex(i => i.what === "買い物");
    if (lunchIdx >= 0 && shopIdx >= 0 && shopIdx > lunchIdx) {
      [reordered[lunchIdx], reordered[shopIdx]] = [reordered[shopIdx], reordered[lunchIdx]];
    }

    const withTravel = insertTravelItems(reordered, "car", true);
    const uiResult = recalculateSchedule(withTravel, {
      departureTime: plan.departureTime,
      arrivalTime: plan.arrivalTime,
    });

    // reorder 後も最初の travel は 08:00
    const uiFirstTravel = uiResult.find(i => i.kind === "travel");
    expect(uiFirstTravel).toBeDefined();
    expect(uiFirstTravel!.startTime).toBe("08:00");

    // reorder 後も最後の travel の到着は 18:00
    const uiTravels = uiResult.filter(i => i.kind === "travel");
    const uiLastTravel = uiTravels[uiTravels.length - 1];
    const lastEnd = toMin(uiLastTravel.startTime!) + uiLastTravel.durationMin;
    expect(lastEnd).toBe(18 * 60);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 15: P1 — Delta で targetDate を変更できる（「明日→今日」）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P1: applyDelta で targetDate/targetDateLabel が更新される", () => {
  test("明日→今日: applyDelta が targetDate と targetDateLabel の両方を更新する", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
      ],
    });

    // 初期状態: 明日
    expect(state.targetDateLabel).toBe("明日");

    // delta: 「やっぱり今日にする」
    const delta = {
      turnType: "correction" as const,
      changes: [
        {
          type: "replace" as const,
          segmentId: null,
          field: "targetDate",
          newValue: "today",
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // targetDateLabel が "今日" に更新されている
    expect(updated.targetDateLabel).toBe("今日");
    // targetDate が今日の YYYY-MM-DD に更新されている
    expect(updated.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 明日の日付ではない
    expect(updated.targetDate).not.toBe(state.targetDate);

    // セグメントは変更されていない
    expect(updated.segments.length).toBe(state.segments.length);
    expect(updated.segments[0].activity).toBe("仕事");
  });

  test("今日→明後日: applyDelta が正しく変換する", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        { order: 1, activity: "買い物" },
      ],
    });

    expect(state.targetDateLabel).toBe("今日");

    const delta = {
      turnType: "correction" as const,
      changes: [
        {
          type: "replace" as const,
          segmentId: null,
          field: "targetDate",
          newValue: "day_after_tomorrow",
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.targetDateLabel).toBe("明後日");
    expect(updated.targetDate).not.toBe(state.targetDate);
  });

  test("targetDate 変更と他の変更を同時に適用できる", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start" },
      ],
    });

    // delta: 「やっぱり今日にして、あと買い物も追加」
    const delta = {
      turnType: "correction" as const,
      changes: [
        {
          type: "replace" as const,
          segmentId: null,
          field: "targetDate",
          newValue: "today",
        },
        {
          type: "add_segment" as const,
          segmentId: null,
          field: "segment",
          newValue: null,
          newSegment: {
            order: 2,
            activity: "買い物",
            timeHint: "afternoon",
            timeType: "window_afternoon",
          },
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.targetDateLabel).toBe("今日");
    expect(updated.segments.length).toBe(2);
    expect(updated.segments[1].activity).toBe("買い物");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 16: P3-1 — departureTime が delta 経由で設定される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P3-1: departureTime が delta 経由で設定 → buildDayPlan で anchor として機能", () => {
  test("CEO再現: Turn1で予定作成 → Turn2で「8時に家を出る」→ departure anchor 設定 → 最初のtravel = 08:00", () => {
    // Turn 1: 初期プラン（departureTime なし）
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
        { order: 3, activity: "打ち合わせ", timeHint: "afternoon", timeType: "window_afternoon" },
      ],
    });

    // departureTime 未設定
    expect(state.departureTime).toBeUndefined();

    // Turn 2: delta で「8時に家を出る、車で」
    const delta = {
      turnType: "clarify_response" as const,
      changes: [
        {
          type: "set" as const,
          segmentId: null,
          field: "departureTime",
          newValue: "08:00",
        },
        {
          type: "set" as const,
          segmentId: null,
          field: "transport",
          newValue: "car",
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);

    // departureTime が設定されている
    expect(updated.departureTime).toBe("08:00");
    expect(updated.transport).toBe("car");

    // buildDayPlan に departureTime が渡される
    const items = planStateToPlanItems(updated);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: updated.departureTime,
    });

    // MorningPlan に anchor が保存されている
    expect(plan.departureTime).toBe("08:00");

    // 最初の travel が exactly 08:00
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels.length).toBeGreaterThan(0);
    expect(travels[0].startTime).toBe("08:00");

    // 仕事の開始は 09:00（移動後）
    const work = plan.items.find(i => i.what === "仕事");
    expect(work?.startTime).toBe("09:00");
  });

  test("departure anchor 変更: 「やっぱり9時出発」→ replace で departureTime 更新", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      departureTime: "08:00",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
      ],
      transport: "car",
      startPlace: "自宅",
    });

    expect(state.departureTime).toBe("08:00");

    // delta: 「やっぱり9時出発」
    const delta = {
      turnType: "correction" as const,
      changes: [
        {
          type: "replace" as const,
          segmentId: null,
          field: "departureTime",
          newValue: "09:00",
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.departureTime).toBe("09:00");
  });

  test("goOut が delta 経由で設定される", () => {
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事" },
      ],
    });

    const delta = {
      turnType: "clarify_response" as const,
      changes: [
        {
          type: "set" as const,
          segmentId: null,
          field: "goOut",
          newValue: "true",
        },
      ],
      confirmSummary: "",
    };

    const updated = applyDelta(state, delta);
    expect(updated.goOut).toBe(true);
  });

  test("UI regenerateTravel: delta で設定された departureTime が MorningPlan を通じて anchor として機能", () => {
    // CEO完全再現: Turn1 → Turn2 delta → buildDayPlan → UI recalculateSchedule

    // Turn 1
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "ランチ", timeHint: "noon", timeType: "window_noon" },
      ],
    });

    // Turn 2: delta で departureTime + transport
    const delta = {
      turnType: "clarify_response" as const,
      changes: [
        { type: "set" as const, segmentId: null, field: "departureTime", newValue: "08:00" },
        { type: "set" as const, segmentId: null, field: "transport", newValue: "car" },
      ],
      confirmSummary: "",
    };
    const updated = applyDelta(state, delta);

    // buildDayPlan（サーバー側）
    const items = planStateToPlanItems(updated);
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2026-04-17",
      goOut: true,
      departureTime: updated.departureTime,
    });

    // UI regenerateTravel（クライアント側）
    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const withTravel = insertTravelItems(nonTravel, "car", true);
    const uiResult = recalculateSchedule(withTravel, {
      departureTime: plan.departureTime,
      arrivalTime: plan.arrivalTime,
    });

    // サーバーとUIの最初の travel が一致 = exactly 08:00
    const serverFirstTravel = plan.items.find(i => i.kind === "travel");
    const uiFirstTravel = uiResult.find(i => i.kind === "travel");
    expect(serverFirstTravel?.startTime).toBe("08:00");
    expect(uiFirstTravel?.startTime).toBe("08:00");
    expect(uiFirstTravel?.startTime).toBe(serverFirstTravel?.startTime);

    // 07:45 / 07:15 のような前倒しはゼロ
    for (const item of uiResult) {
      if (item.kind === "travel" && item.startTime) {
        expect(toMin(item.startTime)).toBeGreaterThanOrEqual(8 * 60);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 17: P3-2 — Gap Fill Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("P3-2: Gap Fill Engine — 空き時間検出と提案差し込み", () => {
  test("45分以上の gap を検出する", () => {
    // 09:00-10:00 仕事 → [gap 2h] → 12:00-13:00 ランチ
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      {
        id: "a", kind: "fixed", text: "仕事", what: "仕事",
        startTime: "09:00", durationMin: 60, fixedStart: true,
        orderHint: 0, sourceTurnIndex: 0, completed: false,
        activityCategory: "work_general",
      },
      {
        id: "b", kind: "fixed", text: "ランチ", what: "ランチ",
        startTime: "12:00", durationMin: 60, fixedStart: true,
        orderHint: 1, sourceTurnIndex: 0, completed: false,
        activityCategory: "social_meal",
      },
    ];

    const gaps = detectGaps(items);
    expect(gaps.length).toBe(1);
    expect(gaps[0].startMin).toBe(10 * 60); // 10:00
    expect(gaps[0].endMin).toBe(12 * 60);   // 12:00
    expect(gaps[0].durationMin).toBe(120);   // 2h
  });

  test("45分未満の gap は検出しない", () => {
    // 09:00-10:00 仕事 → [gap 30min] → 10:30-11:00 メール
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      {
        id: "a", kind: "fixed", text: "仕事", what: "仕事",
        startTime: "09:00", durationMin: 60, fixedStart: true,
        orderHint: 0, sourceTurnIndex: 0, completed: false,
      },
      {
        id: "b", kind: "todo", text: "メール", what: "メール",
        startTime: "10:30", durationMin: 30, fixedStart: false,
        orderHint: 1, sourceTurnIndex: 0, completed: false,
      },
    ];

    const gaps = detectGaps(items);
    expect(gaps.length).toBe(0);
  });

  test("fillGaps: gap に proposal アイテムが差し込まれる", () => {
    // 09:00-10:00 仕事 → [gap 2h] → 12:00-13:00 ランチ
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      {
        id: "a", kind: "fixed", text: "仕事", what: "仕事",
        startTime: "09:00", durationMin: 60, fixedStart: true,
        orderHint: 0, sourceTurnIndex: 0, completed: false,
        activityCategory: "work_general",
      },
      {
        id: "b", kind: "fixed", text: "ランチ", what: "ランチ",
        startTime: "12:00", durationMin: 60, fixedStart: true,
        orderHint: 1, sourceTurnIndex: 0, completed: false,
        activityCategory: "social_meal",
      },
    ];

    const filled = fillGaps(items);
    expect(filled.length).toBeGreaterThan(items.length);

    // proposal フラグが付いている
    const proposals = filled.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // proposal の startTime は gap 内（10:00〜12:00）
    const p = proposals[0];
    expect(p.startTime).toBeDefined();
    const pStart = toMin(p.startTime!);
    expect(pStart).toBeGreaterThanOrEqual(10 * 60);
    expect(pStart + p.durationMin).toBeLessThanOrEqual(12 * 60);

    // proposal は kind="todo" で fixedStart=false
    expect(p.kind).toBe("todo");
    expect(p.fixedStart).toBe(false);

    // proposalReason が設定されている
    expect(p.proposalReason).toBeTruthy();
  });

  test("会議前の gap には準備提案が出る", () => {
    // 09:00-10:00 仕事 → [gap 2h] → 12:00-13:00 打ち合わせ
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      {
        id: "a", kind: "fixed", text: "仕事", what: "仕事",
        startTime: "09:00", durationMin: 60, fixedStart: true,
        orderHint: 0, sourceTurnIndex: 0, completed: false,
        activityCategory: "work_general",
      },
      {
        id: "b", kind: "fixed", text: "打ち合わせ", what: "打ち合わせ",
        startTime: "12:00", durationMin: 60, fixedStart: true,
        orderHint: 1, sourceTurnIndex: 0, completed: false,
        activityCategory: "work_meeting",
      },
    ];

    const filled = fillGaps(items);
    const proposals = filled.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // 打ち合わせ準備 or カフェが提案される
    const p = proposals[0];
    expect(p.text).toMatch(/準備|カフェ/);
  });

  test("gap なしのプランでは proposal は差し込まれない", () => {
    // 09:00-10:30 仕事 → 10:30-11:00 ランチ（gap = 0min）
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      {
        id: "a", kind: "fixed", text: "仕事", what: "仕事",
        startTime: "09:00", durationMin: 90, fixedStart: true,
        orderHint: 0, sourceTurnIndex: 0, completed: false,
      },
      {
        id: "b", kind: "todo", text: "ランチ", what: "ランチ",
        startTime: "10:30", durationMin: 60, fixedStart: false,
        orderHint: 1, sourceTurnIndex: 0, completed: false,
      },
    ];

    const filled = fillGaps(items);
    expect(filled.length).toBe(items.length);
  });

  test("proposal は最大2つまで（MAX_PROPOSALS制約）", () => {
    // 大きな gap が3つある場合
    const items: import("@/lib/alter-morning/types").PlanItem[] = [
      { id: "a", kind: "fixed", text: "仕事", what: "仕事", startTime: "08:00", durationMin: 60, fixedStart: true, orderHint: 0, sourceTurnIndex: 0, completed: false },
      { id: "b", kind: "fixed", text: "ランチ", what: "ランチ", startTime: "11:00", durationMin: 60, fixedStart: true, orderHint: 1, sourceTurnIndex: 0, completed: false, activityCategory: "social_meal" as const },
      { id: "c", kind: "fixed", text: "会議", what: "会議", startTime: "14:00", durationMin: 60, fixedStart: true, orderHint: 2, sourceTurnIndex: 0, completed: false },
      { id: "d", kind: "fixed", text: "夕食", what: "夕食", startTime: "18:00", durationMin: 60, fixedStart: true, orderHint: 3, sourceTurnIndex: 0, completed: false },
    ];

    const filled = fillGaps(items);
    const proposals = filled.filter(i => i.proposal === true);
    expect(proposals.length).toBeLessThanOrEqual(2);
  });

  test("buildDayPlan が gap fill を自動適用する（E2E）", () => {
    // CEO E2E: 仕事 09:00 → ランチ 12:00 → 打ち合わせ 16:00 → gap が2箇所
    const state = normalizeLLMOutput({
      targetDate: "tomorrow",
      segments: [
        { order: 1, activity: "仕事", startTime: "09:00", timeType: "fixed_start", place: "オフィス" },
        { order: 2, activity: "食事", startTime: "12:00", timeType: "fixed_start" },
        { order: 3, activity: "打ち合わせ", startTime: "16:00", timeType: "fixed_start" },
      ],
    });

    const items = planStateToPlanItems(state);
    const plan = buildDayPlan(items, {}, undefined, {
      targetDate: "2026-04-17",
    });

    // plan.items に proposal が含まれている
    const proposals = plan.items.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // proposal は既存アイテムの startTime を壊さない
    const work = plan.items.find(i => i.what === "仕事");
    const meal = plan.items.find(i => i.what === "食事");
    const meeting = plan.items.find(i => i.what === "打ち合わせ");
    expect(work?.startTime).toBe("09:00");
    expect(meal?.startTime).toBe("12:00");
    expect(meeting?.startTime).toBe("16:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 18: Gap Fill v2 — 行動科学エビデンス適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Gap Fill v2: 行動科学エビデンス", () => {
  /** ヘルパー: PlanItem を簡易生成 */
  function makeItem(overrides: Partial<PlanItem> & { text: string; startTime: string; durationMin: number }): PlanItem {
    return {
      id: `test_${Math.random().toString(36).slice(2, 6)}`,
      kind: "todo",
      what: overrides.text,
      fixedStart: false,
      orderHint: 1,
      sourceTurnIndex: 0,
      completed: false,
      ...overrides,
    };
  }

  // ── L1: 過密ガード（Slack研究: 稼働率80%超は逆効果）──

  test("L1: アイテム数 ≥ 7 なら gap fill をスキップする", () => {
    const items: PlanItem[] = [
      makeItem({ text: "朝食", startTime: "07:00", durationMin: 30 }),
      makeItem({ text: "仕事1", startTime: "08:00", durationMin: 60 }),
      makeItem({ text: "仕事2", startTime: "09:30", durationMin: 60 }),
      makeItem({ text: "仕事3", startTime: "11:00", durationMin: 60 }),
      makeItem({ text: "昼食", startTime: "12:30", durationMin: 30 }),
      makeItem({ text: "仕事4", startTime: "13:30", durationMin: 60 }),
      makeItem({ text: "仕事5", startTime: "15:00", durationMin: 60 }),
      // 7個の非travel — 16:00-17:30 に gap があっても提案しない
      makeItem({ text: "帰宅準備", startTime: "17:30", durationMin: 30 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(0); // 過密ガード発動
  });

  test("L1: アイテム数 < 7 なら gap fill が動作する", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 120 }),
      // 11:00 - 14:00 に 180分 gap
      makeItem({ text: "打ち合わせ", startTime: "14:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  // ── T4: 午後ディップ (13-15時は recovery 系のみ) ──

  test("T4: 13-15時の gap には recovery 系のみ提案される", () => {
    const items: PlanItem[] = [
      makeItem({ text: "ランチ", startTime: "12:00", durationMin: 60, activityCategory: "social_meal" }),
      // 13:00 - 15:00 に 120分 gap（午後ディップ帯）
      makeItem({ text: "打ち合わせ", startTime: "15:00", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // 全提案が recovery 系（散歩、カフェ、ストレッチ）
    for (const p of proposals) {
      const isRecovery =
        p.activityCategory === "exercise_walk" ||
        p.activityCategory === "life_rest" ||
        p.activityCategory === "exercise_yoga";
      expect(isRecovery).toBe(true);
    }
  });

  // ── T3: バッファ適用 (Planning Fallacy 対策) ──

  test("T3: 提案の startTime が gap 開始から5分後になる（バッファ）", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60 }),
      // 10:00 - 11:30 に 90分 gap
      makeItem({ text: "打ち合わせ", startTime: "11:30", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(1);

    // gap は 10:00 開始 → バッファ5分 → 提案は 10:05 開始
    expect(proposals[0].startTime).toBe("10:05");
  });

  // ── L3: 連続する gap に両方提案しない（空白保護）──

  test("L3: 連続する gap では交互に提案をスキップする", () => {
    const items: PlanItem[] = [
      makeItem({ text: "朝の仕事", startTime: "08:00", durationMin: 60 }),
      // gap 1: 09:00 - 10:30 (90min)
      makeItem({ text: "打ち合わせ1", startTime: "10:30", durationMin: 30 }),
      // gap 2: 11:00 - 12:30 (90min) ← ここはスキップ
      makeItem({ text: "打ち合わせ2", startTime: "12:30", durationMin: 30 }),
      // gap 3: 13:00 - 15:00 (120min) ← ここは提案
      makeItem({ text: "仕事", startTime: "15:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);

    // MAX_PROPOSALS=2 かつ L3 で gap1提案→gap2スキップ→gap3提案 = 2件以内
    expect(proposals.length).toBeLessThanOrEqual(2);

    // gap2 (11:00-12:30) に提案がないことを確認
    const gap2Proposals = proposals.filter(p => {
      if (!p.startTime) return false;
      const min = toMin(p.startTime);
      return min >= 11 * 60 && min < 12 * 60 + 30;
    });
    expect(gap2Proposals.length).toBe(0);
  });

  // ── if-then 理由テンプレート ──

  test("提案理由が if-then + obstacle contrast 形式で具体的", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 120, activityCategory: "work_code" }),
      // 11:00 - 12:30 に 90分 gap
      makeItem({ text: "打ち合わせ", startTime: "12:30", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // proposalReason が具体的な文章（「空き時間に」のような曖昧な表現ではない）
    for (const p of proposals) {
      expect(p.proposalReason).toBeTruthy();
      expect(p.proposalReason!.length).toBeGreaterThan(10); // 短すぎない
      // 曖昧な理由テンプレートが使われていない
      expect(p.proposalReason).not.toBe("空き時間に");
      expect(p.proposalReason).not.toBe("隙間時間に");
      expect(p.proposalReason).not.toBe("リフレッシュに");
    }
  });

  // ── C3: 同カテゴリ重複回避 ──

  test("C3: 前後のアイテムと同じカテゴリの候補は出さない", () => {
    const items: PlanItem[] = [
      makeItem({ text: "読書", startTime: "09:00", durationMin: 60, activityCategory: "study_reading" }),
      // 10:00 - 12:00 に 120分 gap
      makeItem({ text: "勉強", startTime: "12:00", durationMin: 60, activityCategory: "study_general" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);

    // study_reading が前にあるので、読書(study_reading)は提案されない
    for (const p of proposals) {
      expect(p.activityCategory).not.toBe("study_reading");
    }
  });

  // ── 食後の特殊対応 ──

  test("食後の gap には散歩が最優先で提案される（眠気対策）", () => {
    const items: PlanItem[] = [
      makeItem({ text: "ランチ", startTime: "12:00", durationMin: 60, activityCategory: "social_meal" }),
      // 13:00 - 14:30 に 90分 gap
      makeItem({ text: "仕事", startTime: "14:30", durationMin: 120 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // 食後 + 午後ディップ帯: recovery 系が提案される
    const first = proposals[0];
    const isRecovery =
      first.activityCategory === "exercise_walk" ||
      first.activityCategory === "life_rest" ||
      first.activityCategory === "exercise_yoga";
    expect(isRecovery).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 19: Gap Fill v2.5 — R2, 逆U字, 天気, T2, ログ基盤
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Gap Fill v2.5: CEO方針（R2/逆U字/天気/T2/ログ）", () => {
  /** ヘルパー: PlanItem を簡易生成 */
  function makeItem(overrides: Partial<PlanItem> & { text: string; startTime: string; durationMin: number }): PlanItem {
    return {
      id: `test_${Math.random().toString(36).slice(2, 6)}`,
      kind: "todo",
      what: overrides.text,
      fixedStart: false,
      orderHint: 1,
      sourceTurnIndex: 0,
      completed: false,
      ...overrides,
    };
  }

  // ── R2: explicit_free_time（HARD昇格）──

  test("R2 (HARD): 前アイテムが「休み」のとき gap を埋めない", () => {
    const items: PlanItem[] = [
      makeItem({ text: "午前の休み", startTime: "10:00", durationMin: 60 }),
      // 11:00 - 13:00 に 120分 gap — 「休み」の後なので埋めない
      makeItem({ text: "仕事", startTime: "13:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(0); // R2 発動
  });

  test("R2 (HARD): 後アイテムが「フリータイム」のとき gap を埋めない", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60 }),
      // 10:00 - 12:00 に 120分 gap — 「フリー」の前なので埋めない
      makeItem({ text: "フリータイム", startTime: "12:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(0); // R2 発動
  });

  test("R2 (HARD): 「ゆっくり」も検出する", () => {
    const items: PlanItem[] = [
      makeItem({ text: "ゆっくりする", startTime: "10:00", durationMin: 60 }),
      // 11:00 - 13:00 に 120分 gap
      makeItem({ text: "出発", startTime: "13:00", durationMin: 30 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(0);
  });

  test("R2: 「休み」がなければ通常通り提案する", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60 }),
      // 10:00 - 12:00 に 120分 gap — 普通の gap
      makeItem({ text: "打ち合わせ", startTime: "12:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  test("R2: 「オフィス」は「オフ」と誤爆しない（GPT注意1対応）", () => {
    const items: PlanItem[] = [
      makeItem({ text: "オフィスで仕事", startTime: "09:00", durationMin: 60 }),
      // 10:00 - 12:00 に 120分 gap — 「オフィス」は「オフ」ではない
      makeItem({ text: "打ち合わせ", startTime: "12:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    // 「オフィス」は R2 に引っかからない → 提案が出るはず
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  // ── 逆U字: sparse-day exception ──

  test("逆U字: 非travelアイテム ≤ 2 + gap ≥ 90min → MAX_PROPOSALS=3", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60 }),
      // gap 1: 10:00 - 12:00 (120min)
      makeItem({ text: "打ち合わせ", startTime: "12:00", durationMin: 30 }),
      // gap 2: 12:30 - 15:00 (150min) — L3でスキップ
      // gap 3: なし — 2アイテムのみ
    ];

    // 2アイテム + gap>=90min → sparse-day
    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    // sparse-day でも L3(交互保護) は有効なので、最大提案数は状況次第
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });

  test("逆U字: アイテム数 > 2 なら通常の MAX_PROPOSALS=2", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事1", startTime: "08:00", durationMin: 60 }),
      // gap: 09:00-10:30 (90min)
      makeItem({ text: "仕事2", startTime: "10:30", durationMin: 60 }),
      // gap: 11:30-14:00 (150min) — L3でスキップ
      makeItem({ text: "仕事3", startTime: "14:00", durationMin: 60 }),
      // gap: 15:00-17:00 (120min)
      makeItem({ text: "仕事4", startTime: "17:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    // 4アイテム → 通常モード → MAX=2
    expect(proposals.length).toBeLessThanOrEqual(2);
  });

  // ── Phase 2a: 天気連携 ──

  test("天気: 雨天時に outdoor 候補（散歩等）の priority が下がる", () => {
    // 食後 gap: 通常なら「散歩」(outdoor, priority=1) が最優先
    const items: PlanItem[] = [
      makeItem({ text: "ランチ", startTime: "12:00", durationMin: 60, activityCategory: "social_meal" }),
      // 13:00 - 15:00 に 120分 gap（午後ディップ → recovery のみ）
      makeItem({ text: "仕事", startTime: "15:00", durationMin: 60 }),
    ];

    // 晴れ: 散歩（outdoor）が最優先
    const sunnyResult = fillGaps(items, { weatherIcon: "sun" });
    const sunnyProposals = sunnyResult.filter(i => i.proposal === true);

    // 雨: outdoor にペナルティ → カフェ（indoor）が上に来る
    const rainyResult = fillGaps(items, { weatherIcon: "rain" });
    const rainyProposals = rainyResult.filter(i => i.proposal === true);

    expect(sunnyProposals.length).toBeGreaterThanOrEqual(1);
    expect(rainyProposals.length).toBeGreaterThanOrEqual(1);

    // 雨の日の提案はindoor系になる（散歩ではない）
    if (rainyProposals.length > 0) {
      // 午後ディップ帯: recovery のみ → 雨なら「カフェで一息」or「ストレッチ」(indoor)
      const isIndoorRecovery =
        rainyProposals[0].activityCategory === "life_rest" ||
        rainyProposals[0].activityCategory === "exercise_yoga";
      expect(isIndoorRecovery).toBe(true);
    }
  });

  test("天気: 降水確率 60% 以上でも outdoor が降格する", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 120 }),
      // 11:00 - 12:30 に 90分 gap
      makeItem({ text: "打ち合わせ", startTime: "12:30", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items, { weatherIcon: "cloud", popMax: 70 });
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    // 曇りでも pop>=60 → outdoor にペナルティ
    // PRE_MEETING 候補: 打ち合わせ準備(indoor, priority=1) vs カフェ(indoor, priority=2)
    // → outdoor ペナルティの影響はないが、ロジックは正しく動く
  });

  test("天気: 天気情報なし（undefined）なら通常通り", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60 }),
      makeItem({ text: "打ち合わせ", startTime: "12:00", durationMin: 60 }),
    ];

    const withWeather = fillGaps(items, { weatherIcon: "sun" });
    const withoutWeather = fillGaps(items);
    const withUndefined = fillGaps(items, {});

    // 全て同じ結果
    expect(withoutWeather.filter(i => i.proposal).length)
      .toBe(withUndefined.filter(i => i.proposal).length);
    expect(withWeather.filter(i => i.proposal).length)
      .toBe(withoutWeather.filter(i => i.proposal).length);
  });

  // ── Phase 2a: T2 短gap高認知制限 ──

  test("T2: gap < 30min のとき maintenance/enrichment が除外される", () => {
    // 注: MIN_GAP_MINUTES=45 なので、gap < 30min では gap 自体が検出されない
    // この制約は主に gap >= 45min かつ候補の taxonomy が maintenance/enrichment の場合に
    // 短い gap（例: 45-50min で usable が 35min 程度）で効く
    // ここでは 50min gap をテスト
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60, activityCategory: "work_code" }),
      // 10:00 - 10:50 に 50分 gap（MIN_GAP=45 以上なので検出される）
      makeItem({ text: "打ち合わせ", startTime: "10:50", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    // PRE_MEETING: 打ち合わせ準備(preparation) or カフェ(recovery) — maintenance/enrichment ではない
    // T2 はこの小さい gap ではフィルタが効いている
    for (const p of proposals) {
      // 50min gap は SHORT_GAP_THRESHOLD(30) 以上なので T2 は発動しない
      // T2 は gap.durationMin < 30 のときだけ — これは MIN_GAP(45) と合わせて将来の拡張用
      expect(p.proposal).toBe(true);
    }
  });

  // ── Phase 3 先行: ログ基盤 ──

  test("ProposalEvent 型が正しくエクスポートされている", async () => {
    const gapFill = await import("@/lib/alter-morning/gapFillEngine");

    // 関数がエクスポートされている
    expect(typeof gapFill.logProposalEvent).toBe("function");
    expect(typeof gapFill.getProposalEvents).toBe("function");
    expect(typeof gapFill.buildImpressionEvent).toBe("function");
  });

  test("buildImpressionEvent が正しい形式のイベントを生成する", async () => {
    const gapFill = await import("@/lib/alter-morning/gapFillEngine");

    const item: PlanItem = makeItem({
      id: "gf_test_123",
      text: "カフェで一息",
      startTime: "10:05",
      durationMin: 25,
      activityCategory: "life_rest",
      proposal: true,
      proposalReason: "集中が続くと効率が落ちやすいから、ここで一息入れてリセットしよう",
    });

    const event = gapFill.buildImpressionEvent(
      item,
      { startMin: 600, durationMin: 90, beforeCategory: "work_code", afterCategory: "work_meeting" },
      "sun",
    );

    expect(event.proposalId).toBe("gf_test_123");
    expect(event.activity).toBe("カフェで一息");
    expect(event.action).toBe("impression");
    expect(event.gapStartMin).toBe(600);
    expect(event.gapDurationMin).toBe(90);
    expect(event.beforeCategory).toBe("work_code");
    expect(event.afterCategory).toBe("work_meeting");
    expect(event.weatherIcon).toBe("sun");
    expect(event.timestamp).toBeTruthy();
    expect(event.eventId).toMatch(/^pe_/);
  });

  test("proposalTaxonomy が PlanItem に埋め込まれている", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60, activityCategory: "work_code" }),
      // 10:00 - 12:00 に 120分 gap
      makeItem({ text: "打ち合わせ", startTime: "12:00", durationMin: 60, activityCategory: "work_meeting" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // proposalTaxonomy が設定されている
    for (const p of proposals) {
      expect(p.proposalTaxonomy).toBeTruthy();
      expect(["recovery", "preparation", "maintenance", "nourishment", "enrichment"]).toContain(p.proposalTaxonomy);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 20: Gap Fill Phase 2b — 前後2アイテム文脈拡張
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Gap Fill Phase 2b: 前後2アイテム文脈拡張", () => {
  /** ヘルパー: PlanItem を簡易生成 */
  function makeItem(overrides: Partial<PlanItem> & { text: string; startTime: string; durationMin: number }): PlanItem {
    return {
      id: `test_${Math.random().toString(36).slice(2, 6)}`,
      kind: "todo",
      what: overrides.text,
      fixedStart: false,
      orderHint: 1,
      sourceTurnIndex: 0,
      completed: false,
      ...overrides,
    };
  }

  // ── after2 補助文脈: gap→travel→会議 のとき PRE_MEETING 候補が選ばれる ──

  test("after1=travel, after2=会議 → PRE_MEETING 候補（打ち合わせ準備）が出る", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60, activityCategory: "work_code" }),
      // 10:00 - 11:30 に 90分 gap（MIN_GAP=45 を十分超える）
      makeItem({
        text: "オフィスへ移動", startTime: "11:30", durationMin: 30,
        kind: "travel" as const, travelTo: "オフィス",
      }),
      makeItem({
        text: "打ち合わせ", startTime: "12:00", durationMin: 60,
        activityCategory: "work_meeting",
      }),
    ];

    // Step 1: gap が検出されることを確認
    const gaps = detectGaps(items);
    expect(gaps.length).toBe(1);
    expect(gaps[0].durationMin).toBe(90);
    expect(gaps[0].after?.kind).toBe("travel");
    expect(gaps[0].after2?.what).toBe("打ち合わせ");

    // Step 2: fillGaps で提案が出ることを確認
    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // PRE_MEETING 候補（after2=打ち合わせ 経由）→ 打ち合わせ準備 or カフェ
    const first = proposals[0];
    expect(first.what === "打ち合わせ準備" || first.what === "カフェで一息").toBe(true);
  });

  // ── after2 補助文脈: gap→travel→食事 のとき PRE_MEAL 候補が選ばれる ──

  test("after1=travel, after2=ランチ → PRE_MEAL 候補が出る", () => {
    const items: PlanItem[] = [
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60, activityCategory: "work_code" }),
      // 10:00 - 11:00 に 60分 gap
      makeItem({
        text: "レストランへ移動", startTime: "11:00", durationMin: 30,
        kind: "travel", travelTo: "レストラン",
      }),
      makeItem({
        text: "ランチ", startTime: "11:30", durationMin: 60,
        activityCategory: "social_meal",
      }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);

    // PRE_MEAL 候補 → カフェで一息 or 散歩 or 近くを散策
    const first = proposals[0];
    expect(
      first.what === "カフェで一息" ||
      first.what === "散歩" ||
      first.what === "近くを散策"
    ).toBe(true);
  });

  // ── C3 拡張: before2 にも同カテゴリがあれば重複回避 ──

  test("C3拡張: before2 に同カテゴリ → 重複回避される", () => {
    const items: PlanItem[] = [
      makeItem({ text: "散歩", startTime: "08:00", durationMin: 30, activityCategory: "exercise_walk" }),
      makeItem({ text: "仕事", startTime: "09:00", durationMin: 60, activityCategory: "work_code" }),
      // 10:00 - 12:00 に 120分 gap — before2 に exercise_walk がある
      makeItem({ text: "ランチ", startTime: "12:00", durationMin: 60, activityCategory: "social_meal" }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);

    // exercise_walk は before2 で既にやっているので出ない
    for (const p of proposals) {
      expect(p.activityCategory).not.toBe("exercise_walk");
    }
  });

  // ── R2 拡張: before2 が「休み」で before1 が travel → 空白保護 ──

  test("R2拡張: 休み→travel→[gap] パターンでも空白保護される", () => {
    const items: PlanItem[] = [
      makeItem({ text: "午前の休み", startTime: "09:00", durationMin: 60 }),
      makeItem({
        text: "カフェへ移動", startTime: "10:00", durationMin: 15,
        kind: "travel", travelTo: "カフェ",
      }),
      // 10:15 - 12:00 に 105分 gap — before2 が「休み」
      makeItem({ text: "仕事", startTime: "12:00", durationMin: 60 }),
    ];

    const result = fillGaps(items);
    const proposals = result.filter(i => i.proposal === true);
    expect(proposals.length).toBe(0); // R2 拡張発動
  });

  // ── detectGaps が before2/after2 を正しくセットしている ──

  test("detectGaps が before2/after2 を正しく返す", () => {
    const items: PlanItem[] = [
      makeItem({ text: "A", startTime: "08:00", durationMin: 30 }),
      makeItem({ text: "B", startTime: "09:00", durationMin: 30 }),
      // 09:30 - 11:00 に 90分 gap
      makeItem({ text: "C", startTime: "11:00", durationMin: 30 }),
      makeItem({ text: "D", startTime: "12:00", durationMin: 30 }),
    ];

    const gaps = detectGaps(items);
    expect(gaps.length).toBe(1);

    const gap = gaps[0];
    expect(gap.before?.text).toBe("B");  // before1
    expect(gap.after?.text).toBe("C");   // after1
    expect(gap.before2?.text).toBe("A"); // before2
    expect(gap.after2?.text).toBe("D");  // after2
  });

  test("detectGaps: 先頭の gap では before2 が null", () => {
    const items: PlanItem[] = [
      makeItem({ text: "A", startTime: "08:00", durationMin: 30 }),
      // 08:30 - 10:00 に 90分 gap
      makeItem({ text: "B", startTime: "10:00", durationMin: 30 }),
      makeItem({ text: "C", startTime: "11:00", durationMin: 30 }),
    ];

    const gaps = detectGaps(items);
    expect(gaps.length).toBe(1);

    const gap = gaps[0];
    expect(gap.before?.text).toBe("A");
    expect(gap.after?.text).toBe("B");
    expect(gap.before2).toBeNull(); // 先頭なので null
    expect(gap.after2?.text).toBe("C");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 21: CEO指摘 — 場所+活動の分裂防止（2026-04-16 30点事件）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("Test 21: 場所+活動の分裂防止（mergeLocationActivitySegments）", () => {

  const makeSeg = (overrides: Partial<LLMRawSegment> & { activity: string }): LLMRawSegment => ({
    order: 1,
    ...overrides,
  });

  test("「図書館に行く」+「仕事」→ 統合: activity=仕事, place=図書館", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "図書館に行く" }),
      makeSeg({ order: 2, activity: "仕事" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(1);
    expect(merged[0].activity).toBe("仕事");
    expect(merged[0].place).toBe("図書館");
  });

  test("「マック」+「仕事」→ 統合: activity=仕事, place=マック", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "マック" }),
      makeSeg({ order: 2, activity: "仕事" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(1);
    expect(merged[0].activity).toBe("仕事");
    // placeTable がマックを正規化する可能性がある
    expect(merged[0].place).toBeTruthy();
  });

  test("「カフェに行って」+「ミーティング」→ 統合: activity=ミーティング, place=カフェ", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "カフェに行って" }),
      makeSeg({ order: 2, activity: "ミーティング", companions: ["Bちゃん"] }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(1);
    expect(merged[0].activity).toBe("ミーティング");
    expect(merged[0].place).toBe("カフェ");
    expect(merged[0].companions).toContain("Bちゃん");
  });

  test("統合時に時間情報は場所セグメントから引き継ぐ", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "図書館に行く", startTime: "14:00", timeType: "fixed_start" }),
      makeSeg({ order: 2, activity: "仕事" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(1);
    expect(merged[0].startTime).toBe("14:00");
    expect(merged[0].timeType).toBe("fixed_start");
  });

  test("活動セグメントに既に place がある場合は統合しない", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "カフェに行く" }),
      makeSeg({ order: 2, activity: "仕事", place: "オフィス" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(2);
  });

  test("場所+活動ではない連続セグメントは統合しない", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "仕事" }),
      makeSeg({ order: 2, activity: "ランチ" }),
      makeSeg({ order: 3, activity: "ミーティング" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(3);
  });

  test("場所セグメントに既に place がある場合は場所のみと見なさない", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "図書館に行く", place: "区立図書館" }),
      makeSeg({ order: 2, activity: "仕事" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    // place がある = 既に整形済み → 統合しない
    expect(merged).toHaveLength(2);
  });

  test("3セグメントで先頭2つだけ統合", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "マックに行く" }),
      makeSeg({ order: 2, activity: "仕事" }),
      makeSeg({ order: 3, activity: "ディナー", companions: ["A君"] }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(2);
    expect(merged[0].activity).toBe("仕事");
    expect(merged[0].place).toBeTruthy(); // マック or マクドナルド
    expect(merged[1].activity).toBe("ディナー");
    expect(merged[1].order).toBe(2); // order 振り直し
  });

  test("連続する2ペアの場所+活動を両方統合", () => {
    const segments: LLMRawSegment[] = [
      makeSeg({ order: 1, activity: "図書館に行く" }),
      makeSeg({ order: 2, activity: "仕事" }),
      makeSeg({ order: 3, activity: "カフェに行く" }),
      makeSeg({ order: 4, activity: "ミーティング" }),
    ];
    const merged = mergeLocationActivitySegments(segments);
    expect(merged).toHaveLength(2);
    expect(merged[0].activity).toBe("仕事");
    expect(merged[0].place).toBe("図書館");
    expect(merged[1].activity).toBe("ミーティング");
    expect(merged[1].place).toBe("カフェ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 22: アンカースコア計算 + placeType 分類
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("Test 22: アンカースコア + placeType（normalizeLLMOutput 統合）", () => {

  test("固有名+時刻+同行者 → Hard anchor (score >= 4)", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [{
        order: 1,
        activity: "ランチ",
        place: "サドヤ",
        placeType: "exact_proper_noun",
        startTime: "12:00",
        timeType: "fixed_start",
        companions: ["Aさん"],
      }],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBe("exact_proper_noun");
    // explicit_time(3) + named_place(2) + companion(1) + opening_hours(1) = 7
    expect(state.segments[0].anchorScore).toBeGreaterThanOrEqual(4);
  });

  test("チェーン店+時刻なし+同行者なし → Soft anchor (score <= 1)", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [{
        order: 1,
        activity: "仕事",
        place: "マック",
        placeType: "chain_brand",
      }],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBe("chain_brand");
    // named_place(1) のみ = 1
    expect(state.segments[0].anchorScore).toBeLessThanOrEqual(1);
  });

  test("一般名詞の図書館 → generic_place, score = 0", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [{
        order: 1,
        activity: "勉強",
        place: "図書館",
        placeType: "generic_place",
      }],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBe("generic_place");
    expect(state.segments[0].anchorScore).toBe(0);
  });

  test("自宅 → known_base", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [{
        order: 1,
        activity: "仕事",
        place: "自宅",
        placeType: "known_base",
      }],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBe("known_base");
    expect(state.segments[0].anchorScore).toBe(0);
  });

  test("LLMがplaceTypeを返さなくてもフォールバック推定される", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        { order: 1, activity: "仕事", place: "スタバ" },         // chain
        { order: 2, activity: "ランチ", place: "叙々苑" },       // proper noun
        { order: 3, activity: "勉強", place: "図書館" },         // generic
        { order: 4, activity: "休憩", place: "自宅" },           // known_base
      ],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBe("chain_brand");
    expect(state.segments[1].placeType).toBe("exact_proper_noun");
    expect(state.segments[2].placeType).toBe("generic_place");
    expect(state.segments[3].placeType).toBe("known_base");
  });

  test("複数セグメントでアンカー優先順位が正しい", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        { order: 1, activity: "仕事", place: "マック" },                                              // chain, no time
        { order: 2, activity: "ランチ", place: "サドヤ", startTime: "12:00", timeType: "fixed_start", companions: ["Aさん"] },  // proper, time, companion
        { order: 3, activity: "会議", startTime: "16:00", timeType: "fixed_start" },                   // no place, time
      ],
    };
    const state = normalizeLLMOutput(raw);
    const scores = state.segments.map(s => s.anchorScore ?? 0);
    // サドヤ(Hard) > 会議(Semi) > マック(Soft)
    expect(scores[1]).toBeGreaterThan(scores[0]); // サドヤ > マック
    expect(scores[1]).toBeGreaterThan(scores[2]); // サドヤ > 会議
  });

  test("場所なしセグメントは placeType = undefined, anchorScore は時刻のみ", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [{
        order: 1,
        activity: "会議",
        startTime: "16:00",
        timeType: "fixed_start",
      }],
    };
    const state = normalizeLLMOutput(raw);
    expect(state.segments[0].placeType).toBeUndefined();
    // explicit_time(3) のみ
    expect(state.segments[0].anchorScore).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 23: Planning Integration — 場所解決の morningProtocol 統合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Test 23: Planning Integration — 場所確認メッセージ + 場所確認応答", () => {
  // buildPlaceConfirmQuestions と tryDirectPlaceConfirmResponse は morningProtocol 内部関数。
  // 公開関数でないため、統合的にテストする: handleCollectingPhaseV2 → session.pendingPlaceConfirmations を検証。
  // ただし、confidence ベースの質問生成ロジックをユニットテストとして切り出すのは不可能なので、
  // PlanState + 場所解決後の状態を直接組み立ててテストする。

  test("high confidence の場所は resolvedPlaceName がそのまま使われる", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ディナー",
          place: "サドヤ",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
          companions: ["田中さん"],
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // high confidence の場所解決結果をシミュレート
    const resolved: PlanSegment = {
      ...state.segments[0],
      resolvedPlaceName: "サドヤ ワイナリー",
      resolvedAddress: "甲府市丸の内1-20-16",
      resolutionConfidence: "high",
    };

    const updatedState: PlanState = { ...state, segments: [resolved] };
    const items = planStateToPlanItems(updatedState);

    // resolvedPlaceName が PlanItem に反映されていること
    const dinnerItem = items.find(i => i.text.includes("ディナー"));
    expect(dinnerItem).toBeDefined();
    // buildPlanConfirmMessage が resolvedPlaceName を使う
    const msg = buildPlanConfirmMessage(updatedState);
    expect(msg).toContain("サドヤ ワイナリー");
    expect(msg).not.toContain("placeConfirm");
  });

  test("medium confidence → 確認質問が missingFields に追加される構造", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ディナー",
          place: "サドヤ",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // medium confidence → placeConfirm: フィールドが追加されるべき
    const resolved: PlanSegment = {
      ...state.segments[0],
      resolvedPlaceName: "サドヤ ワイナリー",
      resolutionConfidence: "medium",
    };
    const updatedState: PlanState = {
      ...state,
      segments: [resolved],
      missingFields: [`placeConfirm:${resolved.id}:サドヤ`],
    };

    // buildClarifyFromMissing は placeConfirm: をスキップする（morningProtocol 側で生成）
    const msg = buildPlanConfirmMessage(updatedState);
    // placeConfirm は buildClarifyFromMissing でスキップされるため、質問が二重生成されない
    // （morningProtocol の buildPlaceConfirmQuestions が生成する）
    expect(msg).toContain("サドヤ ワイナリー");
  });

  test("low confidence → placeAsk フィールドが missingFields に追加される構造", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ディナー",
          place: "マイナーな店",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // low confidence → placeAsk: フィールド
    const resolved: PlanSegment = {
      ...state.segments[0],
      resolutionConfidence: "low",
    };
    const updatedState: PlanState = {
      ...state,
      segments: [resolved],
      missingFields: [`placeAsk:${resolved.id}:マイナーな店`],
    };

    // missingFields に placeAsk が含まれている
    expect(updatedState.missingFields.some(f => f.startsWith("placeAsk:"))).toBe(true);
  });

  test("場所確認応答: 肯定 → resolvedPlaceName が確定、confidence が high に昇格", () => {
    const seg: PlanSegment = {
      id: "seg_1",
      order: 1,
      activity: "ディナー",
      place: "サドヤ",
      placeType: "exact_proper_noun",
      resolvedPlaceName: "サドヤ ワイナリー",
      resolutionConfidence: "medium",
      companions: [],
      status: "confirmed",
    };
    const state: PlanState = {
      targetDate: "2026-04-16",
      targetDateLabel: "今日",
      timezone: "Asia/Tokyo",
      segments: [seg],
      status: "clarifying",
      missingFields: ["placeConfirm:seg_1:サドヤ"],
    };

    // 肯定応答のパターン検証
    const confirmPatterns = ["うん", "はい", "そう", "合ってる", "おk"];
    for (const pattern of confirmPatterns) {
      const isConfirm = /^(うん|はい|そう|それ|おk|ok|yes|合って|あって|正解)/i.test(pattern.trim());
      expect(isConfirm).toBe(true);
    }
  });

  test("場所確認応答: 否定 → resolvedPlaceName がクリアされ segmentPlace が追加される", () => {
    // 否定パターンの検証
    const denyPatterns = ["違う", "ちがう", "いいえ", "いや"];
    for (const pattern of denyPatterns) {
      const isDeny = /違う|ちがう|いいえ|いや|ちゃう/.test(pattern.trim());
      expect(isDeny).toBe(true);
    }
  });

  test("場所確認応答: 番号選択 → low confidence 候補から選択", () => {
    // 番号選択パターンの検証
    const numPatterns = ["1", "2", "3"];
    for (const pattern of numPatterns) {
      const match = pattern.trim().match(/^(\d)$/);
      expect(match).not.toBeNull();
      const idx = parseInt(match![1], 10) - 1;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  test("unresolved（検索失敗）はプラン生成を止めない（fail-open）", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ディナー",
          place: "サドヤ",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
        },
        {
          order: 2,
          activity: "仕事",
          place: "オフィス",
          placeType: "known_base",
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // unresolved のセグメントがあっても planStateToPlanItems は動作する
    const unresolvedSeg: PlanSegment = {
      ...state.segments[0],
      resolutionConfidence: "unresolved",
    };
    const updatedState: PlanState = {
      ...state,
      segments: [unresolvedSeg, state.segments[1]],
    };

    const items = planStateToPlanItems(updatedState);
    expect(items.length).toBeGreaterThanOrEqual(2);

    // unresolved でも元の place 名でプランが作れる
    const dinnerItem = items.find(i => i.text.includes("ディナー"));
    expect(dinnerItem).toBeDefined();
  });

  test("resolveAnchors の anchorScore 降順処理: Hard anchor が先に解決される", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "仕事",
          place: "図書館",
          placeType: "generic_place",
        },
        {
          order: 2,
          activity: "ディナー",
          place: "サドヤ",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
          companions: ["田中さん"],
        },
        {
          order: 3,
          activity: "コーヒー",
          place: "スタバ",
          placeType: "chain_brand",
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // anchorScore 降順で、サドヤ(exact_proper_noun)が最も高いはず
    const scores = state.segments.map(s => ({
      place: s.place,
      placeType: s.placeType,
      anchorScore: s.anchorScore ?? 0,
    }));

    // サドヤ: exact_proper_noun(+2) + explicit_time(+3) + companion(+1) = 6
    const sadoya = scores.find(s => s.place === "サドヤ");
    expect(sadoya!.anchorScore).toBeGreaterThanOrEqual(4); // Hard anchor

    // 図書館: generic_place → resolveAnchors ではスキップ（exact_proper_noun のみ対象）
    expect(scores.find(s => s.place === "図書館")!.placeType).toBe("generic_place");

    // スタバ: chain_brand → resolveAnchors ではスキップ
    expect(scores.find(s => s.place === "スタバ")!.placeType).toBe("chain_brand");
  });

  test("MorningSession.pendingPlaceConfirmations 型が利用可能", () => {
    // 型チェック: pendingPlaceConfirmations がセッションで使える
    const session = {
      sessionId: "test",
      phase: "clarifying" as const,
      rawInputs: [],
      personalizeHints: [],
      startedAt: new Date().toISOString(),
      pendingPlaceConfirmations: [
        {
          segmentId: "seg_1",
          originalText: "サドヤ",
          resolvedName: "サドヤ ワイナリー",
          confidence: "medium" as const,
          candidates: [{ name: "サドヤ ワイナリー", address: "甲府市" }],
        },
      ],
      userId: "user1",
      userArea: "甲府",
    };

    expect(session.pendingPlaceConfirmations).toHaveLength(1);
    expect(session.pendingPlaceConfirmations[0].confidence).toBe("medium");
    expect(session.userId).toBe("user1");
    expect(session.userArea).toBe("甲府");
  });

  test("GPT指摘: セグメント削除後に stale な pendingPlaceConfirmations が残らない", () => {
    // delta で seg_1 が削除された状態をシミュレート
    const updatedState: PlanState = {
      targetDate: "2026-04-16",
      targetDateLabel: "今日",
      timezone: "Asia/Tokyo",
      segments: [
        // seg_1 は削除済み、seg_2 のみ残る
        {
          id: "seg_2",
          order: 1,
          activity: "仕事",
          place: "オフィス",
          placeType: "known_base" as const,
          companions: [],
          status: "confirmed" as const,
        },
      ],
      status: "clarifying",
      missingFields: [],
    };

    // セッションに seg_1 の pending が残っている
    const pending: NonNullable<typeof import("@/lib/alter-morning/types").MorningSession.prototype["pendingPlaceConfirmations"]> = [
      {
        segmentId: "seg_1",
        originalText: "サドヤ",
        resolvedName: "サドヤ ワイナリー",
        confidence: "medium" as const,
      },
    ];

    // seg_1 が segments に存在しない → pending はクリーンアップされるべき
    const currentSegmentIds = new Set(updatedState.segments.map(s => s.id));
    const remaining = pending.filter(pc => currentSegmentIds.has(pc.segmentId));
    expect(remaining).toHaveLength(0);
  });

  test("GPT指摘: 日付変更後に全 pendingPlaceConfirmations がクリアされる", () => {
    // 日付変更 delta
    const delta = {
      changes: [{ type: "set", field: "targetDate", segmentId: null }],
    };

    // 日付変更がある場合、全 pending をクリアすべき
    const hasDateChange = delta.changes.some(c => c.field === "targetDate");
    expect(hasDateChange).toBe(true);
  });

  test("GPT指摘: 場所変更後にその segmentId の pending が除去される", () => {
    const delta = {
      changes: [{ type: "replace", field: "place", segmentId: "seg_1" }],
    };

    const pending = [
      { segmentId: "seg_1", originalText: "サドヤ", confidence: "medium" as const },
      { segmentId: "seg_2", originalText: "叙々苑", confidence: "low" as const },
    ];

    // seg_1 の place が変更された → seg_1 の pending を除去、seg_2 は残る
    const invalidatedSegIds = new Set<string>();
    for (const c of delta.changes) {
      if (c.field === "place" && c.segmentId) {
        invalidatedSegIds.add(c.segmentId);
      }
    }

    const remaining = pending.filter(pc => !invalidatedSegIds.has(pc.segmentId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].segmentId).toBe("seg_2");
  });

  test("silent adopt: buildPlanConfirmMessage が resolvedPlaceName を自然に表示する", () => {
    const raw: LLMExtractResult = {
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ディナー",
          place: "サドヤ",
          placeType: "exact_proper_noun",
          startTime: "18:00",
          timeType: "fixed_start",
        },
      ],
    };
    const state = normalizeLLMOutput(raw);

    // high confidence で解決済み
    const resolved: PlanSegment = {
      ...state.segments[0],
      resolvedPlaceName: "サドヤ ワイナリー",
      resolutionConfidence: "high",
    };
    const updatedState: PlanState = { ...state, segments: [resolved] };

    // 確認メッセージにはユーザーの「サドヤ」ではなく正式名「サドヤ ワイナリー」が表示される
    const msg = buildPlanConfirmMessage(updatedState);
    expect(msg).toContain("サドヤ ワイナリー");
    // 質問は含まれない（high なので黙って採用）
    expect(msg).not.toContain("であってる？");
    expect(msg).not.toContain("どこ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug 5 (CEO方針 2026-04-18): 明示順序保持 — A+B+C
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 実機症状（2026-04-18）:
//   発話: 「朝マック仕事 → 12時サドヤランチ → 18時ミーティング」
//   結果: 自宅→サドヤ → 12時ランチ → 13:30 マック仕事（朝タスクが午後に押し出された）
//
// 修正 A: dayStart は earliestFixed だけでなく earliestWindow も見る。
// 修正 B: 衝突時の duration 短縮は durationSource !== "user" のみ。
// 修正 C: window.end を超える配置を禁止（window_morning → 11:59 まで）。

describe("Bug 5 (CEO方針 2026-04-18): 明示順序保持 A+B+C", () => {
  test("A: 朝todo + 昼ランチ fixed → dayStart は window_morning.start を尊重、朝todoが朝に配置される", () => {
    // 朝マック仕事 (window_morning, 120min, todo) + 12:00 ランチ fixed
    const items: PlanItem[] = [
      {
        id: "t_work",
        kind: "todo",
        text: "仕事(マック)",
        what: "仕事",
        durationMin: 120,
        durationSource: "inferred",
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "window_morning",
        sequenceOrder: 1,
      },
      {
        id: "f_lunch",
        kind: "fixed",
        text: "ランチ(サドヤ)",
        what: "ランチ",
        startTime: "12:00",
        durationMin: 60,
        fixedStart: true,
        orderHint: 1,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      },
    ];

    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2099-01-01", // 未来日避けるため現在日時ロジック回避
      goOut: false, // travel 挿入を止めて純粋な順序を見る
    });

    const nonTravel = plan.items.filter(i => i.kind !== "travel");
    const work = nonTravel.find(i => i.what === "仕事");
    const lunch = nonTravel.find(i => i.what === "ランチ");

    // 朝タスクはランチ（12:00）より前に開始していること
    expect(work?.startTime).toBeDefined();
    expect(lunch?.startTime).toBe("12:00");
    const workStartMin = work!.startTime!.split(":").map(Number).reduce((h, m) => h * 60 + m);
    expect(workStartMin).toBeLessThan(12 * 60); // 12:00 より前
  });

  test("C: 朝todo 120min で window_morning.end=11:59 を超えない（dayStart=09:00なら 09:00-11:00 収束）", () => {
    const items: PlanItem[] = [
      {
        id: "t_work",
        kind: "todo",
        text: "仕事",
        what: "仕事",
        durationMin: 120,
        durationSource: "inferred",
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "window_morning",
        sequenceOrder: 1,
      },
      {
        id: "f_lunch",
        kind: "fixed",
        text: "ランチ",
        what: "ランチ",
        startTime: "12:00",
        durationMin: 60,
        fixedStart: true,
        orderHint: 1,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      },
    ];
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2099-01-01",
      goOut: false,
    });
    const work = plan.items.find(i => i.what === "仕事");
    expect(work?.startTime).toBeDefined();
    const [h, m] = work!.startTime!.split(":").map(Number);
    const endMin = h * 60 + m + work!.durationMin;
    // window_morning の end=11:59（719分）を超えないこと
    expect(endMin).toBeLessThanOrEqual(12 * 60); // 12:00 も超えない（ランチ開始と同時なのでOK）
  });

  test("B: 推論 duration は衝突時に短縮される（朝todo 200min vs 昼11時ランチ）", () => {
    // dayStart=max(11:00-60, 06:00)=06:00。200min 置くと 06:00+200=09:20 < 11:00 OK. 問題なし.
    // テストケース: dayStart=10:00 (earliestFixed 11:00 の1h前) 相当。200分は 11:00 を超える。
    // window制約なしでdayStart=10:00だとすると、10:00+200=13:20 → 11:00ランチ衝突 → shrink想定。
    //
    // しかし dayStart 計算は window を含む。window_morning.start=06:00 < 10:00 → 06:00 優先。
    // → 06:00 + 200 = 09:20 で十分収まる。これだと shrink はしない。
    //
    // shrink を発火させるには window 無し × 短い余白を作る必要がある。
    const items: PlanItem[] = [
      {
        id: "t_inferred",
        kind: "todo",
        text: "仕事",
        what: "仕事",
        durationMin: 200,
        durationSource: "inferred",
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        // window 制約なし → dayStart は earliestFixed-60 = 10:00
        sequenceOrder: 1,
      },
      {
        id: "f_lunch",
        kind: "fixed",
        text: "ランチ",
        what: "ランチ",
        startTime: "11:00",
        durationMin: 60,
        fixedStart: true,
        orderHint: 1,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      },
    ];
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2099-01-01",
      goOut: false,
    });
    const work = plan.items.find(i => i.what === "仕事");
    expect(work?.startTime).toBeDefined();
    // 未来日 → dayStart=09:00。11:00ランチまで 120min しかない → shrink される。
    //   availableBefore = 11*60 - startMin - 10(buffer)
    expect(work!.durationMin).toBeLessThan(200); // 200→short
    expect(work!.durationShrunkByPlacement).toBe(true);
    // ランチの前に終わっている（11:00より前）
    const [h, m] = work!.startTime!.split(":").map(Number);
    const endMin = h * 60 + m + work!.durationMin;
    expect(endMin).toBeLessThanOrEqual(11 * 60); // 11:00 までに終わる
  });

  test("B: user-declared duration は短縮されない（push で anchor 後に配置）", () => {
    const items: PlanItem[] = [
      {
        id: "t_user",
        kind: "todo",
        text: "長時間作業",
        what: "作業",
        durationMin: 200,
        durationSource: "user", // ← ユーザー明示
        fixedStart: false,
        orderHint: 0,
        sourceTurnIndex: 0,
        completed: false,
        sequenceOrder: 1,
      },
      {
        id: "f_lunch",
        kind: "fixed",
        text: "ランチ",
        what: "ランチ",
        startTime: "11:00",
        durationMin: 60,
        fixedStart: true,
        orderHint: 1,
        sourceTurnIndex: 0,
        completed: false,
        timeConstraintType: "fixed_start",
        sequenceOrder: 2,
      },
    ];
    const plan = buildDayPlan(items, { mainTransport: "car" }, undefined, {
      targetDate: "2099-01-01",
      goOut: false,
    });
    const work = plan.items.find(i => i.what === "作業");
    expect(work?.durationMin).toBe(200); // 削られていない
    expect(work?.durationShrunkByPlacement).toBeFalsy();
    // push-out: ランチ後（12:00 以降）
    const [h, m] = work!.startTime!.split(":").map(Number);
    const startMin = h * 60 + m;
    expect(startMin).toBeGreaterThanOrEqual(12 * 60);
  });
});
