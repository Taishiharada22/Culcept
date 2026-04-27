/**
 * Stage 2 L2-a — Presence types & constants 網羅 test
 *
 * plan §5.1 Gate:
 *   - 型 shape 固定
 *   - toFamily 逆変換 (F1 → F, F2 → F, その他 → identity)
 *   - matrix 網羅性 (9 state × 7 variant = 63 セル埋め)
 */

import { describe, it, expect } from "vitest";

import {
  PATTERN_FAMILIES,
  PATTERN_VARIANTS,
  PRESENCE_MODES,
  PRESENCE_STATES,
  EXECUTOR_AVAILABILITIES,
  SIGNAL_KINDS,
  SIGNAL_STRENGTHS,
  toFamily,
  type PatternFamily,
  type PatternVariant,
  type PresenceMode,
  type PresenceState,
  type ExecutorAvailability,
  type SignalKind,
  type SignalStrength,
  type PresenceSignal,
} from "@/lib/coalter/presence/types";

import {
  PATTERN_STATE_ALLOWED,
  COOLDOWN_KINDS,
  COOLDOWN_DEFAULT_DURATION_MS,
  STATE_PATTERN_PRIORITY,
  SIGNAL_KIND_DEFAULT_STRENGTH,
  isPatternStateAllowed,
  getAllowedPatterns,
  iteratePatternStateCells,
} from "@/lib/coalter/presence/constants";

// ─────────────────────────────────────────────
// 型 shape 固定 (列挙の counts と要素チェック)
// ─────────────────────────────────────────────

describe("L2-a types — 列挙の counts と要素", () => {
  it("PRESENCE_STATES は S0-S8 の 9 個", () => {
    expect(PRESENCE_STATES).toHaveLength(9);
    expect([...PRESENCE_STATES]).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
    ]);
  });

  it("PRESENCE_MODES は normal/daily/travel の 3 個", () => {
    expect(PRESENCE_MODES).toHaveLength(3);
    expect([...PRESENCE_MODES]).toEqual(["normal", "daily", "travel"]);
  });

  it("PATTERN_VARIANTS は A/B/C/D/E/F1/F2 の 7 個", () => {
    expect(PATTERN_VARIANTS).toHaveLength(7);
    expect([...PATTERN_VARIANTS]).toEqual(["A", "B", "C", "D", "E", "F1", "F2"]);
  });

  it("PATTERN_FAMILIES は A/B/C/D/E/F の 6 個", () => {
    expect(PATTERN_FAMILIES).toHaveLength(6);
    expect([...PATTERN_FAMILIES]).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("EXECUTOR_AVAILABILITIES は 5 個 (disabled/inactive/pending_consent/enabled/active)", () => {
    expect(EXECUTOR_AVAILABILITIES).toHaveLength(5);
    expect([...EXECUTOR_AVAILABILITIES]).toEqual([
      "disabled",
      "inactive",
      "pending_consent",
      "enabled",
      "active",
    ]);
  });

  it("SIGNAL_KINDS は 5 分類 (runtime §1.1 不可侵)", () => {
    expect(SIGNAL_KINDS).toHaveLength(5);
    expect([...SIGNAL_KINDS]).toEqual([
      "explicit",
      "implicit",
      "critical",
      "mode_promotion",
      "manual_restart",
    ]);
  });

  it("SIGNAL_STRENGTHS は strong/soft/none の 3 段階 (runtime §1.2)", () => {
    expect(SIGNAL_STRENGTHS).toHaveLength(3);
    expect([...SIGNAL_STRENGTHS]).toEqual(["strong", "soft", "none"]);
  });
});

// ─────────────────────────────────────────────
// toFamily 逆変換 (統合契約 §4.2 family6 概念)
// ─────────────────────────────────────────────

describe("L2-a toFamily — variant → family 変換", () => {
  it("F1 → F (関係提案 family collapse)", () => {
    expect(toFamily("F1")).toBe("F");
  });

  it("F2 → F (生活提案 family collapse)", () => {
    expect(toFamily("F2")).toBe("F");
  });

  it("A/B/C/D/E はすべて identity (家族 = variant)", () => {
    expect(toFamily("A")).toBe("A");
    expect(toFamily("B")).toBe("B");
    expect(toFamily("C")).toBe("C");
    expect(toFamily("D")).toBe("D");
    expect(toFamily("E")).toBe("E");
  });

  it("全 variant が family に正しく写像する (網羅 7 ケース)", () => {
    const expected: Record<PatternVariant, PatternFamily> = {
      A: "A",
      B: "B",
      C: "C",
      D: "D",
      E: "E",
      F1: "F",
      F2: "F",
    };
    for (const v of PATTERN_VARIANTS) {
      expect(toFamily(v)).toBe(expected[v]);
    }
  });
});

// ─────────────────────────────────────────────
// PATTERN_STATE_ALLOWED 網羅性 (9 state × 7 variant = 63 セル)
// ─────────────────────────────────────────────

describe("L2-a PATTERN_STATE_ALLOWED — UI spec §7.12 網羅", () => {
  it("63 セルすべてが boolean で埋まっている (穴なし)", () => {
    let cells = 0;
    for (const cell of iteratePatternStateCells()) {
      expect(typeof cell.allowed).toBe("boolean");
      cells++;
    }
    expect(cells).toBe(63);
  });

  it("UI spec §7.12 表どおりの ✓ セル: A=[S2], B=[S5], C=[S2,S5], D=[S5], E=[S5], F1=[S7], F2=[S7]", () => {
    expect([...getAllowedPatterns("S0")]).toEqual([]);
    expect([...getAllowedPatterns("S1")]).toEqual([]);
    expect([...getAllowedPatterns("S2")]).toEqual(["A", "C"]);
    expect([...getAllowedPatterns("S3")]).toEqual([]);
    expect([...getAllowedPatterns("S4")]).toEqual([]);
    expect([...getAllowedPatterns("S5")]).toEqual(["B", "C", "D", "E"]);
    expect([...getAllowedPatterns("S6")]).toEqual([]);
    expect([...getAllowedPatterns("S7")]).toEqual(["F1", "F2"]);
    expect([...getAllowedPatterns("S8")]).toEqual([]);
  });

  it("isPatternStateAllowed は PATTERN_STATE_ALLOWED と一致する", () => {
    for (const v of PATTERN_VARIANTS) {
      for (const s of PRESENCE_STATES) {
        expect(isPatternStateAllowed(v, s)).toBe(PATTERN_STATE_ALLOWED[v][s]);
      }
    }
  });

  it("発話パターンを持たない 6 状態 (S0/S1/S3/S4/S6/S8) は全 variant 不許可 (v1.1 §8.2)", () => {
    const noSpeechStates: PresenceState[] = ["S0", "S1", "S3", "S4", "S6", "S8"];
    for (const s of noSpeechStates) {
      for (const v of PATTERN_VARIANTS) {
        expect(PATTERN_STATE_ALLOWED[v][s]).toBe(false);
      }
    }
  });

  it("✓ セルの総数は 9 (A:1 + B:1 + C:2 + D:1 + E:1 + F1:1 + F2:1 + …)", () => {
    let count = 0;
    for (const cell of iteratePatternStateCells()) {
      if (cell.allowed) count++;
    }
    // A=S2, B=S5, C=S2/S5, D=S5, E=S5, F1=S7, F2=S7 = 1+1+2+1+1+1+1 = 8
    expect(count).toBe(8);
  });
});

// ─────────────────────────────────────────────
// STATE_PATTERN_PRIORITY (§7.12 fallback 順)
// ─────────────────────────────────────────────

describe("L2-a STATE_PATTERN_PRIORITY — 状態内優先順", () => {
  it("S2 優先順は [A, C] (A default、C は情報欠落時 fallback)", () => {
    expect([...(STATE_PATTERN_PRIORITY.S2 ?? [])]).toEqual(["A", "C"]);
  });

  it("S5 優先順は [C, B, D, E] (確認先行で裁判官化リスク回避、§11.1)", () => {
    expect([...(STATE_PATTERN_PRIORITY.S5 ?? [])]).toEqual(["C", "B", "D", "E"]);
  });

  it("S7 優先順は [F2, F1] (Daily/Travel default は F2、F1 standalone は通常 S7 のみ)", () => {
    expect([...(STATE_PATTERN_PRIORITY.S7 ?? [])]).toEqual(["F2", "F1"]);
  });

  it("発話パターンを持たない state は priority 未定義", () => {
    const noSpeech: PresenceState[] = ["S0", "S1", "S3", "S4", "S6", "S8"];
    for (const s of noSpeech) {
      expect(STATE_PATTERN_PRIORITY[s]).toBeUndefined();
    }
  });

  it("priority に登場する pattern は §7.12 で許可されているもののみ (一貫性)", () => {
    for (const [stateKey, priorities] of Object.entries(STATE_PATTERN_PRIORITY)) {
      const state = stateKey as PresenceState;
      if (!priorities) continue;
      for (const variant of priorities) {
        expect(PATTERN_STATE_ALLOWED[variant][state]).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────
// COOLDOWN_KINDS / SIGNAL_KIND_DEFAULT_STRENGTH
// ─────────────────────────────────────────────

describe("L2-a Cooldown / Signal default mapping", () => {
  it("COOLDOWN_KINDS は 4 種 (UI spec §6.7 + v1.1 §8.6 5 分)", () => {
    expect(COOLDOWN_KINDS).toHaveLength(4);
    expect([...COOLDOWN_KINDS]).toEqual([
      "mode_escalation_rejected",
      "individual_proposal_rejected",
      "intervention_retreat",
      "recent_proposal_5min",
    ]);
  });

  it("COOLDOWN_DEFAULT_DURATION_MS は全 kind を埋めている", () => {
    for (const kind of COOLDOWN_KINDS) {
      const ms = COOLDOWN_DEFAULT_DURATION_MS[kind];
      expect(typeof ms).toBe("number");
      expect(ms).toBeGreaterThan(0);
    }
  });

  it("recent_proposal_5min は 5 分 = 300_000 ms (v1.1 §8.6)", () => {
    expect(COOLDOWN_DEFAULT_DURATION_MS.recent_proposal_5min).toBe(5 * 60 * 1000);
  });

  it("SIGNAL_KIND_DEFAULT_STRENGTH: implicit のみ soft、他は strong (runtime §1.2)", () => {
    expect(SIGNAL_KIND_DEFAULT_STRENGTH.explicit).toBe("strong");
    expect(SIGNAL_KIND_DEFAULT_STRENGTH.implicit).toBe("soft");
    expect(SIGNAL_KIND_DEFAULT_STRENGTH.critical).toBe("strong");
    expect(SIGNAL_KIND_DEFAULT_STRENGTH.mode_promotion).toBe("strong");
    expect(SIGNAL_KIND_DEFAULT_STRENGTH.manual_restart).toBe("strong");
  });

  it("全 SIGNAL_KINDS が SIGNAL_KIND_DEFAULT_STRENGTH に登場 (網羅)", () => {
    for (const kind of SIGNAL_KINDS) {
      expect(SIGNAL_KIND_DEFAULT_STRENGTH[kind]).toMatch(/^(strong|soft|none)$/);
    }
  });
});

// ─────────────────────────────────────────────
// PresenceSignal 型 shape チェック (compile-time)
// ─────────────────────────────────────────────

describe("L2-a PresenceSignal — shape 例", () => {
  it("有効な signal を構築できる (kind + strength + detectedAt)", () => {
    const sig: PresenceSignal = {
      kind: "explicit",
      strength: "strong",
      detectedAt: Date.now(),
    };
    expect(sig.kind).toBe("explicit");
    expect(sig.strength).toBe("strong");
    expect(typeof sig.detectedAt).toBe("number");
  });

  it("meta フィールドは optional", () => {
    const sig: PresenceSignal = {
      kind: "implicit",
      strength: "soft",
      detectedAt: 0,
      meta: { score: 0.42 },
    };
    expect(sig.meta?.score).toBe(0.42);
  });
});

// ─────────────────────────────────────────────
// 型互換性 (compile-time 確認、ts-expect-error が出ない)
// ─────────────────────────────────────────────

describe("L2-a 型 shape compile-time", () => {
  it("PresenceState / PresenceMode / PatternVariant / PatternFamily / ExecutorAvailability / SignalKind / SignalStrength の値が assign 可能", () => {
    const s: PresenceState = "S5";
    const m: PresenceMode = "daily";
    const v: PatternVariant = "F1";
    const f: PatternFamily = "F";
    const a: ExecutorAvailability = "active";
    const sk: SignalKind = "critical";
    const ss: SignalStrength = "strong";
    expect([s, m, v, f, a, sk, ss]).toEqual([
      "S5",
      "daily",
      "F1",
      "F",
      "active",
      "critical",
      "strong",
    ]);
  });
});
