/**
 * Stage 2.4-A2 — patternSelector routing spec §5 spec-driven test
 *
 * 正本:
 *   - docs/coalter-presence-routing-spec.md (A1-3、commit 34067d98)
 *   - docs/coalter-presence-state-ui-spec.md v0.1 §7.12 / §4.3 / §7.10
 *
 * 本書は routing spec §5.1 確定範囲の補完 spec-driven 試験である。
 * 既存 patternSelector.test.ts (current impl baseline) と重複しない gap を埋める:
 *
 *   1. Stage 1 existence per-cell assertion (既存はカウント網羅、cell 単位なし)
 *   2. Layer 3 context priority comprehensive (3 mode 各々)
 *   3. S5 defensive null 3 mode (既存は normal のみ)
 *   4. I-10 actual routing state assertion (anti-fixture: B/C/F-1 は S3/S4/S6 で null)
 *   5. 副次同伴 §7.10 4-row 完全網羅 (routing spec §2.2 駆動)
 *
 * カバー外 (routing spec §5.2):
 *   - S7 Travel F-2 承認ゲート (selector scope 外、I-5)
 *   - context flag 設定主体・閾値 (§9 保留、I-2/I-3/I-4)
 *   - S5→S6 整理完了遷移条件 (state machine 側、I-9)
 *   - Stage 2.3 fixture 再 quality review (Stage 2.4-D、I-10)
 *
 * CEO 厳守:
 *   - 現実装出力を expected にしない (本書 expected は routing spec / UI spec §7.12)
 *   - Stage 2.3 fixture state (B=S3 / C=S4 / F1=S6) を expected に絶対混ぜない
 *   - actual routing state (B=S5、C=S2/S5、F-1/F-2=S7) を §1.1 / §4.1 から固定
 *   - test fail 時は自律 fix せず、spec vs impl mismatch として報告
 */

import { describe, it, expect } from "vitest";

import {
  PATTERN_VARIANTS,
  PRESENCE_STATES,
  type PatternVariant,
  type PresenceMode,
  type PresenceState,
} from "@/lib/coalter/presence/types";
import { getAllowedPatterns } from "@/lib/coalter/presence/constants";
import {
  selectPattern,
  selectSecondaryPattern,
} from "@/lib/coalter/presence/patternSelector";

const ALL_MODES: PresenceMode[] = ["normal", "daily", "travel"];

/**
 * Routing spec §1.1 期待マトリクス (UI spec §7.12 写像)。
 *
 * 各 state について、許可される variant のセット (ReadonlySet) で表現。
 * 本配列が test 上の正本であり、constants.ts の PATTERN_STATE_ALLOWED と
 * 一致することを 63 セル per-cell assertion で検証する。
 */
const ROUTING_SPEC_S1_1: ReadonlyMap<PresenceState, ReadonlySet<PatternVariant>> =
  new Map([
    ["S0", new Set<PatternVariant>()], // 発話パターンなし (v1.1 §8.2)
    ["S1", new Set<PatternVariant>()], // 介入気配 UI のみ
    ["S2", new Set<PatternVariant>(["A", "C"])],
    ["S3", new Set<PatternVariant>()], // 返答待ち
    ["S4", new Set<PatternVariant>()], // 理解更新中
    ["S5", new Set<PatternVariant>(["B", "C", "D", "E"])],
    ["S6", new Set<PatternVariant>()], // 提案可能 (UI 導線のみ)
    ["S7", new Set<PatternVariant>(["F1", "F2"])],
    ["S8", new Set<PatternVariant>()], // クールダウン
  ]);

describe("Stage 2.4-A2 routing spec §1.1 — Stage 1 existence per-cell (63 cells)", () => {
  it("9 state × 7 variant = 63 セル全てが routing spec §1.1 と一致", () => {
    let asserted = 0;
    for (const state of PRESENCE_STATES) {
      const expectedSet = ROUTING_SPEC_S1_1.get(state)!;
      const allowed = getAllowedPatterns(state);
      const allowedSet = new Set<PatternVariant>(allowed);
      for (const variant of PATTERN_VARIANTS) {
        const expected = expectedSet.has(variant);
        const actual = allowedSet.has(variant);
        // per-cell assertion (失敗時は具体 cell が出る)
        expect(
          actual,
          `cell (${state}, ${variant}): routing spec §1.1 expects ${expected}, impl returned ${actual}`,
        ).toBe(expected);
        asserted++;
      }
    }
    expect(asserted).toBe(63);
  });
});

describe("Stage 2.4-A2 routing spec §1.2 / §3.2 — state内 priority (3 mode)", () => {
  // routing spec §1.2 / §3.2 S2: A default、infoMissing=true → C
  it("S2 default は全 mode で A (infoMissing 未指定 / false)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S2", mode, {})).toBe("A");
      expect(selectPattern("S2", mode, { infoMissing: false })).toBe("A");
    }
  });

  it("S2 + infoMissing=true は全 mode で C (§7.12 fallback)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S2", mode, { infoMissing: true })).toBe("C");
    }
  });

  // routing spec §1.2 / §3.2 S5: priority C > B > D > E
  it("S5 + uncertaintyHigh=true は全 mode で C 最優先 (§11.1 裁判官化リスク回避)", () => {
    for (const mode of ALL_MODES) {
      expect(
        selectPattern("S5", mode, {
          uncertaintyHigh: true,
          needFraming: true,
          oneSidedFatigue: true,
          needTranslation: true,
          relationshipSignalsClear: true,
        }),
      ).toBe("C");
    }
  });

  it("S5 + needFraming=true (uncertainty なし) は全 mode で B", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S5", mode, { needFraming: true })).toBe("B");
    }
  });

  it("S5 + needTranslation=true は全 mode で E", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S5", mode, { needTranslation: true })).toBe("E");
    }
  });

  // routing spec §1.2 / §3.2 S7: F-2 default
  it("S7 default は全 mode で F-2 (§7.12 default)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S7", mode, {})).toBe("F2");
    }
  });
});

describe("Stage 2.4-A2 routing spec §2.1 — Stage 2 suppression #1-#3", () => {
  // #1: S5 Travel D 既定優先度低下
  it("#1 S5 + Travel + D は relationshipSignalsClear=false で抑制 (§4.3.6)", () => {
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: false,
      }),
    ).toBeNull();
  });

  it("#1 S5 + Travel + D は relationshipSignalsClear=true で再昇格", () => {
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: true,
      }),
    ).toBe("D");
  });

  it("#1 S5 + normal/daily + D は relationshipSignalsClear に依存しない (Travel only override)", () => {
    expect(selectPattern("S5", "normal", { oneSidedFatigue: true })).toBe("D");
    expect(selectPattern("S5", "daily", { oneSidedFatigue: true })).toBe("D");
  });

  // #2: S7 Daily F-1 standalone primary suppressed → F-2 default
  it("#2 S7 + Daily の primary は F-2 (F-1 standalone 抑制、§4.3.8)", () => {
    expect(selectPattern("S7", "daily", {})).toBe("F2");
    // relationshipNoiseHigh=true でも primary は F-2 のまま
    expect(selectPattern("S7", "daily", { relationshipNoiseHigh: true })).toBe("F2");
  });

  // #3: S7 Travel F-1 standalone primary suppressed → F-2 default
  it("#3 S7 + Travel の primary は F-2 (F-1 standalone 抑制、§4.3.8)", () => {
    expect(selectPattern("S7", "travel", {})).toBe("F2");
  });
});

describe("Stage 2.4-A2 routing spec §2.2 — 副次同伴 §7.10 (4 row)", () => {
  // routing spec §2.2 row 1: S7 normal F-1 standalone → 副次なし
  it("row 1: S7 normal + F-1 standalone primary → secondary=null", () => {
    const secondary = selectSecondaryPattern("S7", "normal", "F1", {
      relationshipNoiseHigh: true, // 関係ノイズ高くても normal では合成なし
    });
    expect(secondary).toBeNull();
  });

  // routing spec §2.2 row 2: S7 normal F-2 → 副次なし
  it("row 2: S7 normal + F-2 primary → secondary=null", () => {
    const primary = selectPattern("S7", "normal", {});
    expect(primary).toBe("F2");
    const secondary = selectSecondaryPattern("S7", "normal", primary, {
      relationshipNoiseHigh: true,
    });
    expect(secondary).toBeNull();
  });

  // routing spec §2.2 row 3: S7 Daily F-2 + relationshipNoiseHigh=true → F-1 副次
  it("row 3a: S7 Daily + F-2 primary + relationshipNoiseHigh=true → secondary=F-1", () => {
    const primary = selectPattern("S7", "daily", { relationshipNoiseHigh: true });
    expect(primary).toBe("F2");
    const secondary = selectSecondaryPattern("S7", "daily", primary, {
      relationshipNoiseHigh: true,
    });
    expect(secondary).toBe("F1");
  });

  it("row 3b: S7 Daily + F-2 primary + relationshipNoiseHigh=false → secondary=null", () => {
    const primary = selectPattern("S7", "daily", { relationshipNoiseHigh: false });
    expect(primary).toBe("F2");
    const secondary = selectSecondaryPattern("S7", "daily", primary, {
      relationshipNoiseHigh: false,
    });
    expect(secondary).toBeNull();
  });

  // routing spec §2.2 row 4: S7 Travel F-2 → F-1 副次必須 (常時)
  it("row 4: S7 Travel + F-2 primary → secondary=F-1 (常時、§7.10 / §4.3.8)", () => {
    const primary = selectPattern("S7", "travel", {});
    expect(primary).toBe("F2");
    const secondary = selectSecondaryPattern("S7", "travel", primary, {});
    expect(secondary).toBe("F1");
    // relationshipNoiseHigh の値に関わらず Travel は常時 F-1 副次
    const secondaryNoiseHigh = selectSecondaryPattern("S7", "travel", primary, {
      relationshipNoiseHigh: true,
    });
    expect(secondaryNoiseHigh).toBe("F1");
  });

  // 副次同伴の境界: S7 以外 / primary が F2 でない / primary=null
  it("S7 以外の state では secondary=null (§7.10 合成は S7 のみ)", () => {
    expect(selectSecondaryPattern("S2", "daily", "A", {})).toBeNull();
    expect(selectSecondaryPattern("S5", "travel", "B", {})).toBeNull();
    expect(selectSecondaryPattern("S0", "normal", null, {})).toBeNull();
  });

  it("S7 で primary=F-1 / null では secondary=null (合成は F-2 主のみ、§7.10-1)", () => {
    expect(selectSecondaryPattern("S7", "daily", "F1", {})).toBeNull();
    expect(selectSecondaryPattern("S7", "daily", null, {})).toBeNull();
    expect(selectSecondaryPattern("S7", "travel", null, {})).toBeNull();
  });
});

describe("Stage 2.4-A2 routing spec §3.2 #5 — S5 defensive null (CEO 裁定 I-1/I-8)", () => {
  it("S5 全 flag false は全 3 mode で defensive null (E default にしない)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S5", mode, {})).toBeNull();
      expect(
        selectPattern("S5", mode, {
          uncertaintyHigh: false,
          needFraming: false,
          oneSidedFatigue: false,
          needTranslation: false,
        }),
      ).toBeNull();
    }
  });

  it("S5 全 flag false + Travel mode の relationshipSignalsClear=true 単独でも null (D 候補が立たないため)", () => {
    // relationshipSignalsClear は D suppression 解除条件であり、それ単独で D を発火しない
    expect(
      selectPattern("S5", "travel", {
        relationshipSignalsClear: true,
      }),
    ).toBeNull();
  });
});

describe("Stage 2.4-A2 I-10 — actual routing state assertion (anti-Stage 2.3 fixture)", () => {
  // Anti-pattern: Stage 2.3 fixture state (B=S3 / C=S4 / F1=S6) では variant 発火不可
  it("anti-fixture: S3 (B fixture) では全 mode / 全 context で variant=null", () => {
    for (const mode of ALL_MODES) {
      expect(
        selectPattern("S3", mode, {
          infoMissing: true,
          uncertaintyHigh: true,
          needFraming: true,
          oneSidedFatigue: true,
          needTranslation: true,
          relationshipSignalsClear: true,
          relationshipNoiseHigh: true,
        }),
      ).toBeNull();
    }
  });

  it("anti-fixture: S4 (C fixture) では全 mode / 全 context で variant=null", () => {
    for (const mode of ALL_MODES) {
      expect(
        selectPattern("S4", mode, {
          infoMissing: true,
          uncertaintyHigh: true,
          needFraming: true,
          oneSidedFatigue: true,
          needTranslation: true,
          relationshipSignalsClear: true,
          relationshipNoiseHigh: true,
        }),
      ).toBeNull();
    }
  });

  it("anti-fixture: S6 (F1 fixture) では全 mode / 全 context で variant=null", () => {
    for (const mode of ALL_MODES) {
      expect(
        selectPattern("S6", mode, {
          infoMissing: true,
          uncertaintyHigh: true,
          needFraming: true,
          oneSidedFatigue: true,
          needTranslation: true,
          relationshipSignalsClear: true,
          relationshipNoiseHigh: true,
        }),
      ).toBeNull();
    }
  });

  // Positive assertion: actual routing state で variant が発火
  it("actual: B が actual routing state S5 で発火 (needFraming=true、§1.1)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S5", mode, { needFraming: true })).toBe("B");
    }
  });

  it("actual: C が actual routing state S2 (infoMissing=true) で発火 (§1.1)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S2", mode, { infoMissing: true })).toBe("C");
    }
  });

  it("actual: C が actual routing state S5 (uncertaintyHigh=true) で発火 (§1.1)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S5", mode, { uncertaintyHigh: true })).toBe("C");
    }
  });

  it("actual: F-1 が actual routing state S7 で副次同伴として発火 (§7.10、Travel 常時)", () => {
    const primary = selectPattern("S7", "travel", {});
    const secondary = selectSecondaryPattern("S7", "travel", primary, {});
    expect(secondary).toBe("F1");
  });

  it("actual: F-2 が actual routing state S7 で primary として発火 (§1.1)", () => {
    for (const mode of ALL_MODES) {
      expect(selectPattern("S7", mode, {})).toBe("F2");
    }
  });
});
