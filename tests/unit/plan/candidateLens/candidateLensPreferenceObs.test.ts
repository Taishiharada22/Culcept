import { describe, it, expect } from "vitest";
import { buildLensCandidateView, buildLensComparisonView } from "@/lib/plan/candidateLens/candidateLensUi";
import {
  buildPreferenceObservation,
  accumulatePreference,
  type PreferenceObservation,
} from "@/lib/plan/candidateLens/candidateLensPreferenceObs";
import type { LensCandidate } from "@/lib/plan/candidateLens/candidateLensUi";

function cand(over: Partial<LensCandidate> = {}): LensCandidate {
  return { placeId: "p", name: "ブルーボトル", address: "東京都江東区平野1-4-8", lat: 35.6, lng: 139.8, types: ["cafe"], distanceMeters: 300, ...over };
}

describe("buildPreferenceObservation — 選択文脈 → 観測（pure・捏造しない）", () => {
  it("★compare: 選択側 cell が優位(isBest)だった軸を decisive に・proximity を導出", () => {
    const left = buildLensCandidateView(cand({ name: "近い", distanceMeters: 300 }), "meeting_prep", { gapMinutes: 60, affinityReason: "よく行く場所のようです。", visitCount: 5 });
    const right = buildLensCandidateView(cand({ name: "遠い", distanceMeters: 1500 }), "meeting_prep", { gapMinutes: 60 });
    const comparison = buildLensComparisonView("meeting_prep", left, right);
    const obs = buildPreferenceObservation({
      lens: "meeting_prep", selectedKey: "k-left", selectedView: left, choiceContext: "compare",
      comparison, selectedSide: "left", comparedAgainstKey: "k-right", at: 1000,
    });
    expect(obs.decisiveAxes).toContain("walk_estimate"); // 近い側を選んだ＝徒歩が見える差で勝ち
    expect(obs.signals.proximityWeighted).toBe(true);
    expect(obs.signals.reselectedKnown).toBe(true); // affinity あり
    expect(obs.comparedAgainstKey).toBe("k-right");
    expect(obs.selectedPlaceKey).toBe("k-left");
  });

  it("★browse/detail: 候補の最強 honest 軸（徒歩/相性）・値の無い軸は採らない", () => {
    const v = buildLensCandidateView(cand({ distanceMeters: 300 }), "focus_work", { affinityReason: "よく行く場所のようです。", visitCount: 4 });
    const obs = buildPreferenceObservation({ lens: "focus_work", selectedKey: "k", selectedView: v, choiceContext: "browse", at: 1 });
    expect(obs.decisiveAxes).toContain("walk_estimate");
    expect(obs.decisiveAxes).toContain("affinity_reason");
    // Wi-Fi/電源/静か等の未確認軸は決して含まれない
    for (const k of ["wifi", "power", "quiet", "hours"] as const) expect(obs.decisiveAxes).not.toContain(k);
  });

  it("★徒歩も相性も無い候補 → decisive は空（捏造しない）", () => {
    const v = buildLensCandidateView(cand({ distanceMeters: null }), "generic", {});
    const obs = buildPreferenceObservation({ lens: "generic", selectedKey: "k", selectedView: v, choiceContext: "detail", at: 1 });
    expect(obs.decisiveAxes).toEqual([]);
    expect(obs.signals.proximityWeighted).toBe(false);
    expect(obs.signals.reselectedKnown).toBe(false);
  });
});

describe("accumulatePreference — 集計（decay + lens別 + sufficient-gate）", () => {
  const mk = (lens: PreferenceObservation["lens"], axes: PreferenceObservation["decisiveAxes"], at: number): PreferenceObservation => ({
    lens, selectedPlaceKey: "k", decisiveAxes: axes, choiceContext: "compare",
    signals: { proximityWeighted: false, marginWeighted: false, reselectedKnown: false }, at,
  });

  it("★sufficient-gate: 件数 < minObservations は preference を出さない（中立）", () => {
    const obs = [mk("meeting_prep", ["walk_estimate"], 0), mk("meeting_prep", ["walk_estimate"], 0)];
    const pref = accumulatePreference(obs, { now: 0, minObservations: 5 });
    expect(pref.prioritizedAttributes).toBeUndefined();
    expect(pref.perLens).toBeUndefined();
  });

  it("★件数を満たせば軸スコア降順で prioritizedAttributes / perLens を出す", () => {
    const obs = [
      mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["affinity_reason"], 0),
      mk("meeting_prep", ["affinity_reason"], 0),
    ];
    const pref = accumulatePreference(obs, { now: 0, minObservations: 5 });
    expect(pref.prioritizedAttributes?.[0]).toBe("walk_estimate"); // 3 > 2
    expect(pref.prioritizedAttributes).toContain("affinity_reason");
    expect(pref.perLens?.meeting_prep?.[0]).toBe("walk_estimate");
  });

  it("★decay: 新しい観測ほど重い（古い軸より新しい軸が上位）", () => {
    const halfLife = 1000;
    const obs = [
      // 古い walk ×3（age=2000ms → weight ~0.25 each ≈ 0.75）
      mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0),
      // 新しい affinity ×2（age=0 → weight 1 each = 2.0）
      mk("meeting_prep", ["affinity_reason"], 2000),
      mk("meeting_prep", ["affinity_reason"], 2000),
    ];
    const pref = accumulatePreference(obs, { now: 2000, minObservations: 5, halfLifeMs: halfLife });
    expect(pref.prioritizedAttributes?.[0]).toBe("affinity_reason"); // 新しい方が勝つ
  });

  it("★lens 別 gate は独立（足りない lens は perLens に出さない）", () => {
    const obs = [
      mk("meeting_prep", ["walk_estimate"], 0), mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0), mk("meeting_prep", ["walk_estimate"], 0),
      mk("meeting_prep", ["walk_estimate"], 0), // meeting_prep=5
      mk("focus_work", ["walk_estimate"], 0), // focus_work=1
    ];
    const pref = accumulatePreference(obs, { now: 0, minObservations: 5 });
    expect(pref.perLens?.meeting_prep).toBeTruthy();
    expect(pref.perLens?.focus_work).toBeUndefined(); // 件数不足
  });
});
