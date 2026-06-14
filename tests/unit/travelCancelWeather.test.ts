/**
 * T11-C7-D — cancel_weather → T6 readiness handoff golden tests
 *
 * 検証対象: assessCancelWeatherRisk（純 helper）+ assessReadiness 統合（readiness 層のみ）。
 * 設計正本: docs/t11-c7-cancel-weather-readiness-handoff-plan.md
 *   （+ CEO/GPT 修正: 本 slice は fit-core を producer にしない・evaluateFit/burdenFit/labelCap 不触・
 *     interaction 非配線・evidence は readiness 側の純 input）
 *
 * 主眼:
 *   - 天候不確実 × 取消不能 commitment → needs_confirmation(weather_reversal_uncertainty)
 *   - fallback は concern を緩和するが booking authority を grant しない
 *   - 取消柔軟性 未知 → 推測せず確認 / paid・irreversible 未知 → booking-ready にさせない
 *   - private リスク許容度は authoritative にのみ effect・shared 非漏洩
 *   - evidence 未供給 → 既存 readiness 挙動 不変
 *   - fit-core(evaluateFit/burdenFit/rain_outdoor/last_departure_strand) を複製/import しない
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessReadiness,
  toSharedReadinessView,
  hasActionAuthority,
  assessCancelWeatherRisk,
  CANCEL_WEATHER_CONFIRM_RISK_FLOOR,
  type ReadinessInput,
} from "@/lib/shared/travel/readiness-core";
import { CONFIRMATION_REASONS, type CancelWeatherEvidence } from "@/lib/shared/travel/readiness-types";
import type { TravelProposal } from "@/lib/shared/travel/proposal-types";
import type { DecisionResult } from "@/lib/shared/travel/decision-types";
import type { ParticipantImpact } from "@/lib/shared/travel/proposal-comparison-types";

// ── 合成 builder（既存 travelReadinessCore.test.ts と同形） ──
const mkProposal = (over: Partial<TravelProposal> = {}): TravelProposal => ({
  candidateId: "proposal:relaxed", angle: "relaxed", title: "T", summary: "S",
  timeWindow: { kind: "single_day", date: "2026-07-01" },
  areaPlaceholder: "京都", budgetBand: { lo: 0, hi: 30000, confidence: 0.9, currency: "JPY" },
  paceFit: "fit", mobilityFit: "fit", softPreferenceMatches: [], uncertainty: "low",
  missingInputs: [], rationale: { shared: "", forParticipant: {} }, ...over,
});
const imp = (over: Partial<ParticipantImpact> = {}): ParticipantImpact => ({ participantId: "P1", satisfiedShared: 0, satisfiedPrivate: 0, stretchedShared: 0, stretchedPrivate: 0, ...over });
const mkDecision = (selected: TravelProposal, over: Partial<DecisionResult> = {}): DecisionResult => ({
  state: "recommend", recommendedProposalId: selected.candidateId, tiedProposalIds: [], followUpQuestion: null,
  blockers: [], consensusReadiness: "ready", impact: [imp({ participantId: "P1" })],
  tiltedByHistory: false, tiltVisibility: null, rationale: { shared: "", forParticipant: {} }, inputError: null, ...over,
});
const SEL = mkProposal();
const ready = (policy: ReadinessInput["policy"], cancelWeather?: CancelWeatherEvidence, over: Partial<DecisionResult> = {}): ReturnType<typeof assessReadiness> =>
  assessReadiness({ decision: mkDecision(SEL, over), selected: SEL, policy, cancelWeather });

// ════════════════════════════════════════════════════════════════════════════
describe("1. 純 helper: weather 欠落 → hallucinate しない / 決定論", () => {
  it("evidence 無 / weather 欠落 → risk 0・確認なし・missing 記録", () => {
    expect(assessCancelWeatherRisk(undefined)).toEqual({ risk: 0, needsConfirmation: false, needsQuestion: false, privateElevation: false, confidence: 0, missingFields: [] });
    const r = assessCancelWeatherRisk({});
    expect(r.risk).toBe(0);
    expect(r.needsConfirmation).toBe(false);
    expect(r.missingFields).toContain("weatherVulnerability");
  });
  it("決定論: 同一 evidence → 深い等価", () => {
    const e: CancelWeatherEvidence = { weatherVulnerability: 0.7, cancellationFlexibility: 0.2, fallbackAvailability: 0.3 };
    expect(assessCancelWeatherRisk(e)).toEqual(assessCancelWeatherRisk(e));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. evidence 未供給 / 非 commitment → 既存 readiness 挙動 不変", () => {
  it("cancelWeather undefined と非供給 で深い等価", () => {
    const inp = { decision: mkDecision(SEL), selected: SEL, policy: { intendedAction: "schedule_hold" as const } };
    expect(assessReadiness({ ...inp })).toEqual(assessReadiness({ ...inp, cancelWeather: undefined }));
  });
  it("propose_plan(非 commit) では強 evidence でも weather 確認を起こさない（既存と等価）", () => {
    const noEv = ready({ intendedAction: "propose_plan" });
    const withEv = ready({ intendedAction: "propose_plan" }, { weatherVulnerability: 0.9, cancellationFlexibility: 0.05 });
    expect(withEv).toEqual(noEv);
    expect(withEv.requiredConfirmations.map((c) => c.reason)).not.toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3+4. 高 weather + irreversible booking → needs_confirmation(weather_reversal_uncertainty)", () => {
  it("reserve + 高 wv + rigid → needs_confirmation・reason 出現", () => {
    const r = ready(
      { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true },
      { weatherVulnerability: 0.85, cancellationFlexibility: 0.1 },
    );
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(r.riskFlags).toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. 屋外天候 risk × fallback 無 → 確認を要求", () => {
  it("高 wv + 高 exposure + rigid → needsConfirmation・readiness needs_confirmation", () => {
    expect(assessCancelWeatherRisk({ weatherVulnerability: 0.8, outdoorExposure: 0.95, cancellationFlexibility: 0.1 }).needsConfirmation).toBe(true);
    const r = ready({ intendedAction: "schedule_hold" }, { weatherVulnerability: 0.8, outdoorExposure: 0.95, cancellationFlexibility: 0.1 });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. fallback は concern を緩和するが booking authority を grant しない", () => {
  it("fallback 有 → risk 減・needsConfirmation 解消", () => {
    const noFb = assessCancelWeatherRisk({ weatherVulnerability: 0.8, cancellationFlexibility: 0.1 });
    const withFb = assessCancelWeatherRisk({ weatherVulnerability: 0.8, cancellationFlexibility: 0.1, fallbackAvailability: 0.95 });
    expect(withFb.risk).toBeLessThan(noFb.risk);
    expect(noFb.needsConfirmation).toBe(true);
    expect(withFb.needsConfirmation).toBe(false);
  });
  it("fallback で weather 確認が消えても paid 予約は依然 gate（authority を grant しない）", () => {
    const r = ready(
      { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: false },
      { weatherVulnerability: 0.8, cancellationFlexibility: 0.1, fallbackAvailability: 0.95 },
    );
    expect(r.requiredConfirmations.map((c) => c.reason)).not.toContain("weather_reversal_uncertainty"); // weather concern 緩和
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("paid_booking"); // だが予約は gate
    expect(hasActionAuthority(r)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. 取消柔軟性 未知 → 推測せず確認（flexibility を hallucinate しない）", () => {
  it("cancellationFlexibility 未知 → needsQuestion・missingFields・readiness needs_confirmation", () => {
    const risk = assessCancelWeatherRisk({ weatherVulnerability: 0.8 });
    expect(risk.needsQuestion).toBe(true);
    expect(risk.missingFields).toContain("cancellationFlexibility");
    const r = ready({ intendedAction: "schedule_hold" }, { weatherVulnerability: 0.8 });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. paid/irreversible 未知 → reserve_or_book_later を booking-ready にさせない", () => {
  it("reserve + paid・irreversible undefined + 天候 material（柔軟性既知でも） → needs_confirmation・authority 無", () => {
    const r = ready({ intendedAction: "reserve_or_book_later" }, { weatherVulnerability: 0.7, cancellationFlexibility: 0.9 });
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(hasActionAuthority(r)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("9. private リスク許容度 → authoritative にのみ effect・shared 非漏洩", () => {
  const ev: CancelWeatherEvidence = { weatherVulnerability: 0.55, cancellationFlexibility: 0.7, privateRiskTolerance: 0.1 };
  it("shared では立たない条件で private tolerance のみが押し上げ → private 確認・authority 無", () => {
    expect(assessCancelWeatherRisk(ev).needsConfirmation).toBe(false); // 柔軟(0.7)→ shared は立たない
    expect(assessCancelWeatherRisk(ev).privateElevation).toBe(true);
    const r = ready({ intendedAction: "schedule_hold", involvesPaidBooking: false, irreversible: false }, ev);
    expect(r.state).toBe("needs_confirmation");
    expect(r.requiredConfirmations.some((c) => c.reason === "weather_reversal_uncertainty" && c.visibility === "private")).toBe(true);
    expect(hasActionAuthority(r)).toBe(false);
  });
  it("shared 射影では weather_reversal_uncertainty が確認・riskFlag・rationale から消える", () => {
    const r = ready({ intendedAction: "schedule_hold", involvesPaidBooking: false, irreversible: false }, ev);
    const shared = toSharedReadinessView(r);
    expect(shared.state).toBe("ready_to_propose"); // private のみの確認 → shared では ready
    expect(shared.requiredConfirmations.map((c) => c.reason)).not.toContain("weather_reversal_uncertainty");
    expect(shared.riskFlags).not.toContain("weather_reversal_uncertainty"); // ★ riskFlag 漏洩しない
    expect(JSON.stringify(shared)).not.toContain("weather_reversal_uncertainty");
    expect(shared.authoritative).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("10. shared な天候懸念は shared rationale に出てよい", () => {
  it("既知 rigid × 高 wv（shared）→ shared view に reason・rationale 残存", () => {
    const r = ready({ intendedAction: "schedule_hold" }, { weatherVulnerability: 0.8, cancellationFlexibility: 0.1 });
    const shared = toSharedReadinessView(r);
    expect(shared.state).toBe("needs_confirmation");
    expect(shared.requiredConfirmations.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(shared.rationale.shared).toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("11. 二重計上防止: reversibility 単一軸 / strand・rain を複製しない", () => {
  it("reversibility は cancellationFlexibility 単一軸（柔軟 1.0 → risk≈0）", () => {
    const rigid = assessCancelWeatherRisk({ weatherVulnerability: 0.8, cancellationFlexibility: 0.0 });
    const flex = assessCancelWeatherRisk({ weatherVulnerability: 0.8, cancellationFlexibility: 1.0 });
    expect(rigid.risk).toBeGreaterThan(flex.risk);
    expect(flex.risk).toBeLessThan(CANCEL_WEATHER_CONFIRM_RISK_FLOOR);
    expect(flex.needsConfirmation).toBe(false);
  });
  it("weather_reversal_uncertainty は readiness reason・fit interaction(rain_outdoor/last_departure_strand/IX_)を参照しない", () => {
    expect(CONFIRMATION_REASONS).toContain("weather_reversal_uncertainty");
    const core = readFileSync(resolve(process.cwd(), "lib/shared/travel/readiness-core.ts"), "utf8");
    expect(core).not.toMatch(/rain_outdoor/);
    expect(core).not.toMatch(/last_departure_strand/);
    expect(core).not.toMatch(/\bIX_/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("12. 純度: fit-core 非 producer・live 断定なし・action authority 無", () => {
  it("readiness-core/types は fetch/API/DB/route/UI/weather/fit-core を import しない", () => {
    for (const f of ["lib/shared/travel/readiness-core.ts", "lib/shared/travel/readiness-types.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
      // ★ fit-core を producer にしない＝fit 層(fit-core/types/constructs)を import しない（import 行で判定）
      expect(src).not.toMatch(/from ["'][^"']*\/fit-(core|types|constructs)/);
    }
  });
  it("出力に booking/calendar/send 実行語が出ない・確認時は authority 無", () => {
    const r = ready({ intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true }, { weatherVulnerability: 0.85, cancellationFlexibility: 0.1 });
    const json = JSON.stringify(r);
    for (const f of ["booked", "calendarWrite", "sendMessage", "reservation_id"]) expect(json).not.toContain(f);
    expect(hasActionAuthority(r)).toBe(false);
  });
});
