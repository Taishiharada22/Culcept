import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import {
  deriveTrustLevel,
  type RelationalTrustSignals,
  type TrustLevel,
} from "@/lib/stargazer/alterUnderstanding";

// ── helpers ──

function signals(overrides: Partial<RelationalTrustSignals> = {}): RelationalTrustSignals {
  return {
    earnedTrustTotal: 0,
    selfDisclosureDepth: 0,
    defensePredictionStreak: 0,
    voluntaryTopicExpansionCount: 0,
    repairSuccessRate: null,
    consecutiveRuptureCount: 0,
    explicitRejection: false,
    dignityViolation: false,
    trustDelta: 0,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 後方互換: シグナルなし → 旧ロジックと同等
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveTrustLevel — 後方互換（シグナルなし）", () => {
  it("初回セッション・低ターン → T0", () => {
    const result = deriveTrustLevel(0, 0);
    expect(result.effectiveTrust).toBe(0);
    expect(result.baseTrust).toBe(0);
  });

  it("初回セッション・4ターン以上 → T1", () => {
    const result = deriveTrustLevel(0, 0, 4);
    expect(result.effectiveTrust).toBe(1);
  });

  it("3セッション → T1", () => {
    const result = deriveTrustLevel(0.2, 3);
    expect(result.effectiveTrust).toBe(1);
  });

  it("8セッション + continuousTrust 0.4 → T2", () => {
    const result = deriveTrustLevel(0.4, 8);
    expect(result.effectiveTrust).toBe(2);
  });

  it("20セッション + continuousTrust 0.7 → T3", () => {
    const result = deriveTrustLevel(0.7, 20);
    expect(result.effectiveTrust).toBe(3);
  });

  it("40セッション + continuousTrust 0.85 → T4", () => {
    const result = deriveTrustLevel(0.85, 40);
    expect(result.effectiveTrust).toBe(4);
  });

  it("adjustmentReason は null", () => {
    const result = deriveTrustLevel(0.4, 8);
    expect(result.adjustmentReason).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 下降（速い）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveTrustLevel — 下降シグナル", () => {
  it("rupture 1回 → baseTrust -1", () => {
    // baseline T2（sessions=8, trust=0.4）
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      consecutiveRuptureCount: 1,
    }));
    expect(result.baseTrust).toBe(2);
    expect(result.effectiveTrust).toBe(1); // 2 - 1
    expect(result.adjustmentReason).toContain("rupture_detected");
  });

  it("rupture 3連続 → baseTrust -2", () => {
    const result = deriveTrustLevel(0.7, 20, undefined, signals({
      consecutiveRuptureCount: 3,
    }));
    expect(result.baseTrust).toBe(3);
    expect(result.effectiveTrust).toBe(1); // 3 - 2
  });

  it("explicit rejection → -1", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      explicitRejection: true,
    }));
    expect(result.effectiveTrust).toBe(1); // 2 - 1
    expect(result.adjustmentReason).toContain("explicit_rejection");
  });

  it("dignity violation → -1", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      dignityViolation: true,
    }));
    expect(result.effectiveTrust).toBe(1);
    expect(result.adjustmentReason).toContain("dignity_violation");
  });

  it("trustDelta < -0.3 → -1", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      trustDelta: -0.4,
    }));
    expect(result.effectiveTrust).toBe(1);
    expect(result.adjustmentReason).toContain("trust_delta_drop");
  });

  it("複数の負シグナル → 累積して下がる", () => {
    const result = deriveTrustLevel(0.85, 40, undefined, signals({
      consecutiveRuptureCount: 1,  // -1
      explicitRejection: true,     // -1
      dignityViolation: true,      // -1
    }));
    expect(result.baseTrust).toBe(4);
    expect(result.effectiveTrust).toBe(1); // 4 - 3
  });

  it("T0 以下にはならない", () => {
    const result = deriveTrustLevel(0.2, 3, undefined, signals({
      consecutiveRuptureCount: 3, // -2
      explicitRejection: true,    // -1
    }));
    expect(result.baseTrust).toBe(1);
    expect(result.effectiveTrust).toBe(0); // clamped to 0
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 上昇（遅い）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveTrustLevel — 上昇シグナル", () => {
  it("正シグナル 2つ → 上昇なし（3つ必要）", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,        // ✓
      selfDisclosureDepth: 0.5,     // ✓
    }));
    expect(result.effectiveTrust).toBe(2); // 変化なし
    expect(result.adjustmentReason).toBeNull();
  });

  it("正シグナル 3つ → +1", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,              // ✓
      selfDisclosureDepth: 0.5,           // ✓
      defensePredictionStreak: 3,         // ✓
    }));
    expect(result.baseTrust).toBe(2);
    expect(result.effectiveTrust).toBe(3); // 2 + 1
    expect(result.adjustmentReason).toContain("positive_signals_3");
  });

  it("正シグナル 5つ → +1（最大。一気に +2 しない）", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,
      selfDisclosureDepth: 0.5,
      defensePredictionStreak: 3,
      voluntaryTopicExpansionCount: 5,
      repairSuccessRate: 0.9,
    }));
    expect(result.effectiveTrust).toBe(3); // 2 + 1（+2 にはならない）
  });

  it("T4 を超えない", () => {
    const result = deriveTrustLevel(0.85, 40, undefined, signals({
      earnedTrustTotal: 10.0,
      selfDisclosureDepth: 0.8,
      defensePredictionStreak: 5,
    }));
    expect(result.baseTrust).toBe(4);
    expect(result.effectiveTrust).toBe(4); // capped at 4
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase cap
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveTrustLevel — Phase cap", () => {
  it("Phase 0 → Trust 上限 0", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, undefined, 0 as TrustLevel);
    expect(result.baseTrust).toBe(2);
    expect(result.effectiveTrust).toBe(0);
    expect(result.phaseCapped).toBe(true);
  });

  it("Phase 1 → Trust 上限 1", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, undefined, 1 as TrustLevel);
    expect(result.effectiveTrust).toBe(1);
    expect(result.phaseCapped).toBe(true);
  });

  it("Phase cap がシグナル上昇を制限する", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,
      selfDisclosureDepth: 0.5,
      defensePredictionStreak: 3,
    }), 2 as TrustLevel);
    expect(result.signalAdjustedTrust).toBe(3); // シグナルでは +1
    expect(result.effectiveTrust).toBe(2);       // Phase cap で制限
    expect(result.phaseCapped).toBe(true);
  });

  it("Phase cap が不要な場合は phaseCapped = false", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, undefined, 4 as TrustLevel);
    expect(result.effectiveTrust).toBe(2);
    expect(result.phaseCapped).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 上昇と下降の組み合わせ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deriveTrustLevel — 上昇+下降の競合", () => {
  it("正シグナル3つ + rupture1回 → 相殺（+1 -1 = ±0）", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,
      selfDisclosureDepth: 0.5,
      defensePredictionStreak: 3,
      consecutiveRuptureCount: 1,
    }));
    expect(result.effectiveTrust).toBe(2); // 2 + 1 - 1 = 2
  });

  it("正シグナル3つ + rupture3連続 → 下降が勝つ", () => {
    const result = deriveTrustLevel(0.4, 8, undefined, signals({
      earnedTrustTotal: 5.0,
      selfDisclosureDepth: 0.5,
      defensePredictionStreak: 3,
      consecutiveRuptureCount: 3,
    }));
    expect(result.effectiveTrust).toBe(1); // 2 + 1 - 2 = 1
  });
});
