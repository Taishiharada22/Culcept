/**
 * RD3a-P1 — dogfood synthetic non-empty supply + leaveByComputedPresent safe boolean（2026-06-15）
 * 正本設計: docs/reality-mobility-supply-activation-rd3-0.md / CEO RD3a-P1 実装 GO
 *
 * 核: dogfood fixture preview で決定論的 synthetic provider を使い、RouteEtaCapability → DurationValue →
 *   RD2e-SUPPLY → computeLeaveBy → assembleLeaveByBindings まで **non-empty で通す**。consumer-safe DTO には
 *   exact timestamp を出さず `leaveByComputedPresent`（schema-state boolean）だけを出す。
 *   = P1/P2「empty で no-op」の graduation「non-empty でも computed が consumer に漏れない」を実負荷で証明。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDogfoodSyntheticSupplyCandidate } from "@/lib/plan/realityCore/dogfoodSyntheticSupply";
import { dogfoodPayloadLeakViolations } from "@/lib/plan/realityCore/dogfoodPreview";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00

async function buildWithFlag(on: boolean) {
  vi.resetModules();
  vi.stubEnv("REALITY_LEAVEBY_ENRICH_PREVIEW", on ? "true" : "");
  const mod = await import("@/lib/plan/realityCore/dogfoodPreview");
  return mod.buildDogfoodPreviewScenarios(REF);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const readSrc = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));

describe("RD3a-P1 #3-#8 synthetic provider が full chain を通し computed leaveBy を生成・attach", () => {
  it("buildDogfoodSyntheticSupplyCandidate が computed leaveBy 候補を返す（capability usable→durationValue→supply complete→computed）", async () => {
    const r = await buildDogfoodSyntheticSupplyCandidate({
      eventRealityNodeId: "ern:2026-06-12:a1",
      subjectiveDate: "2026-06-12",
      arrivalHHMM: "14:00",
      evaluatedAtIso: "2026-06-12T09:00:00+09:00",
    });
    expect(r).not.toBeNull();
    expect(r!.candidate.leaveBy.status).toBe("computed");
    expect(r!.candidate.eventRealityNodeId).toBe("ern:2026-06-12:a1");
    expect(r!.scope.targetNodeId).toBe("ern:2026-06-12:a1");
  });
  it("flag ON → dogfood scenario に leaveByComputedPresent=true（ERN へ attach 成功）", async () => {
    const on = await buildWithFlag(true);
    expect(on.scenarios.length).toBeGreaterThan(0);
    expect(on.scenarios.every((s) => s.leaveByComputedPresent === true)).toBe(true);
  });
});

describe("RD3a-P1 #1/#2 flag OFF → full chain 未実行・payload 完全不変", () => {
  it("OFF → leaveByComputedPresent 全 false・leak violation ゼロ", async () => {
    const off = await buildWithFlag(false);
    expect(off.scenarios.every((s) => s.leaveByComputedPresent === false)).toBe(true);
    expect(dogfoodPayloadLeakViolations(off)).toEqual([]);
  });
});

describe("RD3a-P1 #9-#13 consumer payload に exact timestamp / 内部 object を出さない", () => {
  it("ON payload に leaveByInstant/arrivalTargetInstant/timeContract/*Ref/durationValue/capability/originValidity/ISO が出ない", async () => {
    const on = await buildWithFlag(true);
    const json = JSON.stringify(on).toLowerCase();
    for (const t of [
      "leavebyinstant", "arrivaltargetinstant", "timecontract", "sourcetimeestimateref", "bufferref",
      "durationvalue", "capability", "origintemporalvalidity", "durationupperbound", "leavebycomputed\":{",
    ]) {
      expect(json.includes(t)).toBe(false);
    }
    // exact ISO instant（YYYY-MM-DDTHH:MM）が出ない
    expect(/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/.test(json)).toBe(false);
  });
  it("ON payload の leaveBy 表現は leaveByComputedPresent: true のみ（leak guard 空）", async () => {
    const on = await buildWithFlag(true);
    expect(dogfoodPayloadLeakViolations(on)).toEqual([]);
    for (const s of on.scenarios) {
      expect(typeof s.leaveByComputedPresent).toBe("boolean");
      // scenario の key 集合に exact-instant 系 field が無い
      expect(Object.keys(s).sort()).toEqual(["consumerView", "delivery", "label", "leaveByComputedPresent", "renderedCopy", "scenarioKey"]);
    }
  });
});

describe("RD3a-P1 #14-#20 safe surface 不変・departure unavailable 継続", () => {
  const safeSurface = (p: { scenarios: ReadonlyArray<{ scenarioKey: unknown; label: unknown; consumerView: unknown; renderedCopy: unknown; delivery: unknown }> }) =>
    p.scenarios.map((s) => ({ scenarioKey: s.scenarioKey, label: s.label, consumerView: s.consumerView, renderedCopy: s.renderedCopy, delivery: s.delivery }));
  it("Feasibility/Risk/Permission/Delivery 出力（consumer surface）は OFF===ON で byte 同一", async () => {
    const off = await buildWithFlag(false);
    const on = await buildWithFlag(true);
    expect(JSON.stringify(safeSurface(on))).toBe(JSON.stringify(safeSurface(off)));
  });
  it("departureAvailable=false・proposalAvailable=false・deliveredNow=false 継続", async () => {
    const on = await buildWithFlag(true);
    for (const s of on.scenarios) {
      expect(s.consumerView.departureAvailable).toBe(false);
      expect(s.consumerView.proposalAvailable).toBe(false);
      expect(s.delivery.deliveredNow).toBe(false);
    }
  });
});

describe("RD3a-P1 #24 token leak guard が synthetic computed object 漏洩を検出（boolean は誤検出しない）", () => {
  it("leaveByComputed object を含む payload → guard 検出", () => {
    const leaked = { schemaVersion: 0, scenarios: [{ scenarioKey: "x", label: "x", consumerView: {}, renderedCopy: {}, delivery: {}, leaked: { leaveByComputed: { leaveByInstant: "2026-06-12T13:40:00+09:00", timeContract: {}, sourceTimeEstimateRef: "r", bufferRef: "b" } } }] };
    const out = dogfoodPayloadLeakViolations(leaked as never);
    expect(out.length).toBeGreaterThan(0);
  });
  it("leaveByComputedPresent: true だけの payload → guard 誤検出しない", () => {
    const safe = { schemaVersion: 0, scenarios: [{ scenarioKey: "x", label: "x", consumerView: {}, renderedCopy: {}, delivery: {}, leaveByComputedPresent: true }] };
    expect(dogfoodPayloadLeakViolations(safe as never)).toEqual([]);
  });
});

describe("RD3a-P1 #22/#23 operator real-data path / product / Alter 未接続・synthetic 安全制約", () => {
  it("dogfoodSyntheticSupply.ts は external/coordinate/currentLocation/IO を持たない（source-scan）", () => {
    const code = readSrc("lib/plan/realityCore/dogfoodSyntheticSupply.ts");
    for (const bad of ["fetch(", "supabase", "localStorage", "geolocation", "currentlocation", "latitude", "longitude", "polyline", "new Date(", "Date.now", "Math.random", "http"]) {
      expect(code.toLowerCase().includes(bad.toLowerCase())).toBe(false);
    }
    // synthetic を明示・route shape を持たない
    expect(code.includes("routeShapePresent: false")).toBe(true);
    expect(code.includes("dogfood-synthetic")).toBe(true);
  });
  it("operatorDayPreview.ts は dogfoodSyntheticSupply を import しない（real-data path 未接続）", () => {
    expect(readSrc("lib/plan/realityCore/operatorDayPreview.ts").includes("dogfoodSyntheticSupply")).toBe(false);
  });
  it("product /plan / Alter tab は dogfoodSyntheticSupply/dogfoodPreview を参照しない", () => {
    for (const rel of ["app/(culcept)/plan/page.tsx", "app/(culcept)/plan/tabs/AlterTab.tsx", "app/(culcept)/plan/tabs/buildAlterScreen.ts"]) {
      const code = readSrc(rel);
      expect(code.includes("dogfoodSyntheticSupply")).toBe(false);
      expect(code.includes("dogfoodPreview")).toBe(false);
    }
  });
});
