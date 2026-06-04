/**
 * isShiftImportSaveConnectionAllowed — 本保存の接続先 guard（S-save-0）
 *
 * CEO 2026-06-04: 保存は DB write 直結のため、接続先が staging か fail-closed で確認。
 *   - staging allowlist（ref 含有）∧ production deny（ref 非含有）の両方を満たす時のみ true。
 *   - VLM / 入口 / live flag、raw画像/base64 とは無関係（純粋な接続先判定）。
 */
import { describe, it, expect } from "vitest";
import { isShiftImportSaveConnectionAllowed } from "@/lib/plan/shift/shiftImportSaveGuard";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const env = (supabaseUrl: string | undefined) => ({
  supabaseUrl,
  stagingRef: STAGING_PROJECT_REF,
  productionRef: PRODUCTION_PROJECT_REF,
});

describe("isShiftImportSaveConnectionAllowed — staging allowlist ∧ production deny", () => {
  it("staging ref を含む URL → 許可", () => {
    expect(isShiftImportSaveConnectionAllowed(env(STAGING_URL))).toBe(true);
  });

  it("production ref を含む URL → 不許可（production deny）", () => {
    expect(isShiftImportSaveConnectionAllowed(env(PRODUCTION_URL))).toBe(false);
  });

  it("staging ref を含まない URL → 不許可（allowlist 不一致）", () => {
    expect(
      isShiftImportSaveConnectionAllowed(env("https://other.supabase.co"))
    ).toBe(false);
  });

  it("URL 未設定 / 空 → 不許可（fail-closed）", () => {
    expect(isShiftImportSaveConnectionAllowed(env(undefined))).toBe(false);
    expect(isShiftImportSaveConnectionAllowed(env(""))).toBe(false);
  });

  it("staging と production の両 ref を含む URL → 不許可（production deny 優先）", () => {
    const both = `https://${STAGING_PROJECT_REF}-${PRODUCTION_PROJECT_REF}.example`;
    expect(isShiftImportSaveConnectionAllowed(env(both))).toBe(false);
  });

  it("boolean のみ返す（URL 値を漏らさない）", () => {
    const r = isShiftImportSaveConnectionAllowed(env(STAGING_URL));
    expect(typeof r).toBe("boolean");
    expect(r).toBe(true);
  });
});
