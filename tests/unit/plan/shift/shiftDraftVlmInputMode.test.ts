/**
 * resolveShiftDraftVlmInputMode — combined-biased 正規化（S3A-2-2-2）
 *
 * CEO/GPT 2026-06-04 の要件:
 *   - default（未設定）は combined
 *   - env "combined" → combined
 *   - env "split" → split（明示 opt-out のみ）
 *   - 不正値 → combined fallback
 *   - split 固定にならない（combined-biased）
 */
import { describe, it, expect } from "vitest";
import { resolveShiftDraftVlmInputMode } from "@/lib/plan/shift/shiftDraftVlmInputMode";

describe("resolveShiftDraftVlmInputMode — combined-biased", () => {
  it("既定（未設定）は combined", () => {
    expect(resolveShiftDraftVlmInputMode(undefined)).toBe("combined");
  });

  it("env='combined' → combined", () => {
    expect(resolveShiftDraftVlmInputMode("combined")).toBe("combined");
  });

  it("env='split' → split（明示 opt-out のみ）", () => {
    expect(resolveShiftDraftVlmInputMode("split")).toBe("split");
  });

  it("不正値 → combined fallback", () => {
    expect(resolveShiftDraftVlmInputMode("foo")).toBe("combined");
    expect(resolveShiftDraftVlmInputMode("")).toBe("combined");
  });

  it("strict: 'split' 厳密一致のみ split（大文字/前後空白は combined）", () => {
    expect(resolveShiftDraftVlmInputMode("Split")).toBe("combined");
    expect(resolveShiftDraftVlmInputMode("SPLIT")).toBe("combined");
    expect(resolveShiftDraftVlmInputMode(" split ")).toBe("combined");
    expect(resolveShiftDraftVlmInputMode("COMBINED")).toBe("combined");
  });

  it("split 固定にならない（combined-biased＝既定は combined）", () => {
    // 既定経路（未設定/不正）は combined に倒れる＝split 固定ではない。
    expect(resolveShiftDraftVlmInputMode(undefined)).not.toBe("split");
    expect(resolveShiftDraftVlmInputMode("anything")).not.toBe("split");
  });
});
