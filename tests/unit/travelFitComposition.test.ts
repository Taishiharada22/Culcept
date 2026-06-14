/**
 * T11-F-E — Fit-to-Decision / T9 composition golden tests
 *
 * 検証対象: fit-decision-adapter(-types) + engine.ts への合成（Bundle 1: advisory・dominance 不変）。
 * 設計正本: docs/t11-fit-to-decision-t9-composition-facade-plan.md
 *   （+ CEO/GPT 修正 2 点: raw FitResult を packet に載せない / join 厳格 fail-closed）
 *
 * 主眼:
 *   - fit 無 → 既存 T9 output byte 同一・fitSummary 無し
 *   - 一致 id → packet fitSummary に出現 / 未知 id → diagnostic / 重複 id → fail-closed 棄却
 *   - raw FitResult を packet に出さない・private fit は authoritative に効くが shared packet に漏れない
 *   - fitSummary は executionAuthority / dominance / ranking を変えない
 *   - cancelWeather が engine input 経由で readiness に届く（fit-core 非経由）
 *   - 射影は display 専用・import 純度
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import { deriveProposalFitSummaries, FIT_CONFIDENCE_BAND_HIGH } from "@/lib/shared/travel/fit-decision-adapter";
import type { ProposalFitInput } from "@/lib/shared/travel/fit-decision-adapter-types";
import { evaluateFit, toSharedFitView } from "@/lib/shared/travel/fit-core";
import type { FitProvenance, FitSubject, FitUserState, Observed, RouteChainState, TravelObjectState } from "@/lib/shared/travel/fit-types";
import type { ExtractedSlot, ExtractionSurface } from "@/lib/shared/travel/slot-types";
import type { TravelPlanEngineInput } from "@/lib/shared/travel/engine-types";

// ── fit fixtures（real evaluateFit）─────────────────────────────────────────
const ob = <T,>(value: T, confidence = 0.8, provenance: FitProvenance = "editorial"): Observed<T> => ({ value, confidence, provenance });
const soloU = (): FitSubject => ({ kind: "solo", user: { tolerances: {} } as FitUserState });
const place = (): TravelObjectState => ({ placeRefId: "P", category: "place", roleAffinity: { relaxation: ob(0.85) } });
const goodFit = () => evaluateFit({ entity: place(), subject: soloU() });
// private burden（walkingLoad private）で full を下げ・shared には出さない
const route = (): RouteChainState => ({ connection: { fromRef: "a", toRef: "b", legs: [{ mode: "walk", legKind: "lastMile", timeMin: 8 }], transferNodes: [] }, ordering: [] });
const privMob = { userPrefs: { self: { walkingLoad: { value: 0.95, confidence: 0.85, visibility: "private" as const } } } };
const fitPriv = () => evaluateFit({ entity: place(), subject: soloU(), routeInput: route(), constructInput: privMob });
const fitPub = () => evaluateFit({ entity: place(), subject: soloU(), routeInput: route() });

// ── engine slot pipeline（readiness test と同形）─────────────────────────────
const ev = (surface: ExtractionSurface, refId: string) => ({ surface, refId });
type Slot = ExtractedSlot;
const dest = (a: string): Slot => ({ key: "destination_area", value: { areaText: a }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("form_input", "f:d")] });
const date = (d: string): Slot => ({ key: "date_or_range", value: { kind: "single_day", date: d }, status: "confirmed", fillState: "filled", confidence: 1, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("session_context", "s:w")] });
const budget = (hi: number): Slot => ({ key: "budget_band", value: { lo: 0, hi, confidence: 0.9, currency: "JPY" }, status: "confirmed", fillState: "filled", confidence: 0.9, owner: { kind: "shared" }, visibility: "shared", evidence: [ev("quick_action", "a:b")] });
const softPref = (v: string): Slot => ({ key: "soft_preference", value: { descriptorKey: "prefer", descriptorValue: v }, status: "confirmed", fillState: "filled", confidence: 0.7, owner: { kind: "participant", participantId: "P1" }, visibility: "shared", evidence: [ev("chat_message", "m:s")] });
const baseSlots = (): Slot[] => [dest("京都"), date("2026-07-01"), budget(30000), softPref("nature")];
const engInput = (over: Partial<TravelPlanEngineInput> = {}): TravelPlanEngineInput => ({ slots: baseSlots(), participantIds: ["P1"], ...over });
const proposalIdsOf = (inp: TravelPlanEngineInput): string[] => {
  const out = runTravelPlanEngine(inp);
  // authoritative recommend id（必ず存在する proposal の 1 つ）
  return out.authoritative.recommendedProposalId ? [out.authoritative.recommendedProposalId] : [];
};
const GRADE_RANK = { excellent: 4, good: 3, stretch: 2, poor: 1, blocked: 0 } as const;

// ════════════════════════════════════════════════════════════════════════════
describe("1. adapter: fit 無 → no-op / 一致 id → summary / band", () => {
  it("fitInputs 無/空 → summaries 空・diagnostics 空（no-op）", () => {
    expect(deriveProposalFitSummaries(["X"], undefined, "authoritative")).toEqual({ summaries: [], diagnostics: { unknownIds: [], duplicateIds: [] } });
    expect(deriveProposalFitSummaries(["X"], [], "shared")).toEqual({ summaries: [], diagnostics: { unknownIds: [], duplicateIds: [] } });
  });
  it("一致 id → bounded summary（raw FitResult を含まない・band 化）", () => {
    const c = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: goodFit() }], "authoritative");
    expect(c.summaries).toHaveLength(1);
    const s = c.summaries[0];
    expect(s.candidateId).toBe("X");
    expect(["excellent", "good", "stretch", "poor", "blocked"]).toContain(s.grade);
    expect(["low", "medium", "high"]).toContain(s.confidenceBand);
    // raw FitResult field を持たない
    expect(Object.keys(s).sort()).toEqual(["candidateId", "confidenceBand", "grade", "labelCap", "labelStability", "missingFields", "mismatchCount", "riskCodes"].sort());
    expect((s as unknown as Record<string, unknown>).components).toBeUndefined();
    expect((s as unknown as Record<string, unknown>).valueFull).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. adapter: 厳格 join（未知=diagnostic / 重複=fail-closed / 推論なし）", () => {
  it("未知 id → 無視 + unknownIds（diagnostic）", () => {
    const c = deriveProposalFitSummaries(["proposal:relaxed"], [{ candidateId: "proposal:ghost", fit: goodFit() }], "authoritative");
    expect(c.summaries).toHaveLength(0);
    expect(c.diagnostics.unknownIds).toEqual(["proposal:ghost"]);
  });
  it("重複 id → **両方棄却**（fail-closed）+ duplicateIds", () => {
    const dup: ProposalFitInput[] = [
      { candidateId: "X", fit: goodFit() },
      { candidateId: "X", fit: goodFit() },
    ];
    const c = deriveProposalFitSummaries(["X"], dup, "authoritative");
    expect(c.summaries).toHaveLength(0); // 任意採用しない
    expect(c.diagnostics.duplicateIds).toEqual(["X"]);
  });
  it("areaPlaceholder/名前から推論しない（id 完全一致のみ採用）", () => {
    const c = deriveProposalFitSummaries(["proposal:relaxed"], [{ candidateId: "京都", fit: goodFit() }], "shared");
    expect(c.summaries).toHaveLength(0);
    expect(c.diagnostics.unknownIds).toEqual(["京都"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. privacy: private fit は authoritative に効くが shared に漏れない", () => {
  it("full burdenFit が private で低下（authoritative grade に反映可）", () => {
    const bf = (f: ReturnType<typeof fitPriv>) => f.components.find((c) => c.key === "burdenFit")!;
    expect(bf(fitPriv()).valueFull).toBeLessThan(bf(fitPriv()).valueShared); // private が full を下げる
    const authPriv = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: fitPriv() }], "authoritative").summaries[0];
    const authPub = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: fitPub() }], "authoritative").summaries[0];
    expect(GRADE_RANK[authPriv.grade]).toBeLessThanOrEqual(GRADE_RANK[authPub.grade]); // private は良化させない
  });
  it("shared summary は private 有無で一致（toSharedFitView 由来・漏洩なし）", () => {
    const sharedPriv = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: fitPriv() }], "shared").summaries[0];
    const sharedPub = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: fitPub() }], "shared").summaries[0];
    expect(sharedPriv).toEqual(sharedPub); // private は shared summary を変えない（canary）
  });
  it("shared summary は toSharedFitView を直接要約したものと一致（純 shared 由来）", () => {
    const viaAdapter = deriveProposalFitSummaries(["X"], [{ candidateId: "X", fit: fitPriv() }], "shared").summaries[0];
    expect(viaAdapter.grade).toBe(toSharedFitView(fitPriv()).fitLabel);
    expect(viaAdapter.labelCap).toBe(toSharedFitView(fitPriv()).labelCap);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. engine: fit 無 → byte 同一・fitSummary 無し", () => {
  it("fit 不在 → 同一入力で深い等価・authoritative/shared/viewer に fitSummary key なし", () => {
    const a = runTravelPlanEngine(engInput({ viewerId: "P1" }));
    const b = runTravelPlanEngine(engInput({ viewerId: "P1" }));
    expect(a).toEqual(b);
    expect(a.authoritative.fitSummary).toBeUndefined();
    expect(a.shared.fitSummary).toBeUndefined();
    expect(a.viewer!.fitSummary).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. engine: 一致 fit → packet fitSummary・dominance/authority 不変", () => {
  const ids = proposalIdsOf(engInput());
  const fitInput: ProposalFitInput[] = [{ candidateId: ids[0], fit: goodFit() }];
  it("一致 id の fit が authoritative packet fitSummary に出現", () => {
    const out = runTravelPlanEngine(engInput({ fit: fitInput }));
    expect(out.authoritative.fitSummary?.map((s) => s.candidateId)).toContain(ids[0]);
  });
  it("fitSummary は recommend/ranking/executionAuthority を変えない（advisory）", () => {
    const noFit = runTravelPlanEngine(engInput());
    const withFit = runTravelPlanEngine(engInput({ fit: fitInput }));
    expect(withFit.authoritative.recommendedProposalId).toBe(noFit.authoritative.recommendedProposalId);
    expect(withFit.authoritative.executionAuthority).toBe(noFit.authoritative.executionAuthority);
    expect(withFit.diagnostics.executionAuthority).toBe(noFit.diagnostics.executionAuthority);
    // fitSummary を外せば残りは完全一致（dominance/nextAction 不変）
    const { fitSummary: _a, ...wRest } = withFit.authoritative;
    expect(wRest).toEqual(noFit.authoritative);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. engine: private fit → shared packet に漏れない・projection display 専用", () => {
  const ids = proposalIdsOf(engInput());
  it("shared packet fitSummary は private 有無で一致・authoritative=false 維持", () => {
    const withPriv = runTravelPlanEngine(engInput({ fit: [{ candidateId: ids[0], fit: fitPriv() }], viewerId: "P1" }));
    const withPub = runTravelPlanEngine(engInput({ fit: [{ candidateId: ids[0], fit: fitPub() }], viewerId: "P1" }));
    expect(withPriv.shared.fitSummary).toEqual(withPub.shared.fitSummary); // canary
    expect(withPriv.viewer!.fitSummary).toEqual(withPub.viewer!.fitSummary);
    expect(withPriv.shared.authoritative).toBe(false);
    expect(withPriv.shared.executionAuthority).toBe(false);
    expect(withPriv.viewer!.executionAuthority).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("7. engine: cancelWeather が readiness に届く（fit-core 非経由）", () => {
  it("cancelWeather 供給 → confirmationQueue に weather_reversal_uncertainty・executionAuthority false", () => {
    const out = runTravelPlanEngine(engInput({
      policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true },
      cancelWeather: { weatherVulnerability: 0.85, cancellationFlexibility: 0.1 },
    }));
    expect(out.authoritative.confirmationQueue.map((c) => c.reason)).toContain("weather_reversal_uncertainty");
    expect(out.authoritative.executionAuthority).toBe(false);
  });
  it("cancelWeather 不在 → 既存 readiness 挙動不変（weather 確認なし）", () => {
    const out = runTravelPlanEngine(engInput({ policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true, irreversible: true } }));
    expect(out.authoritative.confirmationQueue.map((c) => c.reason)).not.toContain("weather_reversal_uncertainty");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("8. import 純度 / 境界", () => {
  it("adapter は fetch/route/weather/API/DB/UI を import しない（fit 層は橋渡しとして可）", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/shared/travel/fit-decision-adapter.ts"), "utf8");
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/Date\.now|Math\.random/);
    // import 行で外部/weather/route data module を引かない（fit 層の import は橋渡しとして可）
    expect(src).not.toMatch(/from ["'][^"']*(weather|timetable|route-api|place-search)/i);
  });
  it("engine.ts は fit-core を直接 import せず adapter 経由（合成は adapter の責務）", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/shared/travel/engine.ts"), "utf8");
    expect(src).not.toMatch(/from ["']\.\/fit-core/);
    expect(src).not.toMatch(/from ["']\.\/fit-constructs/);
    expect(src).toMatch(/from ["']\.\/fit-decision-adapter/); // adapter 経由
  });
  it("band 定数は公開（非 opaque）", () => {
    expect(FIT_CONFIDENCE_BAND_HIGH).toBe(0.7);
  });
});
