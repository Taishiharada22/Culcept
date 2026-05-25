/**
 * Phase 3-N Plan P2 Step 2 v3.1 — Personal Model V2 extractor contract test
 *
 * 検証範囲 (= readiness v3.1 §1 確定):
 *   - getPhaseReadoutLevel (= pure helper、 Phase → layer level)
 *   - buildPersonalModelV2FromSynthetic (= EvalUserProfile → PersonalModelV2)
 *   - Phase 別 layer 充填
 *   - extractPersonalModelV2 (= stub、 Phase 0 safe fallback)
 *
 * 不変原則:
 *   - pure 部分は LLM / API / DB 不使用
 *   - 入力 mutate なし
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getPhaseReadoutLevel,
  buildPersonalModelV2FromSynthetic,
  extractPersonalModelV2,
  type SyntheticPersonalModelSource,
} from "@/lib/plan/llm/personalModelExtractorV2";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getPhaseReadoutLevel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("getPhaseReadoutLevel (= Phase → layer level)", () => {
  it("Phase 0-1 → meta_only", () => {
    expect(getPhaseReadoutLevel(0)).toBe("meta_only");
    expect(getPhaseReadoutLevel(1)).toBe("meta_only");
  });

  it("Phase 2 → stable", () => {
    expect(getPhaseReadoutLevel(2)).toBe("stable");
  });

  it("Phase 3 → stable_recent", () => {
    expect(getPhaseReadoutLevel(3)).toBe("stable_recent");
  });

  it("Phase 4-5 → full", () => {
    expect(getPhaseReadoutLevel(4)).toBe("full");
    expect(getPhaseReadoutLevel(5)).toBe("full");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildPersonalModelV2FromSynthetic (= pure adapter)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SAMPLE_PROFILE: SyntheticPersonalModelSource = {
  hdmPhase: 4,
  trustLevel: 4,
  stable: {
    judgmentMode: "集中型",
    timePreference: "朝強い",
    energyRecovery: "ひとり静か",
    archetype: "賢者型",
  },
  recent: {
    innerWeather: "穏やか",
    recentRhythm: "深い集中続き",
    stressLoad: "中",
  },
  contextual: {
    similarDayRecall: "先週金曜と類似",
    pastSelfDelta: "1 ヶ月前と差なし",
  },
};

describe("buildPersonalModelV2FromSynthetic: Phase 別 layer 充填", () => {
  it("Phase 0 → meta-only", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 0 });
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("Phase 1 → meta-only", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 1 });
    expect(pm.stable).toBeUndefined();
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("Phase 2 → meta + stable", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 2 });
    expect(pm.stable).toBeDefined();
    expect(pm.stable!.judgmentMode).toBe("集中型");
    expect(pm.stable!.timePreference).toBe("朝強い");
    expect(pm.stable!.traitTone).toBe("ひとり静か"); // energyRecovery → traitTone
    expect(pm.recent).toBeUndefined();
    expect(pm.contextual).toBeUndefined();
  });

  it("Phase 3 → meta + stable + recent", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 3 });
    expect(pm.stable).toBeDefined();
    expect(pm.recent).toBeDefined();
    expect(pm.recent!.innerWeather).toBe("穏やか");
    expect(pm.recent!.recentRhythm).toBe("深い集中続き");
    expect(pm.recent!.stressLoad).toBe("中");
    expect(pm.contextual).toBeUndefined();
  });

  it("Phase 4 → 全 layer", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 4 });
    expect(pm.stable).toBeDefined();
    expect(pm.recent).toBeDefined();
    expect(pm.contextual).toBeDefined();
    expect(pm.contextual!.similarDayRecall).toBe("先週金曜と類似");
    expect(pm.contextual!.pastSelfDelta).toBe("1 ヶ月前と差なし");
  });

  it("Phase 5 → 全 layer", () => {
    const pm = buildPersonalModelV2FromSynthetic({ ...SAMPLE_PROFILE, hdmPhase: 5 });
    expect(pm.stable).toBeDefined();
    expect(pm.recent).toBeDefined();
    expect(pm.contextual).toBeDefined();
  });

  it("archetype 不在で stable に含まれない (= optional)", () => {
    const noArchetype: SyntheticPersonalModelSource = {
      ...SAMPLE_PROFILE,
      hdmPhase: 2,
      stable: { ...SAMPLE_PROFILE.stable, archetype: undefined },
    };
    const pm = buildPersonalModelV2FromSynthetic(noArchetype);
    expect(pm.stable!.archetype).toBeUndefined();
    expect(pm.stable!.judgmentMode).toBe("集中型"); // 他は埋まる
  });

  it("contextual undefined (= phase 4 だが contextual data なし) でも安全", () => {
    const noContext: SyntheticPersonalModelSource = {
      ...SAMPLE_PROFILE,
      hdmPhase: 4,
      contextual: undefined,
    };
    const pm = buildPersonalModelV2FromSynthetic(noContext);
    expect(pm.contextual).toBeDefined(); // {} で初期化される
    expect(pm.contextual!.similarDayRecall).toBeUndefined();
  });

  it("meta は常に hdmPhase / trustLevel / observationCompleteness", () => {
    const pm = buildPersonalModelV2FromSynthetic(SAMPLE_PROFILE);
    expect(pm.meta.hdmPhase).toBe(4);
    expect(pm.meta.trustLevel).toBe(4);
    expect(pm.meta.observationCompleteness).toBe(1.0); // default
  });

  it("observationCompleteness 指定可", () => {
    const pm = buildPersonalModelV2FromSynthetic(SAMPLE_PROFILE, 0.5);
    expect(pm.meta.observationCompleteness).toBe(0.5);
  });

  it("deterministic (= 同入力 → 同出力)", () => {
    const pm1 = buildPersonalModelV2FromSynthetic(SAMPLE_PROFILE);
    const pm2 = buildPersonalModelV2FromSynthetic(SAMPLE_PROFILE);
    expect(pm1).toEqual(pm2);
  });

  it("入力 mutate なし", () => {
    const snapshot = JSON.stringify(SAMPLE_PROFILE);
    buildPersonalModelV2FromSynthetic(SAMPLE_PROFILE);
    expect(JSON.stringify(SAMPLE_PROFILE)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractPersonalModelV2 (= server entry、 Step 3 Phase 5 で実 adapter 接続済)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractPersonalModelV2: server entry (= Phase 5 実 adapter 接続)", () => {
  it("userId 不在 → meta-only Phase 0 (= 早期 return、 DB 接続なし)", async () => {
    const pm = await extractPersonalModelV2();
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });

  it("userId 指定あり (= vitest 環境、 supabase Next.js context 不在) → safe fallback Phase 0", async () => {
    // vitest 環境では supabaseServer() の cookies() が動かないため、
    // adapter 内部の try/catch で fail-open し meta-only Phase 0 に degrade する。
    // 実 wire の test は personalModelStargazerAdapter.test.ts で mock 経由実施済。
    const pm = await extractPersonalModelV2("user-x");
    expect(pm.meta.hdmPhase).toBe(0);
    expect(pm.stable).toBeUndefined();
  });
});
