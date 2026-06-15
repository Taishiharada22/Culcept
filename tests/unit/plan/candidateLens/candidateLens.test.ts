import { describe, it, expect } from "vitest";
import { classifyPurposeLens, PURPOSE_LENS_LABEL } from "@/lib/plan/candidateLens/purposeLens";
import {
  buildPlaceAttributes,
  walkEstimateMinutes,
  placeCategoryLabel,
  type CandidateInput,
} from "@/lib/plan/candidateLens/placeAttributeModel";
import {
  buildLensComparison,
  recommendationBasisPhrase,
  LENS_AXES,
} from "@/lib/plan/candidateLens/candidateLensResolver";
import { applyPreferenceToAxes } from "@/lib/plan/candidateLens/userPlacePreference";

// ── fixtures ──
function cand(over: Partial<CandidateInput> = {}): CandidateInput {
  return { name: "ブルーボトル 清澄白河", address: "東京都江東区平野1-4-8", lat: 35.6, lng: 139.8, types: ["cafe"], distanceMeters: 400, ...over };
}

describe("classifyPurposeLens — 予定 → 目的レンズ", () => {
  it("★activityKey: meeting→meeting_prep / work→focus_work / food→conversation / その他→generic", () => {
    expect(classifyPurposeLens({ activityKey: "meeting" })).toBe("meeting_prep");
    expect(classifyPurposeLens({ activityKey: "work" })).toBe("focus_work");
    expect(classifyPurposeLens({ activityKey: "food" })).toBe("conversation");
    expect(classifyPurposeLens({ activityKey: "fitness" })).toBe("generic");
    expect(classifyPurposeLens({ activityKey: "generic" })).toBe("generic");
  });
  it("★title keyword が activityKey を上書き（集中→focus / 相談→conversation / 買い物→errand）", () => {
    expect(classifyPurposeLens({ activityKey: "generic", title: "資料作成で集中" })).toBe("focus_work");
    expect(classifyPurposeLens({ activityKey: "meeting", title: "雑談ベース相談" })).toBe("conversation");
    expect(classifyPurposeLens({ activityKey: "generic", title: "ついでに買い物" })).toBe("errand");
  });
});

describe("placeAttributeModel — 捏造しない / 直線距離の目安", () => {
  it("★walkEstimate: route 補正 1.3・約表記・null は null", () => {
    expect(walkEstimateMinutes(400)).toBe(Math.round((400 * 1.3) / 80)); // ≈7
    expect(walkEstimateMinutes(null)).toBeNull();
  });
  it("★category: types→ラベル（fact）・該当なし null", () => {
    expect(placeCategoryLabel(["cafe"])).toBe("カフェ");
    expect(placeCategoryLabel(["unknown_type"])).toBeNull();
  });
  it("★wifi/power/quiet/social_fit/hours/photo は常に value=null（未確認・捏造しない）", () => {
    const a = buildPlaceAttributes(cand());
    for (const k of ["wifi", "power", "quiet", "crowd", "hours", "photo", "social_fit"] as const) {
      expect(a[k].value).toBeNull();
      expect(["unconfirmed", "weak"]).toContain(a[k].evidenceType);
    }
  });
  it("★walk_estimate/category/address は実値・affinity_reason は ctx 由来のみ", () => {
    const a = buildPlaceAttributes(cand(), { affinityReason: "よく行く場所のようです。", visitCount: 4 });
    expect(a.walk_estimate.value).toContain("約");
    expect(a.walk_estimate.value).toContain("目安");
    expect(a.category.value).toBe("カフェ");
    expect(a.address.value).toContain("江東区");
    expect(a.affinity_reason.value).toBe("よく行く場所のようです。");
    // ctx なしなら affinity は null（捏造しない）
    expect(buildPlaceAttributes(cand()).affinity_reason.value).toBeNull();
  });
  it("★schedule_fit/margin_impact は gap が与えられた時のみ実値・無ければ null", () => {
    expect(buildPlaceAttributes(cand()).schedule_fit.value).toBeNull();
    const withGap = buildPlaceAttributes(cand({ distanceMeters: 400 }), { gapMinutes: 60 });
    expect(withGap.schedule_fit.value).toBeTruthy();
    expect(withGap.margin_impact.value).toBeTruthy();
  });
});

describe("buildLensComparison — ★本丸: 目的で比較行が変わる", () => {
  const left = buildPlaceAttributes(cand({ name: "ブルーボトル", distanceMeters: 300 }), { gapMinutes: 60, affinityReason: "よく行く場所のようです。", visitCount: 5 });
  const right = buildPlaceAttributes(cand({ name: "TRUNK COFFEE", distanceMeters: 900, address: "渋谷区..." }), { gapMinutes: 60 });

  it("★lens が変われば出る行が変わる（meeting_prep ≠ focus_work）", () => {
    const meeting = buildLensComparison({ lens: "meeting_prep", leftAttrs: left, rightAttrs: right });
    const focus = buildLensComparison({ lens: "focus_work", leftAttrs: left, rightAttrs: right });
    const mKeys = meeting.rows.map((r) => r.key);
    const fKeys = focus.rows.map((r) => r.key);
    expect(mKeys).toContain("schedule_fit"); // 会議前は予定接続
    expect(fKeys).not.toContain("schedule_fit"); // 集中作業には出ない
    expect(JSON.stringify(mKeys)).not.toBe(JSON.stringify(fKeys));
  });
  it("★両側 null の軸（focus_work の wifi/power/quiet）は既定で隠す・showUnconfirmed で未確認行", () => {
    const hidden = buildLensComparison({ lens: "focus_work", leftAttrs: left, rightAttrs: right });
    expect(hidden.rows.find((r) => r.key === "wifi")).toBeUndefined();
    const shown = buildLensComparison({ lens: "focus_work", leftAttrs: left, rightAttrs: right, showUnconfirmed: true });
    const wifi = shown.rows.find((r) => r.key === "wifi");
    expect(wifi?.unconfirmed).toBe(true);
    expect(wifi?.left.value).toBeNull();
  });
  it("★優位ハイライトは比較可能な軸のみ（近い側＝walk_estimate left isBest）", () => {
    const r = buildLensComparison({ lens: "meeting_prep", leftAttrs: left, rightAttrs: right });
    const walk = r.rows.find((x) => x.key === "walk_estimate")!;
    expect(walk.left.isBest).toBe(true); // 300m < 900m
    expect(walk.right.isBest).toBe(false);
    const cat = r.rows.find((x) => x.key === "category");
    if (cat) { expect(cat.left.isBest).toBe(false); expect(cat.right.isBest).toBe(false); } // 比較不可
  });
  it("★推薦は勝った軸から導く（近く・余白の left）・basis phrase に数字なし", () => {
    const r = buildLensComparison({ lens: "meeting_prep", leftAttrs: left, rightAttrs: right });
    expect(r.recommendation?.side).toBe("left");
    const phrase = recommendationBasisPhrase(r)!;
    expect(phrase).toMatch(/合いそうです/);
    expect(phrase).not.toMatch(/[0-9%]/);
  });
  it("★捏造しない: どの行の value にも wifi/電源等の偽属性が入らない（未確認は null のまま）", () => {
    const r = buildLensComparison({ lens: "focus_work", leftAttrs: left, rightAttrs: right, showUnconfirmed: true });
    for (const row of r.rows) {
      if (["wifi", "power", "quiet"].includes(row.key)) {
        expect(row.left.value).toBeNull();
        expect(row.right.value).toBeNull();
      }
    }
  });
});

describe("applyPreferenceToAxes — future input（fake data・実保存なし）", () => {
  it("★嗜好なし → 既定軸順のまま（中立）", () => {
    expect(applyPreferenceToAxes(LENS_AXES.meeting_prep, "meeting_prep")).toEqual(LENS_AXES.meeting_prep);
  });
  it("★perLens 指定 → 指定属性を前方へ（既定軸にあるもののみ・無いものは追加しない）", () => {
    const reordered = applyPreferenceToAxes(LENS_AXES.meeting_prep, "meeting_prep", {
      perLens: { meeting_prep: ["affinity_reason", "wifi"] }, // wifi は軸に無い→無視
    });
    expect(reordered[0]).toBe("affinity_reason");
    expect(reordered).not.toContain("wifi");
    expect([...reordered].sort()).toEqual([...LENS_AXES.meeting_prep].sort()); // 集合は不変
  });
  it("ラベル定義（5 lens 全て）", () => {
    for (const k of ["meeting_prep", "focus_work", "conversation", "errand", "generic"] as const) {
      expect(PURPOSE_LENS_LABEL[k]).toBeTruthy();
    }
  });
});
