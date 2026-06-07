import { describe, it, expect } from "vitest";
import {
  buildFeedbackEntry,
  parseFeedbackStore,
  setFeedback,
  getFeedback,
  EMPTY_FEEDBACK_STORE,
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  isMobilityReason,
  MOBILITY_REASONS,
  MOBILITY_REASON_LABELS,
  withReason,
  setFeedbackReason,
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

describe("A0 理由観測（reason・local capture）", () => {
  const CORR: HypothesisFeedbackEntry = { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk" };

  it("R1. MOBILITY_REASONS は 6 種（疲れ/景色/安い/急ぎ/気分/その他）・順序固定", () => {
    expect(MOBILITY_REASONS).toEqual(["tired", "scenery", "cheap", "hurry", "mood", "other"]);
    expect(Object.values(MOBILITY_REASON_LABELS)).toEqual(["疲れ", "景色", "安い", "急ぎ", "気分", "その他"]);
  });
  it("R2. isMobilityReason: 正/誤", () => {
    expect(isMobilityReason("tired")).toBe(true);
    expect(isMobilityReason("other")).toBe(true);
    expect(isMobilityReason("garbage")).toBe(false);
    expect(isMobilityReason(null)).toBe(false);
  });
  it("R3. withReason: 載せる/解除（可逆）", () => {
    expect(withReason(CORR, "tired")).toEqual({ ...CORR, reason: "tired" });
    expect(withReason({ ...CORR, reason: "tired" }, null)).toEqual(CORR); // reason field 省略
    expect(withReason({ ...CORR, reason: "tired" }, null).reason).toBeUndefined();
  });
  it("R4. setFeedbackReason: 既存 entry に付く", () => {
    const s = setFeedback(EMPTY_FEEDBACK_STORE, "2026-06-08", "a__b", CORR);
    const s2 = setFeedbackReason(s, "2026-06-08", "a__b", "hurry");
    expect(getFeedback(s2, "2026-06-08", "a__b")?.reason).toBe("hurry");
  });
  it("R5. ★setFeedbackReason: entry が無い leg は no-op（correction が無い所に reason を付けない）", () => {
    const s2 = setFeedbackReason(EMPTY_FEEDBACK_STORE, "2026-06-08", "x__y", "hurry");
    expect(s2).toBe(EMPTY_FEEDBACK_STORE); // 不変
    expect(getFeedback(s2, "2026-06-08", "x__y")).toBeNull();
  });
  it("R6. setFeedbackReason: null で解除（可逆）", () => {
    let s = setFeedback(EMPTY_FEEDBACK_STORE, "2026-06-08", "a__b", CORR);
    s = setFeedbackReason(s, "2026-06-08", "a__b", "mood");
    s = setFeedbackReason(s, "2026-06-08", "a__b", null);
    expect(getFeedback(s, "2026-06-08", "a__b")?.reason).toBeUndefined();
  });
  it("R7. ★後方互換: reason なし旧 entry は valid のまま読める", () => {
    const old = JSON.stringify({
      version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
      byDay: { "2026-06-01": { a__b: { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk" } } },
    });
    expect(getFeedback(parseFeedbackStore(old), "2026-06-01", "a__b")).toEqual(CORR);
  });
  it("R8. parse: valid reason は保持・invalid reason は drop（entry は壊さない）", () => {
    const withValid = JSON.stringify({
      version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
      byDay: { "2026-06-01": { a__b: { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk", reason: "tired" } } },
    });
    expect(getFeedback(parseFeedbackStore(withValid), "2026-06-01", "a__b")?.reason).toBe("tired");
    const withBad = JSON.stringify({
      version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
      byDay: { "2026-06-01": { a__b: { kind: "explicitCorrection", surfacedMode: "train", chosenMode: "walk", reason: "garbage" } } },
    });
    const e = getFeedback(parseFeedbackStore(withBad), "2026-06-01", "a__b");
    expect(e).toEqual(CORR); // entry 保持・reason だけ落ちる
    expect(e?.reason).toBeUndefined();
  });
});
