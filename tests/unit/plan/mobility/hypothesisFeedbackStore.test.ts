import { describe, it, expect } from "vitest";
import {
  buildFeedbackEntry,
  parseFeedbackStore,
  setFeedback,
  getFeedback,
  EMPTY_FEEDBACK_STORE,
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackEntry,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";

describe("buildFeedbackEntry (v0-E kind 判定)", () => {
  it("readOnly → 記録しない(null)", () => {
    expect(buildFeedbackEntry({ surfacedMode: "train", chosenMode: "walk", readOnly: true })).toBeNull();
  });

  it("仮説非表示(surfacedMode null) → 記録しない(null)", () => {
    expect(buildFeedbackEntry({ surfacedMode: null, chosenMode: "walk", readOnly: false })).toBeNull();
  });

  it("仮説後に同じ mode → confirmation", () => {
    expect(buildFeedbackEntry({ surfacedMode: "train", chosenMode: "train", readOnly: false })).toEqual({
      kind: "confirmation",
      surfacedMode: "train",
      chosenMode: "train",
    });
  });

  it("★仮説後に違う mode → explicitCorrection（surfacedMode/chosenMode 保存で再現可能）", () => {
    expect(buildFeedbackEntry({ surfacedMode: "train", chosenMode: "walk", readOnly: false })).toEqual({
      kind: "explicitCorrection",
      surfacedMode: "train",
      chosenMode: "walk",
    });
  });
});

describe("hypothesisFeedbackStore (parse/set/get・fail-open)", () => {
  const E: HypothesisFeedbackEntry = { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk" };

  it("破損 → fail-open(空)", () => {
    expect(parseFeedbackStore("not json")).toEqual(EMPTY_FEEDBACK_STORE);
  });

  it("version 不一致 → fail-open(空)", () => {
    expect(parseFeedbackStore(JSON.stringify({ version: 999, byDay: {} }))).toEqual(EMPTY_FEEDBACK_STORE);
  });

  it("set → get（kind+surfacedMode+chosenMode 保存）", () => {
    const s = setFeedback(EMPTY_FEEDBACK_STORE, "2026-06-01", "a__b", E);
    expect(getFeedback(s, "2026-06-01", "a__b")).toEqual(E);
  });

  it("same day/same leg は最後の1件に上書き（重複しない）", () => {
    let s = setFeedback(EMPTY_FEEDBACK_STORE, "2026-06-01", "a__b", {
      kind: "confirmation",
      surfacedMode: "train",
      chosenMode: "train",
    });
    s = setFeedback(s, "2026-06-01", "a__b", E);
    expect(getFeedback(s, "2026-06-01", "a__b")).toEqual(E);
    expect(Object.keys(s.byDay["2026-06-01"])).toHaveLength(1);
  });

  it("round-trip: serialize → parse で復元", () => {
    const s = setFeedback(EMPTY_FEEDBACK_STORE, "2026-06-01", "a__b", E);
    expect(parseFeedbackStore(JSON.stringify(s))).toEqual(s);
  });

  it("不正 entry（kind=selected 等）は除外", () => {
    const bad = JSON.stringify({
      version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
      byDay: { "2026-06-01": { a__b: { kind: "selected", surfacedMode: "train", chosenMode: "walk" } } },
    });
    expect(parseFeedbackStore(bad).byDay["2026-06-01"]).toBeUndefined();
  });
});
