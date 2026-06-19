import { describe, it, expect } from "vitest";
import {
  buildLensCandidateView,
  buildLensComparisonView,
  buildExplanationCopy,
  explanationAxisNoun,
  type LensCandidate,
} from "@/lib/plan/candidateLens/candidateLensUi";
import type { UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";
import type { AttributeKey } from "@/lib/plan/candidateLens/placeAttributeModel";

function cand(over: Partial<LensCandidate> = {}): LensCandidate {
  return { placeId: "p", name: "X", address: "東京都江東区平野1-4-8", lat: 35.6, lng: 139.8, types: ["cafe"], distanceMeters: 300, ...over };
}
// 近い(walk勝ち)・履歴あり vs 遠い
const left = buildLensCandidateView(cand({ name: "近い", distanceMeters: 300 }), "meeting_prep", { affinityReason: "よく行く場所のようです。", visitCount: 5 });
const right = buildLensCandidateView(cand({ name: "遠い", distanceMeters: 1500, address: "東京都渋谷区神宮前5-31" }), "meeting_prep", {});

const prefAddressFirst: UserPlacePreference = { perLens: { meeting_prep: ["address"] } };
const prefWalkFirst: UserPlacePreference = { perLens: { meeting_prep: ["walk_estimate"] } }; // walk は既に先頭＝順序不変
const prefAbsentAxis: UserPlacePreference = { perLens: { meeting_prep: ["wifi"] } }; // 比較表に無い軸＝no-op

describe("E-a explanation payload — 発火条件", () => {
  it("★行順が変わる時だけ explanation 非 null（leadAxes/copyKey は applied preference 由来）", () => {
    const v = buildLensComparisonView("meeting_prep", left, right, prefAddressFirst);
    expect(v.explanation).not.toBeNull();
    expect(v.explanation!.reordered).toBe(true);
    expect(v.explanation!.leadAxes).toEqual(["address"]);
    expect(v.explanation!.copyKey).toBe("address");
    // 実際に先頭が address に変わっている
    expect(v.mainRows[0]!.key).toBe("address");
  });

  it("★行順が変わらない（pref 軸が既に先頭）→ null", () => {
    const canonFirst = buildLensComparisonView("meeting_prep", left, right).mainRows[0]!.key;
    expect(canonFirst).toBe("walk_estimate");
    expect(buildLensComparisonView("meeting_prep", left, right, prefWalkFirst).explanation).toBeNull();
  });

  it("★insufficient/比較表に無い軸のみの preference → 並び不変 → null", () => {
    const v = buildLensComparisonView("meeting_prep", left, right, prefAbsentAxis);
    expect(v.explanation).toBeNull();
    expect(v.mainRows.map((r) => r.key)).toEqual(buildLensComparisonView("meeting_prep", left, right).mainRows.map((r) => r.key));
  });

  it("★preference なし（flag OFF 相当）→ null", () => {
    expect(buildLensComparisonView("meeting_prep", left, right).explanation).toBeNull();
    expect(buildLensComparisonView("meeting_prep", left, right, undefined).explanation).toBeNull();
    expect(buildLensComparisonView("meeting_prep", left, right, {}).explanation).toBeNull(); // 空 preference
  });
});

describe("E-a explanation — 不変条件（推薦/winner/集合/①②）", () => {
  const canon = buildLensComparisonView("meeting_prep", left, right);
  const withPref = buildLensComparisonView("meeting_prep", left, right, prefAddressFirst);

  it("★recommendation.side は preference 有無で不変", () => {
    expect(withPref.recommendation?.side).toBe(canon.recommendation?.side);
    expect(canon.recommendation?.side).toBe("left"); // 近い側
  });

  it("★winner/highlight(isBest) は不変（行を並べ替えても値は同じ）", () => {
    const cw = canon.mainRows.find((r) => r.key === "walk_estimate")!;
    const pw = withPref.mainRows.find((r) => r.key === "walk_estimate")!;
    expect(pw.left.isBest).toBe(cw.left.isBest);
    expect(pw.right.isBest).toBe(cw.right.isBest);
  });

  it("★mainRows の集合は不変（行の追加/削除なし・並びだけ）", () => {
    expect([...withPref.mainRows.map((r) => r.key)].sort()).toEqual([...canon.mainRows.map((r) => r.key)].sort());
  });

  it("★①② の候補 view に explanation は影響しない（LensCandidateView に explanation キー無し）", () => {
    const cv = buildLensCandidateView(cand(), "meeting_prep", {});
    expect("explanation" in cv).toBe(false);
    // preference は ① card view の生成に関与しない（引数に取らない）
    expect(cv.primaryChips.length).toBeGreaterThan(0);
  });
});

describe("E-a copy（register A・行為説明のみ・人格断定/追跡語なし）", () => {
  const FORBIDDEN = ["あなた", "よく見る", "履歴", "駅近好き", "な人です", "監視", "好みます", "好きな人"];

  it("★buildExplanationCopy は行為説明（『最近の選び方をもとに、〈軸〉を上に並べています』）", () => {
    expect(buildExplanationCopy(["address"])).toBe("最近の選び方をもとに、場所を上に並べています。");
    expect(buildExplanationCopy(["walk_estimate"])).toBe("最近の選び方をもとに、徒歩の近さを上に並べています。");
  });

  it("★copy に人格断定/追跡語を含まない（全 lead 軸で検査）", () => {
    const keys: AttributeKey[] = ["walk_estimate", "margin_impact", "schedule_fit", "affinity_reason", "social_fit", "category", "address"];
    for (const k of keys) {
      const copy = buildExplanationCopy([k]);
      for (const ng of FORBIDDEN) expect(copy).not.toContain(ng);
      expect(copy.startsWith("最近の選び方をもとに、")).toBe(true);
    }
    // 軸名詞自体も断定語でない
    for (const k of keys) for (const ng of FORBIDDEN) expect(explanationAxisNoun(k)).not.toContain(ng);
  });

  it("★leadAxes 空でも安全な文（断定なし）", () => {
    const copy = buildExplanationCopy([]);
    for (const ng of FORBIDDEN) expect(copy).not.toContain(ng);
  });
});
