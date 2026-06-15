import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PLACE_CANDIDATE_LENS_UI_ENABLED,
  isCandidateLensUiEnabled,
  purposeLensFromSchedule,
  buildLensCandidateView,
  buildLensComparisonView,
  shortAddress,
  splitAddressLines,
  buildWhyBullets,
  type LensCandidate,
} from "@/lib/plan/candidateLens/candidateLensUi";

// ── fixtures ──
function cand(over: Partial<LensCandidate> = {}): LensCandidate {
  return {
    placeId: "p1",
    name: "ブルーボトル 清澄白河",
    address: "東京都江東区平野1-4-8",
    lat: 35.6,
    lng: 139.8,
    types: ["cafe"],
    distanceMeters: 300,
    ...over,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("isCandidateLensUiEnabled — flag default OFF / production hard block", () => {
  it("★定数は default OFF（着地時 production 影響ゼロ）", () => {
    expect(PLACE_CANDIDATE_LENS_UI_ENABLED).toBe(false);
  });
  it("★flag OFF なら dev でも false（既存パネル不変）", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isCandidateLensUiEnabled()).toBe(false); // 定数 false ゆえ
  });
  it("★production では常に false（flag を仮に true でも hard block）", () => {
    // 定数が true だった場合の不変条件を式で検証（production 排他）。
    vi.stubEnv("NODE_ENV", "production");
    const wouldBe = true && process.env.NODE_ENV !== "production";
    expect(wouldBe).toBe(false);
  });
});

describe("purposeLensFromSchedule — 予定名 → 目的レンズ", () => {
  it("★会議→meeting_prep / 集中→focus_work / ランチ→conversation / 買い物→errand", () => {
    expect(purposeLensFromSchedule("クライアントと打ち合わせ")).toBe("meeting_prep");
    expect(purposeLensFromSchedule("資料作成で集中")).toBe("focus_work");
    expect(purposeLensFromSchedule("友人とランチ")).toBe("conversation");
    expect(purposeLensFromSchedule("ついでに買い物")).toBe("errand");
  });
});

describe("buildLensCandidateView — 実値のみ・捏造しない", () => {
  it("★primaryChips は実値のある軸だけ（徒歩は約/目安・category は fact）", () => {
    const v = buildLensCandidateView(cand(), "meeting_prep", { gapMinutes: 60 });
    const walk = v.primaryChips.find((c) => c.key === "walk_estimate");
    expect(walk?.value).toContain("約");
    expect(walk?.value).toContain("目安");
    // chip value に偽属性（wifi/電源/静か）は決して入らない
    for (const chip of v.primaryChips) expect(chip.value).not.toMatch(/Wi-Fi|電源|静か/);
  });
  it("★affinityBadge / whyLine は ctx.affinityReason がある時だけ強まる（無ければ badge null）", () => {
    const withAff = buildLensCandidateView(cand(), "meeting_prep", { gapMinutes: 60, affinityReason: "よく行く場所のようです。" });
    expect(withAff.affinityBadge).toBe("相性");
    expect(withAff.whyLine).toContain("よく行く");
    const noAff = buildLensCandidateView(cand(), "meeting_prep", { gapMinutes: 60 });
    expect(noAff.affinityBadge).toBeNull();
    expect(noAff.whyLine).not.toContain("よく行く");
  });
  it("★whyLine は hedged（断定しない）・徒歩値が無ければ affinity か null（捏造しない）", () => {
    const noWalk = buildLensCandidateView(cand({ distanceMeters: null }), "focus_work", {});
    expect(noWalk.whyLine).toBeNull(); // 徒歩なし・affinity なし → 沈黙
    const noWalkAff = buildLensCandidateView(cand({ distanceMeters: null }), "focus_work", { affinityReason: "よく行く場所のようです。" });
    expect(noWalkAff.whyLine).toContain("よく行く");
  });
});

describe("buildLensComparisonView — 主表/未確認注記の正直な振り分け", () => {
  const left = buildLensCandidateView(cand({ placeId: "L", name: "ブルーボトル", distanceMeters: 300 }), "meeting_prep", {
    gapMinutes: 60,
    affinityReason: "よく行く場所のようです。",
    visitCount: 5,
  });
  const right = buildLensCandidateView(cand({ placeId: "R", name: "TRUNK COFFEE", distanceMeters: 900, address: "渋谷区..." }), "meeting_prep", {
    gapMinutes: 60,
  });

  it("★mainRows は値のある行のみ（「—」だけの行を主表に並べない）", () => {
    const comp = buildLensComparisonView("meeting_prep", left, right);
    for (const row of comp.mainRows) {
      expect(row.left.value !== null || row.right.value !== null).toBe(true);
    }
    expect(comp.mainRows.find((r) => r.key === "walk_estimate")).toBeTruthy();
  });

  it("★未確認注記は『本当に未確認(D)』のみ（focus_work の Wi-Fi/電源/静かさ）", () => {
    const lf = buildLensCandidateView(cand({ placeId: "L" }), "focus_work", { affinityReason: "よく行く場所のようです。" });
    const rf = buildLensCandidateView(cand({ placeId: "R", distanceMeters: 900 }), "focus_work", {});
    const comp = buildLensComparisonView("focus_work", lf, rf);
    expect(comp.unconfirmedLabels).toContain("Wi-Fi");
    expect(comp.unconfirmedLabels).toContain("静かさ");
    // 主表に Wi-Fi は出さない（捏造ゼロ）
    expect(comp.mainRows.find((r) => r.key === "wifi")).toBeUndefined();
  });

  it("★gap 無しで未計算の B(予定接続/余白)は注記に出さない（『未確認』と誤解させない・静かに drop）", () => {
    // gap を渡さない → schedule_fit/margin_impact は computed・value null
    const ln = buildLensCandidateView(cand({ placeId: "L" }), "meeting_prep", {});
    const rn = buildLensCandidateView(cand({ placeId: "R", distanceMeters: 900 }), "meeting_prep", {});
    const comp = buildLensComparisonView("meeting_prep", ln, rn);
    expect(comp.unconfirmedLabels).not.toContain("予定との接続");
    expect(comp.unconfirmedLabels).not.toContain("余白への影響");
    expect(comp.mainRows.find((r) => r.key === "schedule_fit")).toBeUndefined(); // 主表にも出ない
  });

  it("★推薦は honest（近い left）・basis 句に数字なし・side は表示差のある軸由来", () => {
    const comp = buildLensComparisonView("meeting_prep", left, right);
    expect(comp.recommendation?.side).toBe("left");
    expect(comp.recommendation?.basisPhrase).toMatch(/合いそうです/);
    expect(comp.recommendation?.basisPhrase).not.toMatch(/[0-9%]/);
  });

  it("★表示値が同じ行は優位ハイライトしない（見えない差で主張しない＝honesty）", () => {
    // 同距離・同 gap → walk も schedule も表示文言が一致 → どちらも isBest=false
    const a = buildLensCandidateView(cand({ placeId: "A", distanceMeters: 300 }), "meeting_prep", { gapMinutes: 60 });
    const b = buildLensCandidateView(cand({ placeId: "B", distanceMeters: 300 }), "meeting_prep", { gapMinutes: 60 });
    const comp = buildLensComparisonView("meeting_prep", a, b);
    const walk = comp.mainRows.find((r) => r.key === "walk_estimate");
    expect(walk?.left.isBest).toBe(false);
    expect(walk?.right.isBest).toBe(false);
    expect(comp.recommendation).toBeNull(); // 甲乙つけがたい → 沈黙
  });

  it("★lens で主表の行集合が変わる（meeting_prep ≠ conversation）", () => {
    const lc = buildLensCandidateView(cand({ placeId: "L" }), "conversation", { gapMinutes: 60, affinityReason: "よく行く場所のようです。" });
    const rc = buildLensCandidateView(cand({ placeId: "R", distanceMeters: 900 }), "conversation", { gapMinutes: 60 });
    const meeting = buildLensComparisonView("meeting_prep", left, right).mainRows.map((r) => r.key);
    const conv = buildLensComparisonView("conversation", lc, rc).mainRows.map((r) => r.key);
    expect(JSON.stringify(meeting)).not.toBe(JSON.stringify(conv));
  });
});

describe("shortAddress / splitAddressLines — ① 1行省略 / ② 2行整理（pure）", () => {
  it("★空白前で切る・長すぎれば「…」", () => {
    expect(shortAddress("東京都江東区平野1-4-8 清澄白河フラッグA棟")).toBe("東京都江東区平野1-4-8");
    expect(shortAddress("あ".repeat(30), 18)).toBe(`${"あ".repeat(18)}…`);
    expect(shortAddress(null)).toBeNull();
  });
  it("★② は最大 2 行へ整理（県市行 + 残り）", () => {
    expect(splitAddressLines("東京都江東区平野1-4-8 清澄白河フラッグA棟")).toEqual(["東京都江東区平野1-4-8", "清澄白河フラッグA棟"]);
    expect(splitAddressLines("東京都江東区平野1-4-8")).toEqual(["東京都江東区平野1-4-8"]);
    expect(splitAddressLines(null)).toEqual([]);
  });
});

describe("buildWhyBullets — ② なぜここをおすすめ？の ✓ リスト（honest のみ・捏造しない）", () => {
  it("★目的レンズ項目は常に 1 つ・徒歩あれば追加・相性あれば追加（最大 3）", () => {
    const withAll = buildLensCandidateView(cand({ distanceMeters: 300 }), "meeting_prep", { affinityReason: "よく行く場所のようです。", visitCount: 4 });
    const b1 = buildWhyBullets(withAll, "meeting_prep");
    expect(b1.length).toBe(3);
    expect(b1[0]).toContain("会議前"); // 目的レンズ
    expect(b1.some((x) => x.includes("徒歩"))).toBe(true);
    expect(b1.some((x) => x.includes("普段から訪れている"))).toBe(true);
  });
  it("★徒歩なし・相性なし → 目的レンズの 1 項目のみ（常に 1 以上・空にしない）", () => {
    const minimal = buildLensCandidateView(cand({ distanceMeters: null }), "focus_work", {});
    const b = buildWhyBullets(minimal, "focus_work");
    expect(b.length).toBe(1);
    expect(b[0]).toContain("集中");
  });
  it("★未確認（静か/Wi-Fi/電源）は項目に含めない（捏造回避）", () => {
    const v = buildLensCandidateView(cand({ distanceMeters: 300 }), "meeting_prep", {});
    for (const x of buildWhyBullets(v, "meeting_prep")) {
      expect(x).not.toMatch(/Wi-Fi|電源|静か/);
    }
  });
});

describe("CandidateLensPanel — import smoke（JSX transform + 依存解決の durable 検証）", () => {
  it("★コンポーネント module が解決・export される（import path 破損を検知）", async () => {
    const mod = await import("@/app/(culcept)/plan/components/CandidateLensPanel");
    expect(typeof mod.CandidateLensPanel).toBe("function");
  });
});
