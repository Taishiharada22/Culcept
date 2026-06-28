/**
 * isRealityReadConnectionAllowed — E1 hero canary の read 接続先 guard
 *
 * write guard(P18) と同型: staging-positive ∧ all-production-deny・fail-closed。
 *   read であっても production 実データに触れる以上、接続先二重防御を置く。
 */
import { describe, it, expect } from "vitest";
import { isRealityReadConnectionAllowed } from "@/lib/plan/reality/realityReadConnectionGuard";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const LEGACY_PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CLEAN_PROD_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;

describe("isRealityReadConnectionAllowed — staging-positive ∧ all-production-deny", () => {
  it("staging ref を含む URL → 許可", () => {
    expect(isRealityReadConnectionAllowed(STAGING_URL)).toBe(true);
  });
  it("legacy production(aljav) → 不許可", () => {
    expect(isRealityReadConnectionAllowed(LEGACY_PROD_URL)).toBe(false);
  });
  it("active production(plod) → 不許可（実 read を本番に向けない）", () => {
    expect(isRealityReadConnectionAllowed(CLEAN_PROD_URL)).toBe(false);
  });
  it("staging ref を含まない → 不許可", () => {
    expect(isRealityReadConnectionAllowed("https://other.supabase.co")).toBe(false);
  });
  it("未設定 / 空 → 不許可（fail-closed）", () => {
    expect(isRealityReadConnectionAllowed(undefined)).toBe(false);
    expect(isRealityReadConnectionAllowed("")).toBe(false);
  });
  it("staging と production の両 ref → 不許可（production deny 優先）", () => {
    expect(isRealityReadConnectionAllowed(`https://${STAGING_PROJECT_REF}-${PRODUCTION_PROJECT_REF}.x`)).toBe(false);
    expect(isRealityReadConnectionAllowed(`https://${STAGING_PROJECT_REF}-${CLEAN_PRODUCTION_PROJECT_REF}.x`)).toBe(false);
  });
  it("boolean のみ返す（URL を漏らさない）", () => {
    expect(typeof isRealityReadConnectionAllowed(STAGING_URL)).toBe("boolean");
  });
});
