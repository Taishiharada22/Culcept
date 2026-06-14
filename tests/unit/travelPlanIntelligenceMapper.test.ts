/**
 * T11-H3-C — Plan Intelligence Projection pure mapper tests
 *
 * 検証対象: plan-intelligence-projection.ts（buildPlanIntelligenceProjection）。
 * 設計正本: docs/t11-h-plan-intelligence-projection-design.md（§5 マッピング）
 *
 * 主眼:
 *   - display packet field のみから projection を構築・authority/diagnostics/raw を出さない
 *   - needsConfirmation は shared-safe のみ・weather_reversal は確認 reason（booking authority でない）
 *   - fitAdvisory は advisory bounded（raw component なし）
 *   - viewerNote は指定 viewer 自身の note のみ（他者 private 非漏洩）
 *   - import 純度（fit/readiness/中間層/UI/app/fetch なし）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { toDisplayPacket } from "@/lib/shared/travel/engine-consume";
import { buildPlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection";
import type { DisplayPacketForClient } from "@/lib/shared/travel/engine-consume-types";
import { evaluateFit } from "@/lib/shared/travel/fit-core";
import type { FitProvenance, FitSubject, FitUserState, Observed, TravelObjectState } from "@/lib/shared/travel/fit-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";
import type { ProposalFitInput } from "@/lib/shared/travel/fit-decision-adapter-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ob = <T,>(value: T, confidence = 0.8, provenance: FitProvenance = "editorial"): Observed<T> => ({ value, confidence, provenance });
const soloU = (): FitSubject => ({ kind: "solo", user: { tolerances: {} } as FitUserState });
const place = (): TravelObjectState => ({ placeRefId: "P", category: "place", roleAffinity: { relaxation: ob(0.85) } });
const goodFit = () => evaluateFit({ entity: place(), subject: soloU() });

const ev = (surface: ExtractionSurface, refId: string) => ({ surface, refId });
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:s")] });
const engInput = (over: Partial<TravelPlanEngineInput> = {}): TravelPlanEngineInput => ({ slots: [dest("京都"), date("2026-07-01"), budget(30000), softPref("nature")], participantIds: ["P1"], ...over });
const recId = (inp: TravelPlanEngineInput): string => runTravelPlanEngine(inp).authoritative.recommendedProposalId ?? "";
const display = (inp: TravelPlanEngineInput, viewerId?: string): DisplayPacketForClient => toDisplayPacket(runTravelPlanEngine({ ...inp, ...(viewerId ? { viewerId } : {}) }), viewerId);

// ════════════════════════════════════════════════════════════════════════════
describe("1. 出力 shape: display-only・authority/diagnostics/raw key 無し", () => {
  it("基本 projection が構築でき禁止 key を持たない", () => {
    const proj = buildPlanIntelligenceProjection({ packet: display(engInput()) });
    expect(proj.answer.nextAction).toBeDefined();
    for (const k of ["executionAuthority", "authoritative", "diagnostics", "canBook", "canSchedule", "bookingReady", "actionAllowed"]) {
      expect(k in proj).toBe(false);
    }
  });
  it("answer は nextAction/recommendedProposalId/text（shared rationale）由来", () => {
    const out = runTravelPlanEngine(engInput());
    const proj = buildPlanIntelligenceProjection({ packet: toDisplayPacket(out) });
    expect(proj.answer.nextAction).toBe(out.shared.nextAction);
    expect(proj.answer.recommendedProposalId).toBe(out.shared.recommendedProposalId);
    expect(proj.answer.text).toBe(out.shared.rationale.shared);
    expect(proj.whyThisPlan).toBe(out.shared.rationale.shared);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. needsConfirmation は shared-safe のみ・weather_reversal は確認 reason", () => {
  it("cancelWeather → needsConfirmation に weather_reversal_uncertainty・readinessWarning 連動", () => {
    const inp = engInput({ policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true }, cancelWeather: { weatherVulnerability: 0.85, cancellationFlexibility: 0.1 } });
    const proj = buildPlanIntelligenceProjection({ packet: display(inp) });
    expect(proj.needsConfirmation.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(proj.readinessWarning.readinessState).toBe("needs_confirmation");
    expect(proj.readinessWarning.hasOpenConfirmations).toBe(true);
    // booking authority を表現しない
    expect("executionAuthority" in proj).toBe(false);
    expect("executionAuthority" in proj.readinessWarning).toBe(false);
  });
  it("private confirmation を注入しても needsConfirmation に出ない（shared filter）", () => {
    const base = display(engInput());
    const injected = { ...base, confirmationQueue: [{ reason: "private_constraint_conflict" as const, visibility: "private" as const }] } as DisplayPacketForClient;
    const proj = buildPlanIntelligenceProjection({ packet: injected });
    expect(proj.needsConfirmation).toHaveLength(0);
    expect(JSON.stringify(proj)).not.toContain("private_constraint_conflict");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. fitAdvisory は advisory bounded（raw component なし）", () => {
  it("fit 供給 → fitAdvisory に bounded summary・raw component/valueFull 無し", () => {
    const inp = engInput({ fit: [{ candidateId: recId(engInput()), fit: goodFit() }] as ProposalFitInput[] });
    const proj = buildPlanIntelligenceProjection({ packet: display(inp) });
    expect(proj.fitAdvisory.length).toBeGreaterThan(0);
    for (const s of proj.fitAdvisory) {
      expect((s as unknown as Record<string, unknown>).components).toBeUndefined();
      expect((s as unknown as Record<string, unknown>).valueFull).toBeUndefined();
    }
  });
  it("fit 無 → fitAdvisory 空（no-op）", () => {
    expect(buildPlanIntelligenceProjection({ packet: display(engInput()) }).fitAdvisory).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. questionsToAsk←questionQueue / fallbackNote←fallbackSummary", () => {
  it("destination 欠如 → questionsToAsk が questionQueue から導出", () => {
    const out = runTravelPlanEngine({ slots: [date("2026-07-01"), budget(30000)], participantIds: ["P1"] });
    const proj = buildPlanIntelligenceProjection({ packet: toDisplayPacket(out) });
    expect(proj.questionsToAsk.map((q) => q.about)).toEqual(out.shared.questionQueue.map((q) => q.about));
    expect(proj.questionsToAsk.length).toBeGreaterThan(0);
  });
  it("fallbackNote は fallbackSummary を写像（注入 fixture で検証）", () => {
    const base = display(engInput());
    const injected = { ...base, fallbackSummary: [{ trigger: "rain_or_weather" as const, fallbackAction: "switch_proposal" as const, switchToProposalId: "proposal:culture", visibility: "shared" as const }] } as DisplayPacketForClient;
    const proj = buildPlanIntelligenceProjection({ packet: injected });
    expect(proj.fallbackNote).toEqual([{ trigger: "rain_or_weather", fallbackAction: "switch_proposal", switchToProposalId: "proposal:culture" }]);
    expect(proj.whatCouldFail.some((w) => w.source === "fallback" && w.note === "rain_or_weather")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. viewerNote は指定 viewer 自身の note のみ（他者 private 非漏洩）", () => {
  it("viewerId 無 → null / shared packet も null", () => {
    expect(buildPlanIntelligenceProjection({ packet: display(engInput()) }).viewerNote).toBeNull();
  });
  it("forParticipant に複数 note があっても指定 viewer の note のみ読む（他者 SECRET 非漏洩）", () => {
    const base = display(engInput(), "P1");
    const injected = { ...base, rationale: { shared: base.rationale.shared, forParticipant: { P1: "P1の確認事項", P2: "P2_SECRET_NOTE" } } } as DisplayPacketForClient;
    const p1 = buildPlanIntelligenceProjection({ packet: injected, viewerId: "P1" });
    expect(p1.viewerNote).toBe("P1の確認事項");
    expect(JSON.stringify(p1)).not.toContain("P2_SECRET_NOTE"); // 他者 private を読まない
    const p2 = buildPlanIntelligenceProjection({ packet: injected, viewerId: "P2" });
    expect(p2.viewerNote).toBe("P2_SECRET_NOTE"); // 当人には自分の note のみ
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. 決定論 + import 純度", () => {
  it("同一入力 → 深い等価", () => {
    const inp = engInput({ fit: [{ candidateId: recId(engInput()), fit: goodFit() }] as ProposalFitInput[] });
    const d = display(inp);
    expect(buildPlanIntelligenceProjection({ packet: d })).toEqual(buildPlanIntelligenceProjection({ packet: d }));
  });
  it("mapper は fit-core/readiness-core/packet-core/中間層/UI/app/fetch を import しない", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/shared/travel/plan-intelligence-projection.ts"), "utf8");
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/from ["'][^"']*(fit-core|readiness-core|packet-core|proposal-comparator|decision-core|contingency-core|components|app\/)/);
    // import は projection 型のみ
    expect(src).toMatch(/from ["']\.\/plan-intelligence-projection-types/);
  });
});
