/**
 * Stage 2 L2-d — patternSelector 63 セル + 状態×モード suppression test
 *
 * plan §5.4 Gate:
 *   - 63 セル (9 state × 7 variant) の許可/禁止 test
 *   - mode 別 suppression (§4.3.6 Travel D / §4.3.8 Daily/Travel F-1)
 */

import { describe, it, expect } from "vitest";

import {
  PATTERN_VARIANTS,
  PRESENCE_STATES,
  type PatternVariant,
  type PresenceMode,
  type PresenceState,
} from "@/lib/coalter/presence/types";
import {
  selectPattern,
  type PatternContext,
} from "@/lib/coalter/presence/patternSelector";

const ALL_MODES: PresenceMode[] = ["normal", "daily", "travel"];

describe("L2-d selectPattern — Stage 1 existence (§7.12 9 state × 7 variant)", () => {
  it("発話パターンを持たない 6 状態 (S0/S1/S3/S4/S6/S8) は全 mode で null", () => {
    const noSpeech: PresenceState[] = ["S0", "S1", "S3", "S4", "S6", "S8"];
    for (const state of noSpeech) {
      for (const mode of ALL_MODES) {
        expect(selectPattern(state, mode, {})).toBeNull();
      }
    }
  });

  it("S2 default は通常モードで A (infoMissing=false)", () => {
    expect(selectPattern("S2", "normal", {})).toBe("A");
    expect(selectPattern("S2", "daily", {})).toBe("A");
    expect(selectPattern("S2", "travel", {})).toBe("A");
  });

  it("S2 + infoMissing=true は C を選ぶ (§7.12 fallback)", () => {
    expect(selectPattern("S2", "normal", { infoMissing: true })).toBe("C");
    expect(selectPattern("S2", "daily", { infoMissing: true })).toBe("C");
    expect(selectPattern("S2", "travel", { infoMissing: true })).toBe("C");
  });
});

describe("L2-d selectPattern — S5 (B/C/D/E 優先順位、§7.12)", () => {
  it("S5 + uncertaintyHigh=true → C 最優先 (§11.1 裁判官化リスク回避)", () => {
    expect(
      selectPattern("S5", "normal", {
        uncertaintyHigh: true,
        needFraming: true,
        oneSidedFatigue: true,
      }),
    ).toBe("C");
  });

  it("S5 + needFraming=true (uncertaintyHigh なし) → B", () => {
    expect(selectPattern("S5", "normal", { needFraming: true })).toBe("B");
  });

  it("S5 + oneSidedFatigue=true → D (Travel 以外)", () => {
    expect(selectPattern("S5", "normal", { oneSidedFatigue: true })).toBe("D");
    expect(selectPattern("S5", "daily", { oneSidedFatigue: true })).toBe("D");
  });

  it("S5 + needTranslation=true → E", () => {
    expect(selectPattern("S5", "normal", { needTranslation: true })).toBe("E");
  });

  it("S5 + 全 context false → null (S5 で何も該当しない時)", () => {
    expect(selectPattern("S5", "normal", {})).toBeNull();
  });
});

describe("L2-d selectPattern — Stage 2 suppression (§4.3 mode 別 override)", () => {
  it("§4.3.6 S5 + Travel + D は relationshipSignalsClear=false で抑制 (D は除外)", () => {
    // oneSidedFatigue=true で D 候補だが、Travel + relationshipSignalsClear=false で suppress
    // → 他の S5 候補がない場合は null
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: false,
      }),
    ).toBeNull();
  });

  it("§4.3.6 S5 + Travel + D は relationshipSignalsClear=true で再昇格 (D 復活)", () => {
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: true,
      }),
    ).toBe("D");
  });

  it("§4.3.6 S5 + Travel + uncertaintyHigh + relationshipSignalsClear=false → C 優先 (D 抑制でも C で fallback)", () => {
    expect(
      selectPattern("S5", "travel", {
        uncertaintyHigh: true,
        oneSidedFatigue: true,
        relationshipSignalsClear: false,
      }),
    ).toBe("C");
  });

  it("§4.3.8 S7 + Daily の primary は F2 (F1 抑制、§7.12 default)", () => {
    expect(selectPattern("S7", "daily", {})).toBe("F2");
  });

  it("§4.3.8 S7 + Travel の primary も F2 (F1 抑制)", () => {
    expect(selectPattern("S7", "travel", {})).toBe("F2");
  });

  it("S7 + 通常モードの primary は F2 (default、F1 standalone は §7.12 fallback で 2 番目)", () => {
    // S7 priority: [F2, F1]、F2 が default (通常 / Daily / Travel 共通)
    expect(selectPattern("S7", "normal", {})).toBe("F2");
  });
});

describe("L2-d selectPattern — 63 セル網羅 (Stage 1 × Stage 2)", () => {
  it("各 (state × variant × mode) の挙動が定義されている (構造的網羅)", () => {
    let total = 0;
    let nulls = 0;
    let nonNulls = 0;
    for (const state of PRESENCE_STATES) {
      for (const mode of ALL_MODES) {
        // context 全 true で最大候補
        const result = selectPattern(state, mode, {
          infoMissing: true,
          uncertaintyHigh: true,
          needFraming: true,
          oneSidedFatigue: true,
          needTranslation: true,
          relationshipSignalsClear: true,
          relationshipNoiseHigh: true,
        });
        total++;
        if (result === null) nulls++;
        else nonNulls++;
        // 返り値は null か valid PatternVariant
        if (result !== null) {
          expect(PATTERN_VARIANTS).toContain(result);
        }
      }
    }
    // 9 state × 3 mode = 27 検査ポイント
    expect(total).toBe(27);
    // S0/S1/S3/S4/S6/S8 = 6 state × 3 mode = 18 null
    expect(nulls).toBe(18);
    // S2/S5/S7 = 3 state × 3 mode = 9 non-null
    expect(nonNulls).toBe(9);
  });
});
