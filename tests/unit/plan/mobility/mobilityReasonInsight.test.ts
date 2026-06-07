/**
 * mobilityReasonInsight — A0-1 reason → local insight（pure / readiness）。
 * 観測のみ / sparse は no insight / per-leg 独立 / sensitive 除外 / 後方互換 / trait なし を検証。
 */
import { describe, it, expect } from "vitest";
import {
  buildReasonInsights,
  buildReasonInsightForLeg,
  DEFAULT_REASON_INSIGHT_CONFIG,
} from "@/lib/plan/mobility/mobilityReasonInsight";
import {
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackStore,
  type HypothesisFeedbackEntry,
  type MobilityReason,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

type Row = { day: string; leg: string; mode: RouteTransportMode; reason?: MobilityReason };
function mkStore(rows: readonly Row[]): HypothesisFeedbackStore {
  const byDay: Record<string, Record<string, HypothesisFeedbackEntry>> = {};
  for (const r of rows) {
    byDay[r.day] ??= {};
    byDay[r.day][r.leg] = {
      kind: "explicitCorrection",
      surfacedMode: "train",
      chosenMode: r.mode,
      ...(r.reason ? { reason: r.reason } : {}),
    };
  }
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-06-${String(i + 1).padStart(2, "0")}`);

describe("mobilityReasonInsight — A0-1 pure/readiness", () => {
  it("RI1. reason なし entry は無視（reason データ 0 → 結果なし）", () => {
    const s = mkStore(days(4).map((day) => ({ day, leg: "a__b", mode: "walk" }))); // reason なし
    expect(buildReasonInsights(s)).toEqual([]);
  });

  it("RI2. 後方互換: reason あり/なし混在 → reason ありのみ集計", () => {
    const s = mkStore([
      { day: "2026-06-01", leg: "a__b", mode: "walk" }, // reason なし=無視
      { day: "2026-06-02", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-03", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-04", leg: "a__b", mode: "walk", reason: "scenery" },
    ]);
    const r = buildReasonInsights(s);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: "insight", totalReasonObservations: 3, dominantReason: "scenery" });
  });

  it("RI3. ★sparse(2件)→ not_enough_signal（1-2 件で insight を出さない）", () => {
    const s = mkStore([
      { day: "2026-06-01", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-02", leg: "a__b", mode: "walk", reason: "scenery" },
    ]);
    expect(buildReasonInsights(s)[0]).toEqual({ legKey: "a__b", status: "not_enough_signal", observed: 2 });
  });

  it("RI4. sufficient(3件・majority)→ insight emerging", () => {
    const s = mkStore(days(3).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })));
    expect(buildReasonInsights(s)[0]).toMatchObject({
      status: "insight",
      dominantReason: "scenery",
      dominantMode: "walk",
      strength: "emerging",
    });
  });

  it("RI5. established(5件・share≥0.67)→ strength established", () => {
    const s = mkStore([
      ...days(4).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })),
      { day: "2026-06-05", leg: "a__b", mode: "car", reason: "tired" }, // 1 件だけ別
    ]);
    expect(buildReasonInsights(s)[0]).toMatchObject({ status: "insight", strength: "established", dominantReason: "scenery" });
  });

  it("RI6. ★reason 偏りなし(3件バラバラ)→ not_enough_signal（ambiguous は出さない）", () => {
    const s = mkStore([
      { day: "2026-06-01", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-02", leg: "a__b", mode: "walk", reason: "tired" },
      { day: "2026-06-03", leg: "a__b", mode: "walk", reason: "hurry" },
    ]);
    expect(buildReasonInsights(s)[0]).toMatchObject({ status: "not_enough_signal" });
  });

  it("RI7. ★mode 偏りなし(reason 一致だが mode バラバラ)→ not_enough_signal", () => {
    const s = mkStore([
      { day: "2026-06-01", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-02", leg: "a__b", mode: "car", reason: "scenery" },
      { day: "2026-06-03", leg: "a__b", mode: "bicycle", reason: "scenery" },
    ]);
    expect(buildReasonInsights(s)[0]).toMatchObject({ status: "not_enough_signal" });
  });

  it("RI8. ★2-2 tie(4件)→ not_enough_signal（strict majority・tie は出さない）", () => {
    const s = mkStore([
      { day: "2026-06-01", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-02", leg: "a__b", mode: "walk", reason: "scenery" },
      { day: "2026-06-03", leg: "a__b", mode: "walk", reason: "tired" },
      { day: "2026-06-04", leg: "a__b", mode: "walk", reason: "tired" },
    ]);
    expect(buildReasonInsights(s)[0]).toMatchObject({ status: "not_enough_signal", observed: 4 });
  });

  it("RI9. ★per-leg 独立（別 legKey は混線しない）", () => {
    const s = mkStore([
      ...days(3).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })),
      ...days(3).map((day) => ({ day: day + "x".repeat(0) /* same days ok: 別 leg */, leg: "c__d", mode: "car" as const, reason: "hurry" as const })),
    ]);
    const r = buildReasonInsights(s);
    const ab = r.find((x) => x.legKey === "a__b");
    const cd = r.find((x) => x.legKey === "c__d");
    expect(ab).toMatchObject({ status: "insight", dominantReason: "scenery", dominantMode: "walk" });
    expect(cd).toMatchObject({ status: "insight", dominantReason: "hurry", dominantMode: "car" });
  });

  it("RI10. ★sensitive/hidden は excludeLegKeys で対象外にできる", () => {
    const s = mkStore(days(3).map((day) => ({ day, leg: "secret__x", mode: "walk" as const, reason: "scenery" as const })));
    expect(buildReasonInsights(s, { excludeLegKeys: new Set(["secret__x"]) })).toEqual([]);
    expect(buildReasonInsightForLeg(s, "secret__x", { excludeLegKeys: new Set(["secret__x"]) })).toBeNull();
  });

  it("RI11. buildReasonInsightForLeg: データあり→result / なし→null", () => {
    const s = mkStore(days(3).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })));
    expect(buildReasonInsightForLeg(s, "a__b")).toMatchObject({ status: "insight" });
    expect(buildReasonInsightForLeg(s, "no__data")).toBeNull();
  });

  it("RI12. 決定的（同 store→同結果）", () => {
    const s = mkStore(days(3).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })));
    expect(JSON.stringify(buildReasonInsights(s))).toBe(JSON.stringify(buildReasonInsights(s)));
  });

  it("RI13. ★trait/人格語・強語を structured result に含めない（copy でなく構造化）", () => {
    const s = mkStore(days(5).map((day) => ({ day, leg: "a__b", mode: "walk" as const, reason: "scenery" as const })));
    const json = JSON.stringify(buildReasonInsights(s));
    for (const w of ["よく", "いつも", "あなたは", "タイプ", "性格", "傾向があります", "がち"]) {
      expect(json).not.toContain(w);
    }
    // strength は enum のみ
    expect(["emerging", "established"]).toContain((buildReasonInsights(s)[0] as { strength: string }).strength);
  });

  it("RI14. config 既定: minObservations=3（sparse 保護の閾値）", () => {
    expect(DEFAULT_REASON_INSIGHT_CONFIG.minObservations).toBe(3);
  });
});
