/**
 * CoAlter Stage 4 L4-i — speechBuilder LLM 合成本番化
 *
 * 正本: layout plan v0.3 §5.13 (interface) + §7.9 (LLM 合成本番化)
 *
 * 本 phase 改修:
 *   - flag presenceSpeechLLMEnabled OFF (既定): static mock 文面を返す (Stage 1 挙動維持)
 *   - flag ON: speechPromptBuilder + LLM call + speechPostValidator 経路
 *
 * Stage 4 L4-l flip まで flag OFF 固定 (production behavior 不変)。
 *
 * 不可侵:
 *   - flag OFF で LLM 課金経路に到達しない (production cost 不変原則)
 *   - speech template §2 / §1.2.1 違反は postValidateSpeech で構造的に reject
 *   - mainstream Bug-1 lexeme 整合: speechValidator が import 経由で参照
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import {
  LENGTH_OVERRIDE_BY_VARIANT,
} from "./speechTypes";
import type {
  BuildPresenceSpeechInput,
  SpeechOutput,
  ToneCategory,
} from "./speechTypes";
import { buildSpeechPrompt } from "./speechPromptBuilder";
import { postValidateSpeech } from "./speechPostValidator";

// ─────────────────────────────────────────────
// Static mock 文面 (flag OFF 経路 / fallback)
// ─────────────────────────────────────────────

const STATIC_MOCK_BY_VARIANT: Readonly<Record<string, string>> = {
  A: "今、間に入れそうな間が少しありそう。",
  B: "二人の間に少し温度差が見えるかもしれません。",
  C: "少し整理する時間を入れてみるのはどうですか？",
  D: "その揺れに視線を向けてみてもいいかもしれません。",
  E: "違う言葉で言うと、こう聞こえているのかもしれません。",
  F1: "二人で少し話す時間を取れるとよさそうです。",
  F2: "夕方の予定を整えるなら、20 分の話す時間を入れてみる方法があります。",
};

const TONE_BY_VARIANT: Readonly<Record<string, ToneCategory>> = {
  A: "calm",
  B: "calm",
  C: "tentative",
  D: "attentive",
  E: "calm",
  F1: "tentative",
  F2: "tentative",
};

// ─────────────────────────────────────────────
// LLM call interface (DI)
// ─────────────────────────────────────────────

/**
 * LLM 呼び出し関数の型 (本書 interface のみ、実装は Stage 4 L4-l 環境変数 + DI 経由)。
 *
 * 実 production では Anthropic SDK / OpenAI SDK を呼ぶラッパーが本関数として注入される。
 */
export type LlmCallFn = (prompt: string) => Promise<string>;

// グローバル DI スロット (default は throw、L4-l flip 時に setLlmCall で注入)
let injectedLlmCall: LlmCallFn | null = null;

export function setLlmCall(fn: LlmCallFn | null): void {
  injectedLlmCall = fn;
}

/**
 * 注入 state を query する helper (L4-i Phase 2、CEO 確定 2026-05-01)。
 *
 * route 側 lazy init 判定 (instrumentation が cold start 時に走らなかった場合の
 * recovery path) で使う。
 */
export function hasLlmCallInjected(): boolean {
  return injectedLlmCall !== null;
}

// ─────────────────────────────────────────────
// buildPresenceSpeech (本番実装)
// ─────────────────────────────────────────────

/**
 * Pattern variant + state + mode + context → SpeechOutput。
 *
 * 実 source metadata (CEO 確定 2026-05-01 L4-i Phase 2 mislabel fix):
 *   - flag OFF: source="static", latencyMs=0, fallbackReason=null
 *   - flag ON + 注入なし: source="fallback", fallbackReason="llm_error"
 *   - flag ON + LLM call throw: source="fallback", fallbackReason="llm_error"
 *   - flag ON + LLM 成功 + validator OK: source="llm", retries=N, latencyMs=measured
 *   - flag ON + LLM 成功 + validator 全 retry 失敗: source="fallback",
 *     fallbackReason="validation_failed", validationFailed=true
 */
export async function buildPresenceSpeech(
  input: BuildPresenceSpeechInput,
): Promise<SpeechOutput> {
  const override = LENGTH_OVERRIDE_BY_VARIANT[input.variant];
  const tone = TONE_BY_VARIANT[input.variant] ?? "calm";
  const fallbackText = STATIC_MOCK_BY_VARIANT[input.variant] ?? "(fallback)";

  // flag OFF: 即時 static fallback (LLM 試行なし、source="static")
  if (!COALTER_FLAGS.presenceSpeechLLMEnabled) {
    return {
      body: fallbackText,
      tone,
      appliedLength: override,
      source: "static",
      retries: 0,
      latencyMs: 0,
      validationFailed: false,
      fallbackReason: null,
    };
  }

  // flag ON だが LLM 注入未完了: fallback path (source="fallback", reason="llm_error")
  if (!injectedLlmCall) {
    return {
      body: fallbackText,
      tone,
      appliedLength: override,
      source: "fallback",
      retries: 0,
      latencyMs: 0,
      validationFailed: false,
      fallbackReason: "llm_error",
    };
  }

  // flag ON + 注入あり: 実 LLM call
  const prompt = buildSpeechPrompt(input, override);
  const startTs = Date.now();

  let initialText: string;
  try {
    initialText = await injectedLlmCall(prompt);
  } catch {
    return {
      body: fallbackText,
      tone,
      appliedLength: override,
      source: "fallback",
      retries: 0,
      latencyMs: Date.now() - startTs,
      validationFailed: false,
      fallbackReason: "llm_error",
    };
  }

  const validated = await postValidateSpeech(initialText, {
    regenerate: async () => {
      try {
        return await injectedLlmCall!(prompt);
      } catch {
        throw new Error("regenerate failed");
      }
    },
    fallbackText,
    override,
    maxRetries: 2,
  });

  const latencyMs = Date.now() - startTs;

  if (validated.fallbackUsed) {
    // 全 retry が validator で reject → fallback path
    return {
      body: validated.finalText,
      tone,
      appliedLength: override,
      source: "fallback",
      retries: validated.retries,
      latencyMs,
      validationFailed: true,
      fallbackReason: "validation_failed",
    };
  }

  // LLM 成功 path (source="llm")
  return {
    body: validated.finalText,
    tone,
    appliedLength: override,
    source: "llm",
    retries: validated.retries,
    latencyMs,
    validationFailed: false,
    fallbackReason: null,
  };
}

/**
 * Pattern 別 LengthOverride lookup (L2-m から維持)。
 */
export function getLengthOverride(variant: BuildPresenceSpeechInput["variant"]) {
  return LENGTH_OVERRIDE_BY_VARIANT[variant];
}
