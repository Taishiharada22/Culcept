/**
 * isShiftImportSaveConnectionAllowed — 本保存の接続先 guard（S-save-0）
 *
 * CEO 2026-06-04: 保存は DB write 直結のため、接続先が staging か fail-closed で確認。
 *   - staging allowlist（ref 含有）∧ production deny（ref 非含有）の両方を満たす時のみ true。
 *   - VLM / 入口 / live flag、raw画像/base64 とは無関係（純粋な接続先判定）。
 */
import { describe, it, expect } from "vitest";
import {
  isShiftImportSaveConnectionAllowed,
  isShiftImportSaveProductionCanaryAllowed,
  isShiftImportSaveUiEnabled,
} from "@/lib/plan/shift/shiftImportSaveGuard";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CLEAN_PRODUCTION_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;
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

describe("isShiftImportSaveUiEnabled — UI active を server lane gate と一致（P14-B）", () => {
  const CANARY = "canary-user-1";
  const NON_CANARY = "other-user";
  const ui = (over: Partial<Parameters<typeof isShiftImportSaveUiEnabled>[0]>) =>
    isShiftImportSaveUiEnabled({
      flagEnabled: true,
      connection: env(STAGING_URL),
      userId: CANARY,
      canaryUserIds: [CANARY],
      ...over,
    });

  it("flag ON ∧ staging 接続 ∧ auth → true（staging lane）", () => {
    expect(ui({})).toBe(true);
  });

  it("flag ON ∧ production 接続 ∧ user ∈ allowlist → true（canary lane）", () => {
    expect(ui({ connection: env(PRODUCTION_URL) })).toBe(true);
  });

  it("flag ON ∧ production 接続 ∧ user ∉ allowlist → false（偽 active を出さない）", () => {
    expect(ui({ connection: env(PRODUCTION_URL), userId: NON_CANARY })).toBe(false);
  });

  it("flag OFF → 常に false（canary でも）", () => {
    expect(ui({ flagEnabled: false })).toBe(false);
    expect(
      ui({ flagEnabled: false, connection: env(PRODUCTION_URL) })
    ).toBe(false);
  });

  it("userId null（匿名） → false（fail-closed）", () => {
    expect(ui({ userId: null })).toBe(false);
  });

  it("接続先不明（staging でも production でもない） → false", () => {
    expect(ui({ connection: env("https://other.supabase.co") })).toBe(false);
  });

  it("boolean のみ返す", () => {
    expect(typeof ui({})).toBe("boolean");
  });
});

describe("clean production canary lane — 現行本番(plod)を認識する（P14-B 根因修正）", () => {
  const CANARY = "canary-user-1";
  const cleanProdEnv = (url: string | undefined) => ({
    supabaseUrl: url,
    stagingRef: STAGING_PROJECT_REF,
    // ★shift-save lane は clean prod(plod)を本番として使う（legacy aljav ではない）
    productionRef: CLEAN_PRODUCTION_PROJECT_REF,
  });

  it("clean prod ref は plodugvgmdkusifdrdfz で legacy aljav とは別物", () => {
    expect(CLEAN_PRODUCTION_PROJECT_REF).toBe("plodugvgmdkusifdrdfz");
    expect(CLEAN_PRODUCTION_PROJECT_REF).not.toBe(PRODUCTION_PROJECT_REF);
  });

  it("clean prod(plod) 接続 ∧ canary user → canary lane true（本番保存可）", () => {
    expect(
      isShiftImportSaveProductionCanaryAllowed(
        cleanProdEnv(CLEAN_PRODUCTION_URL),
        CANARY,
        [CANARY]
      )
    ).toBe(true);
  });

  it("legacy prod(aljav) 接続は canary lane で false（shift-save は legacy を本番扱いしない）", () => {
    expect(
      isShiftImportSaveProductionCanaryAllowed(
        cleanProdEnv(PRODUCTION_URL),
        CANARY,
        [CANARY]
      )
    ).toBe(false);
  });

  it("clean prod 基準でも staging 接続は staging lane で許可（退化なし）", () => {
    expect(isShiftImportSaveConnectionAllowed(cleanProdEnv(STAGING_URL))).toBe(true);
  });

  it("clean prod 接続は staging lane では拒否（canary lane の領分）", () => {
    expect(
      isShiftImportSaveConnectionAllowed(cleanProdEnv(CLEAN_PRODUCTION_URL))
    ).toBe(false);
  });

  it("UI active も clean prod canary で true（server lane と一致）", () => {
    expect(
      isShiftImportSaveUiEnabled({
        flagEnabled: true,
        connection: cleanProdEnv(CLEAN_PRODUCTION_URL),
        userId: CANARY,
        canaryUserIds: [CANARY],
      })
    ).toBe(true);
  });
});
