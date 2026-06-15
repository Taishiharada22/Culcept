/**
 * C2 — TravelCandidate Conversion 型 firewall tests（type-level + source-contract）
 *
 * 設計正本: docs/t11-candidate-insertion-preflight.md（§11 C2・§12）
 *
 * 主眼（型のみ・構築なし）:
 *   - source は ScheduledDraftCandidateEnvelope のみ（display / raw draft 不可）。
 *   - explicitInterpretation は必須（欠落で型 error）・raw FitResult を受けない。
 *   - 結果（conversion_ready）は TravelCandidate に代入不可・candidates[] に push 不可。
 *   - ranking/dominance/executionAuthority/booking/acceptance フィールド不在（source-contract）。
 *   - import 純度・helper/construction を持たない（types only）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  TravelCandidateConversionInput,
  TravelCandidateConversionReady,
  TravelCandidateExplicitInterpretation,
  TravelCandidateExplicitMetadata,
  TravelCandidateDerivedAllowed,
} from "@/lib/shared/travel/travel-candidate-conversion-types";
import type { ScheduledDraftCandidateEnvelope } from "@/lib/shared/travel/travel-candidate-boundary-types";
import type { ScheduledTravelItineraryDraft } from "@/lib/shared/travel/assembly-types";
import type { DisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display-types";
import type { TravelCandidate, TravelCorePlan } from "@/lib/shared/travel/core-types";
import type { FitResult } from "@/lib/shared/travel/fit-types";

// ── 型 firewall（@ts-expect-error・実行しない＝型のみ）─────────────────────────
// 拒否が崩れる回帰は @ts-expect-error 未使用化で tsc error になり baseline 55 を破る → 早期検知。
export function _conversionTypeFirewall(
  plan: TravelCorePlan,
  env: ScheduledDraftCandidateEnvelope,
  draft: ScheduledTravelItineraryDraft,
  disp: DisplayScheduledItinerary,
  fr: FitResult,
  interp: TravelCandidateExplicitInterpretation,
  meta: TravelCandidateExplicitMetadata,
  derived: TravelCandidateDerivedAllowed,
  ready: TravelCandidateConversionReady,
) {
  // 正常系: envelope を source にした input は通る（型 OK・error なし）
  const okInput: TravelCandidateConversionInput = {
    source: env,
    explicitInterpretation: interp,
    explicitCandidateMetadata: meta,
    derivedAllowed: derived,
  };

  // @ts-expect-error DisplayScheduledItinerary は source にできない
  const badDisplaySource: TravelCandidateConversionInput = { source: disp, explicitInterpretation: interp, explicitCandidateMetadata: meta, derivedAllowed: derived };
  // @ts-expect-error raw ScheduledTravelItineraryDraft は source にできない
  const badRawDraftSource: TravelCandidateConversionInput = { source: draft, explicitInterpretation: interp, explicitCandidateMetadata: meta, derivedAllowed: derived };
  // @ts-expect-error raw FitResult は explicitInterpretation にできない
  const badFitInterp: TravelCandidateExplicitInterpretation = fr;
  // @ts-expect-error interpretive 必須 field 欠落（tags/rationale/uncertainty/tradeoff 欠落）
  const missingInterp: TravelCandidateExplicitInterpretation = { title: "x" };
  // @ts-expect-error 結果は TravelCandidate に代入不可（まだ構築していない）
  const notCandidate: TravelCandidate = ready;
  // @ts-expect-error 結果は candidates[]（TravelCandidate[]）に push 不可
  plan.candidates.push(ready);

  return [okInput, badDisplaySource, badRawDraftSource, badFitInterp, missingInterp, notCandidate, plan];
}

// ── source-contract（types only・純度・ranking/authority 不在）──────────────────
describe("C2 conversion types source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-candidate-conversion-types.ts"), "utf8"));

  it("types only — helper/construction/insertion を持たない（export function/const 値なし）", () => {
    expect(SRC).not.toMatch(/export\s+function/);
    expect(SRC).not.toMatch(/export\s+const/);
    for (const f of ["runTravelPlanEngine", "evaluateFit", "assembleScheduledDraft", "buildScheduledDraftCandidateEnvelope", ".candidates", ".push("]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("ranking/dominance/authority/booking/acceptance フィールドを持たない", () => {
    for (const f of ["dominatedBy", "paretoOptimal", "rank", "executionAuthority", "booking", "calendar", "accepted", "acceptance", "finalized", "planState"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("変換ターゲットを core-types TravelCandidate として型で明示（構築はしない）", () => {
    expect(SRC).toContain("core_types_travel_candidate");
    expect(SRC).toMatch(/TravelCandidateConversionTarget\s*=\s*TravelCandidate/);
  });
  it("fetch/API/DB/Supabase/外部/M2/app/UI を import しない（type import のみ）", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|maps/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
  });
});
