/**
 * Stage 2 L2-d — §7.10 合成規則 + §7.11 非同居規則 test
 *
 * plan §5.4 Gate:
 *   - §7.10 F-1 / F-2 共存 (S7 Daily 関係ノイズ高 / S7 Travel 副次同伴必須)
 *   - §7.11 非同居 (2 pattern 同時発話禁止 / 同パターン連投禁止 等)
 *
 * 本 test は selector 段階で enforce 可能なものに限る:
 *   - selectPattern が同時に 2 variant を返さない (構造的に primary 1 つのみ)
 *   - selectSecondaryPattern は §7.10 合成規則下のみ F-1 を返す
 *
 * UI placement (chip 数 / 同居 layout) は L2-k urgent / L2-l rate limit 側 enforce。
 */

import { describe, it, expect } from "vitest";

import {
  selectPattern,
  selectSecondaryPattern,
} from "@/lib/coalter/presence/patternSelector";

describe("L2-d §7.10 F-1 / F-2 共存規則", () => {
  it("S7 + Daily + relationshipNoiseHigh=true → primary=F2、secondary=F1 (副次同伴 1 行)", () => {
    const primary = selectPattern("S7", "daily", { relationshipNoiseHigh: true });
    const secondary = selectSecondaryPattern("S7", "daily", primary, {
      relationshipNoiseHigh: true,
    });
    expect(primary).toBe("F2");
    expect(secondary).toBe("F1");
  });

  it("S7 + Daily + relationshipNoiseHigh=false → primary=F2、secondary=null (F-1 抑制可、§4.3.8)", () => {
    const primary = selectPattern("S7", "daily", { relationshipNoiseHigh: false });
    const secondary = selectSecondaryPattern("S7", "daily", primary, {
      relationshipNoiseHigh: false,
    });
    expect(primary).toBe("F2");
    expect(secondary).toBeNull();
  });

  it("S7 + Travel → primary=F2、secondary=F1 (関係ノイズ問わず副次同伴必須、§7.10 / §4.3.8)", () => {
    // Travel: 関係ノイズ低でも常時副次
    const primary = selectPattern("S7", "travel", {});
    const secondary = selectSecondaryPattern("S7", "travel", primary, {});
    expect(primary).toBe("F2");
    expect(secondary).toBe("F1");
  });

  it("S7 + 通常モード → primary=F2、secondary=null (F-1 standalone は通常で別経路、§7.10 副次同伴は normal で発動しない)", () => {
    const primary = selectPattern("S7", "normal", {});
    const secondary = selectSecondaryPattern("S7", "normal", primary, {
      relationshipNoiseHigh: true,
    });
    expect(primary).toBe("F2");
    expect(secondary).toBeNull();
  });

  it("S7 以外の state では secondary=null (composition は S7 のみ、§7.10)", () => {
    expect(selectSecondaryPattern("S2", "daily", "A", {})).toBeNull();
    expect(selectSecondaryPattern("S5", "travel", "B", {})).toBeNull();
    expect(selectSecondaryPattern("S0", "normal", null, {})).toBeNull();
  });

  it("S7 で primary が F2 でない場合 secondary=null (composition は F2 主のみ、§7.10-1)", () => {
    expect(selectSecondaryPattern("S7", "daily", null, {})).toBeNull();
    // primary が null の時 (suppression 全部) も secondary は null
    expect(selectSecondaryPattern("S7", "daily", "F1", {})).toBeNull();
  });
});

describe("L2-d §7.11 非同居規則 (selector 構造で担保)", () => {
  it("selectPattern は同時に 2 variant を返さない (primary は 1 つ、§7.11『2 pattern 同時発話禁止』)", () => {
    // どの (state, mode, context) でも primary は variant 1 つ or null
    const result = selectPattern("S5", "normal", {
      uncertaintyHigh: true,
      needFraming: true,
      oneSidedFatigue: true,
      needTranslation: true,
    });
    // 4 候補 (B/C/D/E) 全部 true でも 1 つだけ選ばれる (C が最優先)
    expect(result).toBe("C");
  });

  it("selectPattern + selectSecondaryPattern は最大 2 variant、ただし合成は S7 F2 + F1 副次のみ (§7.10)", () => {
    // 関係保護 (B/E) 状態の S5 と提案 (F1/F2) 状態の S7 は state ordering で混在しない
    // S5 では secondary は null
    const s5primary = selectPattern("S5", "normal", { uncertaintyHigh: true });
    expect(s5primary).toBe("C");
    expect(selectSecondaryPattern("S5", "normal", s5primary, {})).toBeNull();
  });

  it("S5 (橋渡し) と S7 (提案) の variant は同 state では同居しない (state ordering で分離)", () => {
    // S5 で B/C/D/E を返す時、F1/F2 は返さない
    const candidates = ["B", "C", "D", "E"];
    const result = selectPattern("S5", "normal", {
      uncertaintyHigh: true,
    });
    expect(candidates).toContain(result);
    // F1/F2 が S5 で返ることは絶対にない (Stage 1 §7.12 で禁止)
    expect(result).not.toBe("F1");
    expect(result).not.toBe("F2");
  });

  it("§7.11『関係保護 (B/E) 前の提案 (F-1/F-2)』禁止は state ordering で担保 (S5 で F は返らない)", () => {
    // S5 では B/E しか提案しない、F1/F2 は S7 でのみ
    // selectPattern("S5", ...) で F が返る組み合わせはない
    for (const mode of ["normal", "daily", "travel"] as const) {
      const result = selectPattern("S5", mode, {
        uncertaintyHigh: true,
        needFraming: true,
        oneSidedFatigue: true,
        needTranslation: true,
        relationshipSignalsClear: true,
      });
      expect(result === "F1" || result === "F2").toBe(false);
    }
  });
});
