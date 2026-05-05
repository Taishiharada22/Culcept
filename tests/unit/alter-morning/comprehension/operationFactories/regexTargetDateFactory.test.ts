/**
 * regexTargetDateFactory (OP-3A) — pure factory test
 *
 * 検証観点:
 *   1. utterance 空 → 空配列
 *   2. extractTargetDate が undefined (= 「今日」 含む signal なし) → 空配列
 *   3. 「明日」 → 1 envelope (regex_deterministic / 600 / high)
 *   4. 「明後日」 → 1 envelope
 *   5. envelope の provenance.source_type = "utterance"
 *   6. trace.ruleId = "extractTargetDate"
 *   7. pure function (= input mutate しない)
 *
 * 注意:
 *   intentParser:911 の既存挙動: 「今日」 → undefined を返す (= extractTargetDate
 *   は明示的に undefined で「today 扱い」 を表現)。 factory は undefined → 空配列。
 *   よって「今日」 のような relative-today 表現でも空配列を返す (= 既存挙動と整合)。
 */

import { describe, it, expect } from "vitest";
import {
  regexTargetDateFactory,
  type RegexTargetDateInput,
} from "@/lib/alter-morning/comprehension/operationFactories/regexTargetDateFactory";

describe("regexTargetDateFactory (OP-3A)", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 空配列 case
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("utterance 空文字 → 空配列", () => {
    const result = regexTargetDateFactory({ utterance: "" });
    expect(result).toEqual([]);
  });

  it("日付 signal なし → 空配列 (= 「カフェに行く」)", () => {
    const result = regexTargetDateFactory({ utterance: "カフェに行く" });
    expect(result).toEqual([]);
  });

  it("「今日」 → 空配列 (= extractTargetDate は undefined を返す既存挙動)", () => {
    // intentParser.ts:911: 「今日」 は明示的に undefined を返す = factory は空配列
    const result = regexTargetDateFactory({ utterance: "今日は仕事だ" });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 「明日」 / 「明後日」 → envelope 1 件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("「明日」 → envelope 1 件 (regex_deterministic / 600 / high)", () => {
    const result = regexTargetDateFactory({ utterance: "明日のプラン" });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("set_target_date");
    expect(env.source).toBe("regex_deterministic");
    expect(env.priority).toBe(600);
    expect(env.confidence).toBe("high");
    expect(env.provenance.source_type).toBe("utterance");
    expect(env.provenance.from_utterance).toBe(true);
    // payload.date は "YYYY-MM-DD" 形式
    expect(env.payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("「明後日」 → envelope 1 件", () => {
    const result = regexTargetDateFactory({ utterance: "明後日のミーティング" });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("regex_deterministic");
    expect(result[0].payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("「明日 8 時」 → envelope 1 件 (= 時刻併存しても extractTargetDate は明日を抽出)", () => {
    const result = regexTargetDateFactory({ utterance: "明日 8 時に渋谷" });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("set_target_date");
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // trace
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("trace.ruleId = 'extractTargetDate'", () => {
    const result = regexTargetDateFactory({ utterance: "明日カフェ" });
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
  });

  it("sourceTurnIndex 指定 → trace.sourceTurnIndex に反映", () => {
    const result = regexTargetDateFactory({
      utterance: "明後日のプラン",
      sourceTurnIndex: 3,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(3);
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
  });

  it("sourceTurnIndex 未指定 → trace は ruleId のみ", () => {
    const result = regexTargetDateFactory({ utterance: "明日" });
    expect(result[0].trace?.ruleId).toBe("extractTargetDate");
    expect(result[0].trace?.sourceTurnIndex).toBeUndefined();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // pure function
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("input mutate しない (= pure)", () => {
    const input: RegexTargetDateInput = {
      utterance: "明日のプラン",
      sourceTurnIndex: 1,
    };
    const inputSnapshot = JSON.stringify(input);
    regexTargetDateFactory(input);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });

  it("同じ input で同じ shape (= pure)", () => {
    // 注: extractTargetDate は new Date() を使うので payload.date は実行時刻に依存。
    // ここでは shape のみ pure であることを検証。
    const input: RegexTargetDateInput = { utterance: "明後日" };
    const r1 = regexTargetDateFactory(input);
    const r2 = regexTargetDateFactory(input);
    expect(r1).toHaveLength(r2.length);
    expect(r1[0]?.source).toBe(r2[0]?.source);
    expect(r1[0]?.priority).toBe(r2[0]?.priority);
    expect(r1[0]?.confidence).toBe(r2[0]?.confidence);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // provenance shape
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("provenance.source_span は空配列 (= extractTargetDate は個別 span 不返却)", () => {
    const result = regexTargetDateFactory({ utterance: "明日カフェ" });
    expect(result[0].provenance.source_span).toEqual([]);
  });

  it("provenance.provenance_confidence は high", () => {
    const result = regexTargetDateFactory({ utterance: "明後日" });
    expect(result[0].provenance.provenance_confidence).toBe("high");
  });
});
