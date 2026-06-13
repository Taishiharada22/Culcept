/**
 * T11-D2 — Maximum State Coverage / Interaction Registry golden tests
 *
 * 検証対象: lib/shared/travel/fit-constructs.ts（registry）+ fit-constructs-core.ts（helpers）
 * 設計正本: docs/t11-a3.1-maximum-state-coverage.md
 *
 * 主眼: 状態空間が薄い tag へ縮退していないこと / 型ロック（IndicatorKey≠string・ext は veto 不可）/
 *   全 construct が layer+missingData を持つ / 相互作用は既存 component の修飾子で新スコアを作らない /
 *   安全=fail-closed・価格=捏造禁止・perceivedSafety 昼夜分離・hygiene worn≠dirty・noveltySeeking top-level /
 *   import 純度・既存 fit 挙動不変。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONSTRUCT_FAMILY_IDS,
  CONSTRUCT_REGISTRY,
  INDICATOR_REGISTRY,
  INTERACTION_REGISTRY,
  DOUBLE_COUNT_RULES,
  type ConstructAxis,
  type ExtIndicatorSpec,
  type IndicatorKey,
  type InteractionTarget,
} from "@/lib/shared/travel/fit-constructs";
import {
  registryStats,
  validateConstructRegistry,
  validateInteractionTargets,
  isInteractionModifierOnly,
  interactionConfidence,
  computeConstructScore,
  getLayerPlacement,
  getMissingDataPolicy,
  getConstructsByFamily,
} from "@/lib/shared/travel/fit-constructs-core";

const axes = () => Object.keys(CONSTRUCT_REGISTRY) as ConstructAxis[];

// ════════════════════════════════════════════════════════════════════════════
describe("1. 9 族（+批評追加）が存在・登録が整合", () => {
  it("canonical 9 family が全て存在する", () => {
    for (const f of ["A_sensory", "B_burden", "C_time", "D_food", "E_money", "F_social", "G_meaning", "H_route", "I_support"]) {
      expect(CONSTRUCT_FAMILY_IDS as readonly string[]).toContain(f);
    }
  });
  it("批評追加族（safety/condition/communication/infra-work/crosscut）も存在", () => {
    for (const f of ["J_safety", "K_condition", "L_communication", "M_infra_work", "N_crosscut"]) {
      expect(CONSTRUCT_FAMILY_IDS as readonly string[]).toContain(f);
    }
  });
  it("validateConstructRegistry が ok（INDICATOR↔CONSTRUCT 整合・欠落なし）", () => {
    const v = validateConstructRegistry();
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. 低い天井がない（薄い tag に縮退していない）", () => {
  it("構築子は 18 をはるかに超え（>100）・指標は 90 を超える（>600）", () => {
    const s = registryStats();
    expect(s.constructs).toBeGreaterThan(100);
    expect(s.indicators).toBeGreaterThan(600);
    expect(s.families).toBeGreaterThanOrEqual(14);
  });
  it("各 family は typed construct を 1 つ以上持つ", () => {
    for (const f of CONSTRUCT_FAMILY_IDS) {
      expect(getConstructsByFamily(f).length).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. 型ロック（IndicatorKey は string でない・ext は veto 不可）", () => {
  it("既知 indicator key は IndicatorKey 型に収まる", () => {
    const k: IndicatorKey = "ambientNoiseFloorDb";
    expect(INDICATOR_REGISTRY.quietness as readonly string[]).toContain(k);
  });
  it("型レベル: 架空 key は IndicatorKey に代入不可（= string でない証明）", () => {
    // @ts-expect-error 架空の indicator key は union に存在しない（IndicatorKey が string なら此処はエラーにならない）
    const bad: IndicatorKey = "totallyMadeUpKeyXYZ";
    void bad;
    expect(true).toBe(true);
  });
  it("型レベル: 拡張 indicator は veto 能力を持てない（vetoCapable: false 固定）", () => {
    const ok: ExtIndicatorSpec = { key: "futureThing", defaultConfidence: 0.2, vetoCapable: false };
    expect(ok.vetoCapable).toBe(false);
    // @ts-expect-error 拡張 indicator を veto 可能にはできない（safety-critical の混入を型で禁止）
    const bad: ExtIndicatorSpec = { key: "danger", defaultConfidence: 0.9, vetoCapable: true };
    void bad;
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. 全 construct が layer placement と missing-data policy を持つ", () => {
  it("layer placement が全 construct に存在", () => {
    for (const a of axes()) {
      const lp = getLayerPlacement(a);
      expect(lp.primary).toBeTruthy();
    }
  });
  it("missing-data policy が全 construct に存在", () => {
    for (const a of axes()) {
      expect(["ordinary", "safety_critical", "price_unknown", "trait_neutral"]).toContain(getMissingDataPolicy(a));
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. 二重計上禁止規則が存在", () => {
  it("DOUBLE_COUNT_RULES が 10 件以上・相互作用 vs 素 component を含む", () => {
    expect(DOUBLE_COUNT_RULES.length).toBeGreaterThanOrEqual(10);
    expect(DOUBLE_COUNT_RULES.some((r) => r.left === "interaction" && r.right === "base_component")).toBe(true);
    expect(DOUBLE_COUNT_RULES.some((r) => r.left === "priceValue" && r.right === "budgetFit")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. 相互作用は既存 component の修飾子（新並列スコアを作らない）", () => {
  it("validateInteractionTargets が ok（modifies は既存 component/construct/hardBlock）", () => {
    const v = validateInteractionTargets();
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("全 interaction が修飾子のみ（isInteractionModifierOnly）", () => {
    expect(INTERACTION_REGISTRY.length).toBe(15);
    for (const t of INTERACTION_REGISTRY) expect(isInteractionModifierOnly(t)).toBe(true);
  });
  it("全 interaction が confidence rule を持つ", () => {
    for (const t of INTERACTION_REGISTRY) {
      expect(["min_of_inputs", "product_of_inputs"]).toContain(t.confidence);
    }
  });
  it("型レベル: modifies は component/construct/hardBlock 以外の kind を取れない", () => {
    // @ts-expect-error 新しいスコア種別を modifies に作れない（修飾子不変条件）
    const bad: InteractionTarget = { kind: "newParallelScore" };
    void bad;
    expect(true).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. confidence 連鎖（最弱入力を継ぐ）", () => {
  it("min_of_inputs は最弱を返す", () => {
    expect(interactionConfidence("min_of_inputs", [0.9, 0.4, 0.7])).toBeCloseTo(0.4);
  });
  it("product_of_inputs は積を返す", () => {
    expect(interactionConfidence("product_of_inputs", [0.5, 0.8])).toBeCloseTo(0.4);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. 欠損挙動: 安全=fail-closed・価格=捏造禁止・通常=confidence減", () => {
  it("安全 critical（perceivedSafety / allergyDietarySafety / accessibilitySupport）は safety_critical", () => {
    expect(getMissingDataPolicy("perceivedSafety")).toBe("safety_critical");
    expect(getMissingDataPolicy("allergyDietarySafety")).toBe("safety_critical");
    expect(getMissingDataPolicy("accessibilitySupport")).toBe("safety_critical");
  });
  it("価格系（budgetPressure / valueForMoney）は price_unknown（捏造禁止）", () => {
    expect(getMissingDataPolicy("budgetPressure")).toBe("price_unknown");
    expect(getMissingDataPolicy("valueForMoney")).toBe("price_unknown");
  });
  it("user trait（noveltySeeking / paceAutonomy）は trait_neutral", () => {
    expect(getMissingDataPolicy("noveltySeeking")).toBe("trait_neutral");
    expect(getMissingDataPolicy("paceAutonomy")).toBe("trait_neutral");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. 批評修正の確定（昼夜分離 / worn≠dirty / noveltySeeking top-level / graded≠veto）", () => {
  it("perceivedSafety は昼夜を別 indicator に分離", () => {
    const ind = INDICATOR_REGISTRY.perceivedSafety as readonly string[];
    expect(ind).toContain("daytimeSafety");
    expect(ind).toContain("nighttimeSafety");
  });
  it("hygieneCleanliness は worn≠dirty を分離（surfaceWornVsDirty）", () => {
    expect(INDICATOR_REGISTRY.hygieneCleanliness as readonly string[]).toContain("surfaceWornVsDirty");
  });
  it("noveltySeeking は top-level trait（L1・N_crosscut）", () => {
    expect(CONSTRUCT_REGISTRY.noveltySeeking.layer).toBe("L1");
    expect(CONSTRUCT_REGISTRY.noveltySeeking.family).toBe("N_crosscut");
  });
  it("gradedAccessibilityComfort は L2 代償帯（fail-closed veto でない・ordinary）", () => {
    // 硬い accessibility veto は L5 の FitHardConstraint（別機構）。本 construct は代償的中間帯。
    expect(CONSTRUCT_REGISTRY.gradedAccessibilityComfort.layer).toBe("L2");
    expect(getMissingDataPolicy("gradedAccessibilityComfort")).toBe("ordinary");
    expect(getMissingDataPolicy("gradedAccessibilityComfort")).not.toBe("safety_critical");
    // accessibilitySupport（安全 relief）は fail-closed = 代償帯と挙動が異なる
    expect(getMissingDataPolicy("accessibilitySupport")).toBe("safety_critical");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. 独立 rollup（registry-only・欠損除外+再正規化・決定論）", () => {
  it("欠損指標を除外し残 weight 再正規化", () => {
    const r = computeConstructScore("quietness", {
      ambientNoiseFloorDb: { value: 0.8, confidence: 0.9 },
      nightQuietness: { value: 0.6, confidence: 0.8 },
      trafficRoadNoise: null,
    });
    expect(r.available).toBe(true);
    expect(r.usedIndicators).toBe(2);
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.score).toBeLessThanOrEqual(0.8);
  });
  it("全欠損 → 未観測（available=false・distance 加算しない）", () => {
    const r = computeConstructScore("quietness", {});
    expect(r.available).toBe(false);
    expect(r.usedIndicators).toBe(0);
  });
  it("決定論（同一入力→同一出力）", () => {
    const obs = { ambientNoiseFloorDb: { value: 0.5, confidence: 0.7 } };
    expect(computeConstructScore("quietness", obs)).toEqual(computeConstructScore("quietness", obs));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("11. import 純度（registry-only・runtime 非依存）", () => {
  const a = readFileSync(resolve(process.cwd(), "lib/shared/travel/fit-constructs.ts"), "utf8");
  const b = readFileSync(resolve(process.cwd(), "lib/shared/travel/fit-constructs-core.ts"), "utf8");
  it("fetch/API/DB/Supabase/route/UI を import しない", () => {
    for (const src of [a, b]) {
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']@\/app/);
      expect(src).not.toMatch(/from ["']@\/components/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
    }
  });
  it("fit-core / evaluateFit を import しない（registry は未配線）", () => {
    for (const src of [a, b]) {
      expect(src).not.toMatch(/from ["']\.\/fit-core["']/);
    }
  });
});
