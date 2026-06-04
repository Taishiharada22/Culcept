/**
 * draftExtractionFlagGate — S3A-1 の flag gate 契約（pure）
 *
 * CEO 2026-06-04 の S3A-1 test 要件を固定:
 *   - PLAN_SHIFT_DRAFT_LIVE_ENABLED=true で許可（product 導線）
 *   - PLAN_SHIFT_DRAFT_HOST=true でも従来どおり許可（dev route 互換）
 *   - 両方 false / 未定義 なら blocked
 *   - PLAN_SHIFT_IMPORT_SAVE とは無関係（混ざらない）
 *   - raw env value を出力しない（boolean のみ返す）
 *
 * 注: production deny / staging allowlist / api key / auth / VLM 実行 は runExtractShiftDraft
 *     側の別 gate（runExtractShiftDraft.test.ts で既に網羅）。本 test は **flag gate のみ**。
 */
import { describe, it, expect } from "vitest";
import { isDraftExtractionFlagAllowed } from "@/lib/plan/shift/draftExtractionFlagGate";

describe("isDraftExtractionFlagAllowed — 2 flag OR（live || host）", () => {
  it("PLAN_SHIFT_DRAFT_LIVE_ENABLED=true → 許可（product 導線の live VLM gate）", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "true", draftHost: undefined })
    ).toBe(true);
  });

  it("PLAN_SHIFT_DRAFT_HOST=true → 許可（dev route 互換・従来どおり）", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: undefined, draftHost: "true" })
    ).toBe(true);
  });

  it("両方 true → 許可", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "true", draftHost: "true" })
    ).toBe(true);
  });

  it("両方 false → blocked", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "false", draftHost: "false" })
    ).toBe(false);
  });

  it("両方 undefined → blocked", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: undefined, draftHost: undefined })
    ).toBe(false);
  });

  it("live=true / host=false → 許可（product 導線は live で立つ）", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "true", draftHost: "false" })
    ).toBe(true);
  });

  it("live=false / host=true → 許可（dev route は host で立つ）", () => {
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "false", draftHost: "true" })
    ).toBe(true);
  });

  it("strict: '1' / 'yes' / 'TRUE' / 前後空白 は false（'true' 厳密一致のみ）", () => {
    expect(isDraftExtractionFlagAllowed({ liveEnabled: "1", draftHost: undefined })).toBe(false);
    expect(isDraftExtractionFlagAllowed({ liveEnabled: "yes", draftHost: undefined })).toBe(false);
    expect(isDraftExtractionFlagAllowed({ liveEnabled: "TRUE", draftHost: undefined })).toBe(false);
    expect(isDraftExtractionFlagAllowed({ liveEnabled: " true ", draftHost: undefined })).toBe(false);
    expect(isDraftExtractionFlagAllowed({ liveEnabled: undefined, draftHost: "True" })).toBe(false);
  });

  it("save flag とは無関係（helper は save を引数に取らない＝混ざらない）", () => {
    // 型レベルで save field を持たないため、save 値は判定に一切入らない。
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "false", draftHost: "false" })
    ).toBe(false);
    expect(
      isDraftExtractionFlagAllowed({ liveEnabled: "true", draftHost: "false" })
    ).toBe(true);
  });

  it("boolean のみ返す（raw env 値を漏らさない）", () => {
    const r = isDraftExtractionFlagAllowed({
      liveEnabled: "true",
      draftHost: "SECRET-LIKE-VALUE",
    });
    expect(typeof r).toBe("boolean");
    expect(r).toBe(true);
  });
});
