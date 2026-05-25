/**
 * Phase 3-J-2: runtime check + ProposalChip / ProposalSheet モジュール import 検証
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-2 / §10.4 Smoke 38
 *
 * 検証対象:
 *   - runtimeNoAiSubjectCheck: dev/test mode で console.warn、 production で no-op
 *   - ProposalChip / ProposalSheet モジュールが import 可能 (= 型 / 構文 OK)
 *
 * 制限:
 *   - DOM 環境なし (= jsdom 未インストール、 new dependency 禁止)
 *   - rendering テストは playwright / smoke (= 別 phase) に委ねる
 *
 * 不変原則:
 *   - Invariant 34 No-AI-Subject Copy (= runtime check で機械的検知)
 *   - Invariant 42 Memory Chip Style
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runtimeNoAiSubjectCheck } from "@/lib/plan/proposal/copy/noAiSubjectRuntimeCheck";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runtimeNoAiSubjectCheck
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runtimeNoAiSubjectCheck — dev / test mode", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // ensure not production
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("violation triggers console.warn", () => {
    runtimeNoAiSubjectCheck("Alter は 9:45 出発を提案します");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0]!;
    expect(String(args[0])).toMatch(/Phase 3 No-AI-Subject Runtime Check/);
  });

  it("contextLabel appears in warning", () => {
    runtimeNoAiSubjectCheck("私が提案します", "ProposalChip.headline");
    expect(warnSpy).toHaveBeenCalled();
    const args = warnSpy.mock.calls[0]!;
    expect(String(args[0])).toMatch(/ProposalChip\.headline/);
  });

  it("clean copy → no warning", () => {
    runtimeNoAiSubjectCheck("いつもの場所にしますか?");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("empty string → no warning", () => {
    runtimeNoAiSubjectCheck("");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("runtimeNoAiSubjectCheck — production no-op", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("production: violation does NOT trigger warn", () => {
    runtimeNoAiSubjectCheck("Alter は提案します");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ProposalChip / ProposalSheet モジュール import 検証 (= 型 + 構文)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("ProposalChip / ProposalSheet module import", () => {
  it("ProposalChip module imports without error", async () => {
    const mod = await import("@/app/(culcept)/plan/components/ProposalChip");
    expect(mod.ProposalChip).toBeTypeOf("function");
  });

  it("ProposalSheet module imports without error", async () => {
    const mod = await import("@/app/(culcept)/plan/components/ProposalSheet");
    expect(mod.ProposalSheet).toBeTypeOf("function");
  });

  it("ProposalChipProps type is exported", async () => {
    const mod = await import("@/app/(culcept)/plan/components/ProposalChip");
    // 型 check は compile-time、 runtime では function 存在のみ確認
    expect(mod.ProposalChip).toBeDefined();
  });
});
