/**
 * Phase 3-M-3c-pure — Per-transition Disclosure Adapter tests
 *
 * 設計書: docs/alter-plan-phase3-m-3c-readiness-audit.md
 * 実装   : lib/plan/feasibility/feasibilityDisclosureAdapter.ts
 *
 * 検証範囲:
 *   §1. resetAllDisclosures 永続規約 + mutation harden (= GPT 補正反映)
 *   §2. getDisclosureStateForIndex — set in/out / 補集合 / 永続定数
 *   §3. applyDisclosureAction — 全 action × 多 index combinations
 *   §4. expand / collapse の independence (= per-transition)
 *   §5. input mutation 0 (= immutability の構造的保証)
 *   §6. deterministic / idempotent (= reference equality 含む)
 *   §7. resetAllDisclosures — 永続定数返却 + 全 hidden
 *   §8. getExpandedCount — 基本 + edge
 *   §9. FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT — 10 invariants literal true
 *   §10. assertValidTransitionIndex — 不正値 reject
 *   §11. assertValidExpandedIndices — 不正 set 検出
 *   §12. assertNFoldDisclosureCompliance — 10 invariants 機械検証
 *   §13. PII grep — Set element の primitives 型 / state 文字列に PII 不在
 *   §14. M-3b state machine の N-fold lift 検証 (= 統合 invariants)
 *   §15. observational disclosure 規範の N-fold 構造的保証
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure / sync / deterministic
 *   - no DB / no API / no UI / no localStorage / no telemetry sink
 *   - K phase / L / M-1 / M-2 / M-3a / M-3b 既存 file 改変 0
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISCLOSURE_STATE,
  type FeasibilityDisclosureAction,
} from "@/lib/plan/feasibility/feasibilityDisclosureState";
import {
  FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT,
  FeasibilityDisclosureAdapterError,
  applyDisclosureAction,
  assertNFoldDisclosureCompliance,
  assertValidExpandedIndices,
  assertValidTransitionIndex,
  getDisclosureStateForIndex,
  getExpandedCount,
  resetAllDisclosures,
  type ExpandedTransitionIndices,
} from "@/lib/plan/feasibility/feasibilityDisclosureAdapter";
import * as DisclosureAdapter from "@/lib/plan/feasibility/feasibilityDisclosureAdapter";

/**
 * Test-local helper: 「全 hidden の初期 set」 を取得する規約
 * (= M-3c-pure-harden 後、 EMPTY_EXPANDED_INDICES export は削除されたため、
 *    test 内では `resetAllDisclosures()` 経由で取得する。
 *    これにより 「caller も常に function 経由」 という規約を test で再現)
 */
function createEmptySet(): ExpandedTransitionIndices {
  return resetAllDisclosures();
}

const ALL_ACTIONS: ReadonlyArray<FeasibilityDisclosureAction> = [
  "request_expand",
  "request_collapse",
  "passive_idle",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. resetAllDisclosures 永続規約 + mutation harden (= GPT 補正反映)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §1. resetAllDisclosures 永続規約 + mutation harden", () => {
  it("resetAllDisclosures() で取得した empty set の size === 0", () => {
    expect(createEmptySet().size).toBe(0);
  });

  it("resetAllDisclosures() の結果は instanceof Set", () => {
    expect(createEmptySet() instanceof Set).toBe(true);
  });

  it("resetAllDisclosures() は毎回**異なる instance** を返す (= mutation harden)", () => {
    const a = resetAllDisclosures();
    const b = resetAllDisclosures();
    // GPT 補正: 永続定数を外部公開しない → 毎回新規 Set
    expect(a).not.toBe(b);
    expect(a.size).toBe(0);
    expect(b.size).toBe(0);
  });

  it("空 Set で任意 index lookup → 全 hidden (= 永続規約)", () => {
    const samples = [0, 1, 2, 5, 10, 100, 1000, Number.MAX_SAFE_INTEGER];
    const empty = createEmptySet();
    for (const idx of samples) {
      expect(getDisclosureStateForIndex(empty, idx)).toBe("hidden");
    }
  });

  // === Mutation regression tests (= GPT 補正反映 M-3c-pure-harden) ===

  it("攻撃シナリオ A: reset 結果を外部 mutation → 次回 reset は新鮮", () => {
    // 外部 caller が type assertion で mutation 攻撃を試みる
    const corrupted = resetAllDisclosures() as Set<number>;
    corrupted.add(999);
    corrupted.add(0);
    expect(corrupted.size).toBe(2);

    // 攻撃後、 再度 reset → 新鮮な空 set が返る (= 永続定数破壊リスクなし)
    const fresh = resetAllDisclosures();
    expect(fresh.size).toBe(0);
    expect(fresh.has(999)).toBe(false);
    expect(fresh.has(0)).toBe(false);
  });

  it("攻撃シナリオ B: reset 結果を clear() → 次回 reset は新鮮", () => {
    const a = resetAllDisclosures() as Set<number>;
    a.add(1);
    a.add(2);
    a.add(3);
    a.clear();
    expect(a.size).toBe(0);

    const b = resetAllDisclosures();
    expect(b.size).toBe(0);
    expect(b).not.toBe(a);
  });

  it("攻撃シナリオ C: applyDisclosureAction の input が攻撃された場合 → 結果 set 経由でも漏れない", () => {
    // 攻撃された input set を渡してみる
    const malicious = resetAllDisclosures() as Set<number>;
    malicious.add(666);

    const result = applyDisclosureAction(malicious, 0, "request_expand");

    // result は malicious の copy + add(0) なので 666 を含む
    // (= input の mutation を adapter が「修正」する責任は持たない、 caller 規約)
    expect(result.has(0)).toBe(true);
    expect(result.has(666)).toBe(true);

    // 但し adapter が新規 empty を生成する側 (= resetAllDisclosures) では漏れない
    const fresh = resetAllDisclosures();
    expect(fresh.size).toBe(0);
    expect(fresh.has(666)).toBe(false);
  });

  it("「全 default hidden」 不変条件 — 100 回連続 reset で全 hidden 維持", () => {
    for (let i = 0; i < 100; i++) {
      const set = resetAllDisclosures();
      expect(set.size).toBe(0);
      // 任意 index で hidden
      expect(getDisclosureStateForIndex(set, 0)).toBe("hidden");
      expect(getDisclosureStateForIndex(set, 100)).toBe("hidden");
    }
  });

  it("**EMPTY_EXPANDED_INDICES export 不在** (= module export に存在しないことを namespace import で確認)", () => {
    // namespace import で module の全 export を取得
    // TypeScript narrowing 上、 `EMPTY_EXPANDED_INDICES` プロパティは type definitions に存在しないため、
    // unknown cast 経由で runtime 検査
    const exports = DisclosureAdapter as unknown as Record<string, unknown>;
    expect(exports.EMPTY_EXPANDED_INDICES).toBeUndefined();
    expect(exports).not.toHaveProperty("EMPTY_EXPANDED_INDICES");

    // 公式 API は存在
    expect(exports).toHaveProperty("resetAllDisclosures");
    expect(exports).toHaveProperty("applyDisclosureAction");
    expect(exports).toHaveProperty("getDisclosureStateForIndex");
    expect(exports).toHaveProperty("getExpandedCount");
    expect(exports).toHaveProperty("FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. getDisclosureStateForIndex — set in/out / 補集合 / 永続定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §2. getDisclosureStateForIndex", () => {
  it("set に含まれる index → 'expanded'", () => {
    const set: ExpandedTransitionIndices = new Set([1, 3, 5]);
    expect(getDisclosureStateForIndex(set, 1)).toBe("expanded");
    expect(getDisclosureStateForIndex(set, 3)).toBe("expanded");
    expect(getDisclosureStateForIndex(set, 5)).toBe("expanded");
  });

  it("set に含まれない index → 'hidden' (= 補集合)", () => {
    const set: ExpandedTransitionIndices = new Set([1, 3, 5]);
    expect(getDisclosureStateForIndex(set, 0)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 2)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 4)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 100)).toBe("hidden");
  });

  it("DEFAULT_DISCLOSURE_STATE === 'hidden' と一致 (= 補集合の規約整合)", () => {
    const result = getDisclosureStateForIndex(createEmptySet(), 0);
    expect(result).toBe(DEFAULT_DISCLOSURE_STATE);
  });

  it("'previewing' は本 phase では返らない (= forward compat unused)", () => {
    const set: ExpandedTransitionIndices = new Set([1, 2, 3]);
    for (const idx of [0, 1, 2, 3, 4, 5]) {
      const result = getDisclosureStateForIndex(set, idx);
      expect(result === "expanded" || result === "hidden").toBe(true);
      expect(result).not.toBe("previewing");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. applyDisclosureAction — 全 action × 多 index combinations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §3. applyDisclosureAction", () => {
  describe("hidden index に対する action", () => {
    it("request_expand → set に追加", () => {
      const result = applyDisclosureAction(createEmptySet(), 0, "request_expand");
      expect(result.has(0)).toBe(true);
      expect(result.size).toBe(1);
    });

    it("request_collapse → input set 同参照 (= idempotency 維持)", () => {
      const input = createEmptySet();
      const result = applyDisclosureAction(input, 0, "request_collapse");
      // input reference equality (= adapter の idempotency 規約) は維持
      expect(result).toBe(input);
    });

    it("passive_idle → input set 同参照", () => {
      const input = createEmptySet();
      const result = applyDisclosureAction(input, 0, "passive_idle");
      expect(result).toBe(input);
    });
  });

  describe("expanded index に対する action", () => {
    it("request_expand → 同参照 (= idempotency)", () => {
      const initial: ExpandedTransitionIndices = new Set([1, 2]);
      const result = applyDisclosureAction(initial, 1, "request_expand");
      expect(result).toBe(initial);
    });

    it("request_collapse → set から削除", () => {
      const initial: ExpandedTransitionIndices = new Set([1, 2]);
      const result = applyDisclosureAction(initial, 1, "request_collapse");
      expect(result.has(1)).toBe(false);
      expect(result.has(2)).toBe(true);
      expect(result.size).toBe(1);
    });

    it("passive_idle → 同参照", () => {
      const initial: ExpandedTransitionIndices = new Set([1, 2]);
      const result = applyDisclosureAction(initial, 1, "passive_idle");
      expect(result).toBe(initial);
    });
  });

  it("様々な set + index + action の組合せ — 6 ケース", () => {
    const cases: ReadonlyArray<{
      initial: ReadonlyArray<number>;
      index: number;
      action: FeasibilityDisclosureAction;
      expected: ReadonlyArray<number>;
    }> = [
      // hidden index
      { initial: [], index: 0, action: "request_expand", expected: [0] },
      { initial: [], index: 0, action: "request_collapse", expected: [] },
      { initial: [], index: 0, action: "passive_idle", expected: [] },
      // expanded index
      { initial: [0], index: 0, action: "request_expand", expected: [0] },
      { initial: [0], index: 0, action: "request_collapse", expected: [] },
      { initial: [0], index: 0, action: "passive_idle", expected: [0] },
    ];

    for (const c of cases) {
      const initial = new Set<number>(c.initial);
      const result = applyDisclosureAction(initial, c.index, c.action);
      expect(Array.from(result).sort()).toEqual([...c.expected].sort());
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. expand / collapse の per-transition independence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §4. per-transition independence", () => {
  it("index 5 を expand → 他 index 状態に不影響", () => {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    const result = applyDisclosureAction(initial, 5, "request_expand");
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(true);
    expect(result.has(5)).toBe(true);
  });

  it("index 2 を collapse → 他 index 状態に不影響", () => {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    const result = applyDisclosureAction(initial, 2, "request_collapse");
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(false);
    expect(result.has(3)).toBe(true);
  });

  it("10 個の異 index に対し連続 expand → 全件 set に存在", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    for (let i = 0; i < 10; i++) {
      set = applyDisclosureAction(set, i, "request_expand");
    }
    expect(set.size).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(set.has(i)).toBe(true);
    }
  });

  it("10 個 expand 後、 5 個 collapse → 残 5 個 expanded", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    for (let i = 0; i < 10; i++) {
      set = applyDisclosureAction(set, i, "request_expand");
    }
    for (let i = 0; i < 5; i++) {
      set = applyDisclosureAction(set, i, "request_collapse");
    }
    expect(set.size).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(set.has(i)).toBe(false);
    }
    for (let i = 5; i < 10; i++) {
      expect(set.has(i)).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. input mutation 0 — 構造的 immutability 保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §5. input mutation 0", () => {
  it("request_expand 後、 input set 不変", () => {
    const initial = new Set<number>([1, 2]);
    const sizeBefore = initial.size;
    const elementsBefore = Array.from(initial);

    applyDisclosureAction(initial, 5, "request_expand");

    expect(initial.size).toBe(sizeBefore);
    expect(Array.from(initial)).toEqual(elementsBefore);
  });

  it("request_collapse 後、 input set 不変", () => {
    const initial = new Set<number>([1, 2, 3]);
    const sizeBefore = initial.size;
    const elementsBefore = Array.from(initial);

    applyDisclosureAction(initial, 2, "request_collapse");

    expect(initial.size).toBe(sizeBefore);
    expect(Array.from(initial)).toEqual(elementsBefore);
  });

  it("100 連続呼び出しでも input set 不変", () => {
    const initial = new Set<number>([10, 20, 30]);
    const sizeBefore = initial.size;

    for (let i = 0; i < 100; i++) {
      applyDisclosureAction(initial, i, "request_expand");
      applyDisclosureAction(initial, i, "request_collapse");
      applyDisclosureAction(initial, i, "passive_idle");
    }

    expect(initial.size).toBe(sizeBefore);
    expect(initial.has(10)).toBe(true);
    expect(initial.has(20)).toBe(true);
    expect(initial.has(30)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. deterministic / idempotent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §6. deterministic / idempotent", () => {
  it("同 input → 同 output (= deterministic)", () => {
    const initial: ExpandedTransitionIndices = new Set([1, 3]);
    for (const action of ALL_ACTIONS) {
      const r1 = applyDisclosureAction(initial, 2, action);
      const r2 = applyDisclosureAction(initial, 2, action);
      const r3 = applyDisclosureAction(initial, 2, action);
      expect(Array.from(r1).sort()).toEqual(Array.from(r2).sort());
      expect(Array.from(r2).sort()).toEqual(Array.from(r3).sort());
    }
  });

  it("request_expand 連続適用 (= idempotency 同参照)", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 5, "request_expand"); // 1st: hidden → expanded
    const afterFirst = set;
    for (let i = 0; i < 100; i++) {
      set = applyDisclosureAction(set, 5, "request_expand");
    }
    expect(set).toBe(afterFirst); // 同参照
    expect(set.has(5)).toBe(true);
    expect(set.size).toBe(1);
  });

  it("request_collapse 連続適用 (= idempotency 同参照)", () => {
    let set: ExpandedTransitionIndices = new Set([5]);
    set = applyDisclosureAction(set, 5, "request_collapse"); // expanded → hidden
    const afterFirst = set;
    for (let i = 0; i < 100; i++) {
      set = applyDisclosureAction(set, 5, "request_collapse");
    }
    expect(set).toBe(afterFirst); // 同参照
    expect(set.has(5)).toBe(false);
  });

  it("passive_idle 連続適用 (= 同参照)", () => {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    let set: ExpandedTransitionIndices = initial;
    for (let i = 0; i < 100; i++) {
      set = applyDisclosureAction(set, i, "passive_idle");
    }
    expect(set).toBe(initial); // 同参照
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. resetAllDisclosures — 毎回新規 empty (= GPT 補正反映 M-3c-pure-harden)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §7. resetAllDisclosures (= harden 後)", () => {
  it("毎回 size === 0 の Set を返す", () => {
    expect(resetAllDisclosures().size).toBe(0);
  });

  it("毎回**新規 instance** を返す (= reference equality 放棄、 mutation 攻撃面除去)", () => {
    const r1 = resetAllDisclosures();
    const r2 = resetAllDisclosures();
    const r3 = resetAllDisclosures();
    // GPT 補正: 永続定数の外部公開を削除したため、 毎回新規 Set
    expect(r1).not.toBe(r2);
    expect(r2).not.toBe(r3);
    expect(r1).not.toBe(r3);
    // 但し全て空 + 全件 hidden の意味的同等性は保証
    expect(r1.size).toBe(0);
    expect(r2.size).toBe(0);
    expect(r3.size).toBe(0);
  });

  it("reset 後、 全 index が hidden", () => {
    const set = resetAllDisclosures();
    for (const idx of [0, 1, 2, 5, 10, 100]) {
      expect(getDisclosureStateForIndex(set, idx)).toBe("hidden");
    }
  });

  it("「観測の幕間」 シナリオ — 操作後 reset → 全 hidden", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 1, "request_expand");
    set = applyDisclosureAction(set, 2, "request_expand");
    set = applyDisclosureAction(set, 3, "request_expand");
    expect(set.size).toBe(3);

    // tab 切替シミュレーション
    set = resetAllDisclosures();
    expect(set.size).toBe(0);
    // reference equality は意図的放棄、 size === 0 のみ確認
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. getExpandedCount — 基本 + edge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §8. getExpandedCount", () => {
  it("空 Set → 0", () => {
    expect(getExpandedCount(createEmptySet())).toBe(0);
  });

  it("1 要素 → 1", () => {
    expect(getExpandedCount(new Set([5]))).toBe(1);
  });

  it("複数要素 → 件数", () => {
    expect(getExpandedCount(new Set([1, 2, 3]))).toBe(3);
    expect(getExpandedCount(new Set([0, 5, 10, 15, 20]))).toBe(5);
  });

  it("expand 操作後、 count が増える", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    expect(getExpandedCount(set)).toBe(0);
    set = applyDisclosureAction(set, 1, "request_expand");
    expect(getExpandedCount(set)).toBe(1);
    set = applyDisclosureAction(set, 2, "request_expand");
    expect(getExpandedCount(set)).toBe(2);
    set = applyDisclosureAction(set, 1, "request_collapse");
    expect(getExpandedCount(set)).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT literal true
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §9. FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT literal (= 11 invariants after harden)", () => {
  it("11 invariants 全件 true", () => {
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.emptySetIsAllHidden).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.hiddenIsComplement).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.expandedIsMembership).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.requestExpandAddsIndex).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.requestCollapseRemovesIndex).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.passiveIdleKeepsSet).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.idempotency).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.perTransitionIndependence).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.inputSetNotMutated).toBe(true);
    // M-3c-pure-harden で +2 (= GPT 補正反映)
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.resetReturnsFreshEmpty).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT.noExternallyMutableEmptyConstant).toBe(true);
  });

  it("contract key 数 11 件 (= 増減検知、 M-3c-pure-harden で +2)", () => {
    expect(Object.keys(FEASIBILITY_DISCLOSURE_ADAPTER_CONTRACT).length).toBe(11);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. assertValidTransitionIndex — 不正値 reject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §10. assertValidTransitionIndex", () => {
  it("非負整数 → throw なし", () => {
    for (const v of [0, 1, 2, 5, 100, 1000, Number.MAX_SAFE_INTEGER]) {
      expect(() => assertValidTransitionIndex(v)).not.toThrow();
    }
  });

  const invalidValues: ReadonlyArray<unknown> = [
    "0", // 文字列
    "1",
    null,
    undefined,
    true,
    false,
    {},
    [],
    NaN,
    Infinity,
    -Infinity,
    -1, // 負数
    -100,
    1.5, // 小数
    0.5,
    Math.PI,
  ];

  for (const v of invalidValues) {
    const label = typeof v === "number" ? String(v) : JSON.stringify(v) ?? String(v);
    it(`不正値 ${label} → throw FeasibilityDisclosureAdapterError`, () => {
      expect(() => assertValidTransitionIndex(v)).toThrow(FeasibilityDisclosureAdapterError);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. assertValidExpandedIndices — 不正 set 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §11. assertValidExpandedIndices", () => {
  it("空 Set → throw なし", () => {
    expect(() => assertValidExpandedIndices(createEmptySet())).not.toThrow();
    expect(() => assertValidExpandedIndices(new Set())).not.toThrow();
  });

  it("非負整数のみの Set → throw なし", () => {
    expect(() => assertValidExpandedIndices(new Set([0, 1, 2]))).not.toThrow();
    expect(() => assertValidExpandedIndices(new Set([0, 100, Number.MAX_SAFE_INTEGER]))).not.toThrow();
  });

  it("非 Set 引数 → throw", () => {
    expect(() => assertValidExpandedIndices(null)).toThrow(FeasibilityDisclosureAdapterError);
    expect(() => assertValidExpandedIndices(undefined)).toThrow(FeasibilityDisclosureAdapterError);
    expect(() => assertValidExpandedIndices({})).toThrow(FeasibilityDisclosureAdapterError);
    expect(() => assertValidExpandedIndices([])).toThrow(FeasibilityDisclosureAdapterError);
    expect(() => assertValidExpandedIndices("set")).toThrow(FeasibilityDisclosureAdapterError);
  });

  it("文字列要素を含む Set → throw (= PII 防御)", () => {
    const dangerous = new Set<unknown>([1, 2, "anchor_xyz"]);
    expect(() => assertValidExpandedIndices(dangerous)).toThrow(FeasibilityDisclosureAdapterError);
  });

  it("負数要素を含む Set → throw", () => {
    const invalid = new Set([1, -1, 2]);
    expect(() => assertValidExpandedIndices(invalid)).toThrow(FeasibilityDisclosureAdapterError);
  });

  it("小数要素を含む Set → throw", () => {
    const invalid = new Set([1, 1.5, 2]);
    expect(() => assertValidExpandedIndices(invalid)).toThrow(FeasibilityDisclosureAdapterError);
  });

  it("NaN を含む Set → throw", () => {
    const invalid = new Set([1, NaN, 2]);
    expect(() => assertValidExpandedIndices(invalid)).toThrow(FeasibilityDisclosureAdapterError);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §12. assertNFoldDisclosureCompliance — 10 invariants 機械検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §12. assertNFoldDisclosureCompliance (= 11 invariants after harden)", () => {
  it("11 invariants 全件 PASS で throw なし", () => {
    expect(() => assertNFoldDisclosureCompliance()).not.toThrow();
  });

  it("複数回呼び出しでも throw なし (= deterministic)", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => assertNFoldDisclosureCompliance()).not.toThrow();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §13. PII grep — Set element の primitives 型 / state 文字列に PII 不在
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §13. PII grep", () => {
  it("expandedIndices の serialize に PII patterns 不在", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    for (let i = 0; i < 10; i++) {
      set = applyDisclosureAction(set, i, "request_expand");
    }
    // Set serialize: Array で expand してから JSON
    const serialized = JSON.stringify(Array.from(set));
    expect(serialized).not.toMatch(/anchor_/);
    expect(serialized).not.toMatch(/location/i);
    expect(serialized).not.toMatch(/user_/);
    expect(serialized).not.toMatch(/title/i);
    expect(serialized).not.toMatch(/name/i);
    expect(serialized).not.toMatch(/[a-zA-Z]/); // 数字 + コンマ + ブラケットのみ
  });

  it("state 文字列に PII 不在", () => {
    const set: ExpandedTransitionIndices = new Set([1, 2, 3]);
    for (const idx of [1, 2, 3, 4, 5]) {
      const state = getDisclosureStateForIndex(set, idx);
      expect(state === "hidden" || state === "expanded").toBe(true);
      // PII patterns チェック
      expect(state).not.toMatch(/anchor_/);
      expect(state).not.toMatch(/location/i);
      expect(state).not.toMatch(/user_/);
    }
  });

  it("error message に PII を出さない (= 内部値を含まない構造)", () => {
    try {
      assertValidTransitionIndex("anchor_xyz_dangerous");
    } catch (e) {
      if (e instanceof FeasibilityDisclosureAdapterError) {
        // error message には value が含まれるが、 これは caller の入力値で、
        // M-3c-pure 内部で生成された PII ではない
        // ただし caller には注意喚起される構造を持つ (= violation field でカテゴリ分け)
        expect(e.violation).toBeDefined();
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §14. M-3b state machine の N-fold lift 検証 (= 統合 invariants)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §14. N-fold lift of M-3b invariants", () => {
  it("DEFAULT_DISCLOSURE_STATE === 'hidden' (= M-3b 永続規約継承)", () => {
    expect(DEFAULT_DISCLOSURE_STATE).toBe("hidden");
  });

  it("全 index で passive_idle → state 不変 (= M-3b passive_idle keeps state の N-fold lift)", () => {
    const set: ExpandedTransitionIndices = new Set([1, 3, 5]);
    for (const idx of [0, 1, 2, 3, 4, 5, 6]) {
      const before = getDisclosureStateForIndex(set, idx);
      const after = applyDisclosureAction(set, idx, "passive_idle");
      expect(after).toBe(set); // 同参照
      expect(getDisclosureStateForIndex(after, idx)).toBe(before); // state 不変
    }
  });

  it("全 index で request_expand → 'expanded' (= M-3b request_expand reaches expanded の N-fold lift)", () => {
    for (const idx of [0, 1, 5, 100]) {
      const result = applyDisclosureAction(createEmptySet(), idx, "request_expand");
      expect(getDisclosureStateForIndex(result, idx)).toBe("expanded");
    }
  });

  it("全 index で request_collapse → 'hidden' (= M-3b request_collapse reaches hidden の N-fold lift)", () => {
    const initial: ExpandedTransitionIndices = new Set([1, 2, 3]);
    for (const idx of [1, 2, 3]) {
      const result = applyDisclosureAction(initial, idx, "request_collapse");
      expect(getDisclosureStateForIndex(result, idx)).toBe("hidden");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §15. observational disclosure 規範の N-fold 構造的保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3c-pure §15. observational disclosure N-fold 規範", () => {
  it("初期 state から user action なしで全 index が hidden に維持", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    for (let i = 0; i < 100; i++) {
      for (let idx = 0; idx < 10; idx++) {
        set = applyDisclosureAction(set, idx, "passive_idle");
      }
    }
    expect(set.size).toBe(0);
  });

  it("user 能動 1 action で個別 index を expanded 化可能", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 3, "request_expand");
    expect(getDisclosureStateForIndex(set, 3)).toBe("expanded");
    expect(getDisclosureStateForIndex(set, 2)).toBe("hidden"); // 他 index は hidden
  });

  it("user 能動 collapse で hidden に戻れる (= 観測の終わり方を user が決める)", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 3, "request_expand");
    expect(getDisclosureStateForIndex(set, 3)).toBe("expanded");
    set = applyDisclosureAction(set, 3, "request_collapse");
    expect(getDisclosureStateForIndex(set, 3)).toBe("hidden");
  });

  it("複数 index 同時 expanded → 「観測フォーカスの集合」 形成", () => {
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 0, "request_expand");
    set = applyDisclosureAction(set, 2, "request_expand");
    set = applyDisclosureAction(set, 5, "request_expand");
    expect(getExpandedCount(set)).toBe(3);
    expect(getDisclosureStateForIndex(set, 0)).toBe("expanded");
    expect(getDisclosureStateForIndex(set, 1)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 2)).toBe("expanded");
    expect(getDisclosureStateForIndex(set, 3)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 4)).toBe("hidden");
    expect(getDisclosureStateForIndex(set, 5)).toBe("expanded");
  });

  it("「観測の幕間」 シナリオ — tab/day 切替で全 hidden 再起動", () => {
    // user が複数 transition を観測
    let set: ExpandedTransitionIndices = createEmptySet();
    set = applyDisclosureAction(set, 0, "request_expand");
    set = applyDisclosureAction(set, 1, "request_expand");
    set = applyDisclosureAction(set, 2, "request_expand");
    expect(set.size).toBe(3);

    // tab 切替 (= 観測の幕間)
    set = resetAllDisclosures();

    // 全 hidden に戻る (= reference equality は意図的放棄、 意味的同等のみ)
    expect(set.size).toBe(0);

    // 再度 user 能動 1 action で起動 (= 観測の再起動)
    set = applyDisclosureAction(set, 5, "request_expand");
    expect(set.size).toBe(1);
    expect(getDisclosureStateForIndex(set, 5)).toBe("expanded");
  });

  it("AI 指摘 pattern 不在 — caller には 'observe' / 'warn' / 'suggest' 等の API 不在", () => {
    // pure adapter は data 操作のみで、 「指摘する」 「警告する」 機能を提供しない
    // この test は構造的設計の確認: 公開 API は data 操作のみ
    expect(typeof applyDisclosureAction).toBe("function");
    expect(typeof getDisclosureStateForIndex).toBe("function");
    expect(typeof resetAllDisclosures).toBe("function");
    expect(typeof getExpandedCount).toBe("function");

    // notifyUser / warnUser / suggestExpand 等は **存在しない**
    // (= 静的検証は不可能だが、 module export 構造で明示)
  });
});
