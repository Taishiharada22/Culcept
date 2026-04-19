/**
 * [CEO lock 2026-04-20 M0-4 #2] shadow OFF / ON の挙動固定。
 *   - OFF 時: 既存 behavior 変化なし（diagnostics.todayReaderComparison undefined）
 *   - ON 時: diagnostics に aggregated comparison が載り、lens 本体は rule-based と deep equal
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runUnderstanding } from "@/lib/coalter/understanding/index";
import type {
  LLMReadingCandidate,
  TodayReaderLLMClient,
} from "@/lib/coalter/understanding/todayReaderLLM";
import { MATURE_BUNDLE } from "./fixtures/pairs";

const FIXED_NOW = "2026-04-20T12:00:00Z";

function fixedClient(candidate: LLMReadingCandidate): TodayReaderLLMClient {
  return { infer: async () => candidate };
}

describe("runUnderstanding shadow wiring", () => {
  const originalShadow = process.env.COALTER_UNDERSTANDING_LLM_SHADOW;
  const originalDiag = process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (originalShadow === undefined) {
      delete process.env.COALTER_UNDERSTANDING_LLM_SHADOW;
    } else {
      process.env.COALTER_UNDERSTANDING_LLM_SHADOW = originalShadow;
    }
    if (originalDiag === undefined) {
      delete process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
    } else {
      process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = originalDiag;
    }
  });

  it("shadow OFF (default): LLM client を渡しても呼ばれない、lens 出力は rule-based のまま", async () => {
    delete process.env.COALTER_UNDERSTANDING_LLM_SHADOW;
    const inferSpy = vi.fn(async () => ({
      mode: "celebrate" as const,
      energyBudget: "mid" as const,
      timeBudget: "limited" as const,
      implicitIntent: "should not run",
      latentNeeds: [],
      confidence: 0.9,
    }));
    const lens = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_test", {
      llmClient: { infer: inferSpy },
    });
    expect(inferSpy).not.toHaveBeenCalled();
    // 本流 todayReading は rule-based
    expect(["recover", "celebrate", "connect", "challenge", "maintain"]).toContain(
      lens.todayReading.mode,
    );
    // LLM が主張した mode にはならない（client が OFF で呼ばれていないので）
    // → rule 側の mode になる（LLM の "celebrate" と必ずしも一致しない）
  });

  it("shadow ON: diagnostics.todayReaderComparison が出る、lens 本体は変わらない", async () => {
    // baseline は DIAG/SHADOW 両 OFF で取る（console に emit しない）
    delete process.env.COALTER_UNDERSTANDING_LLM_SHADOW;
    delete process.env.COALTER_UNDERSTANDING_DIAGNOSTICS;
    const baseline = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_test");
    consoleSpy.mockClear();

    process.env.COALTER_UNDERSTANDING_LLM_SHADOW = "1";
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "1";

    const lens = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_test", {
      llmClient: fixedClient({
        mode: baseline.todayReading.mode,
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "LEAK_GUARD",
        latentNeeds: ["LEAK_GUARD_NEED"],
        confidence: 0.6,
      }),
    });

    // 本流 lens は baseline と完全一致（LLM が本流に影響しない）
    expect(lens).toEqual(baseline);

    // diagnostics 経由で比較メトリクスが console に出る
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleSpy.mock.calls[0];
    expect(prefix).toBe("[CoAlter] understanding.diagnostics");
    const d = payload as Record<string, unknown>;
    expect(d).toHaveProperty("todayReaderComparison");

    const comp = d.todayReaderComparison as Record<string, unknown>;
    expect(comp.modeAgreement).toBe(true);
    expect(comp.llmOutcome).toBe("ok");
    expect(comp).not.toHaveProperty("implicitIntent");
    expect(comp).not.toHaveProperty("rawOutput");

    // raw text 漏洩なし
    const json = JSON.stringify(d);
    expect(json).not.toContain("LEAK_GUARD");
  });

  it("shadow ON + client 未指定: llmOutcome=error, 本流は不変", async () => {
    process.env.COALTER_UNDERSTANDING_LLM_SHADOW = "1";
    process.env.COALTER_UNDERSTANDING_DIAGNOSTICS = "1";

    const lens = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_test");
    expect(lens.todayReading.mode).toBeDefined();

    const payload = consoleSpy.mock.calls[0][1] as Record<string, unknown>;
    const comp = payload.todayReaderComparison as Record<string, unknown>;
    expect(comp.llmOutcome).toBe("error");
    expect(comp.llmMode).toBeNull();
    expect(comp.confidenceDelta).toBeNull();
  });
});
