/**
 * SR B1b-2C-8-a — isShiftDraftHostAllowed の契約（三重ガード）
 *
 * 不変条件:
 *   - draftMode === "true" 厳密判定（明示 opt-in 必須）
 *   - staging allowlist（STAGING_PROJECT_REF 必須）
 *   - production deny（PRODUCTION_PROJECT_REF 含む時は draftMode="true" でも false）
 *   - supabaseUrl 未設定 → false
 *   - 既存 `devFixtureHost` の STAGING_PROJECT_REF / PRODUCTION_PROJECT_REF を再利用
 */
import { describe, it, expect } from "vitest";
import { isShiftDraftHostAllowed } from "@/lib/plan/shift/devDraftHost";
import {
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

describe("isShiftDraftHostAllowed — 三重ガード（flag + staging allowlist + prod deny）", () => {
  it("draftMode='true' + staging URL + 非 prod → true", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "true", supabaseUrl: STAGING_URL })
    ).toBe(true);
  });

  it("draftMode undefined → false（明示 opt-in 必須）", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: undefined, supabaseUrl: STAGING_URL })
    ).toBe(false);
  });

  it("draftMode='false' → false", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "false", supabaseUrl: STAGING_URL })
    ).toBe(false);
  });

  it("draftMode='1' → false（厳密 'true' のみ通す）", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "1", supabaseUrl: STAGING_URL })
    ).toBe(false);
  });

  it("draftMode='True' → false（大文字小文字を区別）", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "True", supabaseUrl: STAGING_URL })
    ).toBe(false);
  });

  it("staging ref を含まない URL → false（allowlist）", () => {
    expect(
      isShiftDraftHostAllowed({
        draftMode: "true",
        supabaseUrl: "https://other-project.supabase.co",
      })
    ).toBe(false);
  });

  it("★ production ref を含む URL → false（draftMode='true' でも deny）", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "true", supabaseUrl: PROD_URL })
    ).toBe(false);
  });

  it("supabaseUrl undefined → false", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "true", supabaseUrl: undefined })
    ).toBe(false);
  });

  it("supabaseUrl 空文字 → false", () => {
    expect(
      isShiftDraftHostAllowed({ draftMode: "true", supabaseUrl: "" })
    ).toBe(false);
  });

  it("既存 devFixtureHost と同 STAGING_PROJECT_REF / PRODUCTION_PROJECT_REF を使う（同じ guard 思想の整合）", () => {
    // 同 ref を使うことを構造的に確認（=ホスト route 間で staging/prod の判定が一致）
    expect(STAGING_PROJECT_REF).toBe("hjcrvndumgiovyfdacwc");
    expect(PRODUCTION_PROJECT_REF).toBe("aljavfujeqcwnqryjmhl");
  });
});
