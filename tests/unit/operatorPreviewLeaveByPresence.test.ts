/**
 * RD3x-P2 — operator real-data preview の **safe boolean**（`leaveByComputedPresent`）: real anchor + real duration_confirmation
 *   から consume loop（RD3x-P1）を走らせ、computed leaveBy が attach されたかだけを boolean で出す。exact instant / 内部 ref /
 *   durationValue / capability / supply bundle / trace / reason は出さない。
 * 正本設計: docs/reality-operator-seed-activation-plan-rd3x-0.md（RD3x-P2）
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  deriveOperatorPreviewLeaveByComputedPresent,
  type OperatorPreviewLeaveByPresenceInputV0,
} from "@/lib/plan/realityCore/operatorPreviewLeaveByPresence";
import {
  realDayPayloadLeakViolations,
  type RealDaySurfacePayloadV0,
  type OperatorDayPreviewDeps,
} from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import type { DurationConfirmationRowV0 } from "@/lib/plan/realityCore/durationConfirmation";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const SUBJ = "2026-06-12";
const INSTANT = makeRealityInstantJst(REF);
const EVAL = `${INSTANT.calendarDate}T${INSTANT.wallClockHHMM}:00+09:00`; // "2026-06-12T09:00:00+09:00"
const OP = "op-user-1";
const ERN = (id: string) => `ern:${SUBJ}:${id}`;

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OP, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}

/** 当日 target（user_explicit start・14:00）+ 同日 earlier sibling（09:00-10:00 endTime あり） */
const TARGET = oneOff({ id: "tgt", startTime: "14:00", endTime: "15:00", startTimeSource: "user_explicit" });
const PREV = oneOff({ id: "prv", startTime: "09:00", endTime: "10:00", startTimeSource: "user_explicit", locationText: "渋谷" });

function row(over: Partial<DurationConfirmationRowV0> = {}, scopeOver: Partial<DurationConfirmationRowV0["scope"]> = {}): DurationConfirmationRowV0 {
  return {
    id: "dc-1", userId: OP, sourceAnchorRef: null,
    scope: { targetNodeId: ERN("tgt"), originRef: "opaque-o", destinationRef: "opaque-d", transportMode: "transit", timeBand: null, subjectiveDate: SUBJ, temporalScopeRef: "tsr-1", routeEtaSupplyId: null, providerVersion: "v1", ...scopeOver },
    durationUpperBoundMinutes: 20, durationLowerBoundMinutes: null, durationBasis: "user_confirmed",
    governance: { provenanceKind: "operator_seed", actorType: "operator", environment: "staging", learningEligible: false, productionEligible: false, confirmedBy: OP, confirmedAt: "2026-06-12T08:00:00+09:00", createdBySlice: "RD3x-P2", sourceRefs: ["opaque-src"], evidenceRefs: ["opaque-ev"] },
    freshnessStatus: "fresh", validUntil: null, supersededBy: null, revokedAt: null, ...over,
  };
}

const baseInput = (rows: DurationConfirmationRowV0[], dayAnchors: ExternalAnchor[]): OperatorPreviewLeaveByPresenceInputV0 => ({
  dayAnchors, durationConfirmationRows: rows, subjectiveDate: SUBJ, evaluatedAtIso: EVAL, consumingInstant: INSTANT, nowIso: EVAL,
});

describe("RD3x-P2 #1/#2 helper — computed 有無 → boolean", () => {
  it("#1 real anchor + matching confirmation → computed leaveBy attach → present=true", async () => {
    const present = await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row()], [PREV, TARGET]));
    expect(present).toBe(true);
  });
  it("#1b 実 DB format（HH:MM:SS）の anchor でも computed → present=true（format bug 回帰固定）", async () => {
    // 実 Postgres `time` 型は "14:00:00" を返す。手書き fixture と等価に正規化されること（壁 B 修正）。
    const targetSec = oneOff({ id: "tgt", startTime: "14:00:00", endTime: "15:00:00", startTimeSource: "user_explicit" });
    const prevSec = oneOff({ id: "prv", startTime: "09:00:00", endTime: "10:00:00", startTimeSource: "user_explicit", locationText: "渋谷" });
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row()], [prevSec, targetSec]))).toBe(true);
  });
  it("#1c 非時刻 startTime（ISO/空/不正）→ materialize しない → false（fail-closed 維持）", async () => {
    const targetIso = oneOff({ id: "tgt", startTime: "2026-06-12T14:00:00+09:00", endTime: "15:00", startTimeSource: "user_explicit" });
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row()], [PREV, targetIso]))).toBe(false);
  });
  it("#2 confirmation row なし → false（fixture へ fallback しない）", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([], [PREV, TARGET]))).toBe(false);
  });
  it("row が当日 event を指さない（scope targetNodeId 不一致）→ false", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({}, { targetNodeId: ERN("no-such") })], [PREV, TARGET]))).toBe(false);
  });
  it("earlier sibling 不在（origin 派生不能）→ supply incomplete → false", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row()], [TARGET]))).toBe(false);
  });
  it("stale / revoked / superseded row → false", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({ freshnessStatus: "stale" })], [PREV, TARGET]))).toBe(false);
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({ revokedAt: "2026-06-12T08:30:00+09:00" })], [PREV, TARGET]))).toBe(false);
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({ supersededBy: "dc-2" })], [PREV, TARGET]))).toBe(false);
  });
  it("別 subjectiveDate の row → skip → false", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({}, { subjectiveDate: "2026-06-13" })], [PREV, TARGET]))).toBe(false);
  });
  it("transportMode mismatch（row=transit・request も transit だが anchor 無関係 mode は scope 由来）→ malformed upper → false", async () => {
    expect(await deriveOperatorPreviewLeaveByComputedPresent(baseInput([row({ durationUpperBoundMinutes: 23 })], [PREV, TARGET]))).toBe(false);
  });
});

describe("RD3x-P2 #3-#10/#20 leak guard — safe boolean は通す・内部 object は検出", () => {
  const READINESS = {
    schemaVersion: 0 as const, realReadinessChecked: true, anchorCount: 2, candidateEventCount: 2, placeTextPresentCount: 0,
    placeResolutionReadyCount: 0, originCandidateCount: 1, routeEtaCapabilityReadyCount: 0, durationValueReadyCount: 0,
    leaveBySupplyCompleteCount: 0, leaveByComputedPresentCount: 1, primaryBlockerCodes: ["provider_not_connected" as const],
  };
  const safePayload = (present: boolean): RealDaySurfacePayloadV0 => ({
    schemaVersion: 0, mode: "real", available: true, reasonCode: null,
    summary: { oneOffIncludedCount: 1, recurringIncludedCount: 0, recurringExcludedCount: 0, recurringInvalidCount: 0 },
    consumerView: { rows: [] } as unknown as RealDaySurfacePayloadV0["consumerView"],
    renderedCopy: { items: [] } as unknown as RealDaySurfacePayloadV0["renderedCopy"],
    delivery: { eligibility: "deliver", channelCeiling: "in_app", deliveredNow: false } as unknown as RealDaySurfacePayloadV0["delivery"],
    readiness: READINESS, leaveByComputedPresent: present, departureLineCandidatePresent: present,
  });

  it("#3/#4/#5 safe payload（leaveByComputedPresent=true・readiness count 付）→ leak violation 0", () => {
    expect(realDayPayloadLeakViolations(safePayload(true))).toEqual([]);
    expect(realDayPayloadLeakViolations(safePayload(false))).toEqual([]);
  });
  it("#6/#7/#8 内部 leaveByComputed object（leaveByInstant/timeContract/*Ref）が漏れたら検出", () => {
    const leaked = safePayload(true);
    const bad = { ...leaked, renderedCopy: { leaveByComputed: { leaveByInstant: "2026-06-12T13:25:00+09:00", timeContract: { arrivalTargetInstant: "2026-06-12T14:00:00+09:00" }, sourceTimeEstimateRef: "x", bufferRef: "b" } } as unknown as RealDaySurfacePayloadV0["renderedCopy"] };
    const v = realDayPayloadLeakViolations(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((m) => m.includes("leavebyinstant"))).toBe(true);
    expect(v.some((m) => m.includes("timecontract"))).toBe(true);
  });
  it("#9 内部 durationValue object（durationUpperBound/usableForLeaveByComputation）が漏れたら検出", () => {
    const bad = { ...safePayload(true), consumerView: { durationValue: { durationUpperBoundMinutes: 20, usableForLeaveByComputation: true } } as unknown as RealDaySurfacePayloadV0["consumerView"] };
    const v = realDayPayloadLeakViolations(bad);
    expect(v.some((m) => m.includes("durationupperbound"))).toBe(true);
    expect(v.some((m) => m.includes("usableforleavebycomputation"))).toBe(true);
  });
  it("#10 内部 supply bundle（originTemporalValidity）/ capability（arrivalProjectionKnown）が漏れたら検出", () => {
    const bad = { ...safePayload(true), delivery: { originTemporalValidity: { validity: "valid" }, arrivalProjectionKnown: true } as unknown as RealDaySurfacePayloadV0["delivery"] };
    const v = realDayPayloadLeakViolations(bad);
    expect(v.some((m) => m.includes("origintemporalvalidity"))).toBe(true);
    expect(v.some((m) => m.includes("arrivalprojectionknown"))).toBe(true);
  });
  it("#20 exact ISO instant / departure-line 内部文字列が safe payload に無い（safe boolean key は除外）", () => {
    // RD3g-P1: `departureLineCandidatePresent` は意図的 safe boolean key → strip してから "departure" 内部 leak を検査。
    const json = JSON.stringify(safePayload(true)).toLowerCase().split("departurelinecandidatepresent").join("");
    expect(json.includes("t13:25")).toBe(false);
    expect(json.includes("departure")).toBe(false);
    expect(json.includes("notification")).toBe(false);
  });
});

describe("RD3x-P2 #11-#19 source-scan — 不変/未接続境界", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const code = strip(fs.readFileSync(path.join(process.cwd(), "lib/plan/realityCore/operatorPreviewLeaveByPresence.ts"), "utf8"));
  it("#11-#16 helper は MovementReality/Feasibility/CollapseRisk/Intervention/Permission/Surface を import しない", () => {
    for (const t of ["movementReality", "leaveByKnown", "routeKnown", "etaKnown", "feasibilityJudgment", "collapseRisk", "interventionEligibility", "interventionDecision", "deliveryGate", "surfaceProjection", "copySurface", "permissionLevel"]) {
      expect(code.includes(t)).toBe(false);
    }
  });
  it("#17/#18/#19 notification / product /plan / Alter / API / DB を持たない", () => {
    // RD3g-P1: 本 file は L2 departure line presence helper（deriveOperatorPreviewDepartureLinePresence）を**正当に**含むため
    //   "departure" 文字列の不在は要求しない。但し notification/product/外部 IO/DB の非接続は不変。
    const low = code.toLowerCase();
    for (const t of ["notification", "/plan/page", "alttab", "next/server", "react", ".from(", "supabase", "createclient", "fetch(", "new date(", "date.now", "localstorage"]) {
      expect(low.includes(t)).toBe(false);
    }
  });
  it("helper は boolean だけを返す（leaveByComputed 内部 object を返り値型に持たない）", () => {
    // 返り値は Promise<boolean>。internal object を露出しない（型注釈で担保・source に Promise<boolean> 明記）。
    expect(code.includes("Promise<boolean>")).toBe(true);
  });
});

describe("RD3x-P2 #1/#2 integration — flag-gated buildOperatorDayRealPayload で safe boolean", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("flag ON + listDurationConfirmations 注入 → available payload に leaveByComputedPresent=true", async () => {
    vi.stubEnv("REALITY_OPERATOR_PREVIEW_LEAVEBY", "true");
    vi.resetModules();
    const mod = await import("@/lib/plan/realityCore/operatorDayPreview");
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async () => [PREV, TARGET],
      listDurationConfirmations: async () => [row()],
    };
    const p = await mod.buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, deps);
    expect(p.available).toBe(true);
    expect(p.leaveByComputedPresent).toBe(true);
    expect(mod.realDayPayloadLeakViolations(p)).toEqual([]); // safe DTO・exact instant 非露出
  });
  it("flag OFF（デフォルト）→ listDurationConfirmations を読まず leaveByComputedPresent=false", async () => {
    vi.stubEnv("REALITY_OPERATOR_PREVIEW_LEAVEBY", "false");
    vi.resetModules();
    const mod = await import("@/lib/plan/realityCore/operatorDayPreview");
    let read = false;
    const deps: OperatorDayPreviewDeps = {
      listAnchors: async () => [PREV, TARGET],
      listDurationConfirmations: async () => { read = true; return [row()]; },
    };
    const p = await mod.buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, deps);
    expect(p.available).toBe(true);
    expect(p.leaveByComputedPresent).toBe(false);
    expect(read).toBe(false); // flag OFF は consume を走らせない（read もしない）
  });
});
