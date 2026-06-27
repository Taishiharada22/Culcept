/**
 * isRealityWriteConnectionAllowed — reality write の接続先 guard（P18）
 *
 * 設計（P15 同型）:
 *   - staging-positive ∧ all-production-deny（legacy aljav も active plod も deny）
 *   - URL 未設定 / 不明 host / production 含有はすべて false（fail-closed）
 *   - 呼出側は flag と AND（reality write 3 route が gate を担う）
 */
import { describe, it, expect } from "vitest";
import { isRealityWriteConnectionAllowed } from "@/lib/plan/reality/realityWriteConnectionGuard";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const LEGACY_PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CLEAN_PROD_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;

describe("isRealityWriteConnectionAllowed — staging-positive ∧ all-production-deny", () => {
  it("staging ref を含む URL → 許可", () => {
    expect(isRealityWriteConnectionAllowed(STAGING_URL)).toBe(true);
  });

  it("legacy production(aljav) を含む URL → 不許可", () => {
    expect(isRealityWriteConnectionAllowed(LEGACY_PROD_URL)).toBe(false);
  });

  it("active production(plod) を含む URL → 不許可（P15 ref-drift 監査の意味を保つ）", () => {
    expect(isRealityWriteConnectionAllowed(CLEAN_PROD_URL)).toBe(false);
  });

  it("staging ref を含まない URL → 不許可（allowlist 不一致）", () => {
    expect(isRealityWriteConnectionAllowed("https://other.supabase.co")).toBe(false);
  });

  it("URL 未設定 / 空 → 不許可（fail-closed）", () => {
    expect(isRealityWriteConnectionAllowed(undefined)).toBe(false);
    expect(isRealityWriteConnectionAllowed("")).toBe(false);
  });

  it("staging と legacy production の両 ref を含む URL → 不許可（production deny 優先）", () => {
    const both = `https://${STAGING_PROJECT_REF}-${PRODUCTION_PROJECT_REF}.example`;
    expect(isRealityWriteConnectionAllowed(both)).toBe(false);
  });

  it("staging と active production(plod) の両 ref を含む URL → 不許可", () => {
    const both = `https://${STAGING_PROJECT_REF}-${CLEAN_PRODUCTION_PROJECT_REF}.example`;
    expect(isRealityWriteConnectionAllowed(both)).toBe(false);
  });

  it("boolean のみ返す（URL 値を漏らさない）", () => {
    const r = isRealityWriteConnectionAllowed(STAGING_URL);
    expect(typeof r).toBe("boolean");
    expect(r).toBe(true);
  });
});
