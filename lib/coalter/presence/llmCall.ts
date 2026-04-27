/**
 * CoAlter Stage 4 L4-pre-1 — Anthropic Claude LLM call wrapper
 *
 * 正本: layout plan v0.3 §7.9 / CEO 媒体決定 (Anthropic Claude 採用 2026-04-28)
 *
 * speechBuilder の `setLlmCall()` に注入する LLM 呼び出し関数。
 *
 * 採用根拠 (CEO 判定 2026-04-28):
 *   1. 既存 Claude 依存整合 (Anthropic 単一 vendor で運用)
 *   2. Sonnet/Opus の言語品質 (speech template §3-§9 雛形に最適)
 *   3. prompt caching でコスト効率 (system prompt 5 分 cache)
 *
 * 不可侵:
 *   - flag presenceSpeechLLMEnabled OFF で本 wrapper は注入されない
 *     (speechBuilder の setLlmCall(null) state 維持、API call ゼロ、課金ゼロ)
 *   - L4-l flip 時に CEO 別審議で setLlmCall(createAnthropicLlmCall(...)) 実行
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmCallFn } from "./speechBuilder";

// ─────────────────────────────────────────────
// Wrapper factory
// ─────────────────────────────────────────────

export interface AnthropicLlmCallOptions {
  /** Anthropic API key (env: ANTHROPIC_API_KEY)。L4-l flip 時に CEO が設定 */
  apiKey: string;
  /** model 識別子。default: "claude-sonnet-4-5-20250929" */
  model?: string;
  /** max_tokens。default: 200 (発話本文は短い、§5.3 文長制約) */
  maxTokens?: number;
  /** temperature。default: 0.7 */
  temperature?: number;
}

/**
 * Anthropic Claude を使う LlmCallFn を生成する。
 *
 * 入力 prompt は speechPromptBuilder.ts の出力 (system 役割で渡す)。
 * - system 部分には cache_control: ephemeral を付与 (5 分 cache、コスト効率化)
 * - user message は dynamic (variant / state / mode / context が cycle ごと変わる)
 *
 * 戻り値文字列: LLM の text content (発話本文のみ、prompt の指示通り)。
 */
export function createAnthropicLlmCall(
  options: AnthropicLlmCallOptions,
): LlmCallFn {
  const client = new Anthropic({ apiKey: options.apiKey });
  const model = options.model ?? "claude-sonnet-4-5-20250929";
  const maxTokens = options.maxTokens ?? 200;
  const temperature = options.temperature ?? 0.7;

  return async (prompt: string): Promise<string> => {
    // prompt は speechPromptBuilder.ts が組み立てた full prompt。
    // 静的部分 (speech template §3-§9 注入) と dynamic 部分 (state/mode/context)
    // を区別するため、prompt 全体を system に置く ─ ただし dynamic 部分があるため
    // L4-l flip 時に prompt を 2 part に分割する余地を残す (本 wrapper は単純 system 投入)。
    //
    // prompt caching: 同一 system message が 5 分以内に再利用されるとキャッシュヒット。
    // speechPromptBuilder の static prefix が同一になるよう設計済 (variant/state/mode は
    // dynamic 部、§1.2.1 6 項目 + §1.3 + §2 共通禁止は static 部)。
    //
    // 本 wrapper は prompt 全体を 1 system block + 1 user trigger で送る簡易形式。
    // L4-l flip 後の最適化で 2 block 分割 (static cached + dynamic non-cached) が可能。

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: [
        {
          type: "text",
          text: prompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: "発話本文を返してください。",
        },
      ],
    });

    // response.content は ContentBlock[]、text type の最初の block を取り出す
    const firstText = response.content.find((c) => c.type === "text");
    if (!firstText || firstText.type !== "text") {
      throw new Error("Anthropic response had no text content");
    }
    return firstText.text.trim();
  };
}

// ─────────────────────────────────────────────
// Convenience: env から自動構築 (L4-l flip 時に呼ばれる想定)
// ─────────────────────────────────────────────

/**
 * 環境変数 ANTHROPIC_API_KEY から LlmCallFn を構築する convenience helper。
 *
 * L4-l flip 時に呼び出し:
 *   ```
 *   import { setLlmCall } from "@/lib/coalter/presence/speechBuilder";
 *   import { createAnthropicLlmCallFromEnv } from "@/lib/coalter/presence/llmCall";
 *   setLlmCall(createAnthropicLlmCallFromEnv());
 *   ```
 *
 * env 未設定時は null を返す (setLlmCall(null) で速やかに fallback 経路へ)。
 */
export function createAnthropicLlmCallFromEnv(): LlmCallFn | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return createAnthropicLlmCall({ apiKey });
}
