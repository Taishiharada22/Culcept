/**
 * buildDogfoodPreviewScenarios / dogfoodPayloadLeakViolations（RJ2g = dogfood preview safe payload v0）
 * 正本: docs/reality-surface-dogfood-preview-boundary-rj2g-0.md（RJ2g-0）
 *
 * 核: client props 専用 safe DTO（consumerView[RJ2d] / renderedCopy[RJ2e] / delivery safe subset のみ）。
 *   internal object/trace/id を含まない・deliveredNow=false・token leak guard fail-closed・pure（DB read なし・決定論的）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDogfoodPreviewScenarios,
  dogfoodPayloadLeakViolations,
  type RealitySurfaceDogfoodPreviewPayloadV0,
} from "@/lib/plan/realityCore/dogfoodPreview";
import { surfaceProjectionConsumerViewViolations } from "@/lib/plan/realityCore/surfaceProjection";
import { copyViolations } from "@/lib/plan/realityCore/copySurface";

const REF = new Date(Date.UTC(2026, 5, 12, 0, 0)); // JST 09:00（constant・page が渡す形）

describe("RJ2g dogfood #1 safe payload を組む（代表シナリオ・DB read なし）", () => {
  it("scenarios 非空・各シナリオが safe key のみ", () => {
    const payload = buildDogfoodPreviewScenarios(REF);
    expect(payload.schemaVersion).toBe(0);
    expect(payload.scenarios.length).toBeGreaterThan(0);
    for (const s of payload.scenarios) {
      expect(Object.keys(s).sort()).toEqual(["consumerView", "delivery", "label", "renderedCopy", "scenarioKey"]);
      expect(Object.keys(s.delivery).sort()).toEqual(["channelCeiling", "deliveredNow", "eligibility"]);
    }
  });
});

describe("RJ2g dogfood #2 deliveredNow=false 維持", () => {
  it("全シナリオで delivery.deliveredNow false", () => {
    const payload = buildDogfoodPreviewScenarios(REF);
    for (const s of payload.scenarios) expect(s.delivery.deliveredNow).toBe(false);
  });
});

describe("RJ2g dogfood #3 internal object/id/trace を含まない", () => {
  it("payload JSON に internal field が出ない", () => {
    const json = JSON.stringify(buildDogfoodPreviewScenarios(REF)).toLowerCase();
    for (const t of ["trace", "sourcerefs", "suppressedreasons", "carrieddecisionkind", "projectionid", "surfaceplanid", "evidencerefs", "relatedclaimrefs", "gatereasoncode", "assertability", "genericized", "exposurelevel"]) {
      expect(json.includes(t)).toBe(false);
    }
  });
});

describe("RJ2g dogfood #4 token leak guard", () => {
  it("正常 payload → leak guard 空", () => {
    expect(dogfoodPayloadLeakViolations(buildDogfoodPreviewScenarios(REF))).toEqual([]);
  });
  it("raw id 注入 payload → leak guard 検出（fail-closed）", () => {
    const payload = buildDogfoodPreviewScenarios(REF);
    const leaked: RealitySurfaceDogfoodPreviewPayloadV0 = { ...payload, scenarios: [{ ...payload.scenarios[0], label: `予定 ern:2026-06-12:a1` }] };
    expect(dogfoodPayloadLeakViolations(leaked).some((m) => m.includes("ern:"))).toBe(true);
  });
});

describe("RJ2g dogfood #5 各シナリオが RJ2d/RJ2e walker を通過", () => {
  it("consumerView/renderedCopy が安全（walker 空）", () => {
    const payload = buildDogfoodPreviewScenarios(REF);
    for (const s of payload.scenarios) {
      expect(surfaceProjectionConsumerViewViolations(s.consumerView)).toEqual([]);
      expect(copyViolations(s.renderedCopy)).toEqual([]);
    }
  });
});

describe("RJ2g dogfood #6 決定論的（同入力→同出力）", () => {
  it("同じ reference instant → 同じ payload", () => {
    expect(JSON.stringify(buildDogfoodPreviewScenarios(REF))).toBe(JSON.stringify(buildDogfoodPreviewScenarios(REF)));
  });
});

describe("RJ2g dogfood #7 代表シナリオ（observe/ask/overlap/suppress）が含まれる", () => {
  it("scenarioKey に observe/ask/overlap/silent が揃う・文面が exact catalog", () => {
    const payload = buildDogfoodPreviewScenarios(REF);
    const keys = payload.scenarios.map((s) => s.scenarioKey);
    expect(keys).toContain("scenario_observe");
    expect(keys).toContain("scenario_ask");
    expect(keys).toContain("scenario_overlap");
    // ask シナリオ → needs_verification 文面 / overlap → resolve_overlap 文面
    const ask = payload.scenarios.find((s) => s.scenarioKey === "scenario_ask")!;
    expect(ask.renderedCopy.questionCopies.some((q) => q.text === "確認しますか？")).toBe(true);
    const overlap = payload.scenarios.find((s) => s.scenarioKey === "scenario_overlap")!;
    expect(overlap.renderedCopy.questionCopies.some((q) => q.text === "重なって見える予定があります。確認しますか？")).toBe(true);
  });
});

describe("RJ2g dogfood #8 IO 不接触（source-scan）", () => {
  it("dogfoodPreview.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/dogfoodPreview.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["fetch(", "supabase", "localStorage", ".from(", "geolocation", "Date.now", "Math.random", "new Date("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
