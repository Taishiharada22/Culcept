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
  // client / page 共通の internal surface 型（どちらも import 不可）
  const INTERNAL = ["SurfaceProjectionInternalBundleV0", "BoundSurfaceV0", "DeliveryDecisionV0", "SurfaceClaimSetV0", "ClarificationQuestionSetV0", "JudgmentSurfacePlanV0", "RealityGraphSnapshotV0"];
  it("client は internal surface 型 + raw ExternalAnchor を import しない", () => {
    for (const bad of [...INTERNAL, "ExternalAnchor"]) expect(CLIENT.includes(bad)).toBe(false);
  });
  it("page は internal surface 型を client へ渡さない（repo の ExternalAnchor 取得は server 限定で許容）", () => {
    for (const bad of INTERNAL) expect(PAGE.includes(bad)).toBe(false);
  });
});

describe("RD1a page #5 real-data read は flag + auth の後（disabled path で chain 非実行）", () => {
  it("await buildOperatorDayRealPayload は flag check / auth.getUser の後に呼ばれる", () => {
    const flagIdx = PAGE.indexOf("PLAN_FLAGS.realitySurfacePreview");
    const authIdx = PAGE.indexOf("auth.getUser");
    const realCallIdx = PAGE.indexOf("await buildOperatorDayRealPayload"); // 呼び出し（import でなく）
    expect(realCallIdx).toBeGreaterThan(flagIdx); // flag OFF なら real read に到達しない
    expect(realCallIdx).toBeGreaterThan(authIdx); // 非 operator なら real read に到達しない
  });
  it("page が real payload を leak guard で double-guard する", () => {
    expect(PAGE.includes("realDayPayloadLeakViolations")).toBe(true);
  });
  it("real read は listAnchors 注入のみ（owner-RLS・write メソッド呼び出しなし）", () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.includes("listAnchors")).toBe(true);
    for (const bad of ["createSourceWithAnchors", "deleteSource", "updateAnchor", ".insert(", ".upsert("]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});

describe("RD1a client #6 real section が fixture と明確に分離・fallback なし", () => {
  it("client に real section（あなたの当日）+ recurring 当日/除外/不正 count + fixture 区別が両方ある", () => {
    expect(CLIENT.includes("real-day-section")).toBe(true);
    expect(CLIENT.includes("あなたの当日")).toBe(true);
    expect(CLIENT.includes("recurring 当日")).toBe(true); // RD1b: 当日 occur recurring count
    expect(CLIENT.includes("不正")).toBe(true); // recurringInvalidCount
    expect(CLIENT.includes("代表シナリオ")).toBe(true); // fixture 区別
    // unavailable は reasonCode 表示（fixture を出さない＝fallback しない）
    expect(CLIENT.includes("real-day-unavailable")).toBe(true);
  });
});
