/**
 * llmComprehensionTargetDateFactory (OP-3A) — pure factory test
 *
 * 検証観点 (= CEO 2026-05-05 規律):
 *   1. provenance なし → 空配列 (= LLM default 値混入排除)
 *   2. targetDate なし → 空配列 (= string 存在だけで operation 出さない)
 *   3. provenance.source_type = "utterance" → llm_explicit / priority 700 / high
 *   4. provenance.source_type = "inferred" → llm_inferred / priority 500 / medium
 *   5. provenance.source_type = "baseline" / "tool" → 空配列 (= defensive)
 *   6. pure function (= input mutate しない、 同じ input で同じ output)
 */

import { describe, it, expect } from "vitest";
import {
  llmComprehensionTargetDateFactory,
  type LlmComprehensionTargetDateInput,
} from "@/lib/alter-morning/comprehension/operationFactories/llmComprehensionTargetDateFactory";
import type { Provenance } from "@/lib/alter-morning/comprehension/eventSchema";

const UTTERANCE_PROV: Provenance = {
  source_type: "utterance",
  source_span: ["明日"],
  provenance_confidence: "high",
  from_utterance: true,
};

const INFERRED_PROV: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "medium",
  from_utterance: false,
};

const BASELINE_PROV: Provenance = {
  source_type: "baseline",
  source_span: [],
  provenance_confidence: "medium",
  from_utterance: false,
};

const TOOL_PROV: Provenance = {
  source_type: "tool",
  source_span: [],
  provenance_confidence: "high",
  from_utterance: false,
};

describe("llmComprehensionTargetDateFactory (OP-3A)", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO 規律: provenance なし / targetDate なし → 空配列
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("targetDate が null → 空配列", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: null,
      provenance: UTTERANCE_PROV,
    });
    expect(result).toEqual([]);
  });

  it("targetDate が空文字 → 空配列", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "",
      provenance: UTTERANCE_PROV,
    });
    expect(result).toEqual([]);
  });

  it("【CEO 規律】 provenance が undefined → 空配列 (= operation 出さない)", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "tomorrow",
    });
    expect(result).toEqual([]);
  });

  it("【CEO 規律】 provenance が null → 空配列", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "tomorrow",
      provenance: null,
    });
    expect(result).toEqual([]);
  });

  it("【CEO 規律】 targetDate string の存在だけで operation を出さない (= LLM default 値排除)", () => {
    // LLM が default 「today」 を入れた想定だが provenance 無し
    const result = llmComprehensionTargetDateFactory({
      targetDate: "today",
      provenance: undefined,
    });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // utterance 由来 → llm_explicit / 700 / high
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("utterance 由来 → 1 envelope (llm_explicit / 700 / high)", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "tomorrow",
      provenance: UTTERANCE_PROV,
    });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("set_target_date");
    expect(env.payload.date).toBe("tomorrow");
    expect(env.source).toBe("llm_explicit");
    expect(env.priority).toBe(700);
    expect(env.confidence).toBe("high");
    expect(env.provenance.source_type).toBe("utterance");
  });

  it("utterance 由来 + sourceTurnIndex → trace に sourceTurnIndex 付与", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "2026-05-06",
      provenance: UTTERANCE_PROV,
      sourceTurnIndex: 2,
    });
    expect(result).toHaveLength(1);
    expect(result[0].trace?.sourceTurnIndex).toBe(2);
  });

  it("utterance 由来 + sourceTurnIndex 未指定 → trace は undefined", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "tomorrow",
      provenance: UTTERANCE_PROV,
    });
    expect(result[0].trace).toBeUndefined();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // inferred 由来 → llm_inferred / 500 / medium (= 低 priority)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("inferred 由来 → llm_inferred / 500 / medium", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "2026-05-10",
      provenance: INFERRED_PROV,
    });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.source).toBe("llm_inferred");
    expect(env.priority).toBe(500);
    expect(env.confidence).toBe("medium");
    expect(env.provenance.source_type).toBe("inferred");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // baseline / tool → 空配列 (= defensive、 LLM 文脈で意味曖昧)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("baseline 由来 → 空配列 (= defensive)", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "today",
      provenance: BASELINE_PROV,
    });
    expect(result).toEqual([]);
  });

  it("tool 由来 → 空配列 (= defensive)", () => {
    const result = llmComprehensionTargetDateFactory({
      targetDate: "tomorrow",
      provenance: TOOL_PROV,
    });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // pure function 検証
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("input mutate しない (= pure)", () => {
    const input: LlmComprehensionTargetDateInput = {
      targetDate: "tomorrow",
      provenance: UTTERANCE_PROV,
      sourceTurnIndex: 0,
    };
    const inputSnapshot = JSON.stringify(input);
    llmComprehensionTargetDateFactory(input);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });

  it("同じ input で同じ output (= pure / deterministic)", () => {
    const input: LlmComprehensionTargetDateInput = {
      targetDate: "tomorrow",
      provenance: UTTERANCE_PROV,
    };
    const r1 = llmComprehensionTargetDateFactory(input);
    const r2 = llmComprehensionTargetDateFactory(input);
    expect(r1).toEqual(r2);
  });

  it("envelope を 2 回生成しても provenance reference は input から保持", () => {
    const input: LlmComprehensionTargetDateInput = {
      targetDate: "tomorrow",
      provenance: UTTERANCE_PROV,
    };
    const r1 = llmComprehensionTargetDateFactory(input);
    expect(r1[0].provenance).toBe(UTTERANCE_PROV);
  });
});
