import { describe, it, expect } from "vitest";

import type { CalendarOutfitItemVM, CalendarOutfitProposalVM } from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";
import {
  diffScore,
  mainAxisDiff,
  supplementalDiff,
  ensureThreeProposals,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/ensureThreeProposals";

/**
 * D5 — diffScore 分離: main-axis (tops/bottoms/shoes/outer) required + supplemental (bag/accessory) tie-breaker。
 *
 * CEO 推奨補正反映:
 *   mainAxisDiff >= 1 のときだけ supplementalDiff を加点。
 *   bag/accessory だけ違う or outer 0.5 差だけでは閾値 1.0 に届かず、 mock pad に倒れる。
 *
 * 不変原則:
 *   - main-axis: "トップス" / "ボトムス" / "シューズ" / "アウター"（VM.category 完全一致）
 *   - supplemental: "バッグ" / "小物"
 *   - 既存 D1 outer 0.5 セマンティクスは main-axis 内で完全保持
 */

function item(id: string, category: string): CalendarOutfitItemVM {
  return { id, category, label: id, shape: "top", color: "#000" };
}
function vm(id: string, items: CalendarOutfitItemVM[]): CalendarOutfitProposalVM {
  return { id, title: id, items, syncScore: 80, syncBandKey: "good" };
}

// 各 axis の item factory
const tops = (id: string) => item(id, "トップス");
const bottoms = (id: string) => item(id, "ボトムス");
const shoes = (id: string) => item(id, "シューズ");
const outer = (id: string) => item(id, "アウター");
const bag = (id: string) => item(id, "バッグ");
const acc = (id: string) => item(id, "小物");

// ── mainAxisDiff ─────────────────────────────────────────

describe("mainAxisDiff — tops/bottoms/shoes/outer の id 対称差 + outer 有無差", () => {
  it("main-axis 完全同一 + bag/accessory のみ違い → 0（bag/accessory は対象外）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-B")]);
    expect(mainAxisDiff(a, b)).toBe(0);
  });

  it("tops 1 件入れ替え → 2（消失 1 + 新規 1）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1")]);
    const b = vm("b", [tops("t2"), bottoms("b1"), shoes("s1")]);
    expect(mainAxisDiff(a, b)).toBe(2);
  });

  it("outer 有無の差のみ → 1.5（a に outer 追加 = id 差 1 + outer 有無 0.5）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), outer("o1")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1")]);
    expect(mainAxisDiff(a, b)).toBe(1.5);
  });

  it("対称: mainAxisDiff(a,b) === mainAxisDiff(b,a)", () => {
    const a = vm("a", [tops("t1"), outer("o1"), bag("bag-A")]);
    const b = vm("b", [tops("t2"), bag("bag-B")]);
    expect(mainAxisDiff(a, b)).toBe(mainAxisDiff(b, a));
  });
});

// ── supplementalDiff ─────────────────────────────────────

describe("supplementalDiff — bag/accessory の id 対称差 ×0.5", () => {
  it("bag 1 件入れ替え → 1.0（0.5 + 0.5）", () => {
    const a = vm("a", [tops("t1"), bag("bag-A")]);
    const b = vm("b", [tops("t1"), bag("bag-B")]);
    expect(supplementalDiff(a, b)).toBe(1);
  });

  it("accessory 1 件入れ替え → 1.0", () => {
    const a = vm("a", [tops("t1"), acc("acc-A")]);
    const b = vm("b", [tops("t1"), acc("acc-B")]);
    expect(supplementalDiff(a, b)).toBe(1);
  });

  it("main-axis のみ違い → supplemental は 0", () => {
    const a = vm("a", [tops("t1"), bag("bag-X")]);
    const b = vm("b", [tops("t2"), bag("bag-X")]);
    expect(supplementalDiff(a, b)).toBe(0);
  });
});

// ── diffScore（CEO 推奨 B 採用: mainAxisDiff >= 1 のときだけ加点）─

describe("diffScore — D5 新ルール（main-axis required + supplemental tie-breaker）", () => {
  it("① bag だけ違う候補 → diffScore 0（main 0 で supplemental 無効化）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-B")]);
    expect(diffScore(a, b)).toBe(0);
  });

  it("② accessory だけ違う候補 → diffScore 0", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), acc("acc-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), acc("acc-B")]);
    expect(diffScore(a, b)).toBe(0);
  });

  it("③ bag + accessory だけ違う候補 → diffScore 0", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-A"), acc("acc-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-B"), acc("acc-B")]);
    expect(diffScore(a, b)).toBe(0);
  });

  it("④ tops だけ違う候補 → 2（既存通り meaningful・D1 互換）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1")]);
    const b = vm("b", [tops("t2"), bottoms("b1"), shoes("s1")]);
    expect(diffScore(a, b)).toBe(2);
  });

  it("⑤ tops 違い + bag 違い → main + supplemental（tie-breaker 加算）", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-A")]);
    const b = vm("b", [tops("t2"), bottoms("b1"), shoes("s1"), bag("bag-B")]);
    // main: 2 (tops 入れ替え) + supplemental: 1.0 (bag 入れ替え) = 3.0
    expect(diffScore(a, b)).toBe(3);
  });

  it("⑥ outer 有無差 + bag 違い → outer 0.5 のみは main < 1 なので supplemental 無効化", () => {
    // CEO 推奨補正: mainAxisDiff 1.5（id 差 1 + outer 0.5）は >= 1 なので supplemental 加算される
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), outer("o1"), bag("bag-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), bag("bag-B")]);
    // main: id 差 1 (outer) + outer 有無 0.5 = 1.5; supplemental: bag 1.0 → 計 2.5
    expect(diffScore(a, b)).toBe(2.5);
  });

  it("⑥b 同 outer 同 main + bag 違い → main 0 → 0", () => {
    const a = vm("a", [tops("t1"), bottoms("b1"), shoes("s1"), outer("o1"), bag("bag-A")]);
    const b = vm("b", [tops("t1"), bottoms("b1"), shoes("s1"), outer("o1"), bag("bag-B")]);
    expect(diffScore(a, b)).toBe(0); // bag だけ違う → 通さない
  });

  it("既存 D1 outer test 互換: a に outer 追加 [id 1 + outer 0.5] → 1.5", () => {
    const a = vm("a", [tops("x"), tops("y"), tops("z"), outer("o1")]);
    const b = vm("b", [tops("x"), tops("y"), tops("z")]);
    expect(diffScore(a, b)).toBe(1.5);
  });

  it("対称: diffScore(a,b) === diffScore(b,a)", () => {
    const a = vm("a", [tops("t1"), outer("o1"), bag("bag-A")]);
    const b = vm("b", [tops("t2"), bag("bag-B")]);
    expect(diffScore(a, b)).toBe(diffScore(b, a));
  });
});

// ── ensureThreeProposals 統合: bag だけ違う候補が通らないこと（mock pad 置換）─

const MOCK_PROPOSALS: CalendarOutfitProposalVM[] = [
  vm("mock-office", [tops("mof-t"), bottoms("mof-b"), shoes("mof-s")]),
  vm("mock-smart", [tops("msm-t"), bottoms("msm-b"), shoes("msm-s")]),
  vm("mock-fem", [tops("mfm-t"), bottoms("mfm-b"), shoes("mfm-s")]),
];

describe("ensureThreeProposals — D5 反映: bag だけ違う候補は mock pad に倒れる", () => {
  it("⑦ engine main + casual(bag だけ違い) + dressy(bag だけ違い) → casual/dressy は mock pad で置換", () => {
    const mainItems = [tops("m-t"), bottoms("m-b"), shoes("m-s"), bag("bag-MAIN")];
    const casualItems = [tops("m-t"), bottoms("m-b"), shoes("m-s"), bag("bag-CASUAL")];
    const dressyItems = [tops("m-t"), bottoms("m-b"), shoes("m-s"), bag("bag-DRESSY")];
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", mainItems),
        vm("casual-2", casualItems),
        vm("dressy-3", dressyItems),
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps: { itemToVM: (item) => ({ id: item.id, category: "トップス", label: item.id, shape: "top", color: "#000" }) },
    });
    expect(out).not.toBeNull();
    expect(out!.source).toBe("engine_padded");
    expect(out!.proposals[1].id).toBe("main-1"); // 中央は main
    // 端は mock pad（bag だけ違う engine.casual / engine.dressy は弾かれた）
    expect(out!.proposals[0].id).toContain("mock-");
    expect(out!.proposals[2].id).toContain("mock-");
  });

  it("⑧ tops 違い + bag 違い → engine alternatives がそのまま採用される（main + supplemental ある）", () => {
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", [tops("m-t"), bottoms("m-b"), shoes("m-s"), bag("bag-MAIN")]),
        vm("casual-2", [tops("c-t"), bottoms("m-b"), shoes("m-s"), bag("bag-CASUAL")]),
        vm("dressy-3", [tops("d-t"), bottoms("m-b"), shoes("m-s"), bag("bag-DRESSY")]),
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps: { itemToVM: (item) => ({ id: item.id, category: "トップス", label: item.id, shape: "top", color: "#000" }) },
    });
    expect(out).not.toBeNull();
    expect(out!.source).toBe("engine"); // 全部 engine 採用
    expect(out!.proposals[0].id).toBe("casual-2");
    expect(out!.proposals[1].id).toBe("main-1");
    expect(out!.proposals[2].id).toBe("dressy-3");
  });
});
