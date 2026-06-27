/**
 * isShiftDraftLiveUiAllowed — live VLM 経路の canary gate（P15-B）
 *
 * CEO 仕様（2026-06-27）:
 *   - canary user 限定で live UI（ShiftDraftInApp）を表示
 *   - allowlist 外 / flag OFF / 未認証 / 不明 host → 従来どおり fixture fallback or disabled
 *   - 保存可否（shiftImportSaveEnabled）とは別 gate（VLM 抽出可 = 保存可 ではない）
 *   - clean prod(plod) を active production として認識（legacy aljav は staging-positive 句で deny）
 */
import { describe, it, expect } from "vitest";
import { isShiftDraftLiveUiAllowed } from "@/lib/plan/shift/shiftDraftLiveGuard";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  CLEAN_PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const LEGACY_PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const CLEAN_PROD_URL = `https://${CLEAN_PRODUCTION_PROJECT_REF}.supabase.co`;
const CANARY = "canary-user-1";
const NON_CANARY = "other-user";

const env = (supabaseUrl: string | undefined) => ({
  supabaseUrl,
  stagingRef: STAGING_PROJECT_REF,
  productionRef: CLEAN_PRODUCTION_PROJECT_REF, // canary lane 用は clean prod 基準
});

const allowed = (over: Partial<Parameters<typeof isShiftDraftLiveUiAllowed>[0]>) =>
  isShiftDraftLiveUiAllowed({
    flagEnabled: true,
    connection: env(STAGING_URL),
    userId: CANARY,
    canaryUserIds: [CANARY],
    ...over,
  });

describe("isShiftDraftLiveUiAllowed — canary lane（live VLM 経路の UI 表示）", () => {
  it("flag ON ∧ staging 接続 ∧ auth → true（staging lane）", () => {
    expect(allowed({})).toBe(true);
  });

  it("flag ON ∧ clean-prod(plod) 接続 ∧ user ∈ allowlist → true（canary lane）", () => {
    expect(allowed({ connection: env(CLEAN_PROD_URL) })).toBe(true);
  });

  it("flag ON ∧ clean-prod 接続 ∧ user ∉ allowlist → false（fixture fallback へ落ちる）", () => {
    expect(allowed({ connection: env(CLEAN_PROD_URL), userId: NON_CANARY })).toBe(false);
  });

  it("flag ON ∧ legacy aljav 接続 → false（shift-save lane は legacy を本番扱いしない）", () => {
    expect(allowed({ connection: env(LEGACY_PROD_URL) })).toBe(false);
  });

  it("flag OFF → 常に false（canary でも・staging でも・clean-prod でも）", () => {
    expect(allowed({ flagEnabled: false })).toBe(false);
    expect(allowed({ flagEnabled: false, connection: env(CLEAN_PROD_URL) })).toBe(false);
    expect(allowed({ flagEnabled: false, connection: env(STAGING_URL) })).toBe(false);
  });

  it("userId null（匿名） → false（fail-closed）", () => {
    expect(allowed({ userId: null })).toBe(false);
    expect(allowed({ userId: null, connection: env(CLEAN_PROD_URL) })).toBe(false);
  });

  it("接続先未設定 / 不明 host → false（fail-closed）", () => {
    expect(allowed({ connection: env(undefined) })).toBe(false);
    expect(allowed({ connection: env("") })).toBe(false);
    expect(allowed({ connection: env("https://other.supabase.co") })).toBe(false);
  });

  it("空 allowlist + clean-prod 接続 → false（production 保存不可・事故で全開しない）", () => {
    expect(allowed({ connection: env(CLEAN_PROD_URL), canaryUserIds: [] })).toBe(false);
  });

  it("空 allowlist + staging 接続 → true（staging は allowlist 不要）", () => {
    expect(allowed({ canaryUserIds: [] })).toBe(true);
  });

  it("boolean のみ返す（URL/UUID を漏らさない）", () => {
    const r = allowed({});
    expect(typeof r).toBe("boolean");
    expect(r).toBe(true);
  });
});
