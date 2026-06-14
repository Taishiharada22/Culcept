/**
 * T11-H2-C — Plan Intelligence Projection pure types tests
 *
 * 検証対象: plan-intelligence-projection-types.ts（型壁 + bounded 出力契約）。
 * 設計正本: docs/t11-h-plan-intelligence-projection-design.md（+ CEO/GPT 命名補正: action-authority 語禁止）
 *
 * 主眼:
 *   - PI 入力は DisplayPacketForClient のみ受理・authoritative/生 packet は @ts-expect-error
 *   - 出力に executionAuthority/authoritative/diagnostics/raw FitResult/private rationale が無い
 *   - fitAdvisory は advisory のみ・cancelWeather は確認 text のみ（booking authority でない）
 *   - import 純度
 *
 * ★ 型レベル assertion は tsc baseline=55 維持で検証（壁が壊れると @ts-expect-error/型不一致で error 増）。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import type {
  PlanIntelligenceProjection,
  PlanIntelligenceProjectionInput,
} from "@/lib/shared/travel/plan-intelligence-projection-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (surface: ExtractionSurface, refId: string) => ({ surface, refId });
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const engInput = (over: Partial<TravelPlanEngineInput> = {}): TravelPlanEngineInput => ({ slots: [dest("京都"), date("2026-07-01"), budget(30000)], participantIds: ["P1"], ...over });

// 型レベル: 指定 key が **不在**なら true（存在すると false → true 代入で tsc error）
type KeyAbsent<T, K extends PropertyKey> = K extends keyof T ? false : true;

// ── bounded projection fixture（display 由来のみで構築可能なことを型で示す）──
const sampleProjection = (): PlanIntelligenceProjection => ({
  answer: { nextAction: "confirm", recommendedProposalId: "proposal:relaxed", text: "進める前に確認が必要です。" },
  whyThisPlan: "共有条件に合致します。",
  whatCouldFail: [{ note: "雨天時の代替が必要", source: "fit_risk" }],
  needsConfirmation: [{ reason: "weather_reversal_uncertainty" }],
  questionsToAsk: [{ about: "missing_slot", intent: "ask_budget" }],
  fallbackNote: [{ trigger: "rain_or_weather", fallbackAction: "switch_proposal", switchToProposalId: "proposal:culture" }],
  fitAdvisory: [{ candidateId: "proposal:relaxed", grade: "good", labelCap: null, labelStability: "stable", confidenceBand: "high", mismatchCount: 0, riskCodes: [], missingFields: [] }],
  readinessWarning: { readinessState: "needs_confirmation", hasOpenConfirmations: true },
  viewerNote: null,
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. 入力は DisplayPacketForClient のみ受理（型ロック）", () => {
  it("toDisplayPacket 由来は受理（型エラーなし）", () => {
    const out = runTravelPlanEngine(engInput({ viewerId: "P1" }));
    const input: PlanIntelligenceProjectionInput = { packet: toDisplayPacket(out, "P1"), viewerId: "P1" };
    expect(input.packet.authoritative).toBe(false);
    expect(input.packet.executionAuthority).toBe(false);
  });
  it("authoritative packet は受理不可（@ts-expect-error）", () => {
    const out = runTravelPlanEngine(engInput());
    // @ts-expect-error authoritative packet は DisplayPacketForClient でない（PI 入力に渡せない）
    const bad: PlanIntelligenceProjectionInput = { packet: out.authoritative };
    expect(bad.packet.authoritative).toBe(true); // 実体は authoritative=true（型壁が防ぐ）
  });
  it("生 PlanDecisionPacket（shared）も brand 無しで受理不可（@ts-expect-error）", () => {
    const out = runTravelPlanEngine(engInput());
    // @ts-expect-error 生 packet は display brand を持たない（toDisplayPacket 経由のみ）
    const bad: PlanIntelligenceProjectionInput = { packet: out.shared };
    expect(bad.packet.authoritative).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. 出力に authority/diagnostics/raw が無い（型 + runtime）", () => {
  it("型: executionAuthority / authoritative / diagnostics は projection の key でない", () => {
    const noExec: KeyAbsent<PlanIntelligenceProjection, "executionAuthority"> = true;
    const noAuth: KeyAbsent<PlanIntelligenceProjection, "authoritative"> = true;
    const noDiag: KeyAbsent<PlanIntelligenceProjection, "diagnostics"> = true;
    expect([noExec, noAuth, noDiag]).toEqual([true, true, true]);
  });
  it("型: action-authority 語の field を持たない（canBook/canSchedule/bookingReady/actionAllowed）", () => {
    const a: KeyAbsent<PlanIntelligenceProjection, "canBook"> = true;
    const b: KeyAbsent<PlanIntelligenceProjection, "canSchedule"> = true;
    const c: KeyAbsent<PlanIntelligenceProjection, "bookingReady"> = true;
    const d: KeyAbsent<PlanIntelligenceProjection, "actionAllowed"> = true;
    expect([a, b, c, d]).toEqual([true, true, true, true]);
  });
  it("runtime: 構築した projection に禁止 key が出ない", () => {
    const p = sampleProjection();
    for (const k of ["executionAuthority", "authoritative", "diagnostics", "canBook", "canSchedule", "bookingReady", "actionAllowed"]) {
      expect(k in p).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. fitAdvisory は advisory・raw FitResult なし / readiness は説明のみ", () => {
  it("fitAdvisory entry は bounded（components/valueFull を持たない）", () => {
    const p = sampleProjection();
    for (const s of p.fitAdvisory) {
      expect((s as unknown as Record<string, unknown>).components).toBeUndefined();
      expect((s as unknown as Record<string, unknown>).valueFull).toBeUndefined();
    }
  });
  it("readinessWarning は state + hasOpenConfirmations のみ（authority field なし）", () => {
    const p = sampleProjection();
    expect(Object.keys(p.readinessWarning).sort()).toEqual(["hasOpenConfirmations", "readinessState"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. cancelWeather は確認 text のみ（booking authority でない）", () => {
  it("weather_reversal_uncertainty は needsConfirmation の reason として現れる（authority でない）", () => {
    const p = sampleProjection();
    expect(p.needsConfirmation.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    // 確認は説明のみ・executionAuthority/booking 語は projection に無い
    expect("executionAuthority" in p).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. import 純度", () => {
  it("projection types は app/UI/fetch/API/DB/fit-core を import しない", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/shared/travel/plan-intelligence-projection-types.ts"), "utf8");
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/from ["'][^"']*(components|app\/|fit-core)/);
  });
});
