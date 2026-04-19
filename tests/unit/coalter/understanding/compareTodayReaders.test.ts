/**
 * [CEO lock 2026-04-20 M0-4 #3/#5] rule vs LLM 比較器の aggregated metrics 検証。
 */

import { describe, expect, it } from "vitest";
import { compareTodayReaders } from "@/lib/coalter/understanding/compareTodayReaders";
import type {
  LLMReadingCandidate,
  TodayReaderLLMClient,
} from "@/lib/coalter/understanding/todayReaderLLM";
import { MATURE_BUNDLE, SPARSE_BUNDLE } from "./fixtures/pairs";

const FIXED_NOW = "2026-04-20T12:00:00Z";

function fixedClient(candidate: LLMReadingCandidate): TodayReaderLLMClient {
  return { infer: async () => candidate };
}

describe("compareTodayReaders", () => {
  it("client 未指定 → llmOutcome=error, modeAgreement=false, confidenceDelta=null", async () => {
    const c = await compareTodayReaders(MATURE_BUNDLE, FIXED_NOW, undefined);
    expect(c.llmOutcome).toBe("error");
    expect(c.modeAgreement).toBe(false);
    expect(c.llmMode).toBeNull();
    expect(c.llmConfidence).toBeNull();
    expect(c.confidenceDelta).toBeNull();
    expect(c.latencyMs.rule).toBeGreaterThanOrEqual(0);
    expect(c.latencyMs.llm).toBeGreaterThanOrEqual(0);
  });

  it("LLM が rule と同じ mode → modeAgreement=true", async () => {
    // MATURE の rule-based mode は connect（caring gap 0.2 ちょうど、1〜2 fatigue hit → recover 優先）
    // 先に rule の実 mode を動かして取得 → 同一を stub に返す
    const ruleProbe = await compareTodayReaders(MATURE_BUNDLE, FIXED_NOW, undefined);
    const ruleMode = ruleProbe.ruleMode;

    const c = await compareTodayReaders(
      MATURE_BUNDLE,
      FIXED_NOW,
      fixedClient({
        mode: ruleMode,
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "落ち着きを共有する",
        latentNeeds: ["安心"],
        confidence: 0.7,
      }),
    );
    expect(c.llmOutcome).toBe("ok");
    expect(c.modeAgreement).toBe(true);
    expect(c.llmMode).toBe(ruleMode);
    expect(c.confidenceDelta).not.toBeNull();
    expect(c.ruleConfidence).toBeGreaterThan(0);
    expect(c.llmConfidence).toBe(0.7);
  });

  it("LLM が異なる mode → modeAgreement=false, enum のみ", async () => {
    const c = await compareTodayReaders(
      SPARSE_BUNDLE,
      FIXED_NOW,
      fixedClient({
        mode: "celebrate",
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "祝いの日",
        latentNeeds: [],
        confidence: 0.3,
      }),
    );
    expect(c.llmOutcome).toBe("ok");
    expect(c.llmMode).toBe("celebrate");
    expect(c.modeAgreement).toBe(false);
  });

  it("latentNeedsDelta は count のみで overlap も数値", async () => {
    // MATURE の rule 側 latentNeeds を probe
    const probe = await compareTodayReaders(MATURE_BUNDLE, FIXED_NOW, undefined);
    const ruleCount = probe.latentNeedsDelta.ruleCount;

    const c = await compareTodayReaders(
      MATURE_BUNDLE,
      FIXED_NOW,
      fixedClient({
        mode: probe.ruleMode,
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "",
        latentNeeds: ["未観測ニーズX", "未観測ニーズY"],
        confidence: 0.6,
      }),
    );
    expect(c.latentNeedsDelta.ruleCount).toBe(ruleCount);
    expect(c.latentNeedsDelta.llmCount).toBe(2);
    // rule 側と重ならない LLM 出力 → overlap 0
    expect(c.latentNeedsDelta.overlapCount).toBe(0);
  });

  it("raw text が漏れていない: JSON.stringify に implicitIntent/quote 等が載らない", async () => {
    const c = await compareTodayReaders(
      MATURE_BUNDLE,
      FIXED_NOW,
      fixedClient({
        mode: "connect",
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "SENSITIVE_INTENT_DO_NOT_LEAK",
        latentNeeds: ["SENSITIVE_NEED_DO_NOT_LEAK"],
        confidence: 0.5,
      }),
    );
    const json = JSON.stringify(c);
    expect(json).not.toContain("SENSITIVE_INTENT_DO_NOT_LEAK");
    expect(json).not.toContain("SENSITIVE_NEED_DO_NOT_LEAK");
    // 禁止 key も shape に存在しない
    expect(Object.keys(c)).not.toContain("implicitIntent");
    expect(Object.keys(c)).not.toContain("rawOutput");
    expect(Object.keys(c)).not.toContain("prompt");
  });

  it("llm fallback 時: modeAgreement=false, confidenceDelta=null, latency 計測は残る", async () => {
    const c = await compareTodayReaders(
      MATURE_BUNDLE,
      FIXED_NOW,
      fixedClient({
        mode: "WRONG" as never,
        energyBudget: "mid",
        timeBudget: "limited",
        implicitIntent: "",
        latentNeeds: [],
        confidence: 0.5,
      }),
    );
    expect(c.llmOutcome).toBe("fallback");
    expect(c.modeAgreement).toBe(false);
    expect(c.confidenceDelta).toBeNull();
    expect(c.latentNeedsDelta.llmCount).toBe(0);
  });
});
