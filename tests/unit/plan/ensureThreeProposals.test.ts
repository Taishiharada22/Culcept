import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import type {
  CalendarOutfitItemVM,
  CalendarOutfitProposalVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";
import {
  diffScore,
  formalityRankOf,
  findSwapCandidate,
  swapProposalAxis,
  variantOfVM,
  assignRolesFromEngine,
  ensureThreeProposals,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/ensureThreeProposals";

/**
 * D1-1 — 3 候補保証 pure helper のテスト。
 *
 * 重点:
 *   - main を中央 (proposals[1]) に必ず置く（CEO 補正の根拠 = OutfitCarousel.initialIndex=1 for count=3）
 *   - swap-by-axis で派生候補を作る
 *   - mock pad で diff 保証
 *   - source は engine / engine_padded の 2 値
 */

// ── factories ─────────────────────────────────────────

function w(p: Partial<WardrobeItem> & { id: string; category?: WardrobeItem["category"] }): WardrobeItem {
  return {
    name: p.id,
    category: p.category ?? "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

function vmItem(id: string, category = "トップス"): CalendarOutfitItemVM {
  return { id, category, label: id, shape: "top", color: "#000" };
}

function vm(
  id: string,
  itemIds: string[] = ["t1", "b1", "s1"],
  opts?: { withOuter?: boolean; title?: string },
): CalendarOutfitProposalVM {
  const items: CalendarOutfitItemVM[] = itemIds.map((i) => vmItem(i));
  if (opts?.withOuter) items.push(vmItem("o1", "アウター"));
  return {
    id,
    title: opts?.title ?? "title",
    items,
    syncScore: 80,
    syncBandKey: "good",
  };
}

const deps = {
  itemToVM: (item: WardrobeItem): CalendarOutfitItemVM => ({
    id: item.id,
    category: "トップス",
    label: item.name,
    shape: "top",
    color: "#000",
  }),
};

// ── variantOfVM ───────────────────────────────────────

describe("variantOfVM", () => {
  it("engine id prefix から variant を抽出", () => {
    expect(variantOfVM(vm("main-12345"))).toBe("main");
    expect(variantOfVM(vm("casual-12345"))).toBe("casual");
    expect(variantOfVM(vm("dressy-12345"))).toBe("dressy");
    expect(variantOfVM(vm("rain-12345"))).toBe("rain");
    expect(variantOfVM(vm("cold-12345"))).toBe("cold");
  });
  it("mock id では null", () => {
    expect(variantOfVM(vm("mock-outfit-office"))).toBeNull();
    expect(variantOfVM(vm("hydrated-12345"))).toBeNull();
  });
});

// ── diffScore ─────────────────────────────────────────

describe("diffScore", () => {
  it("完全同一 → 0", () => {
    expect(diffScore(vm("a", ["x", "y", "z"]), vm("b", ["x", "y", "z"]))).toBe(0);
  });
  it("1 item 入れ替え → 2（消失 1 + 新規 1）", () => {
    expect(diffScore(vm("a", ["x", "y", "z"]), vm("b", ["x", "y", "w"]))).toBe(2);
  });
  it("outer 有無の差 → 対称差 +0.5", () => {
    // a に "o1" outer 追加 → ids 対称差 +1（"o1" は a だけ）、 outer 有無差 +0.5 → 計 1.5
    const a = vm("a", ["x", "y", "z"], { withOuter: true });
    const b = vm("b", ["x", "y", "z"], { withOuter: false });
    expect(diffScore(a, b)).toBe(1.5);
  });
  it("対称: diffScore(a,b) === diffScore(b,a)", () => {
    const a = vm("a", ["x", "y", "z"], { withOuter: true });
    const b = vm("b", ["x", "w", "z"], { withOuter: false });
    expect(diffScore(a, b)).toBe(diffScore(b, a));
  });
});

// ── formalityRankOf ───────────────────────────────────

describe("formalityRankOf", () => {
  it("casual=0 smart=1 dress=2", () => {
    expect(formalityRankOf(w({ id: "x", formality: "casual" }))).toBe(0);
    expect(formalityRankOf(w({ id: "x", formality: "smart" }))).toBe(1);
    expect(formalityRankOf(w({ id: "x", formality: "dress" }))).toBe(2);
  });
  it("未指定 / 異常値は 0 扱い", () => {
    expect(formalityRankOf(w({ id: "x" }))).toBe(0);
    expect(formalityRankOf(w({ id: "x", formality: "weird" as never }))).toBe(0);
  });
});

// ── findSwapCandidate ─────────────────────────────────

describe("findSwapCandidate", () => {
  const tops = [
    w({ id: "t-casual", category: "tops", formality: "casual" }),
    w({ id: "t-smart", category: "tops", formality: "smart" }),
    w({ id: "t-dress", category: "tops", formality: "dress" }),
  ];
  it("direction=-1 (relaxed): smart base → casual を返す（1 段下）", () => {
    const base = tops[1]; // smart
    expect(findSwapCandidate(base, tops, -1)?.id).toBe("t-casual");
  });
  it("direction=+1 (smart): casual base → smart を返す（1 段上、 dress より近い）", () => {
    const base = tops[0]; // casual
    expect(findSwapCandidate(base, tops, +1)?.id).toBe("t-smart");
  });
  it("base 自身は候補にしない", () => {
    const base = tops[1];
    const result = findSwapCandidate(base, tops, -1);
    expect(result?.id).not.toBe(base.id);
  });
  it("カテゴリ違いは候補にしない", () => {
    const base = tops[0];
    const pool = [w({ id: "b1", category: "bottoms", formality: "smart" })];
    expect(findSwapCandidate(base, pool, +1)).toBeNull();
  });
  it("該当方向の候補が無い → null", () => {
    const base = w({ id: "t-d", category: "tops", formality: "dress" });
    const pool = [base, w({ id: "t-d2", category: "tops", formality: "dress" })]; // 同 rank のみ
    // direction=+1: dress より上は無い → 同 rank が候補（delta=0）として返る
    expect(findSwapCandidate(base, pool, +1)?.id).toBe("t-d2");
  });
  it("候補ゼロ → null", () => {
    const base = tops[0];
    expect(findSwapCandidate(base, [base], -1)).toBeNull();
  });
});

// ── swapProposalAxis ──────────────────────────────────

describe("swapProposalAxis", () => {
  const wardrobe = [
    w({ id: "t-c", category: "tops", formality: "casual" }),
    w({ id: "t-s", category: "tops", formality: "smart" }),
    w({ id: "b-c", category: "bottoms", formality: "casual" }),
    w({ id: "b-s", category: "bottoms", formality: "smart" }),
  ];
  const wardrobeById = new Map(wardrobe.map((w) => [w.id, w] as const));

  it("direction=-1: base の formality 最も高い item を 1 段下に swap", () => {
    const base = vm("main-1", ["t-s", "b-s"]); // 両方 smart
    const out = swapProposalAxis({
      base,
      wardrobeById,
      pool: wardrobe,
      direction: -1,
      idSuffix: "relaxed",
      titleOverride: "リラックス寄り",
      deps,
    });
    expect(out).not.toBeNull();
    expect(out!.id).toBe("main-1-relaxed");
    expect(out!.title).toBe("リラックス寄り");
    // 元の smart item のうち、 1 つが casual 同カテゴリに置換されている
    const newIds = out!.items.map((i) => i.id);
    expect(newIds.includes("t-c") || newIds.includes("b-c")).toBe(true);
  });

  it("direction=+1: 最も formality 低い item を 1 段上に swap", () => {
    const base = vm("main-1", ["t-c", "b-c"]); // 両方 casual
    const out = swapProposalAxis({
      base,
      wardrobeById,
      pool: wardrobe,
      direction: 1,
      idSuffix: "smart",
      deps,
    });
    expect(out).not.toBeNull();
    const newIds = out!.items.map((i) => i.id);
    expect(newIds.includes("t-s") || newIds.includes("b-s")).toBe(true);
  });

  it("base に wardrobe 未紐付け item のみ → null", () => {
    const base = vm("main-1", ["unknown-1", "unknown-2"]);
    const out = swapProposalAxis({
      base,
      wardrobeById,
      pool: wardrobe,
      direction: -1,
      idSuffix: "x",
      deps,
    });
    expect(out).toBeNull();
  });

  it("swap 候補が無い場合 → null", () => {
    const base = vm("main-1", ["t-c"]);
    const onlySelf = new Map([["t-c", wardrobeById.get("t-c")!]]);
    const out = swapProposalAxis({
      base,
      wardrobeById: onlySelf,
      pool: [wardrobeById.get("t-c")!],
      direction: -1,
      idSuffix: "x",
      deps,
    });
    expect(out).toBeNull();
  });
});

// ── assignRolesFromEngine ─────────────────────────────

describe("assignRolesFromEngine", () => {
  it("Tier A: main + casual + dressy → relaxed=casual / main=main / smart=dressy", () => {
    const engine = [vm("main-1"), vm("casual-2"), vm("dressy-3")];
    const r = assignRolesFromEngine(engine);
    expect(r.main?.id).toBe("main-1");
    expect(r.relaxed?.id).toBe("casual-2");
    expect(r.smart?.id).toBe("dressy-3");
  });

  it("rain は relaxed 優先、 cold は smart 優先（fallback）", () => {
    const engine = [vm("main-1"), vm("rain-2"), vm("cold-3")];
    const r = assignRolesFromEngine(engine);
    expect(r.relaxed?.id).toBe("rain-2");
    expect(r.smart?.id).toBe("cold-3");
  });

  it("casual と rain 両方ある → casual を relaxed に優先採用", () => {
    const engine = [vm("main-1"), vm("rain-2"), vm("casual-3")];
    const r = assignRolesFromEngine(engine);
    expect(r.relaxed?.id).toBe("casual-3");
  });

  it("alternatives ゼロ → main のみ、 relaxed/smart は null", () => {
    const r = assignRolesFromEngine([vm("main-1")]);
    expect(r.main?.id).toBe("main-1");
    expect(r.relaxed).toBeNull();
    expect(r.smart).toBeNull();
  });

  it("engineVMs 空 → 全 null", () => {
    const r = assignRolesFromEngine([]);
    expect(r.main).toBeNull();
    expect(r.relaxed).toBeNull();
    expect(r.smart).toBeNull();
  });
});

// ── ensureThreeProposals (main) ────────────────────────

const MOCK_PROPOSALS: CalendarOutfitProposalVM[] = [
  { ...vm("mock-office", ["mof-t", "mof-b", "mof-s"]), title: "office mock" },
  { ...vm("mock-smart", ["msm-t", "msm-b", "msm-s"]), title: "smart mock" },
  { ...vm("mock-fem", ["mfm-t", "mfm-b", "mfm-s"]), title: "feminine mock" },
];

describe("ensureThreeProposals — D1 中核", () => {
  it("① main が中央 proposals[1] に置かれる（CEO 補正）", () => {
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", ["m-t", "m-b", "m-s"]),
        vm("casual-2", ["c-t", "c-b", "c-s"]),
        vm("dressy-3", ["d-t", "d-b", "d-s"]),
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out).not.toBeNull();
    expect(out!.proposals).toHaveLength(3);
    expect(out!.proposals[1].id).toBe("main-1");
  });

  it("② Tier A: 3 件 engine 由来 → source=engine, 配置=[casual, main, dressy]", () => {
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", ["m-t", "m-b", "m-s"]),
        vm("casual-2", ["c-t", "c-b", "c-s"]),
        vm("dressy-3", ["d-t", "d-b", "d-s"]),
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out!.source).toBe("engine");
    expect(out!.proposals[0].id).toBe("casual-2");
    expect(out!.proposals[2].id).toBe("dressy-3");
  });

  it("③ Tier B: engine main のみ + wardrobe 充実 → source=engine_padded, swap 派生で 3 件", () => {
    const wardrobe = [
      w({ id: "t-c", category: "tops", formality: "casual" }),
      w({ id: "t-s", category: "tops", formality: "smart" }),
      w({ id: "b-c", category: "bottoms", formality: "casual" }),
      w({ id: "b-s", category: "bottoms", formality: "smart" }),
    ];
    const out = ensureThreeProposals({
      engineVMs: [vm("main-1", ["t-c", "b-s"])],
      wardrobe,
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out!.source).toBe("engine_padded");
    expect(out!.proposals).toHaveLength(3);
    expect(out!.proposals[1].id).toBe("main-1");
    // 派生 VM の id は main-1-relaxed / main-1-smart のサフィックスを持つ
    expect(out!.proposals[0].id).toMatch(/^main-1-relaxed$|^mock-/);
    expect(out!.proposals[2].id).toMatch(/^main-1-smart$|^mock-/);
  });

  it("④ Tier B fallback: wardrobe 不足で swap 不可 → mock pad", () => {
    const out = ensureThreeProposals({
      engineVMs: [vm("main-1", ["unknown-t", "unknown-b"])],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out!.source).toBe("engine_padded");
    expect(out!.proposals[1].id).toBe("main-1");
    expect(out!.proposals[0].id).toContain("mock-");
    expect(out!.proposals[2].id).toContain("mock-");
  });

  it("⑤ engineVMs 空 → null（caller が Tier C/D に分岐）", () => {
    expect(
      ensureThreeProposals({
        engineVMs: [],
        wardrobe: [],
        mockProposals: MOCK_PROPOSALS,
        deps,
      }),
    ).toBeNull();
  });

  it("⑥ diff 保証: main 複製は並ばない（mock pad で置換）", () => {
    // engine alternatives が main と完全同一の場合（理論上は engine 側で drop されるが念のため）
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", ["x", "y", "z"]),
        vm("casual-2", ["x", "y", "z"]), // main 完全コピー
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out!.source).toBe("engine_padded");
    expect(out!.proposals[1].id).toBe("main-1");
    // proposals[0] は casual-2 ではなく mock pad に置換されているはず（diff=0 だから）
    expect(out!.proposals[0].id).not.toBe("casual-2");
  });

  it("⑦ relaxed と smart の diff: 完全同一なら smart 側を pad", () => {
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", ["m-t", "m-b"]),
        vm("casual-2", ["c-t", "c-b"]),
        vm("dressy-3", ["c-t", "c-b"]), // casual と完全同一
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    expect(out!.proposals[1].id).toBe("main-1");
    expect(out!.proposals[0].id).toBe("casual-2");
    expect(out!.proposals[2].id).not.toBe("dressy-3");
    expect(out!.proposals[2].id).toContain("mock-");
  });

  it("⑧ Tier A の最終配置で diff ≥ 1 を全ペアで満たす", () => {
    const out = ensureThreeProposals({
      engineVMs: [
        vm("main-1", ["m-t", "m-b", "m-s"]),
        vm("casual-2", ["c-t", "m-b", "m-s"]), // 1 件違い
        vm("dressy-3", ["d-t", "m-b", "m-s"]), // 1 件違い
      ],
      wardrobe: [],
      mockProposals: MOCK_PROPOSALS,
      deps,
    });
    const [a, b, c] = out!.proposals;
    expect(diffScore(a, b)).toBeGreaterThanOrEqual(1);
    expect(diffScore(b, c)).toBeGreaterThanOrEqual(1);
    expect(diffScore(a, c)).toBeGreaterThanOrEqual(1);
  });

  it("⑨ 配列は必ず長さ 3", () => {
    const cases: CalendarOutfitProposalVM[][] = [
      [vm("main-1")],
      [vm("main-1"), vm("casual-2")],
      [vm("main-1"), vm("casual-2"), vm("dressy-3")],
    ];
    for (const engineVMs of cases) {
      const out = ensureThreeProposals({
        engineVMs,
        wardrobe: [],
        mockProposals: MOCK_PROPOSALS,
        deps,
      });
      expect(out!.proposals).toHaveLength(3);
    }
  });
});
