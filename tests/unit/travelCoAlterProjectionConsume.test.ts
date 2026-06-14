/**
 * T11-B(CoAlter)-D — CoAlter Projection consume types/helper tests
 *
 * 検証対象: coalter-projection-consume(-types).ts。
 * 設計正本: docs/t11-ui-coalter-consume-wiring-preflight.md §4/§8
 *
 * 主眼:
 *   - 入力は PlanIntelligenceProjection のみ（authoritative/raw packet/raw FitResult は @ts-expect-error）
 *   - questionsToAsk→ask_question / needsConfirmation→ask_confirmation / readiness→note_risk /
 *     fallback→show_fallback / fitAdvisory→explain_plan|note_risk
 *   - weather_reversal_uncertainty は確認 cue（booking authority でない）
 *   - execute/book/schedule/send action / executionAuthority/authoritative/diagnostics を持たない
 *   - useCoAlter / /talk / fetch / DB を import しない
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveCoAlterProjectionCues } from "@/lib/shared/travel/coalter-projection-consume";
import {
  COALTER_PROJECTION_DISPLAY_ACTIONS,
  type CoAlterProjectionCue,
  type CoAlterProjectionPromptInput,
} from "@/lib/shared/travel/coalter-projection-consume-types";
import type { PlanIntelligenceProjection } from "@/lib/shared/travel/plan-intelligence-projection-types";
import type { DisplayPacketForClient } from "@/lib/shared/travel/engine-consume-types";

// ── fixture projection（display-safe・private-free）──
const projection = (over: Partial<PlanIntelligenceProjection> = {}): PlanIntelligenceProjection => ({
  answer: { nextAction: "confirm", recommendedProposalId: "proposal:relaxed", text: "確認が必要です。" },
  whyThisPlan: "共有条件に合致します。",
  whatCouldFail: [{ note: "outdoor_weather_exposure", source: "fit_risk" }],
  needsConfirmation: [{ reason: "weather_reversal_uncertainty" }, { reason: "paid_booking" }],
  questionsToAsk: [{ about: "missing_slot", intent: "ask_budget_band" }],
  fallbackNote: [{ trigger: "rain_or_weather", fallbackAction: "switch_proposal", switchToProposalId: "proposal:culture" }],
  fitAdvisory: [
    { candidateId: "proposal:relaxed", grade: "good", labelCap: null, labelStability: "stable", confidenceBand: "high", mismatchCount: 1, riskCodes: ["outdoor_weather_exposure"], missingFields: [] },
    { candidateId: "proposal:culture", grade: "excellent", labelCap: null, labelStability: "stable", confidenceBand: "high", mismatchCount: 0, riskCodes: [], missingFields: [] },
  ],
  readinessWarning: { readinessState: "needs_confirmation", hasOpenConfirmations: true },
  viewerNote: null,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
describe("1. 入力型ロック: projection のみ受理", () => {
  it("PlanIntelligenceProjection は受理", () => {
    const input: CoAlterProjectionPromptInput = { projection: projection(), viewerId: "you" };
    expect(input.projection.answer).toBeDefined();
  });
  it("DisplayPacketForClient / authoritative / raw は受理不可（@ts-expect-error）", () => {
    // @ts-expect-error display packet は PlanIntelligenceProjection でない（CoAlter 入力に渡せない）
    const bad: CoAlterProjectionPromptInput = { projection: {} as unknown as DisplayPacketForClient };
    void bad;
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. cue 写像（display/proposal のみ）", () => {
  const cues = deriveCoAlterProjectionCues(projection());
  const by = (action: string) => cues.filter((c) => c.action === action);
  it("questionsToAsk → ask_question（ref=intent）", () => {
    expect(by("ask_question").map((c) => c.ref)).toEqual(["ask_budget_band"]);
  });
  it("needsConfirmation → ask_confirmation（weather_reversal_uncertainty も確認 cue）", () => {
    const conf = by("ask_confirmation").map((c) => c.ref);
    expect(conf).toContain("weather_reversal_uncertainty");
    expect(conf).toContain("paid_booking");
  });
  it("readinessWarning(非 ready) → note_risk", () => {
    expect(by("note_risk").some((c) => c.source === "readinessWarning" && c.ref === "needs_confirmation")).toBe(true);
  });
  it("fallbackNote → show_fallback（ref=trigger）", () => {
    expect(by("show_fallback").map((c) => c.ref)).toEqual(["rain_or_weather"]);
  });
  it("fitAdvisory: risk あり→note_risk / なし→explain_plan", () => {
    const fit = cues.filter((c) => c.source === "fitAdvisory");
    expect(fit.find((c) => c.ref === "proposal:relaxed")?.action).toBe("note_risk"); // riskCodes あり
    expect(fit.find((c) => c.ref === "proposal:culture")?.action).toBe("explain_plan"); // riskCodes なし
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. authority/booking/send を持たない", () => {
  it("display action 集合に execute/book/schedule/send が無い", () => {
    for (const forbidden of ["execute", "book", "schedule", "send", "reserve", "pay"]) {
      expect(COALTER_PROJECTION_DISPLAY_ACTIONS.some((a) => a.includes(forbidden))).toBe(false);
    }
  });
  it("cue は executionAuthority/authoritative/diagnostics field を持たない", () => {
    const c: CoAlterProjectionCue = deriveCoAlterProjectionCues(projection())[0];
    for (const k of ["executionAuthority", "authoritative", "diagnostics", "canBook", "execute"]) {
      expect(k in c).toBe(false);
    }
    expect(Object.keys(c).sort()).toEqual(["action", "ref", "source"]);
  });
  it("ready_to_propose のとき readiness cue を出さない", () => {
    const cues = deriveCoAlterProjectionCues(projection({ readinessWarning: { readinessState: "ready_to_propose", hasOpenConfirmations: false } }));
    expect(cues.some((c) => c.source === "readinessWarning")).toBe(false);
  });
  it("決定論: 同一 projection → 同一 cue 列", () => {
    expect(deriveCoAlterProjectionCues(projection())).toEqual(deriveCoAlterProjectionCues(projection()));
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. import 純度（useCoAlter / talk / runtime なし）", () => {
  it("consume(-types) は useCoAlter/talk/fetch/API/DB/Supabase/中間層を import しない", () => {
    // コメント（説明文に forbidden 語が出る）を除いた実コードのみで判定（既存 plan test 同方式）。
    const stripComments = (raw: string) =>
      raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    for (const f of ["lib/shared/travel/coalter-projection-consume.ts", "lib/shared/travel/coalter-projection-consume-types.ts"]) {
      const src = stripComments(readFileSync(resolve(process.cwd(), f), "utf8"));
      expect(src).not.toMatch(/useCoAlter/);
      expect(src).not.toMatch(/\/talk/);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/from ["'][^"']*(fit-core|readiness-core|packet-core|engine)/);
      expect(src).not.toMatch(/realtime|read_?receipt/i);
    }
  });
});
