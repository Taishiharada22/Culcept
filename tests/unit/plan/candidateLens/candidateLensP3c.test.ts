import { describe, it, expect, vi, afterEach } from "vitest";
import { buildLensCandidateView, buildLensComparisonView, type LensCandidate } from "@/lib/plan/candidateLens/candidateLensUi";
import { accumulatePreference, type PreferenceObservation } from "@/lib/plan/candidateLens/candidateLensPreferenceObs";
import {
  PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED,
  isCandidateLensPrefApplyEnabled,
} from "@/lib/plan/candidateLens/candidateLensPreferenceStore";
import type { UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";

afterEach(() => vi.unstubAllEnvs());

function cand(over: Partial<LensCandidate> = {}): LensCandidate {
  return { placeId: "p", name: "X", address: "東京都江東区平野1-4-8", lat: 35.6, lng: 139.8, types: ["cafe"], distanceMeters: 300, ...over };
}
// 近い(walk勝ち)・履歴あり vs 遠い
const left = buildLensCandidateView(cand({ name: "近い", distanceMeters: 300 }), "meeting_prep", { affinityReason: "よく行く場所のようです。", visitCount: 5 });
const right = buildLensCandidateView(cand({ name: "遠い", distanceMeters: 1500, address: "東京都渋谷区神宮前5-31" }), "meeting_prep", {});

describe("P3-c 推薦/行順 分離 — buildLensComparisonView(preference)", () => {
  const prefAddressFirst: UserPlacePreference = { perLens: { meeting_prep: ["address"] } };

  it("★(1) preference が十分でも recommendation.side は canonical と同じ", () => {
    const canon = buildLensComparisonView("meeting_prep", left, right);
    const withPref = buildLensComparisonView("meeting_prep", left, right, prefAddressFirst);
    expect(withPref.recommendation?.side).toBe(canon.recommendation?.side);
    expect(canon.recommendation?.side).toBe("left"); // 近い側
  });

  it("★(2) winner/highlight(isBest) の意味は canonical と同じ（行を並べ替えても値は不変）", () => {
    const canon = buildLensComparisonView("meeting_prep", left, right);
    const withPref = buildLensComparisonView("meeting_prep", left, right, prefAddressFirst);
    const canonWalk = canon.mainRows.find((r) => r.key === "walk_estimate")!;
    const prefWalk = withPref.mainRows.find((r) => r.key === "walk_estimate")!;
    expect(prefWalk.left.isBest).toBe(canonWalk.left.isBest); // true（近い側）
    expect(prefWalk.right.isBest).toBe(canonWalk.right.isBest); // false
  });

  it("★(3) preference が十分な時だけ mainRows の行順だけが変わる（集合は同じ）", () => {
    const canon = buildLensComparisonView("meeting_prep", left, right);
    const withPref = buildLensComparisonView("meeting_prep", left, right, prefAddressFirst);
    expect(canon.mainRows[0]!.key).toBe("walk_estimate"); // canonical 先頭
    expect(withPref.mainRows[0]!.key).toBe("address"); // address を前に
    // 集合（行の有無）は不変＝行の追加/削除なし
    expect([...withPref.mainRows.map((r) => r.key)].sort()).toEqual([...canon.mainRows.map((r) => r.key)].sort());
  });

  it("★(4) preference なし/空 → canonical 行順のまま（insufficient 相当）", () => {
    const canon = buildLensComparisonView("meeting_prep", left, right);
    expect(buildLensComparisonView("meeting_prep", left, right, {}).mainRows.map((r) => r.key)).toEqual(canon.mainRows.map((r) => r.key));
    expect(buildLensComparisonView("meeting_prep", left, right, undefined).mainRows.map((r) => r.key)).toEqual(canon.mainRows.map((r) => r.key));
  });
});

describe("P3-c sufficient-gate / min-support / EPS（accumulatePreference）", () => {
  const mk = (axes: PreferenceObservation["decisiveAxes"], at = 0): PreferenceObservation => ({
    lens: "meeting_prep", selectedPlaceKey: "k", decisiveAxes: axes, choiceContext: "compare",
    signals: { proximityWeighted: false, marginWeighted: false, reselectedKnown: false }, at,
  });
  const GATE = { now: 0, minLensObservations: 5, minGlobalObservations: 8, minAxisSupport: 3, minScore: 0.05 };

  it("★lens<5 → perLens 出さない（薄い観測で反映しない）", () => {
    const pref = accumulatePreference([mk(["walk_estimate"]), mk(["walk_estimate"]), mk(["walk_estimate"]), mk(["walk_estimate"])], GATE);
    expect(pref.perLens).toBeUndefined();
    expect(pref.prioritizedAttributes).toBeUndefined();
  });

  it("★lens>=5 かつ 軸支持>=3 → perLens に出す（global<8 なら prioritized は出さない）", () => {
    const obs = Array.from({ length: 5 }, () => mk(["walk_estimate"]));
    const pref = accumulatePreference(obs, GATE);
    expect(pref.perLens?.meeting_prep).toEqual(["walk_estimate"]);
    expect(pref.prioritizedAttributes).toBeUndefined(); // 全体 5 < 8
  });

  it("★軸支持<3 → その軸は除外（lens 件数は満たしても単発軸は昇格しない）", () => {
    // 5 obs: walk×2(支持2) + affinity×3(支持3)
    const obs = [mk(["walk_estimate"]), mk(["walk_estimate"]), mk(["affinity_reason"]), mk(["affinity_reason"]), mk(["affinity_reason"])];
    const pref = accumulatePreference(obs, GATE);
    expect(pref.perLens?.meeting_prep).toEqual(["affinity_reason"]); // walk(支持2)は除外
  });

  it("★EPS: 古くて decay 後スコアが minScore 未満の軸は失効して除外", () => {
    const halfLife = 1000;
    // walk×5 すべて古い(age=20×halfLife → weight≈2^-20≈9.5e-7 each, 合計≈4.8e-6 < 0.05)
    const obs = Array.from({ length: 5 }, () => mk(["walk_estimate"], 0));
    const pref = accumulatePreference(obs, { ...GATE, now: 20000, halfLifeMs: halfLife, minScore: 0.05 });
    expect(pref.perLens).toBeUndefined(); // 失効
  });

  it("★後方互換: minObservations だけ指定 → lens/global の fallback として働く（P3-a 挙動不変）", () => {
    const obs = Array.from({ length: 5 }, () => mk(["walk_estimate"]));
    const pref = accumulatePreference(obs, { now: 0, minObservations: 5 });
    expect(pref.perLens?.meeting_prep).toEqual(["walk_estimate"]);
  });
});

describe("P3-c apply flag（obs と独立・default OFF・production hard block）", () => {
  it("★default OFF", () => {
    expect(PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isCandidateLensPrefApplyEnabled()).toBe(false); // 定数 false ゆえ
  });
  it("★production hard block（flag を仮に true でも production 排他）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(true && process.env.NODE_ENV !== "production").toBe(false);
    expect(isCandidateLensPrefApplyEnabled()).toBe(false);
  });
});
