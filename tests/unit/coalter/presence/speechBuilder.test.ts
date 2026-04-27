/**
 * Stage 4 L4-i — speechBuilder LLM 合成本番化 test
 *
 * plan v0.3 §7.9 Gate:
 *   - flag OFF で speechBuilder は静的 mock 文面 (Stage 1 挙動維持)
 *   - flag ON で LLM 合成 + 事後 validator 動作
 *   - §2 / §1.2.1 違反ゼロ (random sampling)
 *   - mainstream Bug-1 lexeme 正本との dual source 禁止
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  buildPresenceSpeech,
  setLlmCall,
  type LlmCallFn,
} from "@/lib/coalter/presence/speechBuilder";
import { buildSpeechPrompt } from "@/lib/coalter/presence/speechPromptBuilder";
import { postValidateSpeech } from "@/lib/coalter/presence/speechPostValidator";
import { LENGTH_OVERRIDE_BY_VARIANT } from "@/lib/coalter/presence/speechTypes";

const ENV_KEY = "COALTER_PRESENCE_SPEECH_LLM";
let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  setLlmCall(null);
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
  setLlmCall(null);
});

describe("L4-i buildPresenceSpeech — flag OFF (既定): static mock", () => {
  it("flag OFF で LLM call は呼ばれない (DI 関数も呼び出されない)", async () => {
    let llmCalled = 0;
    setLlmCall(async () => {
      llmCalled++;
      return "called";
    });
    delete process.env[ENV_KEY];
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    expect(llmCalled).toBe(0);
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("flag OFF で全 7 variant が static mock を返す", async () => {
    delete process.env[ENV_KEY];
    for (const variant of ["A", "B", "C", "D", "E", "F1", "F2"] as const) {
      const r = await buildPresenceSpeech({
        variant,
        state: variant === "A" ? "S2" : variant.startsWith("F") ? "S7" : "S5",
        mode: "normal",
      });
      expect(r.body.length).toBeGreaterThan(0);
      expect(r.appliedLength).toBe(LENGTH_OVERRIDE_BY_VARIANT[variant]);
    }
  });
});

describe("L4-i buildPresenceSpeech — flag ON: LLM 合成 + 事後 validator", () => {
  it("flag ON + LLM call OK で出力を返す", async () => {
    process.env[ENV_KEY] = "true";
    const llm: LlmCallFn = async () => "今、間に入れそうな間が少し見えますよ";
    setLlmCall(llm);
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    expect(r.body).toContain("間に入れそう");
  });

  it("flag ON + LLM call が undefined → fallback (fail-open)", async () => {
    process.env[ENV_KEY] = "true";
    setLlmCall(null);
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    // static fallback の文面が返る
    expect(r.body).toContain("間に入れそう");
  });

  it("flag ON + LLM call が throw → fallback", async () => {
    process.env[ENV_KEY] = "true";
    setLlmCall(async () => {
      throw new Error("LLM error");
    });
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    expect(r.body.length).toBeGreaterThan(0);
  });

  it("flag ON + 違反含み LLM 出力 → 再生成 (postValidator 経由)", async () => {
    process.env[ENV_KEY] = "true";
    let calls = 0;
    setLlmCall(async () => {
      calls++;
      // 1 回目は禁止語彙 (「正しい」)、2 回目以降は OK
      if (calls === 1) return "あなたが正しいです";
      return "今、間に入れそうな静かな時間が見えています";
    });
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    expect(calls).toBeGreaterThanOrEqual(2); // 再生成された
    expect(r.body).not.toContain("正しい");
  });

  it("flag ON + 全 retry 違反 → fallback (静的 mock)", async () => {
    process.env[ENV_KEY] = "true";
    setLlmCall(async () => "あなたが正しいです"); // 永続違反
    const r = await buildPresenceSpeech({
      variant: "A",
      state: "S2",
      mode: "normal",
    });
    // fallback (static mock) が採用される
    expect(r.body).not.toContain("正しい");
  });
});

describe("L4-i buildSpeechPrompt — speech template 注入", () => {
  it("§1.2.1 6 項目 + §1.3 が prompt に注入される", () => {
    const prompt = buildSpeechPrompt(
      { variant: "A", state: "S2", mode: "normal" },
      LENGTH_OVERRIDE_BY_VARIANT.A,
    );
    expect(prompt).toMatch(/裁定/);
    expect(prompt).toMatch(/評定/);
    expect(prompt).toMatch(/代弁/);
    expect(prompt).toMatch(/勝手に確定/);
    expect(prompt).toMatch(/尋問/);
    expect(prompt).toMatch(/追い詰め/);
    expect(prompt).toMatch(/感嘆符/);
  });

  it("variant ごとの prompt 雛形が含まれる", () => {
    for (const variant of ["A", "B", "C", "D", "E", "F1", "F2"] as const) {
      const prompt = buildSpeechPrompt(
        { variant, state: "S2", mode: "normal" },
        LENGTH_OVERRIDE_BY_VARIANT[variant],
      );
      expect(prompt).toContain(`Pattern variant: ${variant}`);
    }
  });

  it("文長制約が prompt に注入される", () => {
    const override = LENGTH_OVERRIDE_BY_VARIANT.C;
    const prompt = buildSpeechPrompt(
      { variant: "C", state: "S2", mode: "normal" },
      override,
    );
    expect(prompt).toContain(`最大 ${override.maxSentences} 文`);
    expect(prompt).toContain(`最大数: ${override.maxQuestions}`);
  });
});

describe("L4-i postValidateSpeech — 再生成 / fallback", () => {
  it("初回出力が valid → retries=0 で通過", async () => {
    const r = await postValidateSpeech("今、間に入れそうな静かな時間が見えそうです", {
      regenerate: async () => "(再生成しない想定)",
      fallbackText: "fallback",
      override: LENGTH_OVERRIDE_BY_VARIANT.A,
    });
    expect(r.fallbackUsed).toBe(false);
    expect(r.retries).toBe(0);
  });

  it("初回違反 + 2 回目で OK → retries=1", async () => {
    const r = await postValidateSpeech("正しい！", {
      regenerate: async () =>
        "今、間に入れそうな静かな時間が見えそうです",
      fallbackText: "fallback",
      override: LENGTH_OVERRIDE_BY_VARIANT.A,
    });
    expect(r.fallbackUsed).toBe(false);
    expect(r.retries).toBe(1);
  });

  it("最大 retries 回違反 → fallback", async () => {
    const r = await postValidateSpeech("正しい！", {
      regenerate: async () => "正しい！",
      fallbackText: "fallback",
      override: LENGTH_OVERRIDE_BY_VARIANT.A,
      maxRetries: 2,
    });
    expect(r.fallbackUsed).toBe(true);
    expect(r.finalText).toBe("fallback");
  });

  it("regenerate throw → fallback", async () => {
    const r = await postValidateSpeech("正しい！", {
      regenerate: async () => {
        throw new Error("regen failed");
      },
      fallbackText: "fallback",
      override: LENGTH_OVERRIDE_BY_VARIANT.A,
    });
    expect(r.fallbackUsed).toBe(true);
  });
});

describe("L4-i 構造 invariant — mainstream lexeme dual source 禁止", () => {
  it("speechValidator は import 経由でのみ使う (speechBuilder.ts は独自禁止語彙を持たない)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(
      __dirname,
      "../../../../lib/coalter/presence/speechBuilder.ts",
    );
    const content = fs.readFileSync(file, "utf8");
    // speechBuilder は postValidateSpeech 経由でのみ validation を行う
    expect(content).toMatch(/postValidateSpeech/);
    // 直接 regex / lexeme リストを持たない (dual source 禁止)
    expect(content).not.toMatch(/正しい|間違っている/);
  });
});
