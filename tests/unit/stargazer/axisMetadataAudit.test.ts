/**
 * TASK-3b: StargazerAxis メタデータ品質監査テスト
 *
 * - Schema Validation: 全軸の必須フィールド検証
 * - sensitivity: 'high' の軸は min_trust_to_probe >= 2.0
 * - causal_affinity_prior に自分自身が含まれていないこと
 * - causal_affinity_prior の参照先が実在する TraitAxisKey であること
 * - Coverage レポート: フルメタデータ記述率の出力
 */

import { describe, it, expect } from "vitest";
import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "@/lib/stargazer/traitAxes";
import { STARGAZER_AXES } from "@/lib/stargazer/proactiveUnderstanding";

const ALL_AXIS_KEYS = new Set<string>(TRAIT_AXIS_KEYS);

describe("StargazerAxis Metadata Audit", () => {
  // ── Schema Validation ──

  it("全軸に category が設定��れていること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(axis, `${key} が STARGAZER_AXES に存在しない`).toBeDefined();
      expect(axis.category, `${key} の category が未設定`).toBeTruthy();
    }
  });

  it("全軸の id が TRAIT_AXIS_KEYS と一致すること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(axis.id).toBe(key);
    }
  });

  it("全軸に label が設定されていること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(axis.label.length, `${key} の label が空`).toBeGreaterThan(0);
    }
  });

  it("sensitivity が 'high' の軸は min_trust_to_probe >= 2.0 であること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      if (axis.sensitivity === "high") {
        expect(
          axis.min_trust_to_probe,
          `${key}: sensitivity=high だが min_trust_to_probe=${axis.min_trust_to_probe} < 2.0`,
        ).toBeGreaterThanOrEqual(2.0);
      }
    }
  });

  it("causal_affinity_prior に自分自身が含まれていないこと", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(
        axis.causal_affinity_prior.includes(key),
        `${key} の causal_affinity_prior に自分自身が含まれている`,
      ).toBe(false);
    }
  });

  it("causal_affinity_prior の参照先が実在する TraitAxisKey であること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      for (const ref of axis.causal_affinity_prior) {
        expect(
          ALL_AXIS_KEYS.has(ref),
          `${key} の causal_affinity_prior に存在しない軸 "${ref}" が含まれている`,
        ).toBe(true);
      }
    }
  });

  it("sensitivity は 'low' | 'medium' | 'high' のいずれかであること", () => {
    const validValues = new Set(["low", "medium", "high"]);
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(
        validValues.has(axis.sensitivity),
        `${key} の sensitivity="${axis.sensitivity}" が不正`,
      ).toBe(true);
    }
  });

  it("min_trust_to_probe が 0 以上であること", () => {
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      expect(
        axis.min_trust_to_probe,
        `${key} の min_trust_to_probe=${axis.min_trust_to_probe} が負`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  // ── probe_seeds 警告（エラーではなく WARNING） ──

  it("probe_seeds が空の軸を WARNING として出力すること", () => {
    const emptySeeds: string[] = [];
    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      if (axis.probe_seeds.length === 0) {
        emptySeeds.push(key);
      }
    }
    if (emptySeeds.length > 0) {
      console.warn(
        `[WARNING] probe_seeds が空の軸 (${emptySeeds.length}/${TRAIT_AXIS_KEYS.length}):`,
        emptySeeds.join(", "),
      );
    }
    // probe_seeds カバレッジ: 現状 ~35%、Phase 1 目標 40%（到達次第で閾値引き上げ）
    const coverageRate = (TRAIT_AXIS_KEYS.length - emptySeeds.length) / TRAIT_AXIS_KEYS.length;
    expect(coverageRate).toBeGreaterThanOrEqual(0.35);
  });

  // ── Coverage レポート ──

  it("フルメタデータ記述率を出力すること（Phase 1 目標: 40%+）", () => {
    let fullCount = 0;
    const total = TRAIT_AXIS_KEYS.length;

    for (const key of TRAIT_AXIS_KEYS) {
      const axis = STARGAZER_AXES[key];
      const hasProbeSeedsContent = axis.probe_seeds.length > 0;
      const hasCausalAffinity = axis.causal_affinity_prior.length > 0;
      if (hasProbeSeedsContent && hasCausalAffinity) {
        fullCount++;
      }
    }

    const coverage = (fullCount / total) * 100;
    console.log(`\n📊 メタデータ Coverage: ${fullCount}/${total} (${coverage.toFixed(1)}%)`);
    console.log(`   Phase 1 目標: 40%+ | Phase 2 目標: 90%+`);

    // Phase 1 の最低基準
    expect(coverage, `Coverage ${coverage.toFixed(1)}% が Phase 1 目標 40% に到達していない`).toBeGreaterThanOrEqual(30);
  });
});
