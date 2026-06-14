/**
 * /plan/dev-reality-surface page + client の構造安全 source-scan（RJ2g）
 * 正本: docs/reality-surface-dogfood-preview-boundary-rj2g-0.md
 *
 * gated server component は full render が supabase/cookies を要するため、**ガード構成 + read-only + safe-payload-only +
 *   no-action を source-scan で検証**（logic は dogfoodPreview.test.ts でカバー）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-reality-surface/page.tsx"), "utf8");
const CLIENT = readFileSync(join(process.cwd(), "app/(culcept)/plan/dev-reality-surface/RealitySurfaceDogfoodClient.tsx"), "utf8");

describe("RJ2g page #1 三重ガード + flag + operator auth が揃う", () => {
  it("host gate / flag / auth / notFound / Disabled / leak guard を持つ", () => {
    expect(PAGE.includes("isCandidateActionsPreviewHostAllowed")).toBe(true); // host 三重ガード
    expect(PAGE.includes("PLAN_FLAGS.realitySurfacePreview")).toBe(true); // flag(server default OFF)
    expect(PAGE.includes("supabaseServer")).toBe(true); // operator auth
    expect(PAGE.includes("auth.getUser")).toBe(true);
    expect(PAGE.includes("notFound()")).toBe(true); // production hard block
    expect(PAGE.includes("dogfoodPayloadLeakViolations")).toBe(true); // token leak guard fail-closed
    expect(PAGE.includes("RealitySurfaceDogfoodClient")).toBe(true);
  });
});

describe("RJ2g page #2 read-only / no-write / no-notification / service_role 不使用（source-scan）", () => {
  it("page に DB write / service_role / notification / push / localStorage / fetch / deliveredNow:true が無い", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["service_role", ".insert(", ".update(", ".delete(", ".upsert(", "localStorage", "fetch(", "notification", "push(", "deliveredNow: true", "deliveredNow:true"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2g client #3 表示専用（derive 関数を import しない・no-action）", () => {
  it("client は型のみ import・onClick/onSubmit/fetch/supabase/localStorage/derive なし", () => {
    expect(CLIENT.includes('import type { RealitySurfaceDogfoodPreviewPayloadV0 }')).toBe(true); // 型のみ
    const code = CLIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["onClick", "onSubmit", "fetch(", "supabase", "localStorage", "deriveSurface", "evaluateDelivery", "renderCopy", "evaluateInterventionDecision", ".insert(", ".update("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RJ2g client #4 内部 object を props 型に持たない（safe payload のみ）", () => {
  it("client は SurfaceProjectionInternalBundle / BoundSurface / DeliveryDecisionV0 / SurfaceClaimSet を import しない", () => {
    for (const bad of ["SurfaceProjectionInternalBundleV0", "BoundSurfaceV0", "DeliveryDecisionV0", "SurfaceClaimSetV0", "ClarificationQuestionSetV0", "JudgmentSurfacePlanV0"]) {
      expect(CLIENT.includes(bad)).toBe(false);
      expect(PAGE.includes(bad)).toBe(false); // page も client へ internal を渡さない
    }
  });
});
