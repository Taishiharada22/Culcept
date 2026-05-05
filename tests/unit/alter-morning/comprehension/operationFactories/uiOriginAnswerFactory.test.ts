/**
 * uiOriginAnswerFactory (OP-3B) — 文脈ガード厳守 test
 *
 * CEO 2026-05-05 規律: raw answer だけ受けると、 将来接続時に普通の発話まで origin
 * answer として誤処理する危険がある。 二重保護で「origin clarify が active な
 * 時のみ動く」 を保証する。
 *
 * 検証観点:
 *   1. clarifySlot !== "origin" → 空配列
 *   2. isOriginClarifyActive !== true → 空配列
 *   3. answer 空文字 → 空配列
 *   4. bindOriginAnswer.bound = false (= semantic_miss) → 空配列
 *   5. 全 PASS → 1 envelope (= ui_action / 1000 / high / utterance / slot=origin)
 *   6. pure (= input mutate なし)
 */

import { describe, it, expect } from "vitest";
import {
  uiOriginAnswerFactory,
  type UiOriginAnswerInput,
} from "@/lib/alter-morning/comprehension/operationFactories/uiOriginAnswerFactory";

describe("uiOriginAnswerFactory (OP-3B) — 文脈ガード厳守", () => {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CEO 規律: 文脈ガード — origin clarify 文脈以外で空配列
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("【CEO 規律】 clarifySlot !== 'origin' → 空配列 (= 普通の発話への誤発火防止)", () => {
    const result = uiOriginAnswerFactory({
      answer: "自宅",
      clarifySlot: "where", // ← origin ではない
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  it("clarifySlot = 'when' → 空配列", () => {
    const result = uiOriginAnswerFactory({
      answer: "ホテル",
      clarifySlot: "when",
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  it("clarifySlot = null → 空配列", () => {
    const result = uiOriginAnswerFactory({
      answer: "自宅",
      clarifySlot: null,
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  it("【CEO 規律】 isOriginClarifyActive = false → 空配列 (= 二重保護)", () => {
    const result = uiOriginAnswerFactory({
      answer: "自宅",
      clarifySlot: "origin",
      isOriginClarifyActive: false,
    });
    expect(result).toEqual([]);
  });

  it("【CEO 規律】 普通の発話で「自宅」 が含まれただけで origin candidate 化しない", () => {
    // 例: user が普通の発話で「自宅から駅まで歩いた」 と言った場合、 clarify
    // active でない限り resolve_place_candidate(origin) を出さない
    const result = uiOriginAnswerFactory({
      answer: "自宅から駅まで歩いた",
      clarifySlot: null,
      isOriginClarifyActive: false,
    });
    expect(result).toEqual([]);
  });

  it("answer 空文字 → 空配列", () => {
    const result = uiOriginAnswerFactory({
      answer: "",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 文脈 active + bind 失敗 → 空配列
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("文脈 active + bind 失敗 (= 「から」 のみで suffix 剥いて空 → semantic_miss) → 空配列", () => {
    // normalizeOriginAnswer の挙動 (answerBinder.ts:235-256):
    //   - 末尾 suffix「から / から出る / から出発 / を出発 / を出る」 を剥く
    //   - 剥いた結果が空文字 → null (= bound=false)
    //   - 「から」 単独入力 → 「」 → null
    // よって factory は「から」 単独で空配列を返す。
    const result = uiOriginAnswerFactory({
      answer: "から",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  it("文脈 active + 句読点のみ (= 「、」) → 空配列 (= bind 失敗)", () => {
    // normalizeOriginAnswer は末尾句読点を剥く → 空 → null
    const result = uiOriginAnswerFactory({
      answer: "、",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toEqual([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 全 PASS case (= origin clarify active + 妥当な answer)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("全 PASS (= origin clarify active + 「自宅」) → 1 envelope (ui_action / 1000 / high)", () => {
    const result = uiOriginAnswerFactory({
      answer: "自宅",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toHaveLength(1);
    const env = result[0];
    expect(env.type).toBe("resolve_place_candidate");
    expect(env.payload.slot).toBe("origin");
    expect(env.payload.label).toBe("自宅");
    expect(env.source).toBe("ui_action");
    expect(env.priority).toBe(1000);
    expect(env.confidence).toBe("high");
    expect(env.provenance.source_type).toBe("utterance");
    expect(env.provenance.from_utterance).toBe(true);
  });

  it("全 PASS (= 「ホテル」) → 1 envelope", () => {
    const result = uiOriginAnswerFactory({
      answer: "ホテル",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].payload.label).toBe("ホテル");
  });

  it("全 PASS (= 「東京駅」) → 1 envelope", () => {
    const result = uiOriginAnswerFactory({
      answer: "東京駅",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result).toHaveLength(1);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // trace
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("trace.ruleId = 'uiOriginAnswer'", () => {
    const result = uiOriginAnswerFactory({
      answer: "自宅",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    });
    expect(result[0].trace?.ruleId).toBe("uiOriginAnswer");
  });

  it("sourceTurnIndex 反映", () => {
    const result = uiOriginAnswerFactory({
      answer: "ホテル",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
      sourceTurnIndex: 9,
    });
    expect(result[0].trace?.sourceTurnIndex).toBe(9);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // pure
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  it("input mutate しない", () => {
    const input: UiOriginAnswerInput = {
      answer: "自宅",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    };
    const snapshot = JSON.stringify(input);
    uiOriginAnswerFactory(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("同じ input で同じ output (= deterministic)", () => {
    const input: UiOriginAnswerInput = {
      answer: "ホテル",
      clarifySlot: "origin",
      isOriginClarifyActive: true,
    };
    const r1 = uiOriginAnswerFactory(input);
    const r2 = uiOriginAnswerFactory(input);
    expect(r1).toEqual(r2);
  });
});
