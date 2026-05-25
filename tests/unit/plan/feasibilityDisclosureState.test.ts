/**
 * Phase 3-M-3b-pure — Feasibility Disclosure State Machine tests
 *
 * 設計書: docs/alter-plan-phase3-m-3b-readiness-audit.md
 * 実装   : lib/plan/feasibility/feasibilityDisclosureState.ts
 *
 * 検証範囲:
 *   §1. default state ("hidden") 永続規約
 *   §2. state × action transition matrix (= 3 × 3 = 9 件全件)
 *   §3. passive_idle で state 不変 (= 圧防止)
 *   §4. request_expand で全 state から "expanded" 到達
 *   §5. request_collapse で全 state から "hidden" 到達
 *   §6. deterministic (= 同 input → 同 output)
 *   §7. assertValidDisclosureState — 不正値 reject
 *   §8. assertDisclosureStateMachineCompliance — 9 invariants 機械検証
 *   §9. FEASIBILITY_DISCLOSURE_CONTRACT — literal true 全件
 *   §10. 純度保証 (= no side effect, no mutation)
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure / sync / deterministic
 *   - no DB / no API / no localStorage / no network / no UI
 *   - K phase / L / M-1 / M-2 / M-3a 既存 file 改変 0
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISCLOSURE_STATE,
  FEASIBILITY_DISCLOSURE_CONTRACT,
  FeasibilityDisclosureContractError,
  assertDisclosureStateMachineCompliance,
  assertValidDisclosureState,
  nextDisclosureState,
  type FeasibilityDisclosureAction,
  type FeasibilityDisclosureState,
} from "@/lib/plan/feasibility/feasibilityDisclosureState";

const ALL_STATES: ReadonlyArray<FeasibilityDisclosureState> = [
  "hidden",
  "previewing",
  "expanded",
];

const ALL_ACTIONS: ReadonlyArray<FeasibilityDisclosureAction> = [
  "request_expand",
  "request_collapse",
  "passive_idle",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. default state — 永続規約
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §1. DEFAULT_DISCLOSURE_STATE", () => {
  it('default が "hidden" 固定 (= observational disclosure 思想 の核心)', () => {
    expect(DEFAULT_DISCLOSURE_STATE).toBe("hidden");
  });

  it('default は "expanded" / "previewing" にならない (= push 表示禁止)', () => {
    expect(DEFAULT_DISCLOSURE_STATE).not.toBe("expanded");
    expect(DEFAULT_DISCLOSURE_STATE).not.toBe("previewing");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. state × action transition matrix (= 9 件全件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §2. transition matrix", () => {
  // 3 states × 3 actions = 9 行
  const cases: ReadonlyArray<{
    current: FeasibilityDisclosureState;
    action: FeasibilityDisclosureAction;
    expected: FeasibilityDisclosureState;
    note: string;
  }> = [
    // hidden × *
    { current: "hidden", action: "request_expand", expected: "expanded", note: "user 能動 → expand" },
    { current: "hidden", action: "request_collapse", expected: "hidden", note: "既に hidden、 不変" },
    { current: "hidden", action: "passive_idle", expected: "hidden", note: "圧防止" },
    // previewing × *
    { current: "previewing", action: "request_expand", expected: "expanded", note: "user 能動 → expand" },
    { current: "previewing", action: "request_collapse", expected: "hidden", note: "縮小" },
    { current: "previewing", action: "passive_idle", expected: "previewing", note: "不変" },
    // expanded × *
    { current: "expanded", action: "request_expand", expected: "expanded", note: "既に expanded、 不変" },
    { current: "expanded", action: "request_collapse", expected: "hidden", note: "縮小" },
    { current: "expanded", action: "passive_idle", expected: "expanded", note: "不変" },
  ];

  for (const c of cases) {
    it(`(${c.current}) + (${c.action}) → (${c.expected})  // ${c.note}`, () => {
      expect(nextDisclosureState(c.current, c.action)).toBe(c.expected);
    });
  }

  it("行 (= state) 数 × 列 (= action) 数 = 9 件 全件 cover", () => {
    expect(cases.length).toBe(ALL_STATES.length * ALL_ACTIONS.length);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. passive_idle で state 不変 (= 圧防止)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §3. passive_idle 不変", () => {
  for (const state of ALL_STATES) {
    it(`(${state}) + passive_idle → (${state}) 不変`, () => {
      expect(nextDisclosureState(state, "passive_idle")).toBe(state);
    });
  }

  it('「何もしないと何も表示されない」 規範 — hidden で idle 連打 → hidden 維持', () => {
    let s: FeasibilityDisclosureState = DEFAULT_DISCLOSURE_STATE;
    for (let i = 0; i < 10; i += 1) {
      s = nextDisclosureState(s, "passive_idle");
    }
    expect(s).toBe("hidden");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. request_expand で全 state から "expanded" 到達
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §4. request_expand 集約", () => {
  for (const state of ALL_STATES) {
    it(`(${state}) + request_expand → "expanded"`, () => {
      expect(nextDisclosureState(state, "request_expand")).toBe("expanded");
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. request_collapse で全 state から "hidden" 到達
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §5. request_collapse 集約", () => {
  for (const state of ALL_STATES) {
    it(`(${state}) + request_collapse → "hidden"`, () => {
      expect(nextDisclosureState(state, "request_collapse")).toBe("hidden");
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. deterministic — 同 input → 同 output
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §6. deterministic", () => {
  for (const state of ALL_STATES) {
    for (const action of ALL_ACTIONS) {
      it(`(${state}) + (${action}) — 2 連続呼び出しで同一結果`, () => {
        const r1 = nextDisclosureState(state, action);
        const r2 = nextDisclosureState(state, action);
        const r3 = nextDisclosureState(state, action);
        expect(r1).toBe(r2);
        expect(r2).toBe(r3);
      });
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. assertValidDisclosureState — 不正値 reject
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §7. assertValidDisclosureState", () => {
  for (const state of ALL_STATES) {
    it(`valid state "${state}" → throw なし`, () => {
      expect(() => assertValidDisclosureState(state)).not.toThrow();
    });
  }

  const invalidValues: ReadonlyArray<unknown> = [
    "",
    "open",
    "closed",
    "HIDDEN",
    "Hidden",
    null,
    undefined,
    0,
    1,
    true,
    false,
    {},
    [],
    { state: "hidden" },
  ];

  for (const v of invalidValues) {
    it(`invalid value ${JSON.stringify(v) ?? String(v)} → throw FeasibilityDisclosureContractError`, () => {
      expect(() => assertValidDisclosureState(v)).toThrow(FeasibilityDisclosureContractError);
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. assertDisclosureStateMachineCompliance — 9 invariants 機械検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §8. assertDisclosureStateMachineCompliance", () => {
  it("9 invariants 全件 PASS で throw なし", () => {
    expect(() => assertDisclosureStateMachineCompliance()).not.toThrow();
  });

  it("複数回呼び出しでも throw なし (= deterministic)", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(() => assertDisclosureStateMachineCompliance()).not.toThrow();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. FEASIBILITY_DISCLOSURE_CONTRACT — literal true 全件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §9. FEASIBILITY_DISCLOSURE_CONTRACT literal", () => {
  it("9 invariants 全件 true", () => {
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.defaultIsHidden).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.passiveIdleKeepsState).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.requestExpandReachesExpanded).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.requestCollapseReachesHidden).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.hiddenIsValidState).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.previewingIsValidState).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.expandedIsValidState).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.stateTransitionIsDeterministic).toBe(true);
    expect(FEASIBILITY_DISCLOSURE_CONTRACT.unknownActionKeepsState).toBe(true);
  });

  it("contract key 数 9 件 (= 増減検知)", () => {
    expect(Object.keys(FEASIBILITY_DISCLOSURE_CONTRACT).length).toBe(9);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. 純度保証 — no side effect, no mutation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §10. 純度保証", () => {
  it("input mutation なし (= state 文字列は primitive で immutable)", () => {
    const state: FeasibilityDisclosureState = "hidden";
    const _result = nextDisclosureState(state, "request_expand");
    expect(state).toBe("hidden"); // input は変わらない
  });

  it("contract object freeze 風 — runtime mutation 試行は読み出しに影響しない", () => {
    // FEASIBILITY_DISCLOSURE_CONTRACT は as const なので readonly。
    // ここでは runtime 上で値が安定していることを確認 (= mutation 検知)
    const snapshot1 = { ...FEASIBILITY_DISCLOSURE_CONTRACT };
    nextDisclosureState("hidden", "request_expand");
    nextDisclosureState("expanded", "request_collapse");
    const snapshot2 = { ...FEASIBILITY_DISCLOSURE_CONTRACT };
    expect(snapshot1).toEqual(snapshot2);
  });

  it("state machine は完全 pure — 副作用観測 0 (= 同 seed で再現可能)", () => {
    // pure であることを 経路シミュレーションで確認
    // 経路: hidden → expand → expanded → collapse → hidden → idle → hidden → expand → expanded
    let s: FeasibilityDisclosureState = DEFAULT_DISCLOSURE_STATE;
    const trace: FeasibilityDisclosureState[] = [s];

    s = nextDisclosureState(s, "request_expand");
    trace.push(s);
    s = nextDisclosureState(s, "request_collapse");
    trace.push(s);
    s = nextDisclosureState(s, "passive_idle");
    trace.push(s);
    s = nextDisclosureState(s, "request_expand");
    trace.push(s);

    expect(trace).toEqual(["hidden", "expanded", "hidden", "hidden", "expanded"]);

    // 再現: 同経路で同 trace
    let s2: FeasibilityDisclosureState = DEFAULT_DISCLOSURE_STATE;
    const trace2: FeasibilityDisclosureState[] = [s2];
    s2 = nextDisclosureState(s2, "request_expand");
    trace2.push(s2);
    s2 = nextDisclosureState(s2, "request_collapse");
    trace2.push(s2);
    s2 = nextDisclosureState(s2, "passive_idle");
    trace2.push(s2);
    s2 = nextDisclosureState(s2, "request_expand");
    trace2.push(s2);

    expect(trace2).toEqual(trace);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. observational disclosure 思想 の構造的保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Phase 3-M-3b-pure §11. observational disclosure 規範", () => {
  it('初期 state から user action なしでは "expanded" に到達不能', () => {
    // 「何もしない」 を何度繰り返しても hidden のまま
    let s: FeasibilityDisclosureState = DEFAULT_DISCLOSURE_STATE;
    for (let i = 0; i < 100; i += 1) {
      s = nextDisclosureState(s, "passive_idle");
    }
    expect(s).toBe("hidden");
    expect(s).not.toBe("expanded");
  });

  it('user の能動 1 action で "expanded" に到達 (= 観測の入口)', () => {
    const s = nextDisclosureState(DEFAULT_DISCLOSURE_STATE, "request_expand");
    expect(s).toBe("expanded");
  });

  it("user 能動の collapse で hidden に戻れる (= 観測の終わり方を user が決める)", () => {
    let s = nextDisclosureState(DEFAULT_DISCLOSURE_STATE, "request_expand");
    expect(s).toBe("expanded");
    s = nextDisclosureState(s, "request_collapse");
    expect(s).toBe("hidden");
  });
});
