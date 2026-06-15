/**
 * RD2f-wiring-P1 — dogfood fixture preview への leaveBy enrichment **no-op wiring** + leak-token 硬化（2026-06-15）
 * 正本設計: docs/reality-leaveby-assembly-wiring-rd2f-assembly-wiring-0.md（§5/§6/§7）
 *
 * 核（honest constraint）: route ETA supply が未接続ゆえ `assembleLeaveByBindings` は **何も attach しない**。
 *   よって flag ON でも OFF でも dogfood payload は **byte 同一**（inert plumbing）。本 slice の価値は
 *   (a) gated seam の確立 と (b) leaveBy internal token を全 serialization guard に硬化（asymmetry 解消）。
 *
 * 検証:
 *   - flag OFF（本番デフォルト）→ enrichment 非実行・既存挙動不変。
 *   - flag ON（empty supply）→ payload は OFF と byte 同一（DOM-diff zero）・leak violation ゼロ。
 *   - LEAVEBY_LEAK_TOKENS が dogfood/operator/surfaceProjection の 3 serialization guard で検出される。
 *   - ordinary safe text では leaveBy token が false positive しない。
 *   - exact instant / timeContract / *Ref が万一 serialize されれば全 guard が弾く（DTO filter 防御の機械検証）。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildDogfoodPreviewScenarios as buildDogfoodDefault,
  dogfoodPayloadLeakViolations,
} from "@/lib/plan/realityCore/dogfoodPreview";
import { realDayPayloadLeakViolations } from "@/lib/plan/realityCore/operatorDayPreview";
import { surfaceProjectionConsumerViewViolations } from "@/lib/plan/realityCore/surfaceProjection";
import { LEAVEBY_LEAK_TOKENS } from "@/lib/plan/realityCore/leaveByLeakTokens";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00（constant・page が渡す形）

/** flag を env で切り替えて dogfoodPreview を fresh import（PLAN_FLAGS は module-load 時評価ゆえ resetModules 必須） */
async function buildDogfoodWithFlag(on: boolean) {
  vi.resetModules();
  vi.stubEnv("REALITY_LEAVEBY_ENRICH_PREVIEW", on ? "true" : "");
  const mod = await import("@/lib/plan/realityCore/dogfoodPreview");
  return mod.buildDogfoodPreviewScenarios(REF);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("RD2f-wiring-P1 #1 flag default OFF（本番デフォルト）", () => {
  it("PLAN_FLAGS.realityLeaveByEnrichPreview は env 未設定で false", () => {
    expect(PLAN_FLAGS.realityLeaveByEnrichPreview).toBe(false);
  });
  it("OFF（top import）で dogfood payload は従来通り構築され leak violation ゼロ・leaveByComputedPresent 全 false", async () => {
    const payload = await buildDogfoodDefault(REF);
    expect(payload.scenarios.length).toBeGreaterThan(0);
    expect(dogfoodPayloadLeakViolations(payload)).toEqual([]);
    for (const s of payload.scenarios) expect(s.leaveByComputedPresent).toBe(false);
  });
});

// RD3a-P1 で ON は non-empty（synthetic supply で computed 生成）に進化。よって OFF/ON の差分は
// **leaveByComputedPresent のみ**で、consumer-facing safe surface（consumerView/renderedCopy/delivery）は byte 同一。
describe("RD2f-wiring-P1 #2 OFF と ON で safe surface は byte 同一（leaveByComputedPresent のみ differ）", () => {
  const safeSurface = (p: { scenarios: ReadonlyArray<{ scenarioKey: unknown; label: unknown; consumerView: unknown; renderedCopy: unknown; delivery: unknown }> }) =>
    p.scenarios.map((s) => ({ scenarioKey: s.scenarioKey, label: s.label, consumerView: s.consumerView, renderedCopy: s.renderedCopy, delivery: s.delivery }));
  it("consumer-facing safe surface は OFF===ON（computed は internal-only ゆえ表面不変）", async () => {
    const off = await buildDogfoodWithFlag(false);
    const on = await buildDogfoodWithFlag(true);
    expect(JSON.stringify(safeSurface(on))).toBe(JSON.stringify(safeSurface(off)));
  });
  it("ON(non-empty) でも leak violation ゼロ・exact-instant content token 不出現", async () => {
    const on = await buildDogfoodWithFlag(true);
    expect(dogfoodPayloadLeakViolations(on)).toEqual([]);
    const json = JSON.stringify(on).toLowerCase();
    // exact instant / object 内部 field は出ない（leaveByComputedPresent[schema-state]の substring は除外）
    for (const t of ["leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref"]) {
      expect(json.includes(t)).toBe(false);
    }
    // bare object key "leavebycomputed":{ は出ない（boolean key leavebycomputedpresent のみ）
    expect(json.includes('leavebycomputed":{')).toBe(false);
  });
});

describe("RD2f-wiring-P1 #3 leak guard 硬化: LEAVEBY token を 3 serialization guard が検出", () => {
  // exact instant / timeContract / *Ref を含む合成 object（万一 DTO に serialize されたら弾かれるべき）
  const synthetic = {
    note: "safe-looking",
    nested: {
      leaveByComputed: {
        leaveByInstant: "2026-06-12T09:20:00+09:00",
        timeContract: { arrivalTargetInstant: "2026-06-12T10:00:00+09:00" },
        sourceTimeEstimateRef: "ref_src_1",
        bufferRef: "ref_buf_1",
      },
    },
  };

  it("dogfoodPayloadLeakViolations が leaveByComputed/leaveByInstant/arrivalTargetInstant/timeContract/*Ref を弾く", () => {
    const out = dogfoodPayloadLeakViolations(synthetic as never);
    for (const t of LEAVEBY_LEAK_TOKENS) {
      expect(out.some((m) => m.includes(t))).toBe(true);
    }
  });

  it("realDayPayloadLeakViolations（operator real-data guard）も同 token を弾く", () => {
    const out = realDayPayloadLeakViolations(synthetic as never);
    for (const t of LEAVEBY_LEAK_TOKENS) {
      expect(out.some((m) => m.includes(t))).toBe(true);
    }
  });

  it("surfaceProjection consumerView serialization backstop も leaveBy token を弾く（asymmetry 解消）", () => {
    // 構造的に valid な consumerView（claims/questions は配列）に token を混入 → backstop が検出
    const leakView = {
      display: "render",
      claims: [],
      questions: [],
      proposalAvailable: false,
      departureAvailable: false,
      leaked: "leaveByInstant=2026-06-12T09:20:00+09:00 timeContract arrivalTargetInstant sourceTimeEstimateRef bufferRef leaveByComputed",
    };
    const out = surfaceProjectionConsumerViewViolations(leakView as never);
    for (const t of LEAVEBY_LEAK_TOKENS) {
      expect(out.some((m) => m.includes(t))).toBe(true);
    }
  });
});

describe("RD2f-wiring-P1 #4 ordinary safe text で false positive しない", () => {
  it("safe な日本語 payload で LEAVEBY token は 1 つも発火しない", () => {
    const safe = {
      label: "今日の予定は順調です",
      copy: "余裕をもって出発の準備をしましょう", // 「出発」は copySurface lexicon 対象だが本 token 群には無関係
      view: { display: "render", claims: [], questions: [] },
    };
    const out = dogfoodPayloadLeakViolations(safe as never);
    const realOut = realDayPayloadLeakViolations(safe as never);
    for (const t of LEAVEBY_LEAK_TOKENS) {
      expect(out.some((m) => m.includes(t))).toBe(false);
      expect(realOut.some((m) => m.includes(t))).toBe(false);
    }
  });

  it("既存 display field `leaveBy`（bare token）を誤検出しない: bare \"leaveby\" は token に含めない", () => {
    // ern.leaveBy（display RealityAttribute<string>・null）相当が serialize されても false positive しない
    const withDisplayLeaveBy = { leaveBy: { value: null, status: "unresolved" } };
    const out = dogfoodPayloadLeakViolations(withDisplayLeaveBy as never);
    // LEAVEBY_LEAK_TOKENS は internal field 名のみ（bare "leaveby" 非含有）ゆえ display field では発火しない
    for (const t of LEAVEBY_LEAK_TOKENS) expect(out.some((m) => m.includes(t))).toBe(false);
  });
});

describe("RD2f-wiring-P1 #5 LEAVEBY_LEAK_TOKENS 構成（bare \"leaveby\" 非含有・internal field のみ）", () => {
  it("6 token・全 lowercase・bare \"leaveby\" を含まない", () => {
    expect([...LEAVEBY_LEAK_TOKENS].sort()).toEqual(
      ["arrivaltargetinstant", "bufferref", "leavebycomputed", "leavebyinstant", "sourcetimeestimateref", "timecontract"].sort(),
    );
    expect(LEAVEBY_LEAK_TOKENS.includes("leaveby")).toBe(false);
    for (const t of LEAVEBY_LEAK_TOKENS) expect(t).toBe(t.toLowerCase());
  });
});
