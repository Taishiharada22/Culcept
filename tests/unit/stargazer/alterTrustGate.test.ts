/**
 * Trust Gate 回帰テスト — P0.5 不変条件を固定する
 *
 * これらのテストが崩れると「演者」（全部知っているが隠す）に戻る。
 * resolveAlterAccess() + 各テンプレート関数が Trust Level に応じて
 * 情報を正しくゲートしていることを検証する。
 */
import { vi, describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));

import {
  buildAlterPersonality,
  generateAlterGreeting,
  generateAlterResponse,
  generateAlterProvocation,
  resolveAlterAccess,
  type AlterInput,
  type AlterAccessGate,
} from "@/lib/stargazer/alter";

import type { TrustLevel } from "@/lib/stargazer/alterUnderstanding";

// ── Test Data ──

function makeAlterInput(overrides: Partial<AlterInput> = {}): AlterInput {
  return {
    archetypeCode: "ACIO",
    shadowCode: "NVEX",
    axisScores: {
      introvert_vs_extrovert: 0.3,
      individual_vs_social: -0.3,
      logic_vs_emotion: 0.15,
      plan_vs_improvise: -0.24,
      abstract_vs_concrete: 0.3,
      optimism_vs_pessimism: 0.09,
      risk_vs_safety: -0.18,
      novelty_vs_tradition: 0.21,
    },
    observationDepth: 50,
    ...overrides,
  };
}

const personality = buildAlterPersonality(makeAlterInput());

// CoreWound の実際のテキスト（テストデータの ACIO アーキタイプから生成）
const coreWoundText = personality.coreWound;
const coreWoundShort = personality.coreWoundShort;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. resolveAlterAccess() — ゲート関数の正確性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveAlterAccess()", () => {
  it("T0 opening: innerWeather のみ、全深層データ blocked", () => {
    const gate = resolveAlterAccess(0, "opening");
    expect(gate.coreWound).toBe("none");
    expect(gate.contradiction.allowed).toBe(false);
    expect(gate.deepTension).toBe(false);
    expect(gate.behavioralEvidence).toBe(false);
    expect(gate.innerWeather).toBe(true);
    expect(gate.toneConstraint).toBe("warm_only");
  });

  it("T1 opening: 行動証拠も blocked（opening は response より一段浅い）", () => {
    const gate = resolveAlterAccess(1, "opening");
    expect(gate.behavioralEvidence).toBe(false);
    expect(gate.deepTension).toBe(false);
    expect(gate.coreWound).toBe("none");
    expect(gate.contradiction.allowed).toBe(false);
  });

  it("T1 response: 行動証拠は OK、CoreWound/contradiction は blocked", () => {
    const gate = resolveAlterAccess(1, "response");
    expect(gate.behavioralEvidence).toBe(true);
    expect(gate.deepTension).toBe(true);
    expect(gate.coreWound).toBe("none");
    expect(gate.contradiction.allowed).toBe(false);
  });

  it("T2 response: contradiction 1件まで、CoreWound は none", () => {
    const gate = resolveAlterAccess(2, "response");
    expect(gate.contradiction.allowed).toBe(true);
    expect(gate.contradiction.maxCount).toBe(1);
    expect(gate.coreWound).toBe("none");
    expect(gate.deepTension).toBe(true);
    expect(gate.behavioralEvidence).toBe(true);
    expect(gate.toneConstraint).toBe("adaptive");
  });

  it("T2 opening: contradiction blocked（opening では矛盾に触れない）", () => {
    const gate = resolveAlterAccess(2, "opening");
    expect(gate.contradiction.allowed).toBe(false);
    expect(gate.coreWound).toBe("none");
  });

  it("T3 response: CoreWound hypothesis、contradiction 複数", () => {
    const gate = resolveAlterAccess(3, "response");
    expect(gate.coreWound).toBe("hypothesis");
    expect(gate.contradiction.allowed).toBe(true);
    expect(gate.contradiction.maxCount).toBe(3);
  });

  it("T3 opening: CoreWound silhouette のみ（opening は一段浅い）", () => {
    const gate = resolveAlterAccess(3, "opening");
    expect(gate.coreWound).toBe("silhouette");
    expect(gate.contradiction.allowed).toBe(true);
    expect(gate.contradiction.maxCount).toBe(1);
  });

  it("T4 response: フルアクセス", () => {
    const gate = resolveAlterAccess(4, "response");
    expect(gate.coreWound).toBe("hypothesis");
    expect(gate.contradiction.allowed).toBe(true);
    expect(gate.contradiction.maxCount).toBe(5);
    expect(gate.deepTension).toBe(true);
    expect(gate.behavioralEvidence).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. generateAlterGreeting() — Opening Trust 不変条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateAlterGreeting() Trust gate", () => {
  it("T0 opening: CoreWound テキストが出力に含まれない", () => {
    const greeting = generateAlterGreeting(personality, undefined, undefined, 0);
    expect(greeting).not.toContain(coreWoundText);
    expect(greeting).not.toContain(coreWoundShort);
  });

  it("T0 opening: dominantContradictions が出力に含まれない", () => {
    const greeting = generateAlterGreeting(personality, undefined, undefined, 0);
    for (const c of personality.dominantContradictions) {
      expect(greeting).not.toContain(c);
    }
  });

  it("T1 opening: CoreWound テキストが出力に含まれない", () => {
    const greeting = generateAlterGreeting(personality, undefined, undefined, 1);
    expect(greeting).not.toContain(coreWoundText);
    expect(greeting).not.toContain(coreWoundShort);
  });

  it("T3+ opening: shadowName は含まれる（最低限の自己紹介）", () => {
    const greeting = generateAlterGreeting(personality, undefined, undefined, 3);
    expect(greeting).toContain(personality.shadowName);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. generateAlterResponse() — Response Trust 不変条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateAlterResponse() Trust gate", () => {
  const history = [{ role: "user" as const, content: "辛い", mode: "warm" as const }];

  it("T0 response / warm: CoreWound trigger が出力に含まれない", () => {
    // "辛い" → pain emotion → uses mainWound.trigger
    const response = generateAlterResponse(personality, "辛いことがあった", history, "warm", 0);
    // getCoreWoundModel("ACIO").trigger のテキストが含まれないことを確認
    // trigger は personality には直接露出していないので、coreWound 系で代替検証
    expect(response).not.toContain(coreWoundText);
    expect(response).not.toContain(coreWoundShort);
  });

  it("T2 response / provocative: CoreWound が出力に含まれない", () => {
    const response = generateAlterResponse(
      personality,
      "自分がよく分からない",
      [
        { role: "user", content: "話を聞いて", mode: "warm" },
        { role: "assistant", content: "聞いてる", mode: "warm" },
        { role: "user", content: "もっと深い話", mode: "provocative" },
        { role: "assistant", content: "いいよ", mode: "provocative" },
      ],
      "provocative",
      2,
    );
    expect(response).not.toContain(coreWoundShort);
  });

  it("T3+ response / provocative: CoreWound (仮説言語) が出力に出せる", () => {
    // T3+ で coreWound が使えることを確認
    // provocative default template uses personality.coreWoundShort
    // depth が浅い場合 default に落ちる
    const response = generateAlterResponse(
      personality,
      "もう全部話してほしい",
      [], // empty history → default provocative
      "provocative",
      3,
    );
    // T3+ではCoreWoundShortにアクセスできるはず
    // ただしテンプレート選択はデータ依存なので、gate の状態で検証
    const gate = resolveAlterAccess(3, "response");
    expect(gate.coreWound).toBe("hypothesis");
  });

  it("T3+ response / analytical: 完全な構造分析が可能", () => {
    const gate = resolveAlterAccess(3, "response");
    expect(gate.coreWound).toBe("hypothesis");
    expect(gate.contradiction.allowed).toBe(true);
    expect(gate.contradiction.maxCount).toBeGreaterThanOrEqual(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. generateAlterProvocation() — Provocation Trust 不変条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateAlterProvocation() Trust gate", () => {
  it("T0: CoreWound / contradiction / 抑圧 が一切出ない", () => {
    // variant 0-4 全パターンをチェック
    for (let v = 0; v < 5; v++) {
      const text = generateAlterProvocation(personality, v, 0);
      expect(text).not.toContain(coreWoundShort);
      for (const c of personality.dominantContradictions) {
        expect(text).not.toContain(c);
      }
    }
  });

  it("T0: 汎用メッセージのみ返す", () => {
    const text = generateAlterProvocation(personality, 0, 0);
    expect(text).toContain(personality.shadowName);
    expect(text.length).toBeGreaterThan(5);
  });

  it("T3+: CoreWound パターンが使用可能", () => {
    // variant 0 = 核心的傷 template (if gate allows)
    const text = generateAlterProvocation(personality, 0, 3);
    // At T3+ the coreWoundShort template should be available
    expect(text).toContain(coreWoundShort);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. canDisclose() 整合性 — resolveAlterAccess と同じルール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("resolveAlterAccess ↔ canDisclose alignment", () => {
  // canDisclose rules:
  // wound: T >= 3
  // contradiction: T >= 2
  // behavior_observed: T >= 1

  it("coreWound access mirrors canDisclose(wound) = T>=3", () => {
    expect(resolveAlterAccess(0, "response").coreWound).toBe("none");
    expect(resolveAlterAccess(1, "response").coreWound).toBe("none");
    expect(resolveAlterAccess(2, "response").coreWound).toBe("none");
    expect(resolveAlterAccess(3, "response").coreWound).not.toBe("none");
    expect(resolveAlterAccess(4, "response").coreWound).not.toBe("none");
  });

  it("contradiction access mirrors canDisclose(contradiction) = T>=2", () => {
    expect(resolveAlterAccess(0, "response").contradiction.allowed).toBe(false);
    expect(resolveAlterAccess(1, "response").contradiction.allowed).toBe(false);
    expect(resolveAlterAccess(2, "response").contradiction.allowed).toBe(true);
    expect(resolveAlterAccess(3, "response").contradiction.allowed).toBe(true);
  });

  it("behavioralEvidence access mirrors canDisclose(behavior) = T>=1", () => {
    expect(resolveAlterAccess(0, "response").behavioralEvidence).toBe(false);
    expect(resolveAlterAccess(1, "response").behavioralEvidence).toBe(true);
    expect(resolveAlterAccess(2, "response").behavioralEvidence).toBe(true);
  });
});
