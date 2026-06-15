/**
 * RD3b-P1 — operator real-data supply readiness summary（pure・read-only・safe DTO）（2026-06-15）
 * 正本設計: docs/reality-mobility-supply-activation-rd3-0.md / CEO RD3b-P1 実装 GO
 *
 * 核: operator real-data preview に readiness 集計（safe count + safe generic blocker code のみ）を出す。
 *   v0 は provider 未注入ゆえ routeEtaCapability/durationValue/supply/computedPresent 系は常に 0。raw anchor 非露出。
 *   real-data unavailable 時に fixture へ fallback しない。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import {
  buildOperatorDayRealPayload,
  realDayPayloadLeakViolations,
  type OperatorDayPreviewDeps,
} from "@/lib/plan/realityCore/operatorDayPreview";
import { buildOperatorRealityReadiness, OPERATOR_REALITY_READINESS_INITIAL } from "@/lib/plan/realityCore/operatorRealityReadiness";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00
const SUBJ = makeRealityInstantJst(REF).subjectiveDate; // "2026-06-12"
const OP = "op-user-1";

function oneOff(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", userId: OP, sourceId: "src-real", title: "予定", date: SUBJ, rigidity: "soft", endTime: undefined, confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const depsOf = (anchors: ExternalAnchor[]): OperatorDayPreviewDeps => ({ listAnchors: async () => anchors });

// 漏らされたら困る raw 値（タイトル/場所文字列/id/companions/exact ISO）を anchor に明示注入。
const RAW_TITLE = "極秘プロジェクトA × 渋谷支店ミーティング";
const RAW_PLACE_1 = "東京都渋谷区道玄坂1-2-3";
const RAW_PLACE_2 = "東京都新宿区西新宿2-8-1";
const RAW_SOURCE_ID = "src-google-123abc";
const RAW_EXTERNAL_UID = "extuid-xyz-7890";
const RAW_COMPANIONS = ["田中部長", "佐藤次郎"];
const RAW_EXACT_ISO = "2026-06-12T13:42:00+09:00";

const ANCHORS_TWO_WITH_LOC: ExternalAnchor[] = [
  oneOff({ id: "a1", startTime: "10:00", endTime: "11:00", title: RAW_TITLE, locationText: RAW_PLACE_1, sourceId: RAW_SOURCE_ID, externalUid: RAW_EXTERNAL_UID, companions: RAW_COMPANIONS }),
  oneOff({ id: "a2", startTime: "14:00", endTime: "15:00", title: "別の予定", locationText: RAW_PLACE_2 }),
];
const ANCHORS_ONE_NO_LOC: ExternalAnchor[] = [
  oneOff({ id: "a1", startTime: "10:00", endTime: "11:00", title: "場所なし予定" /* locationText undefined */ }),
];

describe("RD3b-P1 #1 operator real-data payload に readiness summary が出る", () => {
  it("available payload に readiness が含まれる（schema-state のみ・raw 値 非含有）", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    expect(p.available).toBe(true);
    expect(p.readiness).toBeDefined();
    expect(p.readiness.schemaVersion).toBe(0);
    expect(p.readiness.realReadinessChecked).toBe(true);
    expect(p.readiness.anchorCount).toBe(2);
    expect(p.readiness.candidateEventCount).toBe(2);
    expect(p.readiness.placeTextPresentCount).toBe(2);
  });
});

describe("RD3b-P1 #3/#4/#5/#6 provider 未接続ゆえ v0 で常に 0（honest）", () => {
  it("routeEtaCapability/durationValue/supplyComplete/computedPresent は全て 0", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    expect(p.readiness.routeEtaCapabilityReadyCount).toBe(0);
    expect(p.readiness.durationValueReadyCount).toBe(0);
    expect(p.readiness.leaveBySupplyCompleteCount).toBe(0);
    expect(p.readiness.leaveByComputedPresentCount).toBe(0);
    // placeCertainty 常 unknown（v0）→ placeResolutionReadyCount=0
    expect(p.readiness.placeResolutionReadyCount).toBe(0);
  });
});

describe("RD3b-P1 #7 primaryBlockerCodes は safe generic code のみ・root cause を最初に", () => {
  it("provider_not_connected / route_eta_missing / duration_value_missing を必ず含む（依存浅い順）", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    const codes = p.readiness.primaryBlockerCodes;
    const allowed = new Set(["place_unresolved", "origin_unresolved", "route_eta_missing", "duration_value_missing", "arrival_target_missing", "buffer_missing", "capability_value_binding_missing", "provider_not_connected", "not_projection_grade"]);
    for (const c of codes) expect(allowed.has(c)).toBe(true);
    expect(codes[0]).toBe("provider_not_connected"); // root cause first
    expect(codes).toContain("route_eta_missing");
    expect(codes).toContain("duration_value_missing");
    expect(codes).toContain("capability_value_binding_missing");
    expect(codes).toContain("origin_unresolved"); // 2 anchor・第 1 anchor に prev なし
  });
  it("anchor が全て locationText 欠の場合 place_unresolved が立つ", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_ONE_NO_LOC));
    expect(p.readiness.placeTextPresentCount).toBe(0);
    expect(p.readiness.primaryBlockerCodes).toContain("place_unresolved");
  });
});

describe("RD3b-P1 #8-#14 raw anchor を safe DTO に出さない（leak guard 通過）", () => {
  it("raw title / locationText / sourceId / externalUid / companions / exact ISO が payload に出ない", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    const json = JSON.stringify(p);
    expect(json.includes(RAW_TITLE)).toBe(false);
    expect(json.includes(RAW_PLACE_1)).toBe(false);
    expect(json.includes(RAW_PLACE_2)).toBe(false);
    expect(json.includes(RAW_SOURCE_ID)).toBe(false);
    expect(json.includes(RAW_EXTERNAL_UID)).toBe(false);
    for (const c of RAW_COMPANIONS) expect(json.includes(c)).toBe(false);
    expect(json.includes(RAW_EXACT_ISO)).toBe(false);
    // exact ISO instant 一般パターンも出ない
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(json)).toBe(false);
  });
  it("evidenceRefs / sourceRefs / missingInputRefs / leaveByInstant / arrivalTargetInstant / timeContract が出ない", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    // RD3b-P1: schema-state safe key `leaveByComputedPresentCount` は意図的（substring "leavebycomputed" を含むが exact instant でない）
    const json = JSON.stringify(p).toLowerCase().split("leavebycomputedpresentcount").join("");
    for (const t of ["evidencerefs", "sourcerefs", "missinginputrefs", "leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref", "leavebycomputed"]) {
      expect(json.includes(t)).toBe(false);
    }
  });
  it("realDayPayloadLeakViolations が空（既存 raw token 集合）", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf(ANCHORS_TWO_WITH_LOC));
    expect(realDayPayloadLeakViolations(p)).toEqual([]);
  });
});

describe("RD3b-P1 #15 real-data unavailable 時に fixture へ fallback しない", () => {
  it("anchors=[] → available=false / no_anchor / consumerView=null・fixture へ戻らない", async () => {
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, depsOf([]));
    expect(p.available).toBe(false);
    expect(p.reasonCode).toBe("no_anchor");
    expect(p.consumerView).toBeNull();
    expect(p.renderedCopy).toBeNull();
    expect(p.delivery).toBeNull();
    // readiness は出る（zero counts）
    expect(p.readiness.realReadinessChecked).toBe(true);
    expect(p.readiness.candidateEventCount).toBe(0);
    expect(p.readiness.leaveByComputedPresentCount).toBe(0);
  });
  it("listAnchors throw → assemble_failed・INITIAL readiness（未到達=checked:false）", async () => {
    const failDeps: OperatorDayPreviewDeps = { listAnchors: async () => { throw new Error("rls"); } };
    const p = await buildOperatorDayRealPayload({ operatorUserId: OP, referenceInstantUtc: REF }, failDeps);
    expect(p.available).toBe(false);
    expect(p.reasonCode).toBe("assemble_failed");
    expect(p.readiness.realReadinessChecked).toBe(false);
    expect(p.readiness.primaryBlockerCodes).toContain("provider_not_connected");
  });
});

describe("RD3b-P1 #2 fixture（dogfood）には影響しない", () => {
  it("dogfoodPreview の DogfoodScenarioV0 に readiness は出ない（operator のみ）", async () => {
    const { buildDogfoodPreviewScenarios } = await import("@/lib/plan/realityCore/dogfoodPreview");
    const payload = await buildDogfoodPreviewScenarios(REF);
    for (const s of payload.scenarios) {
      expect((s as unknown as Record<string, unknown>).readiness).toBeUndefined();
    }
  });
});

describe("RD3b-P1 #16/#17 DB write/notification なし（pure・readonly）", () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const readSrc = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
  it("operatorRealityReadiness.ts は IO / external / notification を持たない", () => {
    const code = readSrc("lib/plan/realityCore/operatorRealityReadiness.ts");
    for (const bad of ["fetch(", "supabase", "localStorage", "geolocation", "currentLocation", "Date.now", "Math.random", "new Date(", "notification", "push", ".insert(", ".update(", ".delete("]) {
      expect(code.toLowerCase().includes(bad.toLowerCase())).toBe(false);
    }
  });
});

describe("RD3b-P1 #18/#19 MovementReality / Feasibility / Risk / Permission 出力 不変", () => {
  it("operatorRealityReadiness.ts は MovementReality / Feasibility / CollapseRisk / Permission を import しない", () => {
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const code = stripComments(readFileSync(join(process.cwd(), "lib/plan/realityCore/operatorRealityReadiness.ts"), "utf8"));
    for (const t of ["movementReality", "feasibilityJudgment", "collapseRisk", "interventionEligibility", "interventionDecision", "deliveryGate", "leaveByGraphBinding", "movementLeaveByReconcile"]) {
      expect(code.includes(t)).toBe(false);
    }
  });
});

describe("RD3b-P1 buildOperatorRealityReadiness pure helper の unit 性質", () => {
  it("空 dayAnchors → candidate 0・place 0・origin 0・全 blocker code を含む", () => {
    const r = buildOperatorRealityReadiness({ allAnchorCount: 0, dayAnchors: [] });
    expect(r.realReadinessChecked).toBe(true);
    expect(r.candidateEventCount).toBe(0);
    expect(r.placeTextPresentCount).toBe(0);
    expect(r.originCandidateCount).toBe(0);
    expect(r.primaryBlockerCodes).toContain("provider_not_connected");
  });
  it("2 anchor・全 locationText 有 → place 全充足・origin は 1（後発のみ）", () => {
    const r = buildOperatorRealityReadiness({ allAnchorCount: 2, dayAnchors: ANCHORS_TWO_WITH_LOC });
    expect(r.placeTextPresentCount).toBe(2);
    expect(r.originCandidateCount).toBe(1); // a2 has earlier sibling a1
    expect(r.primaryBlockerCodes).not.toContain("place_unresolved");
    expect(r.primaryBlockerCodes).toContain("origin_unresolved"); // a1 is first
  });
  it("OPERATOR_REALITY_READINESS_INITIAL は全 0・unchecked・provider_not_connected", () => {
    expect(OPERATOR_REALITY_READINESS_INITIAL.realReadinessChecked).toBe(false);
    expect(OPERATOR_REALITY_READINESS_INITIAL.candidateEventCount).toBe(0);
    expect(OPERATOR_REALITY_READINESS_INITIAL.primaryBlockerCodes).toEqual(["provider_not_connected"]);
  });
});
