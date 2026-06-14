/**
 * T11-G-D — Consume trust-tier types/helpers golden tests
 *
 * 検証対象: engine-consume-types.ts（型壁）+ engine-consume.ts（helper/assertion）。
 * 設計正本: docs/t11-consume-contract-preflight.md（2 trust tier の型壁化）
 *
 * 主眼:
 *   - toDisplayPacket は shared/viewer のみ（authoritative=false / executionAuthority=false）
 *   - authoritative packet を DisplayPacketForClient に代入できない（@ts-expect-error・tsc 検証）
 *   - display packet に private confirmation / raw FitResult が出ない・diagnostics 非搭載
 *   - fitSummary は advisory のまま非権限 / server helper は authoritative を保持
 *   - assertion fail-closed / import 純度
 *
 * ★ 型レベル負例（@ts-expect-error）は tsc baseline=55 維持で検証される
 *   （壁が壊れて代入可能になると未使用 @ts-expect-error → tsc error 増 → baseline 破綻で検知）。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTravelPlanEngine } from "@/lib/shared/travel/engine";
import {
  toDisplayPacket,
  toServerAuthoritativePacket,
  assertDisplayPacketHasNoAuthority,
  assertNoAuthoritativePacketForClient,
} from "@/lib/shared/travel/engine-consume";
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

// ════════════════════════════════════════════════════════════════════════════
describe("1. toDisplayPacket は shared/viewer のみ・非権限", () => {
  it("viewerId 無 → shared 由来（authoritative=false / executionAuthority=false）", () => {
    const out = runTravelPlanEngine(engInput());
    const d = toDisplayPacket(out);
    expect(d.authoritative).toBe(false);
    expect(d.executionAuthority).toBe(false);
    expect(d).toEqual(out.shared);
  });
  it("viewerId 有 + viewer あり → viewer 由来", () => {
    const out = runTravelPlanEngine(engInput({ viewerId: "P1" }));
    expect(toDisplayPacket(out, "P1")).toEqual(out.viewer);
  });
  it("viewerId 有だが viewer null → shared に fallback", () => {
    const out = runTravelPlanEngine(engInput()); // viewerId 未指定 → viewer null
    expect(toDisplayPacket(out, "P1")).toEqual(out.shared);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("2. 型壁: authoritative packet を display として扱えない（@ts-expect-error）", () => {
  it("authoritative PlanDecisionPacket は DisplayPacketForClient に代入不可（実体は authoritative=true）", () => {
    const out = runTravelPlanEngine(engInput());
    // @ts-expect-error authoritative packet は display tier でない（brand 欠如 + authoritative:false 不一致）
    const bad: DisplayPacketForClient = out.authoritative;
    expect(bad.authoritative).toBe(true); // 型壁が無ければ client に漏れる実体
  });
  it("生 shared packet も brand 無しでは DisplayPacketForClient に代入不可（helper 経由を強制）", () => {
    const out = runTravelPlanEngine(engInput());
    // @ts-expect-error 生 packet は brand を持たない（toDisplayPacket 経由のみ）
    const bad: DisplayPacketForClient = out.shared;
    expect(bad.authoritative).toBe(false);
    // helper 経由は OK（型エラーなし）
    const ok: DisplayPacketForClient = toDisplayPacket(out);
    expect(ok.authoritative).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("3. display packet に private/raw が出ない・diagnostics 非搭載", () => {
  it("confirmationQueue に private visibility が出ない（reserve+private 制約でも shared のみ）", () => {
    // private 制約は readiness で private confirmation を生むが shared/display では除去される
    const out = runTravelPlanEngine(engInput({ policy: { intendedAction: "reserve_or_book_later", involvesPaidBooking: true } }));
    const d = toDisplayPacket(out);
    expect(d.confirmationQueue.every((c) => c.visibility === "shared")).toBe(true);
  });
  it("display packet に diagnostics field が無い（server-only）", () => {
    const out = runTravelPlanEngine(engInput());
    const d = toDisplayPacket(out);
    expect("diagnostics" in d).toBe(false);
  });
  it("display fitSummary に raw FitResult/component が出ない（bounded summary のみ）", () => {
    const out = runTravelPlanEngine(engInput({ fit: [{ candidateId: recId(engInput()), fit: goodFit() }] as ProposalFitInput[] }));
    const d = toDisplayPacket(out);
    for (const s of d.fitSummary ?? []) {
      expect((s as unknown as Record<string, unknown>).components).toBeUndefined();
      expect((s as unknown as Record<string, unknown>).valueFull).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("4. fitSummary advisory・server helper は authoritative 保持", () => {
  it("fitSummary は display packet でも executionAuthority を立てない", () => {
    const out = runTravelPlanEngine(engInput({ fit: [{ candidateId: recId(engInput()), fit: goodFit() }] as ProposalFitInput[] }));
    expect(toDisplayPacket(out).executionAuthority).toBe(false);
  });
  it("toServerAuthoritativePacket は authoritative=true の正本を保持", () => {
    const out = runTravelPlanEngine(engInput());
    const s = toServerAuthoritativePacket(out);
    expect(s.authoritative).toBe(true);
    expect(s).toEqual(out.authoritative);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("5. assertion fail-closed", () => {
  it("assertDisplayPacketHasNoAuthority: authoritative packet で throw・display で通過", () => {
    const out = runTravelPlanEngine(engInput());
    expect(() => assertDisplayPacketHasNoAuthority(out.authoritative)).toThrow();
    expect(() => assertDisplayPacketHasNoAuthority(out.shared)).not.toThrow();
  });
  it("assertNoAuthoritativePacketForClient: authoritative で throw・display 通過", () => {
    const out = runTravelPlanEngine(engInput());
    expect(() => assertNoAuthoritativePacketForClient(out.authoritative)).toThrow();
    expect(() => assertNoAuthoritativePacketForClient(toDisplayPacket(out))).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("6. import 純度（app/UI/fetch/API/DB なし）", () => {
  it("engine-consume(-types) は next/supabase/fetch/UI/app を import しない", () => {
    for (const f of ["lib/shared/travel/engine-consume.ts", "lib/shared/travel/engine-consume-types.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/Date\.now|Math\.random/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|fit-core)/);
    }
  });
});
