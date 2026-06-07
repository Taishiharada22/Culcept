/**
 * A1-6-9 §9.15 Candidate Action E2E Preview — 静的配線/安全性検証（"use server" は import 不可ゆえ source 静的確認）。
 *   real route / real DB の挙動は controlled staging E2E smoke（Playwright・untracked）で検証。本 test は guard/RLS/redaction の構造固定。
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const E2E_DIR = "app/(culcept)/plan/dev-candidate-actions-e2e";
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), E2E_DIR, f), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("A1-6-9 §9.15 server actions — 三重ガード + auth + user-RLS + no service_role", () => {
  const CODE = strip(read("actions.ts"));
  it("'use server' で各 action が previewAllowed()（三重ガード）を適用", () => {
    expect(CODE).toContain('"use server"');
    expect((CODE.match(/previewAllowed\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it("auth.getUser() の user.id を使う（client から userId を受け取らない）", () => {
    expect(CODE).toContain("auth.getUser()");
    expect(CODE).toContain("user.id");
  });
  it("sentinel desired_date で isolation（cleanup は sentinel のみ delete）", () => {
    expect(CODE).toContain("SENTINEL_DATE");
    expect(CODE).toContain(".delete()");
    expect(CODE).toContain("desired_date");
  });
  it("service_role / createClient を使わない（user-RLS・supabaseServer）", () => {
    expect(CODE).not.toContain("service_role");
    expect(CODE).not.toContain("createClient");
    expect(CODE).not.toContain("SERVICE_ROLE");
    expect(CODE).toContain("supabaseServer");
  });
  it("un-gated surface（gateAllow=true）+ reflected plan（A1-6-7 merge）", () => {
    expect(CODE).toContain("buildCaptureSurfaceFromProjected");
    expect(CODE).toContain("reflectConsumedSeedsIntoMorningPlan");
  });
  it("返り値に seedRef / source_ref / raw を出さない（plan item は opaque handle id のみ）", () => {
    expect(CODE).toContain("E2ESafePlanItem");
    expect(CODE).not.toContain("seedRef");
    expect(CODE).not.toContain("source_ref");
  });
});

describe("A1-6-9 §9.15 page guard（page.tsx）", () => {
  const CODE = strip(read("page.tsx"));
  it("三重ガード（isCandidateActionsPreviewHostAllowed）+ notFound", () => {
    expect(CODE).toContain("isCandidateActionsPreviewHostAllowed");
    expect(CODE).toContain("notFound()");
  });
  it("REALITY_CANDIDATE_ACTIONS_DEV_HOST + supabase URL を guard に渡す", () => {
    expect(CODE).toContain("REALITY_CANDIDATE_ACTIONS_DEV_HOST");
    expect(CODE).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("A1-6-9 §9.15 E2E client — real route POST + 実 DB re-fetch（optimistic でない）", () => {
  const CODE = strip(read("CandidateActionsE2EClient.tsx"));
  it("postCandidateAction（real /api/reality/candidate-action POST）を使う", () => {
    expect(CODE).toContain("postCandidateAction");
  });
  it("optimistic helper（applyCandidateActionResult）を使わない（E2E は実 DB を読む）", () => {
    expect(CODE).not.toContain("applyCandidateActionResult");
  });
  it("action 後に getE2EPreviewState で実 DB を re-fetch・setup/cleanup を呼ぶ", () => {
    expect(CODE).toContain("getE2EPreviewState");
    expect(CODE).toContain("setupE2ETestCandidate");
    expect(CODE).toContain("cleanupE2ETestCandidates");
  });
});

describe("A1-6-9 §9.15 既存 render-only preview を壊さない", () => {
  it("render-only preview（dev-candidate-actions）の page/client が存在し続ける", () => {
    const base = path.join(process.cwd(), "app/(culcept)/plan/dev-candidate-actions");
    expect(fs.existsSync(path.join(base, "page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(base, "CandidateActionsPreviewClient.tsx"))).toBe(true);
  });
  it("E2E は別ディレクトリ（dev-candidate-actions-e2e）で分離", () => {
    expect(fs.existsSync(path.join(process.cwd(), E2E_DIR, "page.tsx"))).toBe(true);
  });
});
