/**
 * E1 hero canary resolver — triple gate（flag ∧ canary user ∧ read 接続先 guard）と flag-OFF rollback。
 *   gate は pure（shouldResolveHeroCanary）で全網羅。resolveHeroCanarySurface は test env(flag OFF)で undefined。
 */
import { describe, it, expect } from "vitest";
import { shouldResolveHeroCanary, resolveHeroCanarySurface } from "@/lib/plan/realityPipeline/heroCanaryResolver";
import {
  STAGING_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PLOD_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;
const ALJAV_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const U = "canary-user-1";

describe("shouldResolveHeroCanary — triple gate（全て満たす時のみ true）", () => {
  it("全 gate 通過（flag ∧ canary ∧ staging）→ true", () => {
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [U], userId: U, supabaseUrl: STAGING_URL })).toBe(true);
  });
  it("flag OFF → false", () => {
    expect(shouldResolveHeroCanary({ flagOn: false, canaryUserIds: [U], userId: U, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("非 canary user → false", () => {
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: ["other"], userId: U, supabaseUrl: STAGING_URL })).toBe(false);
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [], userId: U, supabaseUrl: STAGING_URL })).toBe(false);
  });
  it("production(plod/aljav) URL → false（read guard が deny）", () => {
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [U], userId: U, supabaseUrl: PLOD_URL })).toBe(false);
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [U], userId: U, supabaseUrl: ALJAV_URL })).toBe(false);
  });
  it("URL 未設定 → false（fail-closed）", () => {
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [U], userId: U, supabaseUrl: undefined })).toBe(false);
  });
  it("userId 空 → false", () => {
    expect(shouldResolveHeroCanary({ flagOn: true, canaryUserIds: [""], userId: "", supabaseUrl: STAGING_URL })).toBe(false);
  });
});

describe("resolveHeroCanarySurface — flag OFF rollback（test env=flag未設定）", () => {
  it("flag OFF（既定）→ 実 read せず undefined（supabase に触れない）", async () => {
    let touched = false;
    const supabase = { from() { touched = true; return {}; } };
    const r = await resolveHeroCanarySurface(supabase, U, STAGING_URL);
    expect(r).toBeUndefined();
    expect(touched).toBe(false); // gate 不通過なら client に触れない
  });
});
