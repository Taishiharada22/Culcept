/**
 * Bug 1 + Bug 2 暫定止血テスト (handoff 2026-04-18)
 *
 * Bug 1: Turn 1 place hallucinate — LLM world knowledge 由来の、
 *        発話に出現しない proper noun を拒否する。
 * Bug 2: 「朝はマックに変更」で segmentId=null → applyDelta 黙殺。
 *        seg.startTime からの時間帯逆引きで救済。
 */

import { describe, test, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  type PlanState,
  type LLMExtractResult,
  resetSegmentCounter,
} from "@/lib/alter-morning/planState";
import { preloadVocabulary } from "@/lib/alter-morning/intentParser";

vi.mock("server-only", () => ({}));

let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;
let resolveSegmentIdFromHint: typeof import("@/lib/alter-morning/llmDeltaParser").resolveSegmentIdFromHint;

beforeAll(async () => {
  await preloadVocabulary();
  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
  const delta = await import("@/lib/alter-morning/llmDeltaParser");
  resolveSegmentIdFromHint = delta.resolveSegmentIdFromHint;
});

beforeEach(() => {
  resetSegmentCounter();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug 1 triage: utterance-source gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Bug 1 triage: userMessage utterance-source gate", () => {
  const baseRaw = (place: string | null): LLMExtractResult => ({
    targetDate: "today",
    segments: [
      {
        order: 1,
        startTime: "09:00",
        activity: "カフェ",
        place,
        placeType: null,
        companions: [],
        timeHint: null,
        transport: null,
      } as unknown as LLMExtractResult["segments"][number],
    ],
    transport: null,
    endTime: null,
    endAction: null,
    goOut: true,
    startPlace: null,
    departureTime: null,
  });

  test("発話外の proper noun「二藍」は拒否される（userMessage 指定）", () => {
    const state = normalizeLLMOutput(
      baseRaw("二藍"),
      "朝はどこかで軽くカフェしたい",
    );
    expect(state.segments[0].place).toBeUndefined();
  });

  test("発話に含まれる proper noun「サドヤ」は通過する", () => {
    const state = normalizeLLMOutput(
      baseRaw("サドヤ"),
      "朝はサドヤでコーヒー飲みたい",
    );
    expect(state.segments[0].place).toBe("サドヤ");
  });

  test("chain brand「マック」は発話になくても通過（辞書由来）", () => {
    const state = normalizeLLMOutput(
      baseRaw("マック"),
      "朝ご飯を軽く済ませたい",
    );
    expect(state.segments[0].place).toBe("マック");
  });

  test("known base「自宅」は発話になくても通過", () => {
    const state = normalizeLLMOutput(
      baseRaw("自宅"),
      "今日はゆっくり過ごす",
    );
    expect(state.segments[0].place).toBe("自宅");
  });

  test("generic place「カフェ」は発話になくても通過", () => {
    const state = normalizeLLMOutput(
      baseRaw("カフェ"),
      "朝はどこかで一息つきたい",
    );
    expect(state.segments[0].place).toBe("カフェ");
  });

  test("userMessage 未指定時は gate を skip（既存経路の互換性）", () => {
    const state = normalizeLLMOutput(baseRaw("二藍"));
    expect(state.segments[0].place).toBe("二藍");
  });

  test("句読点を含む発話でも一致できる（正規化で吸収）", () => {
    const state = normalizeLLMOutput(
      baseRaw("サドヤ"),
      "朝は、サドヤで、コーヒー。",
    );
    expect(state.segments[0].place).toBe("サドヤ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bug 2 triage: startTime → timeHint 逆引き
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Bug 2 triage: resolveSegmentIdFromHint startTime reverse lookup", () => {
  function mkState(segs: Array<{
    startTime?: string;
    timeHint?: "morning" | "noon" | "afternoon" | "evening";
    activity?: string;
    place?: string;
  }>): PlanState {
    return {
      targetDate: "2026-04-21",
      targetDateLabel: "今日",
      timezone: "Asia/Tokyo",
      segments: segs.map((s, i) => ({
        id: `seg-${i + 1}`,
        order: i + 1,
        timeHint: s.timeHint,
        startTime: s.startTime,
        timeConstraint: undefined,
        activity: s.activity ?? "予定",
        activityCanonical: s.activity ?? "予定",
        activityCategory: undefined,
        estimatedDurationMin: 60,
        place: s.place,
        placeCanonical: s.place,
        placeCategory: undefined,
        placeType: undefined,
        anchorScore: 0,
        placeSearchHint: undefined,
        companions: [],
        transport: undefined,
        status: "tentative" as const,
      })) as PlanState["segments"],
      transport: undefined,
      endTime: undefined,
      endAction: undefined,
      endpointType: undefined,
      goOut: true,
      startPoint: undefined,
      departureTime: undefined,
      departureTimeConstraint: undefined,
      missingFields: [],
    } as unknown as PlanState;
  }

  test("「朝」hint → startTime=09:00 の segment に解決（timeHint 未設定）", () => {
    const state = mkState([
      { startTime: "09:00", activity: "カフェ" },
      { startTime: "12:30", activity: "ランチ" },
    ]);
    const id = resolveSegmentIdFromHint("朝", state);
    expect(id).toBe("seg-1");
  });

  test("「昼」hint → startTime=12:30 の segment に解決", () => {
    const state = mkState([
      { startTime: "09:00", activity: "カフェ" },
      { startTime: "12:30", activity: "食事" },
    ]);
    const id = resolveSegmentIdFromHint("昼", state);
    expect(id).toBe("seg-2");
  });

  test("「午後」hint → startTime=15:00 の segment に解決", () => {
    const state = mkState([
      { startTime: "09:00", activity: "朝練" },
      { startTime: "15:00", activity: "打合せ" },
    ]);
    const id = resolveSegmentIdFromHint("午後", state);
    expect(id).toBe("seg-2");
  });

  test("「夜」hint → startTime=19:30 の segment に解決", () => {
    const state = mkState([
      { startTime: "12:00", activity: "ランチ" },
      { startTime: "19:30", activity: "会食" },
    ]);
    const id = resolveSegmentIdFromHint("夜", state);
    expect(id).toBe("seg-2");
  });

  test("timeHint 直接一致が優先される（逆引き fallback は後段のみ）", () => {
    const state = mkState([
      { startTime: "11:30", timeHint: "morning", activity: "朝活" }, // noon 相当の時刻だが timeHint=morning
      { startTime: "09:00", activity: "カフェ" }, // 逆引きで morning 相当
    ]);
    const id = resolveSegmentIdFromHint("朝", state);
    expect(id).toBe("seg-1"); // timeHint 直接一致が勝つ
  });

  test("startTime 不正形式は逆引きしない（解決失敗）", () => {
    const state = mkState([
      { startTime: "invalid", activity: "カフェ" },
    ]);
    const id = resolveSegmentIdFromHint("朝", state);
    expect(id).toBeNull();
  });

  test("startTime 欠落時は逆引きしない（解決失敗）", () => {
    const state = mkState([{ activity: "カフェ" }]);
    const id = resolveSegmentIdFromHint("朝", state);
    expect(id).toBeNull();
  });

  test("境界時刻: 11:00 は noon", () => {
    const state = mkState([{ startTime: "11:00", activity: "早昼" }]);
    expect(resolveSegmentIdFromHint("昼", state)).toBe("seg-1");
  });

  test("境界時刻: 10:59 は morning", () => {
    const state = mkState([{ startTime: "10:59", activity: "朝活" }]);
    expect(resolveSegmentIdFromHint("朝", state)).toBe("seg-1");
  });

  test("境界時刻: 17:00 は evening", () => {
    const state = mkState([{ startTime: "17:00", activity: "夕飯" }]);
    expect(resolveSegmentIdFromHint("夜", state)).toBe("seg-1");
  });
});
