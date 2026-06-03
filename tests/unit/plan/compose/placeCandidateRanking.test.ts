import { describe, it, expect } from "vitest";

import {
  rerankGoogleCandidatesByActivity,
  TYPE_NUDGE,
  type RankableGoogleCandidate,
} from "@/lib/plan/compose/placeCandidateRanking";

const c = (placeId: string, types?: string[]): RankableGoogleCandidate => ({ placeId, types });
const ids = (r: { candidate: { placeId: string } }[]) => r.map((x) => x.candidate.placeId);

describe("placeCandidateRanking — generic / 空 / 既存順維持（テスト1,4,5）", () => {
  it("activityKey generic（title 空相当）→ Google 順を完全維持・reason 全 null", () => {
    const items = [c("a", ["restaurant"]), c("b", ["library"]), c("c")];
    const r = rerankGoogleCandidatesByActivity(items, "generic");
    expect(ids(r)).toEqual(["a", "b", "c"]);
    expect(r.every((x) => x.typeReason === null)).toBe(true);
  });

  it("空配列 → 空配列", () => {
    expect(rerankGoogleCandidatesByActivity([], "work")).toEqual([]);
  });

  it("type 整合が無ければ並べ替えない（順序維持・reason 全 null）", () => {
    const items = [c("a", ["restaurant"]), c("b", ["gym"]), c("c", ["park"])];
    const r = rerankGoogleCandidatesByActivity(items, "work"); // どれも work 非整合
    expect(ids(r)).toEqual(["a", "b", "c"]);
    expect(r.every((x) => x.typeReason === null)).toBe(true);
  });
});

describe("placeCandidateRanking — gentle type nudge（GPT 補正3・テスト6,7）", () => {
  it("勉強/作業系: library が gentle に上がる（最大1ポジション）", () => {
    const items = [
      c("c0", ["restaurant"]),
      c("c1", ["gym"]),
      c("c2", ["park"]),
      c("c3", ["library"]), // work 整合
      c("c4", ["bar"]),
    ];
    const r = rerankGoogleCandidatesByActivity(items, "work");
    expect(ids(r)).toEqual(["c0", "c1", "c3", "c2", "c4"]); // c3 が c2 を 1 つ越える
    expect(r.find((x) => x.candidate.placeId === "c3")?.typeReason).toBe(
      "この予定タイプに近い場所です",
    );
  });

  it("food 系: restaurant/cafe が gentle に上がる", () => {
    const items = [c("c0", ["park"]), c("c1", ["gym"]), c("c2", ["restaurant"])];
    const r = rerankGoogleCandidatesByActivity(items, "food");
    expect(ids(r)).toEqual(["c0", "c2", "c1"]); // c2 が c1 を 1 つ越える
  });

  it("遠い/弱い（最下位）整合候補が最上位に飛ばない（GPT NG 回避）", () => {
    const items = [
      c("c0", ["restaurant"]),
      c("c1", ["gym"]),
      c("c2", ["park"]),
      c("c3", ["museum"]),
      c("c4", ["library"]), // 最下位のみ整合
    ];
    const r = rerankGoogleCandidatesByActivity(items, "work");
    expect(ids(r)[0]).toBe("c0"); // 最上位は不変
    expect(ids(r).indexOf("c4")).toBeLessThanOrEqual(3); // 最大1ポジション上昇のみ
  });

  it("同 match 状態は Google 順を維持（安定ソート）", () => {
    const items = [c("c0", ["library"]), c("c1", ["book_store"]), c("c2", ["restaurant"])];
    const r = rerankGoogleCandidatesByActivity(items, "work"); // c0,c1 整合 / c2 非整合
    expect(ids(r)).toEqual(["c0", "c1", "c2"]); // 整合2件は元順維持
  });
});

describe("placeCandidateRanking — reason は fact-only・決定的（テスト8,9,10）", () => {
  it("reason は type 整合文字列 or null のみ（人格/場所性質を出さない）", () => {
    const items = [c("a", ["library"]), c("b", ["park"])];
    const r = rerankGoogleCandidatesByActivity(items, "work");
    for (const x of r) {
      if (x.typeReason !== null) expect(x.typeReason).toBe("この予定タイプに近い場所です");
    }
  });

  it("決定的（2回同一）= no I/O・no persona", () => {
    const items = [c("a", ["library"]), c("b", ["restaurant"])];
    expect(rerankGoogleCandidatesByActivity(items, "work")).toEqual(
      rerankGoogleCandidatesByActivity(items, "work"),
    );
  });

  it("TYPE_NUDGE は 1.5（gentle = 最大1ポジション）", () => {
    expect(TYPE_NUDGE).toBe(1.5);
  });
});
